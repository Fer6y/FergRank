// ─────────────────────────────────────────────────────────────────────────
//  fightPrediction.ts — the ENHANCED head-to-head win probability.
//
//  The pure-Elo win% answers "who is the better fighter?". A betting analyst
//  asks "who wins THIS fight?" — which turns on age and, above all, the STYLE
//  MATCHUP. This module layers two bounded, DISPLAY-ONLY signals on top of the
//  Elo logit:
//     • age edge   — Elo has no aging curve; an older fighter underperforms
//                    their rating (validated: the dominant non-Elo signal).
//     • style edge — can A impose their game on B? Grappling imposition,
//                    striking differential, and finishing power, each modelled
//                    as an INTERACTION (offence vs the other's weakness), not a
//                    raw stat dump.
//
//  Grounded entirely in our own fight data — it NEVER reads odds. It never
//  touches Elo, the ranking, or the sweep: this is a presentation-layer refine-
//  ment of the shown probability, exactly like winProbability(). Coefficients
//  live in RANKING_CONFIG.winProbModel and were fit walk-forward (research/
//  backtest/edgeExperiment.ts) so the magnitudes are earned, not guessed.
// ─────────────────────────────────────────────────────────────────────────
import { loadAllData, type LoadedData } from './loadData';
import type { Fight } from './types';
import { RANKING_CONFIG } from './rankingConfig';
import { getFighterAge } from './fighterAges';
import { buildEloRatings, getElo } from './eloEngine';
import { loadPedigreeStrength } from './pedigreeSeed';

const LN10 = Math.log(10);
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

// ── Style profile — per-15 pace aggregated over a fighter's fights, optionally
//    only those strictly BEFORE `asOf` (so the backtest stays leak-free; live
//    prediction passes no date and uses the full record). ──
export interface StyleProfile {
  fights: number;
  minutes: number;
  landedPer15: number;     // sig strikes landed  (striking offence)
  absorbedPer15: number;   // sig strikes absorbed (lower = more durable)
  tdPer15: number;         // takedowns landed    (grappling offence)
  tdAbsorbedPer15: number; // takedowns conceded  (lower = better TDD)
  ctrlSharePct: number;    // % of cage time in control
  netCtrlSharePct: number; // (own − opponent) control as % of fight time — the real dominance signal
  kdPer15: number;         // knockdowns          (power)
  subAttPer15: number;     // submission attempts (grappling threat)
  // Composite dials (for display + the clash label)
  grapplingDominance: number; // NET grappling: (td − tdAbsorbed) + control differential + sub threat
  strikingOffense: number;    // volume
}

function fightMinutes(f: Fight): number | null {
  const m = /^(\d+):(\d{1,2})$/.exec((f.fightTime || '').trim());
  if (!m || !f.round || f.round < 1) return null;
  const mins = (f.round - 1) * 5 + parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
  return mins > 0 && mins <= 60 ? mins : null;
}

export function styleProfile(data: LoadedData, fighterId: string, asOf?: Date): StyleProfile | null {
  const all = data.fighterFights.get(fighterId);
  if (!all) return null;
  const cutMs = asOf ? asOf.getTime() : Infinity;
  let minutes = 0, landed = 0, absorbed = 0, td = 0, tdAbs = 0, kd = 0, sub = 0, ctrlSec = 0, oppCtrlSec = 0, n = 0;
  for (const f of all) {
    if (f.hasMetrics === false) continue;                 // recency top-ups carry no metrics
    if (!f.eventDate || f.eventDate.getTime() >= cutMs) continue;
    const mins = fightMinutes(f);
    if (mins == null) continue;
    const first = f.fighterId1 === fighterId;
    minutes += mins; n++;
    landed += first ? f.str1 : f.str2;
    absorbed += first ? f.str2 : f.str1;
    td += first ? f.td1 : f.td2;
    tdAbs += first ? f.td2 : f.td1;
    kd += first ? f.kd1 : f.kd2;
    sub += first ? f.sub1 : f.sub2;
    ctrlSec += first ? f.ctrl1 : f.ctrl2;
    oppCtrlSec += first ? f.ctrl2 : f.ctrl1;   // opponent's control → the differential
  }
  if (n < 1 || minutes <= 0) return null;
  const per15 = (t: number) => (t / minutes) * 15;
  const tdPer15 = per15(td);
  const tdAbsorbedPer15 = per15(tdAbs);
  const ctrlSharePct = (ctrlSec / (minutes * 60)) * 100;
  const netCtrlSharePct = ((ctrlSec - oppCtrlSec) / (minutes * 60)) * 100;
  const subAttPer15 = per15(sub);
  const landedPer15 = per15(landed);
  return {
    fights: n,
    minutes: Math.round(minutes),
    landedPer15,
    absorbedPer15: per15(absorbed),
    tdPer15,
    tdAbsorbedPer15,
    ctrlSharePct,
    netCtrlSharePct,
    kdPer15: per15(kd),
    subAttPer15,
    // NET grappling dominance: takedown differential + control-time differential
    // (the real signal — winning the grappling, not just attempting it) + a small
    // submission-threat term. Replaces the raw takedowns-conceded proxy.
    grapplingDominance: (tdPer15 - tdAbsorbedPer15) + netCtrlSharePct / 12 + subAttPer15 * 0.4,
    strikingOffense: landedPer15,
  };
}

// ── The matchup: fav-perspective interaction edges. Each is (fav's imposition
//    − dog's imposition), so a positive number favours `fav`. This is the
//    "styles make fights" core — it rewards being able to force YOUR game onto
//    an opponent who is weak to it, not merely being statistically busier. ──
export type Clash = 'grappler-vs-striker' | 'striker-vs-grappler' | 'grappling-battle' | 'striking-battle' | 'balanced';

export interface StyleMatchup {
  grapplingEdge: number;   // fav can control dog more than dog can control fav
  strikingEdge: number;    // fav out-strikes (out-lands + is harder to hit)
  powerEdge: number;       // fav's knockdown power vs dog's
  clash: Clash;
  summary: string;
  favProfile: StyleProfile;
  dogProfile: StyleProfile;
}

export function styleMatchup(fav: StyleProfile, dog: StyleProfile): StyleMatchup {
  // Both edges are (fav's net dominance − dog's net dominance) in their dimension,
  // so a positive number favours `fav`. Grappling now uses the takedown + CONTROL
  // differential (who actually wins the grappling), not raw takedowns conceded.
  const grapplingEdge = fav.grapplingDominance - dog.grapplingDominance;
  const strikingEdge = (fav.landedPer15 - fav.absorbedPer15) - (dog.landedPer15 - dog.absorbedPer15);
  const powerEdge = fav.kdPer15 - dog.kdPer15;

  // Clash label from each fighter's dominant mode (grappling-load first, like classifyStyle).
  const grap = (p: StyleProfile) => p.tdPer15 >= 1.5 || p.ctrlSharePct >= 18;
  const strike = (p: StyleProfile) => p.landedPer15 >= 55 && p.tdPer15 < 1.2;
  let clash: Clash = 'balanced';
  if (grap(fav) && strike(dog)) clash = 'grappler-vs-striker';
  else if (strike(fav) && grap(dog)) clash = 'striker-vs-grappler';
  else if (grap(fav) && grap(dog)) clash = 'grappling-battle';
  else if (strike(fav) && strike(dog)) clash = 'striking-battle';

  // Neutral summary (fighter A = first arg to predictFight; consumers hold the
  // names). Names the dominant weighted edge and which corner it favours.
  const dim = Math.abs(grapplingEdge) >= Math.abs(strikingEdge)
    ? { name: 'grappling', val: grapplingEdge } : { name: 'striking', val: strikingEdge };
  const summary = `${clash.replace(/-/g, ' ')}; ${dim.name} edge to fighter ${dim.val >= 0 ? 'A' : 'B'}`;

  return { grapplingEdge, strikingEdge, powerEdge, clash, summary, favProfile: fav, dogProfile: dog };
}

// ── The enhanced prediction. eloLogit is the pure-Elo probability in logit
//    space; age + style are bounded logit nudges from RANKING_CONFIG.winProbModel.
//    `sampleConf` (0–1) shrinks EVERYTHING toward a coin flip on thin samples
//    (provisional shading, unchanged intent). Returns the probability AND the
//    decomposition so the UI can explain the pick. ──
// Per-bout context for one fighter (short notice / missed weight). Only meaningful
// for a scheduled or actual bout — a hypothetical compare leaves it undefined.
export interface FightContext {
  shortNotice?: boolean;
  missedWeight?: boolean;
}

export interface PredictionBreakdown {
  probA: number;         // final P(fighter A wins)
  eloProbA: number;      // pure-Elo baseline
  ageEdgeYears: number;  // + = A younger
  ageLogit: number;
  style: StyleMatchup | null;
  styleLogit: number;
  flagLogit: number;     // net context-flag adjustment (A perspective)
  flagsA: FightContext;
  flagsB: FightContext;
  pedigreeEdge: number;  // A's tapered pre-UFC pedigree strength − B's (+ = A better pedigree)
  pedigreeLogit: number; // pre-UFC pedigree prior (thin-sample only; tapers out by seedTaperUFCFights)
  totalAdjLogit: number; // age + style + flags + pedigree, after the cap
  confidence: number;    // sample-size confidence applied
}

// Net logit for one fighter's flags (all negative — they only ever hurt).
function flagLogitFor(ctx: FightContext | undefined): number {
  const cfg = RANKING_CONFIG.winProbModel;
  let l = 0;
  if (ctx?.shortNotice) l += cfg.shortNoticeLogit;
  if (ctx?.missedWeight) l += cfg.missedWeightLogit;
  return l;
}

export function eloLogit(ratingA: number, ratingB: number): number {
  return (LN10 * (ratingA - ratingB)) / RANKING_CONFIG.elo.winProbDenominator;
}

// Full prediction from ratings + ids. `asOf` keeps it leak-free in backtests.
export function predictFight(
  data: LoadedData,
  idA: string, idB: string,
  ratingA: number, ratingB: number,
  fightsA: number, fightsB: number,
  asOf?: Date,
  ctxA?: FightContext, ctxB?: FightContext,
): PredictionBreakdown {
  const cfg = RANKING_CONFIG.winProbModel;
  const base = eloLogit(ratingA, ratingB);

  // Age edge (A perspective): + when A is younger. getFighterAge is point-in-time via asOf.
  const at = asOf ?? new Date();
  const ageA = getFighterAge(idA, at)?.age ?? null;
  const ageB = getFighterAge(idB, at)?.age ?? null;
  const ageEdgeYears = ageA != null && ageB != null ? ageB - ageA : 0;
  const ageLogit = cfg.enabled ? cfg.ageEdgeCoef * ageEdgeYears : 0;

  // Style edge (A perspective).
  const pA = styleProfile(data, idA, asOf);
  const pB = styleProfile(data, idB, asOf);
  let style: StyleMatchup | null = null;
  let styleLogit = 0;
  if (cfg.enabled && pA && pB && pA.fights >= cfg.minStyleFights && pB.fights >= cfg.minStyleFights) {
    style = styleMatchup(pA, pB);
    styleLogit =
      cfg.grapplingEdgeCoef * style.grapplingEdge +
      cfg.strikingEdgeCoef * style.strikingEdge +
      cfg.powerEdgeCoef * style.powerEdge;
  }

  // Context flags (A perspective): A's own flags hurt A; B's flags help A.
  const flagLogit = cfg.enabled ? flagLogitFor(ctxA) - flagLogitFor(ctxB) : 0;

  // Pre-UFC pedigree PRIOR (A perspective). A newcomer's thin Elo is a weak
  // estimate — this leans on where they came from and how they did there. Each
  // side's strength tapers to zero by seedTaperUFCFights, so it vanishes once a
  // fighter has a real UFC sample (exactly like the ranking seed). DISPLAY-ONLY:
  // reads the pedigree strength map, never the Elo pool.
  let pedigreeEdge = 0;
  let pedigreeLogit = 0;
  if (cfg.enabled && RANKING_CONFIG.preUFCPedigree.enabled) {
    const taperFights = RANKING_CONFIG.preUFCPedigree.seedTaperUFCFights;
    const ped = loadPedigreeStrength(data);
    const taper = (n: number) => Math.max(0, 1 - n / taperFights);
    const effA = (ped.get(idA)?.strength ?? 0) * taper(fightsA);
    const effB = (ped.get(idB)?.strength ?? 0) * taper(fightsB);
    pedigreeEdge = effA - effB;
    pedigreeLogit = cfg.pedigreeEdgeCoef * pedigreeEdge;
  }

  const totalAdjLogit = clamp(ageLogit + styleLogit + flagLogit + pedigreeLogit, -cfg.maxAdjustmentLogit, cfg.maxAdjustmentLogit);

  // Sample-size confidence (provisional shading), applied to the WHOLE logit.
  const conf = Math.max(
    RANKING_CONFIG.elo.winProbShadeFloor,
    Math.min(1, Math.min(fightsA, fightsB) / RANKING_CONFIG.elo.provisionalFights),
  );

  const eloProbA = sigmoid(base);
  const probA = sigmoid((base + totalAdjLogit) * conf);
  return {
    probA, eloProbA, ageEdgeYears, ageLogit, style: style ?? null, styleLogit,
    flagLogit, flagsA: ctxA ?? {}, flagsB: ctxB ?? {},
    pedigreeEdge, pedigreeLogit, totalAdjLogit, confidence: conf,
  };
}

// Convenience wrapper for the display layer: predict from two ids, loading the
// (memoized) data + Elo ratings itself. Live prediction → no asOf (full record).
export function predictMatchup(idA: string, idB: string): PredictionBreakdown | null {
  const data = loadAllData();
  if (!data.fighterMap.has(idA) || !data.fighterMap.has(idB)) return null;
  const ratings = buildEloRatings(data);
  return predictFight(
    data, idA, idB,
    getElo(ratings, idA).rating, getElo(ratings, idB).rating,
    data.fighterFights.get(idA)?.length ?? 0, data.fighterFights.get(idB)?.length ?? 0,
  );
}
