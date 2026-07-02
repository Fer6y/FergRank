// ─────────────────────────────────────────────────────────────────────────
//  advancedStats.ts — deep, display-only fighter analytics.
//
//  Pace-normalized (per-15-minute) rates, recent-vs-career form drift, a
//  per-fight form timeline (the profile chart), durability, and finish
//  anatomy. Derived from the SAME loaded fight rows the engine reads, but
//  strictly DOWNSTREAM: nothing here is imported by eloEngine /
//  scoringEngine / rankingConfig, so the rankings cannot be affected.
//
//  Sampling rules:
//  • Rate stats use only primary-CSV fights (hasMetrics) — Sherdog recency
//    top-ups carry no per-fight counts and are excluded automatically.
//  • A fight with zero recorded strikes on BOTH sides is treated as missing
//    data (early-era rows), not a genuine 0-output performance.
//  • Cage time = (round−1) × 5 min + final-round clock; rows with an
//    unparseable clock are skipped. Loss/finish COUNTS use all dated fights
//    (method + result exist even on Sherdog rows).
// ─────────────────────────────────────────────────────────────────────────

import type { Fight } from './types';
import type { LoadedData } from './loadData';
import type { FightTrace } from './eloEngine';

const RECENT_WINDOW = 5;      // "recent form" = last 5 metric-bearing fights
const MIN_RECENT_FIGHTS = 3;  // fewer than this → no recent window / no drift
const TREND_WINDOW = 3;       // the macro trend read looks at the last 3 fights

// One fighter's side of one fight, pace-normalized. Chart + table fuel.
export interface FormPoint {
  fightId: string;
  date: string;            // ISO "YYYY-MM-DD"
  result: string;          // W / L / D / NC
  opponentName: string;
  method: string;
  minutes: number;         // cage time
  landedPer15: number;
  absorbedPer15: number;
  tdPer15: number;
  kd: number;
}

// Aggregate per-15-minute rates over a set of fights (career or recent).
export interface PaceWindow {
  fights: number;
  minutes: number;
  landedPer15: number;
  absorbedPer15: number;
  diffPer15: number;           // landed − absorbed (the metrics-bonus headline)
  tdPer15: number;
  tdAbsorbedPer15: number;
  kdPer15: number;
  subAttPer15: number;
  ctrlSharePct: number;        // % of cage time spent in control
  sigAccuracy: number | null;  // mean per-fight accuracy (0–1)
}

// Recent window minus career — the "is their output changing?" readout.
export interface FormDrift {
  landedPer15Delta: number;
  landedPctChange: number | null; // (recent/career − 1), null if career ~0
  diffPer15Delta: number;
  tdPer15Delta: number;
  sigAccuracyDelta: number | null;
}

export interface Durability {
  koTkoLosses: number;
  subLosses: number;
  decisionLosses: number;
  timesFinished: number;
  lastFinishedYear: number | null;
  kdAbsorbedPer15: number;
  strikesAbsorbedPer15: number;
}

export interface FinishBreakdownEntry {
  label: string; // e.g. "Rear Naked Choke", "Punches"
  count: number;
}

export interface AdvancedStats {
  sampleFights: number;        // metric-bearing dated fights used for rates
  totalMinutes: number;
  career: PaceWindow;
  recent: PaceWindow | null;   // null until MIN_RECENT_FIGHTS metric fights
  last3: PaceWindow | null;    // the macro-trend window (last 3 metric fights)
  drift: FormDrift | null;
  // Landed:absorbed strike ratio — the margin metric. >1 = out-landing opponents.
  ratioCareer: number | null;
  ratioLast3: number | null;
  timeline: FormPoint[];       // ascending by date
  rollingLanded: number[];     // rolling-3 mean of landedPer15, aligned to timeline
  durability: Durability;
  finishWins: FinishBreakdownEntry[]; // how they finish opponents
  finishedBy: FinishBreakdownEntry[]; // how they have been finished
}

// ── Macro trend read ─────────────────────────────────────────────────────
// Plain-English interpretation of the numbers, written deliberately cautious:
// fights are rare events and stat lines are matchup-dependent, so a "trend"
// only gets called when the macro picture supports it (mileage, opposition
// level, damage history) — and even then it's phrased as a lean for the next
// fight, not a verdict.

export interface TrendInsight {
  kind: 'positive' | 'negative' | 'caution' | 'neutral';
  text: string;
}

export interface TrendContext {
  age: number | null;           // real age from the DOB pipeline, when resolved
  tenureYears: number;          // years since UFC debut (the fallback aging proxy)
  monthsSinceLastFight: number;
  eloRating: number;
  eloPeak: number;
  history: FightTrace[];        // newest first (for opponent-quality context)
}

export function buildTrendRead(a: AdvancedStats, ctx: TrendContext): TrendInsight[] {
  const out: TrendInsight[] = [];
  const { career, last3, ratioCareer, ratioLast3 } = a;

  if (!last3 || ratioCareer == null || ratioLast3 == null) {
    return [{ kind: 'neutral', text: 'Fewer than 3 charted fights — not enough for a trend read yet.' }];
  }

  // Opposition context: was the last-3 schedule a step up from the career norm?
  const traced = ctx.history.filter((h) => h.opponentRating > 0);
  const oppRecent = traced.slice(0, TREND_WINDOW);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const oppRecentElo = mean(oppRecent.map((h) => h.opponentRating));
  const oppCareerElo = mean(traced.map((h) => h.opponentRating));
  const oppStep = Math.round(oppRecentElo - oppCareerElo);
  const stepUp = oppStep >= 40;

  const ratioChange = ratioLast3 / ratioCareer - 1;           // margin trend
  const outputChange = career.landedPer15 >= 5 ? last3.landedPer15 / career.landedPer15 - 1 : 0;
  // Real age leads the mileage judgement (34+ is where MMA age curves bend);
  // tenure/fight-count carry it when no DOB resolved.
  const deepMileage = (ctx.age != null && ctx.age >= 34) || ctx.tenureYears >= 9 || a.sampleFights >= 18;
  const mileageNote = ctx.age != null
    ? `at age ${ctx.age} with ${a.sampleFights} charted fights`
    : ctx.tenureYears >= 1
      ? `${Math.round(ctx.tenureYears)} years and ${a.sampleFights} charted fights into the UFC run`
      : `${a.sampleFights} charted fights in`;
  const pctFmt = (x: number) => `${Math.abs(Math.round(x * 100))}%`;

  // Margin tightening — the aging-pattern read, but opposition-aware.
  if (ratioChange <= -0.15) {
    if (stepUp) {
      out.push({
        kind: 'caution',
        text: `Landed:absorbed ratio has tightened ${pctFmt(ratioChange)} over the last 3 (${ratioLast3.toFixed(2)} vs ${ratioCareer.toFixed(2)} career), but the opposition also stepped up (~+${oppStep} Elo vs career average). Read it as context first, decline second — the next fight against level competition is the real test.`,
      });
    } else if (deepMileage) {
      out.push({
        kind: 'negative',
        text: `Landed:absorbed ratio has tightened ${pctFmt(ratioChange)} over the last 3 (${ratioLast3.toFixed(2)} vs ${ratioCareer.toFixed(2)} career) against similar-level opposition, ${mileageNote} — the classic wear pattern. For the next fight it means thinner margins for error, especially if the pace holds into later rounds.`,
      });
    } else {
      out.push({
        kind: 'caution',
        text: `Landed:absorbed ratio is down ${pctFmt(ratioChange)} across the last 3, but with a short career sample and no mileage red flags this is a lean, not a pattern — one more fight decides.`,
      });
    }
  }

  // Margin widening — ascending read, sample-aware.
  if (ratioChange >= 0.15 && outputChange >= -0.05) {
    out.push({
      kind: 'positive',
      text: stepUp
        ? `Margins are widening (${ratioLast3.toFixed(2)} landed per absorbed over the last 3, vs ${ratioCareer.toFixed(2)} career) while the opposition stepped up ~+${oppStep} Elo — the strongest version of an ascending signal.`
        : `Margins are widening — ${ratioLast3.toFixed(2)} landed per absorbed over the last 3, vs ${ratioCareer.toFixed(2)} career. Trajectory points up, with the usual 3-fight caveat.`,
    });
  }

  // Age risk that the stat line hasn't shown yet — MMA age curves bend fast.
  if (ctx.age != null && ctx.age >= 36 && ratioChange > -0.15) {
    out.push({
      kind: 'caution',
      text: `At ${ctx.age}, age risk is live even while the numbers hold — MMA age curves bend quickly past the mid-30s, and the drop tends to arrive suddenly rather than gradually.`,
    });
  }

  // Output falling with the margin holding → pace, not damage.
  if (outputChange <= -0.2 && ratioChange > -0.15) {
    out.push({
      kind: 'caution',
      text: `Volume is down ${pctFmt(outputChange)} over the last 3 but the strike ratio is holding — slower fights, not one-sided ones. Style of recent opponents matters here; expect the number to swing back against a pressure matchup.`,
    });
  }

  // Durability: heavy damage history on a worn fighter.
  if (a.durability.timesFinished >= 4 || (a.durability.kdAbsorbedPer15 >= 0.3 && deepMileage)) {
    out.push({
      kind: 'negative',
      text: `Damage history is real: finished ${a.durability.timesFinished} times${a.durability.lastFinishedYear ? ` (last ${a.durability.lastFinishedYear})` : ''}, absorbing ${a.durability.kdAbsorbedPer15.toFixed(2)} knockdowns/15 for the career. Late-career chins rarely improve — factor it against heavy hitters.`,
    });
  }

  // Layoff.
  if (ctx.monthsSinceLastFight >= 12) {
    out.push({
      kind: 'caution',
      text: `${Math.round(ctx.monthsSinceLastFight)} months since the last fight — the rating already regresses for inactivity, but first-fight-back rust is a real pattern on top of it.`,
    });
  }

  // Far below peak — the chart usually shows why.
  if (ctx.eloPeak - ctx.eloRating >= 120 && deepMileage) {
    out.push({
      kind: 'neutral',
      text: `Current rating sits ${Math.round(ctx.eloPeak - ctx.eloRating)} Elo below the career peak — the engine has already priced the slide; the timeline above shows when it started.`,
    });
  }

  if (out.length === 0) {
    out.push({
      kind: 'neutral',
      text: 'Output, margins and durability are all tracking near the career baseline — no macro trend worth pricing into the next fight.',
    });
  }
  return out.slice(0, 4);
}

// ── Division benchmark ───────────────────────────────────────────────────
// Median landed:absorbed ratio (and per-15 rates) across a division's RANKED
// fighters — the "what's normal at this level" yardstick shown next to a
// fighter's own ratio. Memoized per division (the ranked pool only changes
// when the data reloads).

export interface RatioBenchmark {
  ratio: number;          // median landed:absorbed among ranked fighters
  landedPer15: number;    // median
  absorbedPer15: number;  // median
  sample: number;         // how many ranked fighters had chartable data
}

const benchCache = new Map<string, RatioBenchmark | null>();

export function divisionRatioBenchmark(
  data: LoadedData,
  division: string,
  rankedIds: string[],
): RatioBenchmark | null {
  const hit = benchCache.get(division);
  if (hit !== undefined) return hit;

  const ratios: number[] = [];
  const landed: number[] = [];
  const absorbed: number[] = [];
  for (const id of rankedIds) {
    const a = getAdvancedStats(data, id);
    const r = a ? ratioOf(a.career) : null;
    if (a && r != null) {
      ratios.push(r);
      landed.push(a.career.landedPer15);
      absorbed.push(a.career.absorbedPer15);
    }
  }
  const median = (xs: number[]) => {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const result = ratios.length >= 10
    ? {
        ratio: Math.round(median(ratios) * 100) / 100,
        landedPer15: Math.round(median(landed) * 10) / 10,
        absorbedPer15: Math.round(median(absorbed) * 10) / 10,
        sample: ratios.length,
      }
    : null;
  benchCache.set(division, result);
  return result;
}

// ── The Gauntlet ───────────────────────────────────────────────────────────
// Every fight plotted at the OPPONENT's Elo the night it happened, against the
// fighter's own Elo trajectory. This is the career-story chart: level of
// competition (dots), where the fighter's own rating sat (line), and how often
// they beat the number (overperformance). All derived from the Elo trace — no
// engine or loader changes. Display-only, like everything in this file.

export interface GauntletPoint {
  date: string;            // ISO "YYYY-MM-DD"
  opponentName: string;
  result: 'W' | 'L' | 'D';
  method: string;
  // Finish type drives the dot ring: 'ko' = magenta, 'sub' = cyan, null =
  // decision (no ring). Deliberately NOT gold (champion/title) or red (loss).
  finishType: 'ko' | 'sub' | null;
  opponentElo: number;     // opponent's rating at fight time (the dot height)
  ownElo: number;          // fighter's rating AFTER the fight (trajectory line)
  delta: number;           // per-fight Elo swing (dot size = |delta|)
  expected: number;        // pre-fight win expectancy vs this opponent (0–1)
  overUnder: number;       // actual − expected for this fight (+ = upset win)
  cumOverperf: number;     // running Σ(actual − expected) — "wins above expected"
}

export interface Gauntlet {
  points: GauntletPoint[];   // ascending by date
  totalOverperf: number;     // final cumulative actual − expected
  biggestUpset: GauntletPoint | null; // largest positive overUnder win
  eloMin: number;
  eloMax: number;
}

// Elo win expectancy — the same logistic the engine uses, recomputed here from
// the pre-fight ratings the trace already stores (no coupling to eloEngine).
function winExpectancy(ratingFor: number, ratingAgainst: number): number {
  return 1 / (1 + Math.pow(10, (ratingAgainst - ratingFor) / 400));
}

export function buildGauntlet(history: FightTrace[]): Gauntlet | null {
  // Trace is newest-first; the chart reads left→right in time. Only fights
  // against a RATED opponent can be placed (opponentRating 0 = unrated/Sherdog).
  const traced = history.filter((h) => h.opponentRating > 0);
  if (traced.length < 2) return null;
  const asc = [...traced].reverse();

  let cum = 0;
  let biggest: GauntletPoint | null = null;
  const points: GauntletPoint[] = asc.map((h) => {
    const expected = winExpectancy(h.ratingBefore, h.opponentRating);
    const actual = h.result === 'W' ? 1 : h.result === 'D' ? 0.5 : 0;
    const ou = actual - expected;
    cum += ou;
    const m = h.method.trim().toUpperCase();
    const finishType: 'ko' | 'sub' | null =
      m.startsWith('KO') || m.startsWith('TKO') ? 'ko' : m === 'SUB' ? 'sub' : null;
    const pt: GauntletPoint = {
      date: h.date.slice(0, 10),
      opponentName: h.opponentName,
      result: h.result,
      method: h.method,
      finishType,
      opponentElo: Math.round(h.opponentRating),
      ownElo: Math.round(h.ratingAfter),
      delta: Math.round(h.delta),
      expected: Math.round(expected * 100) / 100,
      overUnder: Math.round(ou * 100) / 100,
      cumOverperf: Math.round(cum * 100) / 100,
    };
    if (h.result === 'W' && (!biggest || ou > biggest.overUnder)) biggest = pt;
    return pt;
  });

  const elos = points.flatMap((p) => [p.opponentElo, p.ownElo]);
  return {
    points,
    totalOverperf: Math.round(cum * 10) / 10,
    biggestUpset: biggest,
    eloMin: Math.min(...elos),
    eloMax: Math.max(...elos),
  };
}

// Recent-form drift → bounded Elo nudge, for the DISPLAY-ONLY "form-adjusted"
// win probability (compare page + upcoming cards). Reads the same signals the
// metrics bonus uses (strike differential + takedown drift, ~1 TD ≈ 5 strikes),
// scaled ~2.2 Elo per drift point and clamped to ±45 — enough to shade a
// pick'em, never enough to flip a clear Elo gap. The validated headline
// probability stays pure Elo; this variant is labeled experimental in the UI.
export function formEloNudge(drift: FormDrift | null | undefined): number {
  if (!drift) return 0;
  const score = drift.diffPer15Delta * 0.7 + drift.tdPer15Delta * 5 * 0.3;
  return Math.max(-45, Math.min(45, Math.round(score * 2.2 * 10) / 10));
}

// ── helpers ──────────────────────────────────────────────────────────────

function fightMinutes(f: Fight): number | null {
  const m = /^(\d+):(\d{1,2})$/.exec(f.fightTime.trim());
  if (!m || !f.round || f.round < 1) return null;
  const mins = (f.round - 1) * 5 + parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
  return mins > 0 && mins <= 60 ? mins : null;
}

// One fighter's side of a fight row.
interface Side {
  result: string;
  opponentName: string;
  landed: number;
  absorbed: number;
  td: number;
  tdAbsorbed: number;
  kd: number;
  kdAbsorbed: number;
  subAtt: number;
  ctrlSec: number;
  sigAcc: number;
}

function sideOf(f: Fight, fighterId: string): Side {
  const first = f.fighterId1 === fighterId;
  return first
    ? {
        result: f.result1, opponentName: f.fighter2Name,
        landed: f.str1, absorbed: f.str2, td: f.td1, tdAbsorbed: f.td2,
        kd: f.kd1, kdAbsorbed: f.kd2, subAtt: f.sub1, ctrlSec: f.ctrl1, sigAcc: f.sigStrPct1,
      }
    : {
        result: f.result2, opponentName: f.fighter1Name,
        landed: f.str2, absorbed: f.str1, td: f.td2, tdAbsorbed: f.td1,
        kd: f.kd2, kdAbsorbed: f.kd1, subAtt: f.sub2, ctrlSec: f.ctrl2, sigAcc: f.sigStrPct2,
      };
}

function buildWindow(samples: { side: Side; minutes: number }[]): PaceWindow {
  const minutes = samples.reduce((s, x) => s + x.minutes, 0);
  const per15 = (total: number) => (minutes > 0 ? (total / minutes) * 15 : 0);
  const sum = (pick: (s: Side) => number) => samples.reduce((s, x) => s + pick(x.side), 0);
  const accSamples = samples.filter((x) => x.side.sigAcc > 0);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    fights: samples.length,
    minutes: Math.round(minutes),
    landedPer15: r1(per15(sum((s) => s.landed))),
    absorbedPer15: r1(per15(sum((s) => s.absorbed))),
    diffPer15: r1(per15(sum((s) => s.landed - s.absorbed))),
    tdPer15: r1(per15(sum((s) => s.td))),
    tdAbsorbedPer15: r1(per15(sum((s) => s.tdAbsorbed))),
    kdPer15: Math.round(per15(sum((s) => s.kd)) * 100) / 100,
    subAttPer15: r1(per15(sum((s) => s.subAtt))),
    ctrlSharePct: minutes > 0 ? r1((sum((s) => s.ctrlSec) / (minutes * 60)) * 100) : 0,
    sigAccuracy: accSamples.length
      ? Math.round((accSamples.reduce((s, x) => s + x.side.sigAcc, 0) / accSamples.length) * 1000) / 1000
      : null,
  };
}

// Raw Method Details are noisy and over-specific ("Punch to Head At Distance",
// "Kick to Head At DistanceFront kick") — bucket them into a readable taxonomy
// so the finish-anatomy panel groups sensibly. Order matters: more specific
// submission names first ("Triangle Armbar" before "Armbar"/"Triangle").
const SUB_TAXONOMY: [string, string][] = [
  ['rear naked', 'Rear Naked Choke'],
  ["d'arce", "D'Arce Choke"],
  ['anaconda', 'Anaconda Choke'],
  ['arm triangle', 'Arm Triangle'],
  ['triangle armbar', 'Triangle Armbar'],
  ['triangle', 'Triangle Choke'],
  ['guillotine', 'Guillotine Choke'],
  ['armbar', 'Armbar'],
  ['kimura', 'Kimura'],
  ['kneebar', 'Kneebar'],
  ['heel hook', 'Heel Hook'],
  ['ankle', 'Ankle Lock'],
  ['americana', 'Americana'],
  ['ezekiel', 'Ezekiel Choke'],
  ['von flue', 'Von Flue Choke'],
  ['twister', 'Twister'],
  ['neck crank', 'Neck Crank'],
  ['choke', 'Other choke'],
];

function cleanFinishLabel(method: string, details: string): string {
  const m = method.trim().toUpperCase();
  const d = details.toLowerCase();
  if (m === 'SUB') {
    for (const [needle, label] of SUB_TAXONOMY) if (d.includes(needle)) return label;
    return 'Submission (other)';
  }
  if (m.startsWith('KO') || m.startsWith('TKO')) {
    if (d.includes('punch')) return 'Punches';
    if (d.includes('elbow')) return 'Elbows';
    if (d.includes('knee')) return 'Knees';
    if (d.includes('kick') && d.includes('head')) return 'Head kick';
    if (d.includes('kick') && d.includes('body')) return 'Body kick';
    if (d.includes('kick') && d.includes('leg')) return 'Leg kicks';
    if (d.includes('kick')) return 'Kicks';
    if (d.includes('injury')) return 'Injury stoppage';
    if (d.includes('doctor')) return 'Doctor stoppage';
    if (d.includes('retire') || d.includes('corner')) return 'Corner stoppage';
    return 'KO/TKO (other)';
  }
  return '';
}

function topFinishes(entries: string[]): FinishBreakdownEntry[] {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e, (counts.get(e) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

// Landed:absorbed ratio of a window. Capped so a near-untouched run (absorbed
// ≈ 0) reads as "9.99+" instead of infinity.
function ratioOf(w: PaceWindow | null): number | null {
  if (!w || w.landedPer15 <= 0) return null;
  if (w.absorbedPer15 < 1) return 9.99;
  return Math.round((w.landedPer15 / w.absorbedPer15) * 100) / 100;
}

// ── main ─────────────────────────────────────────────────────────────────

export function getAdvancedStats(data: LoadedData, fighterId: string): AdvancedStats | null {
  const all = (data.fighterFights.get(fighterId) ?? [])
    .filter((f) => f.eventDate)
    .sort((a, b) => a.eventDate!.getTime() - b.eventDate!.getTime());
  if (all.length === 0) return null;

  // Metric-bearing fights with usable time + strike data → rate samples.
  const samples: { fight: Fight; side: Side; minutes: number }[] = [];
  for (const f of all) {
    if (!f.hasMetrics) continue;
    const minutes = fightMinutes(f);
    if (minutes == null) continue;
    const side = sideOf(f, fighterId);
    if (side.landed + side.absorbed === 0) continue; // missing early-era data
    samples.push({ fight: f, side, minutes });
  }
  if (samples.length === 0) return null;

  const career = buildWindow(samples);
  const recentSamples = samples.slice(-RECENT_WINDOW);
  const recent = recentSamples.length >= MIN_RECENT_FIGHTS ? buildWindow(recentSamples) : null;
  const last3 = samples.length >= TREND_WINDOW ? buildWindow(samples.slice(-TREND_WINDOW)) : null;

  let drift: FormDrift | null = null;
  if (recent) {
    drift = {
      landedPer15Delta: Math.round((recent.landedPer15 - career.landedPer15) * 10) / 10,
      landedPctChange:
        career.landedPer15 >= 5
          ? Math.round((recent.landedPer15 / career.landedPer15 - 1) * 1000) / 1000
          : null,
      diffPer15Delta: Math.round((recent.diffPer15 - career.diffPer15) * 10) / 10,
      tdPer15Delta: Math.round((recent.tdPer15 - career.tdPer15) * 10) / 10,
      sigAccuracyDelta:
        recent.sigAccuracy != null && career.sigAccuracy != null
          ? Math.round((recent.sigAccuracy - career.sigAccuracy) * 1000) / 1000
          : null,
    };
  }

  const timeline: FormPoint[] = samples.map(({ fight, side, minutes }) => ({
    fightId: fight.fightId,
    date: fight.eventDate!.toISOString().slice(0, 10),
    result: side.result || '—',
    opponentName: side.opponentName,
    method: fight.method,
    minutes: Math.round(minutes * 10) / 10,
    landedPer15: Math.round((side.landed / minutes) * 15 * 10) / 10,
    absorbedPer15: Math.round((side.absorbed / minutes) * 15 * 10) / 10,
    tdPer15: Math.round((side.td / minutes) * 15 * 10) / 10,
    kd: side.kd,
  }));

  const rollingLanded = timeline.map((_, i) => {
    const win = timeline.slice(Math.max(0, i - 2), i + 1);
    return Math.round((win.reduce((s, p) => s + p.landedPer15, 0) / win.length) * 10) / 10;
  });

  // Durability counts use ALL dated fights (Sherdog rows carry method+result).
  let koTkoLosses = 0, subLosses = 0, decisionLosses = 0, lastFinishedYear: number | null = null;
  const finishWinLabels: string[] = [];
  const finishedByLabels: string[] = [];
  for (const f of all) {
    const side = sideOf(f, fighterId);
    const m = f.method.trim().toUpperCase();
    const isKo = m.startsWith('KO') || m.startsWith('TKO');
    const isSub = m === 'SUB';
    if (side.result === 'L') {
      if (isKo) koTkoLosses++;
      else if (isSub) subLosses++;
      else if (m.includes('DEC')) decisionLosses++;
      if (isKo || isSub) {
        lastFinishedYear = f.eventDate!.getFullYear();
        const label = cleanFinishLabel(f.method, f.methodDetails);
        if (label) finishedByLabels.push(label);
      }
    }
    if (side.result === 'W' && (isKo || isSub)) {
      const label = cleanFinishLabel(f.method, f.methodDetails);
      if (label) finishWinLabels.push(label);
    }
  }

  return {
    sampleFights: samples.length,
    totalMinutes: career.minutes,
    career,
    recent,
    last3,
    drift,
    ratioCareer: ratioOf(career),
    ratioLast3: ratioOf(last3),
    timeline,
    rollingLanded,
    durability: {
      koTkoLosses,
      subLosses,
      decisionLosses,
      timesFinished: koTkoLosses + subLosses,
      lastFinishedYear,
      kdAbsorbedPer15: career.minutes > 0
        ? Math.round((samples.reduce((s, x) => s + x.side.kdAbsorbed, 0) / career.minutes) * 15 * 100) / 100
        : 0,
      strikesAbsorbedPer15: career.absorbedPer15,
    },
    finishWins: topFinishes(finishWinLabels),
    finishedBy: topFinishes(finishedByLabels),
  };
}
