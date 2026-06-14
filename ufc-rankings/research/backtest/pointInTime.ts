// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/pointInTime.ts — THE sanctioned point-in-time predictor.
//
//  Every backtest prediction goes through here. Given an engine config (the
//  production default, or any custom EloParams set for a parameter search), it
//  returns each fight's PRE-FIGHT win probability built only from results that
//  happened earlier on the timeline.
//
//  CONTRACT (do not break — this is the anti-leakage guardrail):
//    • Predictions use `ratingBefore` / `opponentRating` from the engine's
//      chronological trace — the rating a fighter carried INTO the bout.
//    • NEVER read `EloMap.rating` (today's regressed number) to predict a past
//      fight. That field is wall-clock dependent and contaminated by every
//      later result; using it would be massive look-ahead leakage.
//    • Odds never enter here. This module predicts from Elo only; odds are
//      joined alongside for evaluation, never fed into a rating.
// ─────────────────────────────────────────────────────────────────────────

import { buildEloWithTraces } from '../../src/lib/eloEngine';
import { effectiveEngine, DEFAULT_FILTERS, type EffectiveEngine } from '../../src/lib/filters';
import { buildNameIndex, resolveNameToId } from '../../src/lib/nameResolver';
import type { LoadedData } from '../../src/lib/loadData';
import { loadClosingOdds } from '../loadOdds';
import { ODDS_NAME_OVERRIDES } from '../oddsNameOverrides';

// ── small local helpers (mirror the engine's one-liners; kept local so the
//    engine surface stays untouched) ──
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}
function dayNum(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? NaN : Math.floor(t / 86_400_000);
}
function monthsBetween(d1: Date, d2: Date): number {
  return (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}
// Same normalisation the engine uses to decide a weight-class move.
function normWC(wc: string): string | null {
  if (!wc) return null;
  const w = wc.trim();
  if (/catch ?weight|open ?weight|tournament|superfight/i.test(w)) return null;
  return w.replace(/^Interim\s+/i, '').trim();
}

// ── per-fight point-in-time record, from ONE fighter's perspective ──
interface PITFight {
  selfRating: number;       // rating entering the bout (deterministic)
  oppRating: number;        // opponent's rating entering the bout
  selfFightNo: number;      // 0-based: their Nth decisive UFC fight (entering)
  selfProvisional: boolean; // selfFightNo < provisionalFights
  selfLayoffMonths: number; // gap since their previous fight (0 for debut)
  selfWeightMove: boolean;  // division changed vs their previous fight
  weightClass: string;
  date: string;
  result: 'W' | 'L' | 'D';  // self's actual result
}

export type PointInTimeIndex = Map<string, PITFight>;

// Build the directed index `${selfId}#${oppId}#${dayNum}` → PITFight for a given
// engine config. Each bout appears under both fighters' keys, so a matchup can
// be assembled from either orientation. No clock dependence (uses ratingBefore).
export function buildPointInTimeIndex(
  data: LoadedData,
  engine: EffectiveEngine = effectiveEngine(DEFAULT_FILTERS)
): PointInTimeIndex {
  const { history } = buildEloWithTraces(data, engine);
  const provisionalFights = engine.elo.provisionalFights;
  const idx: PointInTimeIndex = new Map();

  for (const [fighterId, traces] of history) {
    // Traces are pushed in chronological order; sort defensively by date.
    const chron = [...traces].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    let prevDate: Date | null = null;
    let prevWC: string | null = null;
    chron.forEach((t, i) => {
      const date = new Date(t.date);
      const wc = normWC(t.weightClass);
      idx.set(`${fighterId}#${t.opponentId}#${dayNum(t.date)}`, {
        selfRating: t.ratingBefore,
        oppRating: t.opponentRating,
        selfFightNo: i,
        selfProvisional: i < provisionalFights,
        selfLayoffMonths: prevDate ? monthsBetween(prevDate, date) : 0,
        selfWeightMove: prevWC != null && wc != null && wc !== prevWC,
        weightClass: t.weightClass,
        date: t.date,
        result: t.result,
      });
      prevDate = date;
      if (wc) prevWC = wc;
    });
  }
  return idx;
}

// Odds dates and our event dates can differ by a day or two.
const DAY_TOLERANCE = [0, 1, -1, 2, -2];
function lookup(idx: PointInTimeIndex, selfId: string, oppId: string, day: number): PITFight | null {
  for (const off of DAY_TOLERANCE) {
    const hit = idx.get(`${selfId}#${oppId}#${day + off}`);
    if (hit) return hit;
  }
  return null;
}

// A full matchup prediction (favourite vs underdog), assembled from both
// perspectives so we carry tags for BOTH fighters.
export interface MatchupPrediction {
  eloProbFav: number;       // Elo's pre-fight P(favourite wins)
  favRating: number;
  dogRating: number;
  favFightNo: number;
  dogFightNo: number;
  favProvisional: boolean;
  dogProvisional: boolean;
  bothEstablished: boolean; // neither fighter provisional → cleanest signal
  favLayoffMonths: number;
  dogLayoffMonths: number;
  favWeightMove: boolean;
  dogWeightMove: boolean;
  weightClass: string;
  date: string;
}

export function predictMatchup(
  idx: PointInTimeIndex,
  favId: string,
  dogId: string,
  day: number
): MatchupPrediction | null {
  const f = lookup(idx, favId, dogId, day);
  if (!f) return null;
  const d = lookup(idx, dogId, favId, day); // reverse view for the dog's tags
  return {
    eloProbFav: expectedScore(f.selfRating, f.oppRating),
    favRating: f.selfRating,
    dogRating: f.oppRating,
    favFightNo: f.selfFightNo,
    dogFightNo: d?.selfFightNo ?? -1,
    favProvisional: f.selfProvisional,
    dogProvisional: d?.selfProvisional ?? true,
    bothEstablished: !f.selfProvisional && !(d?.selfProvisional ?? true),
    favLayoffMonths: f.selfLayoffMonths,
    dogLayoffMonths: d?.selfLayoffMonths ?? 0,
    favWeightMove: f.selfWeightMove,
    dogWeightMove: d?.selfWeightMove ?? false,
    weightClass: f.weightClass,
    date: f.date,
  };
}

// Resolve an odds-feed fighter name to a CSV id: research-zone alias map first,
// then the engine resolver in bulk-safe mode (no last-name+initial fallback).
export function resolveOddsName(
  name: string,
  nameIndex: ReturnType<typeof buildNameIndex>
): string | null {
  const alias = ODDS_NAME_OVERRIDES[name] ?? name;
  return resolveNameToId(alias, nameIndex, { allowLastFirst: false, quiet: true });
}

// ── The canonical joined sample: one fight with odds + point-in-time Elo +
//    segmentation tags. Both the exploratory summary and the backtest consume
//    this. `marketFavProb` is left to the caller's de-vig (Phase 1); the raw
//    decimal odds are always present so any de-vig method can be applied. ──
export interface JoinedSample {
  date: string;
  event: string;
  division: string;        // normalised weight class of the bout
  era: number;             // calendar year (for walk-forward splits / segmenting)
  favName: string;
  dogName: string;
  favId: string;
  dogId: string;
  favOdds: number;         // decimal
  dogOdds: number;         // decimal
  eloProbFav: number;      // Elo pre-fight P(fav)
  favWon: boolean;         // did the market favourite win?
  // tags (from predictMatchup)
  favFightNo: number;
  dogFightNo: number;
  favProvisional: boolean;
  dogProvisional: boolean;
  bothEstablished: boolean;
  favLayoffMonths: number;
  dogLayoffMonths: number;
  favWeightMove: boolean;
  dogWeightMove: boolean;
}

export interface JoinResult {
  samples: JoinedSample[];
  totalOdds: number;
  unresolvedNames: number; // a fighter name didn't resolve to an id
  noEloFight: number;      // resolved, but no matching Elo bout found
  unknownOutcome: number;  // matched, but the odds row has no settled winner
}

// Join every closing-odds row to a point-in-time Elo prediction under `engine`.
// Odds are fixed; only the Elo predictions change with the engine config — so a
// parameter search re-runs this per candidate config and re-scores.
export function joinOddsToPredictions(
  data: LoadedData,
  engine: EffectiveEngine = effectiveEngine(DEFAULT_FILTERS)
): JoinResult {
  const idx = buildPointInTimeIndex(data, engine);
  const nameIndex = buildNameIndex(data.fighters);
  const odds = loadClosingOdds();

  const samples: JoinedSample[] = [];
  let unresolvedNames = 0;
  let noEloFight = 0;
  let unknownOutcome = 0;

  for (const o of odds) {
    const favId = resolveOddsName(o.favourite, nameIndex);
    const dogId = resolveOddsName(o.underdog, nameIndex);
    if (!favId || !dogId) { unresolvedNames++; continue; }

    const day = dayNum(o.date);
    const p = Number.isNaN(day) ? null : predictMatchup(idx, favId, dogId, day);
    if (!p) { noEloFight++; continue; }

    if (o.outcome === 'unknown') { unknownOutcome++; continue; }

    samples.push({
      date: o.date,
      event: o.event,
      division: normWC(p.weightClass) ?? p.weightClass,
      era: new Date(o.date).getFullYear(),
      favName: o.favourite,
      dogName: o.underdog,
      favId,
      dogId,
      favOdds: o.favouriteOdds,
      dogOdds: o.underdogOdds,
      eloProbFav: p.eloProbFav,
      favWon: o.outcome === 'favourite',
      favFightNo: p.favFightNo,
      dogFightNo: p.dogFightNo,
      favProvisional: p.favProvisional,
      dogProvisional: p.dogProvisional,
      bothEstablished: p.bothEstablished,
      favLayoffMonths: p.favLayoffMonths,
      dogLayoffMonths: p.dogLayoffMonths,
      favWeightMove: p.favWeightMove,
      dogWeightMove: p.dogWeightMove,
    });
  }

  return { samples, totalOdds: odds.length, unresolvedNames, noEloFight, unknownOutcome };
}
