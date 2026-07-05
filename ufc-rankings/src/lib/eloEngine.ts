// ─────────────────────────────────────────────────────────────────────────
//  eloEngine.ts — the core rating system (v2)
//
//  A single chronological sweep over every UFC fight produces one Elo rating
//  per fighter. Properties (all by construction, see CLAUDE.md):
//    • Beating a strong opponent raises your rating a lot; beating a weak one
//      barely moves it. Opponent quality is therefore baked into the rating —
//      strength of schedule is not a bolt-on, it IS the rating.
//    • A KO/TKO moves ratings more than a split decision (finish-weighted K).
//    • New fighters converge faster (provisional K) and sit near the mean until
//      they prove themselves — prospects can't rocket past champions.
//    • Inactivity regresses a rating toward the mean, so an old/declined
//      fighter's long-past wins stop propping up today's number.
//    • Changing weight class carries the rating across with a decay penalty.
//
//  Nothing here is hardcoded — every number comes from RANKING_CONFIG.elo.
// ─────────────────────────────────────────────────────────────────────────

import { RANKING_CONFIG } from './rankingConfig';
import { effectiveEngine, DEFAULT_FILTERS, type EffectiveEngine, type EloParams } from './filters';
import type { Fight } from './types';
import type { LoadedData } from './loadData';

export interface EloState {
  rating: number;          // Current rating (regressed to "now" for inactivity)
  ratingAtLastFight: number; // Rating immediately after their most recent fight
  peakRating: number;      // Highest rating ever held
  fights: number;          // Decisive/draw fights processed
  lastFightDate: Date | null;
  lastWeightClass: string | null; // Normalized weight class of most recent fight
  discountedAtBoundary: boolean;  // Has the one-time current-form boundary discount been applied?
  divisionsSeen: Set<string>;     // Normalized divisions the fighter has already competed in
                                  // (the move-decay penalty is charged only on the FIRST entry
                                  // into a new division — returning to a proven weight is free).
}

export type EloMap = Map<string, EloState>;

// Per-fight snapshot for the profile page. Recorded during the rating sweep —
// PURELY ADDITIVE: it observes the same numbers the engine already computes and
// changes no rating math, so rankings/validation output is byte-identical.
export interface FightTrace {
  fightId: string;
  date: string;            // ISO
  opponentId: string;
  opponentName: string;
  result: 'W' | 'L' | 'D';
  method: string;
  round: number;
  weightClass: string;
  fiveRound: boolean;      // scheduled for 5 rounds (main event / title fight) — display only
  ratingBefore: number;    // entering the fight (post inactivity/move prep)
  ratingAfter: number;     // immediately after
  delta: number;           // ratingAfter − ratingBefore (the per-fight Elo swing)
  opponentRating: number;  // opponent's rating at fight time (context)
}

export type EloHistoryMap = Map<string, FightTrace[]>;

function monthsBetween(d1: Date, d2: Date): number {
  return (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

// Strip interim/championship qualifiers so "Interim Lightweight" doesn't read
// as a different division than "Lightweight" and trigger a bogus move penalty.
// Catch/open weight and blanks return null → treated as "no move" (neutral).
export function normalizeWeightClassForMove(wc: string): string | null {
  if (!wc) return null;
  const w = wc.trim();
  if (/catch ?weight|open ?weight|tournament|superfight/i.test(w)) return null;
  return w.replace(/^Interim\s+/i, '').trim();
}

// The finish-method K multiplier for a fight (same for both corners). Multiply
// by baseK (and the provisional boost) at the call site.
function finishMultiplier(method: string, mults: Record<string, number>): number {
  const m = method.trim();
  // KO/TKO — including "TKO - Doctor's Stoppage" (a doctor waving it off IS a
  // finish, so it earns full finish credit, not neutral K).
  if (m.startsWith('KO/TKO') || m.startsWith('TKO')) return mults['KO/TKO'];
  if (m === 'SUB' || m === 'Submission') return mults['SUB'];
  if (m === 'U-DEC') return mults['U-DEC'];
  if (m === 'M-DEC') return mults['M-DEC'];
  if (m === 'S-DEC') return mults['S-DEC'];
  return 1.0;
}

// Regress a rating toward the mean for a layoff of `months`, beyond a grace period.
function regressForInactivity(rating: number, months: number, E: EloParams): number {
  if (months <= E.inactivityGraceMonths) return rating;
  const years = (months - E.inactivityGraceMonths) / 12;
  const retention = Math.pow(E.inactivityRetentionPerYear, years);
  return E.initialRating + (rating - E.initialRating) * retention;
}

// One-time "current-form" discount. The first time a fighter competes inside the
// recent window (on/after boundaryDate), the rating they CARRY IN is regressed
// once toward the mean by boundaryRegressionToMean — heavily discounting their
// pre-window form without the spread-destroying full reset of a hard cutoff.
// Applied once per fighter; brand-new fighters (rating already at the mean) are
// unaffected but still flagged so it never re-fires.
function applyBoundaryDiscount(state: EloState, fightDate: Date, boundaryDate: Date, E: EloParams): void {
  if (state.discountedAtBoundary || fightDate < boundaryDate) return;
  const frac = RANKING_CONFIG.elo.boundaryRegressionToMean;
  state.rating = E.initialRating + (state.rating - E.initialRating) * (1 - frac);
  state.discountedAtBoundary = true;
}

function newState(E: EloParams): EloState {
  return {
    rating: E.initialRating,
    ratingAtLastFight: E.initialRating,
    peakRating: E.initialRating,
    fights: 0,
    lastFightDate: null,
    lastWeightClass: null,
    discountedAtBoundary: false,
    divisionsSeen: new Set<string>(),
  };
}

// Expected score for A against B (standard Elo logistic).
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

// Prepare a fighter's rating for an upcoming fight: apply inactivity regression
// for the gap since their last fight, then a move penalty if the division changed.
function prepareForFight(state: EloState, fightDate: Date, normWC: string | null, E: EloParams): void {
  if (state.lastFightDate) {
    const gap = monthsBetween(state.lastFightDate, fightDate);
    if (gap > 0) state.rating = regressForInactivity(state.rating, gap, E);
  }
  // Weight-class move decay — charged ONCE per division. A fighter pays the
  // "unproven at a new weight" tax only the FIRST time they enter a division;
  // moving back to a weight they've already competed in is free (they've proven
  // themselves there, and the inactivity regression already handles the gap).
  if (normWC && state.lastWeightClass && normWC !== state.lastWeightClass && !state.divisionsSeen.has(normWC)) {
    state.rating = E.initialRating + (state.rating - E.initialRating) * (1 - E.moveDecayPenalty);
  }
  if (normWC) state.divisionsSeen.add(normWC);
}

/**
 * Build one Elo rating per fighter from the full fight history.
 * Memoized per LoadedData instance so repeated division calls don't recompute.
 */
// Cache keyed by (LoadedData → filter signature). The default signature is the
// un-filtered engine; each distinct filter combo gets its own cached sweep.
const eloCache = new WeakMap<LoadedData, Map<string, EloMap>>();
const historyCache = new WeakMap<LoadedData, EloHistoryMap>();

// The chronological rating sweep. Pure: same inputs → same {states, history},
// no caching. buildEloRatings (cached, default-history) and buildEloWithTraces
// (any engine, returns history) are thin wrappers so their math is identical.
function runEloSweep(
  data: LoadedData,
  engine: EffectiveEngine
): { states: EloMap; history: EloHistoryMap } {
  const E = engine.elo;

  const states: EloMap = new Map();
  const history: EloHistoryMap = new Map();
  const pushTrace = (id: string, t: FightTrace): void => {
    let arr = history.get(id);
    if (!arr) { arr = []; history.set(id, arr); }
    arr.push(t);
  };
  const get = (id: string): EloState => {
    let s = states.get(id);
    if (!s) { s = newState(E); states.set(id, s); }
    return s;
  };

  // Chronological order (oldest first). Fights without a date can't be placed on
  // the timeline, so they're skipped. The Era filter (engine.eraStartYear), when
  // set, is a HARD window — drops fights before the chosen year for a pure
  // historical lens. The house default (no era) keeps the FULL history (so the
  // rating spread + opponent calibration are intact) and instead applies the
  // one-time current-form boundary discount below.
  const ordered = data.fights
    .filter((f) => f.eventDate && (engine.eraStartYear == null || f.eventDate.getFullYear() >= engine.eraStartYear))
    .sort((a, b) => a.eventDate!.getTime() - b.eventDate!.getTime());

  // Current-form boundary discount applies only in house mode (no explicit era);
  // an explicit era is already its own hard recency window.
  const maxAge = RANKING_CONFIG.elo.maxFightAgeYears;
  const boundaryDate =
    engine.eraStartYear == null && maxAge != null
      ? new Date(Date.now() - maxAge * 365.25 * 24 * 60 * 60 * 1000)
      : null;

  for (const fight of ordered) {
    const result = decisiveResult(fight);
    if (!result) continue; // NC / unknown — no rating change

    const a = get(fight.fighterId1);
    const b = get(fight.fighterId2);
    const date = fight.eventDate!;
    const normWC = normalizeWeightClassForMove(fight.weightClass);

    prepareForFight(a, date, normWC, E);
    prepareForFight(b, date, normWC, E);
    if (boundaryDate) {
      applyBoundaryDiscount(a, date, boundaryDate, E);
      applyBoundaryDiscount(b, date, boundaryDate, E);
    }

    const ea = expectedScore(a.rating, b.rating);
    const eb = 1 - ea;
    const [sa, sb] = result; // actual scores (1/0, 0/1, or 0.5/0.5)

    // Finish-weighted K, boosted while either fighter is still provisional.
    // While a fighter is provisional, the finish multiplier is damped toward 1.0
    // (provisionalFinishDamp) so finish×provisional K can't compound — a newcomer
    // KO'ing low-rated opponents converges on the RESULT, not the method.
    const finishMult = finishMultiplier(fight.method, engine.finishMultipliers);
    const provDampedMult = 1 + (finishMult - 1) * E.provisionalFinishDamp;
    const provA = a.fights < E.provisionalFights;
    const provB = b.fights < E.provisionalFights;
    const ka = E.baseK * (provA ? provDampedMult * E.provisionalKMultiplier : finishMult);
    const kb = E.baseK * (provB ? provDampedMult * E.provisionalKMultiplier : finishMult);

    const aBefore = a.rating;
    const bBefore = b.rating;
    let deltaA = ka * (sa - ea);
    let deltaB = kb * (sb - eb);

    // Win-quality gate: the points a fighter GAINS from a win are scaled by the
    // OPPONENT'S ABSOLUTE rating — beating a weak opponent (low Elo) earns little,
    // beating a strong one earns full credit EVEN IF they're ranked below you.
    // This plateaus an unbeaten streak over weak/lower competition near that
    // slate's level instead of letting it float into contention (an undefeated
    // fighter's rating otherwise climbs forever), while NOT punishing an elite who
    // beats other elites (Makhachev over #3). Enforces "opponent quality IS the
    // rating." LOSSES are untouched (negative deltas keep full weight). Keyed on
    // ABSOLUTE opp Elo, NOT the gap-to-winner (that flaw punished the #1, who has
    // everyone below them). Off when winQualityGate == 0.
    if (E.winQualityGate > 0) {
      const span = E.winQualityFullElo - E.winQualityLowElo;
      const gateMult = (oppElo: number): number => {
        const q = span > 0 ? Math.max(E.winQualityGateFloor, Math.min(1, (oppElo - E.winQualityLowElo) / span)) : 1;
        return 1 - E.winQualityGate * (1 - q); // winQualityGate scales how fully the gate applies (1 = full)
      };
      if (deltaA > 0) deltaA *= gateMult(bBefore);
      if (deltaB > 0) deltaB *= gateMult(aBefore);
    }

    a.rating += deltaA;
    b.rating += deltaB;

    // Additive trace (observation only — does not touch the rating math above).
    const iso = date.toISOString();
    const toResult = (s: number): 'W' | 'L' | 'D' => (s === 1 ? 'W' : s === 0 ? 'L' : 'D');
    pushTrace(fight.fighterId1, {
      fightId: fight.fightId, date: iso,
      opponentId: fight.fighterId2, opponentName: fight.fighter2Name,
      result: toResult(sa), method: fight.method, round: fight.round,
      weightClass: fight.weightClass, fiveRound: (fight.timeFormat || '').startsWith('5 Rnd'),
      ratingBefore: aBefore, ratingAfter: a.rating, delta: deltaA, opponentRating: bBefore,
    });
    pushTrace(fight.fighterId2, {
      fightId: fight.fightId, date: iso,
      opponentId: fight.fighterId1, opponentName: fight.fighter1Name,
      result: toResult(sb), method: fight.method, round: fight.round,
      weightClass: fight.weightClass, fiveRound: (fight.timeFormat || '').startsWith('5 Rnd'),
      ratingBefore: bBefore, ratingAfter: b.rating, delta: deltaB, opponentRating: aBefore,
    });

    for (const [s, wc] of [[a, normWC], [b, normWC]] as [EloState, string | null][]) {
      s.peakRating = Math.max(s.peakRating, s.rating);
      s.ratingAtLastFight = s.rating;
      s.lastFightDate = date;
      if (wc) s.lastWeightClass = wc;
      s.fights += 1;
    }
  }

  // Final regression: bring each rating from its last-fight date up to "now"
  // so the displayed number reflects current layoff.
  const now = new Date();
  for (const s of states.values()) {
    if (s.lastFightDate) {
      const gap = monthsBetween(s.lastFightDate, now);
      if (gap > 0) s.rating = regressForInactivity(s.ratingAtLastFight, gap, E);
    }
  }

  return { states, history };
}

// Cache entries are keyed by (filter signature, UTC day): the sweep's final
// regression brings every rating up to "now", so a map built yesterday is
// stale today — day-keying lets a long-lived process refresh daily instead of
// serving boot-time ratings forever. Oldest entries are evicted so distinct
// filter combos (and passing days) can't grow the cache unbounded.
const ELO_CACHE_MAX = 24;

export function buildEloRatings(data: LoadedData, eng?: EffectiveEngine): EloMap {
  const engine = eng ?? effectiveEngine(DEFAULT_FILTERS);

  let perData = eloCache.get(data);
  if (!perData) { perData = new Map(); eloCache.set(data, perData); }
  const key = `${engine.signature}|${new Date().toISOString().slice(0, 10)}`;
  const cached = perData.get(key);
  if (cached) return cached;

  const { states, history } = runEloSweep(data, engine);

  if (perData.size >= ELO_CACHE_MAX) perData.delete(perData.keys().next().value as string);
  perData.set(key, states);
  // History is only needed for the (un-filtered) profile page — record it once.
  // (Per-fight traces are historical, not regressed to "now", so no day key.)
  if (engine.isDefault) historyCache.set(data, history);
  return states;
}

/**
 * Point-in-time traces for ANY engine config (offline analysis/evaluation).
 * Returns the final ratings AND the per-fight history without the default-only
 * cache gate, so a custom EloParams set still yields each fighter's pre-fight
 * `ratingBefore` / `opponentRating`. Identical sweep math — never affects
 * rankings or the cached production path.
 */
export function buildEloWithTraces(
  data: LoadedData,
  eng?: EffectiveEngine
): { ratings: EloMap; history: EloHistoryMap } {
  const engine = eng ?? effectiveEngine(DEFAULT_FILTERS);
  const { states, history } = runEloSweep(data, engine);
  return { ratings: states, history };
}

// Chronological per-fight trace for one fighter (newest first), for the profile
// page's fight-history list. Always uses the default (un-filtered) engine.
export function getFighterHistory(data: LoadedData, fighterId: string): FightTrace[] {
  buildEloRatings(data);
  const arr = historyCache.get(data)?.get(fighterId) ?? [];
  // ISO dates compare lexicographically — a stable string sort keeps same-day
  // (tournament-era) fights in sweep order without allocating Dates.
  return [...arr].sort((x, y) => (y.date < x.date ? -1 : y.date > x.date ? 1 : 0));
}

// UFC W/L/D record derived from the Elo fight trace (which INCLUDES the recency
// top-up). The static W/L/D in Fighters_Stats.csv is frozen at the primary-data
// cutoff, so it goes stale the moment a recent bout lands via the recency patch
// (e.g. Mitch Raposo reading 1-2 while the Gauntlet shows his 2-2). Deriving the
// displayed record from the same traced fights keeps it in lockstep with the
// fight history and the current Elo. Falls back to the static record only when a
// fighter has no traced fights (e.g. only undated or no-contest bouts). Display
// only — the record never feeds the rating (Elo processes fights directly).
export function getTracedRecord(
  data: LoadedData,
  fighterId: string,
  fallback: { wins: number; losses: number; draws: number }
): { wins: number; losses: number; draws: number } {
  buildEloRatings(data);
  const arr = historyCache.get(data)?.get(fighterId);
  if (!arr || arr.length === 0) return { wins: fallback.wins, losses: fallback.losses, draws: fallback.draws };
  let wins = 0, losses = 0, draws = 0;
  for (const h of arr) {
    if (h.result === 'W') wins++;
    else if (h.result === 'L') losses++;
    else draws++;
  }
  return { wins, losses, draws };
}

// Convenience: the traced record formatted as "W-L-D".
export function getTracedRecordString(
  data: LoadedData,
  fighterId: string,
  fallback: { wins: number; losses: number; draws: number }
): string {
  const r = getTracedRecord(data, fighterId, fallback);
  return `${r.wins}-${r.losses}-${r.draws}`;
}

// Returns [scoreA, scoreB] or null if the fight shouldn't affect ratings.
function decisiveResult(fight: Fight): [number, number] | null {
  const r1 = fight.result1;
  const r2 = fight.result2;
  if (r1 === 'W' && r2 === 'L') return [1, 0];
  if (r1 === 'L' && r2 === 'W') return [0, 1];
  if (r1 === 'D' && r2 === 'D') return [0.5, 0.5];
  return null; // NC, DQ-as-NC, blanks, etc.
}

export function getElo(map: EloMap, fighterId: string): EloState {
  return map.get(fighterId) ?? newState(RANKING_CONFIG.elo);
}

// Raw Elo → 0–100 display score (linear, clamped). Monotonic, so it never
// changes the ordering — purely for readable bars/numbers in the UI.
// Monotonic piecewise-linear map from an Elo value to a 0–100 display score,
// given a curve of [elo, score] anchors. Fixed (not filtered) so the scale
// stays comparable across divisions/filters.
function mapEloCurve(elo: number, curve: readonly [number, number][]): number {
  if (elo <= curve[0][0]) return curve[0][1];
  const last = curve[curve.length - 1];
  if (elo >= last[0]) return last[1];
  for (let i = 1; i < curve.length; i++) {
    const [e1, s1] = curve[i];
    if (elo <= e1) {
      const [e0, s0] = curve[i - 1];
      return s0 + ((elo - e0) / (e1 - e0)) * (s1 - s0);
    }
  }
  return last[1]; // unreachable (elo < last[0] handled above)
}

export function eloToDisplayScore(elo: number): number {
  return mapEloCurve(elo, RANKING_CONFIG.elo.displayCurve);
}

// Schedule-strength display mapping. sosElo is an AVERAGE of opponent Elos and
// so compresses toward the mean; it uses its own curve (anchored to the observed
// sosElo distribution, ceiling ~1620) rather than the fighter-rating curve, so
// an elite slate saturates near 100 instead of topping out mid-scale. Absolute
// and display-only — see rankingConfig.sosDisplayCurve.
export function sosEloToDisplayScore(sosElo: number): number {
  return mapEloCurve(sosElo, RANKING_CONFIG.sosDisplayCurve);
}

// Calibrated head-to-head win probability for DISPLAY (e.g. the Compare page).
// Uses winProbDenominator (≈589, from the backtest's Platt fit) instead of the
// sweep's /400, which is over-confident for UFC. Symmetric:
// winProbability(a,b) + winProbability(b,a) = 1. Does not touch the rating math.
export function winProbability(eloA: number, eloB: number): number {
  const d = RANKING_CONFIG.elo.winProbDenominator;
  return 1 / (1 + Math.pow(10, (eloB - eloA) / d));
}

// Confidence in a head-to-head probability given each corner's UFC sample size.
// Driven by the THINNER fighter (min): a rating built on <provisionalFights
// bouts is a weak estimate, so any gap it produces is discounted. 1 = full
// confidence (both established); floored so a debutant still keeps some edge.
export function winProbConfidence(fightsA: number, fightsB: number): number {
  const { provisionalFights, winProbShadeFloor } = RANKING_CONFIG.elo;
  const raw = Math.min(fightsA, fightsB) / provisionalFights;
  return Math.max(winProbShadeFloor, Math.min(1, raw));
}

// DISPLAY win probability with provisional-uncertainty shading: winProbability()
// pulled toward 0.5 when either fighter's UFC sample is thin (see
// winProbConfidence). Symmetric — shaded(a,b,fa,fb) + shaded(b,a,fb,fa) = 1 —
// and never touches ratings or rankings.
export function winProbabilityShaded(
  eloA: number, eloB: number, fightsA: number, fightsB: number,
): number {
  const p = winProbability(eloA, eloB);
  return 0.5 + (p - 0.5) * winProbConfidence(fightsA, fightsB);
}
