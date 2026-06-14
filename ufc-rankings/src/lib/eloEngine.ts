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
function normalizeWeightClassForMove(wc: string): string | null {
  if (!wc) return null;
  const w = wc.trim();
  if (/catch ?weight|open ?weight|tournament|superfight/i.test(w)) return null;
  return w.replace(/^Interim\s+/i, '').trim();
}

function finishK(method: string, mults: Record<string, number>, baseK: number): number {
  const m = method.trim();
  let mult = 1.0;
  // KO/TKO — including "TKO - Doctor's Stoppage" (a doctor waving it off IS a
  // finish, so it earns full finish credit, not neutral K).
  if (m.startsWith('KO/TKO') || m.startsWith('TKO')) mult = mults['KO/TKO'];
  else if (m === 'SUB' || m === 'Submission') mult = mults['SUB'];
  else if (m === 'U-DEC') mult = mults['U-DEC'];
  else if (m === 'M-DEC') mult = mults['M-DEC'];
  else if (m === 'S-DEC') mult = mults['S-DEC'];
  return baseK * mult;
}

// Regress a rating toward the mean for a layoff of `months`, beyond a grace period.
function regressForInactivity(rating: number, months: number, E: EloParams): number {
  if (months <= E.inactivityGraceMonths) return rating;
  const years = (months - E.inactivityGraceMonths) / 12;
  const retention = Math.pow(E.inactivityRetentionPerYear, years);
  return E.initialRating + (rating - E.initialRating) * retention;
}

function newState(E: EloParams): EloState {
  return {
    rating: E.initialRating,
    ratingAtLastFight: E.initialRating,
    peakRating: E.initialRating,
    fights: 0,
    lastFightDate: null,
    lastWeightClass: null,
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
  if (normWC && state.lastWeightClass && normWC !== state.lastWeightClass) {
    state.rating = E.initialRating + (state.rating - E.initialRating) * (1 - E.moveDecayPenalty);
  }
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

  // Chronological order (oldest first). Fights without a date can't be placed
  // on the timeline, so they're skipped. The era filter drops fights before the
  // chosen start year entirely (so the rating reflects only that era).
  const ordered = data.fights
    .filter((f) => f.eventDate && (engine.eraStartYear == null || f.eventDate.getFullYear() >= engine.eraStartYear))
    .sort((a, b) => a.eventDate!.getTime() - b.eventDate!.getTime());

  for (const fight of ordered) {
    const result = decisiveResult(fight);
    if (!result) continue; // NC / unknown — no rating change

    const a = get(fight.fighterId1);
    const b = get(fight.fighterId2);
    const date = fight.eventDate!;
    const normWC = normalizeWeightClassForMove(fight.weightClass);

    prepareForFight(a, date, normWC, E);
    prepareForFight(b, date, normWC, E);

    const ea = expectedScore(a.rating, b.rating);
    const eb = 1 - ea;
    const [sa, sb] = result; // actual scores (1/0, 0/1, or 0.5/0.5)

    // Finish-weighted K, boosted while either fighter is still provisional.
    const kBase = finishK(fight.method, engine.finishMultipliers, E.baseK);
    const ka = kBase * (a.fights < E.provisionalFights ? E.provisionalKMultiplier : 1);
    const kb = kBase * (b.fights < E.provisionalFights ? E.provisionalKMultiplier : 1);

    const aBefore = a.rating;
    const bBefore = b.rating;
    const deltaA = ka * (sa - ea);
    const deltaB = kb * (sb - eb);

    a.rating += deltaA;
    b.rating += deltaB;

    // Additive trace (observation only — does not touch the rating math above).
    const iso = date.toISOString();
    const toResult = (s: number): 'W' | 'L' | 'D' => (s === 1 ? 'W' : s === 0 ? 'L' : 'D');
    pushTrace(fight.fighterId1, {
      fightId: fight.fightId, date: iso,
      opponentId: fight.fighterId2, opponentName: fight.fighter2Name,
      result: toResult(sa), method: fight.method, round: fight.round,
      weightClass: fight.weightClass,
      ratingBefore: aBefore, ratingAfter: a.rating, delta: deltaA, opponentRating: bBefore,
    });
    pushTrace(fight.fighterId2, {
      fightId: fight.fightId, date: iso,
      opponentId: fight.fighterId1, opponentName: fight.fighter1Name,
      result: toResult(sb), method: fight.method, round: fight.round,
      weightClass: fight.weightClass,
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

export function buildEloRatings(data: LoadedData, eng?: EffectiveEngine): EloMap {
  const engine = eng ?? effectiveEngine(DEFAULT_FILTERS);

  let perData = eloCache.get(data);
  if (!perData) { perData = new Map(); eloCache.set(data, perData); }
  const cached = perData.get(engine.signature);
  if (cached) return cached;

  const { states, history } = runEloSweep(data, engine);

  perData.set(engine.signature, states);
  // History is only needed for the (un-filtered) profile page — record it once.
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
  return [...arr].sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime());
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
export function eloToDisplayScore(elo: number): number {
  // Display mapping is fixed (not filtered) so the 0–100 scale stays comparable.
  const { displayEloFloor: lo, displayEloCeil: hi } = RANKING_CONFIG.elo;
  return Math.max(0, Math.min(100, ((elo - lo) / (hi - lo)) * 100));
}

// Calibrated head-to-head win probability for DISPLAY (e.g. the Compare page).
// Uses winProbDenominator (≈589, from the backtest's Platt fit) instead of the
// sweep's /400, which is over-confident for UFC. Symmetric:
// winProbability(a,b) + winProbability(b,a) = 1. Does not touch the rating math.
export function winProbability(eloA: number, eloB: number): number {
  const d = RANKING_CONFIG.elo.winProbDenominator;
  return 1 / (1 + Math.pow(10, (eloB - eloA) / d));
}
