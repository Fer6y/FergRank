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

const RECENT_WINDOW = 5;      // "recent form" = last 5 metric-bearing fights
const MIN_RECENT_FIGHTS = 3;  // fewer than this → no recent window / no drift

// One fighter's side of one fight, pace-normalized. Chart + table fuel.
export interface FormPoint {
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
  drift: FormDrift | null;
  timeline: FormPoint[];       // ascending by date
  rollingLanded: number[];     // rolling-3 mean of landedPer15, aligned to timeline
  durability: Durability;
  finishWins: FinishBreakdownEntry[]; // how they finish opponents
  finishedBy: FinishBreakdownEntry[]; // how they have been finished
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
    drift,
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
