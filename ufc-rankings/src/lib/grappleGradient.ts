// ─────────────────────────────────────────────────────────────────────────
//  grappleGradient.ts — grappling proficiency colour ramp (DISPLAY ONLY)
//
//  A grey → blue SEQUENTIAL magnitude encoding: grey #4a4a52 (negligible
//  grappler) → mid #2f6fb0 → blue #4a9eff / --accent-blue (elite). It reads
//  "how much grappler, how deep?" — NOT good/bad — so the scale is floored at 0
//  (sequential), unlike the red↔green diverging chips used for signed deltas.
//
//  The underlying value is RadarAxes.grappling (fighterRadar.ts). The problem it
//  solves: on an absolute 0–1 fill, every strong grappler saturates to the same
//  firm blue and you see no gradient. So each fighter is ranked against their own
//  division's 3+-fight pool (a PERCENTILE), which stretches the crowded middle of
//  a division apart while honestly leaving the genuine elite tail bunched near
//  the top. Rendered as a full grey→blue track with a needle at the percentile
//  (see components/GrappleRamp.tsx) so even one fighter shows the whole gradient.
//
//  NEVER imported by eloEngine.ts / scoringEngine.ts — this is presentation only.
// ─────────────────────────────────────────────────────────────────────────

import { computeRadarAxes } from './fighterRadar';
import { getFighterPerspective, recencyWeight } from './scoringEngine';
import { RANKING_CONFIG } from './rankingConfig';
import type { LoadedData } from './loadData';

const GREY = [74, 74, 82] as const; // #4a4a52 — negligible grappler
const MID = [47, 111, 176] as const; // #2f6fb0 — mid
const BLUE = [74, 158, 255] as const; // #4a9eff — elite (--accent-blue)

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Colour on the grey→mid→blue ramp for t in [0,1]. Returns a css `rgb()` string. */
export function rampColor(t: number): string {
  const x = clamp01(t);
  const [from, to] = x < 0.5 ? [GREY, MID] : [MID, BLUE];
  const k = x < 0.5 ? x / 0.5 : (x - 0.5) / 0.5;
  const c = from.map((v, i) => Math.round(v + (to[i] - v) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/**
 * Raw grappling axis (0–1) for a fighter. Only `careerGroundPct` + the per-fight
 * grappling metrics drive this axis, so the other RadarContext fields are inert
 * placeholders here. Returns null if the fighter is unknown.
 */
export function grapplingValue(data: LoadedData, fighterId: string): number | null {
  const f = data.fighterMap.get(fighterId);
  if (!f) return null;
  return computeRadarAxes(data, fighterId, null, {
    sos: 50,
    eloDisplay: 50,
    monthsSinceLastFight: 6,
    careerFinishRate: f.koRate + f.subRate,
    careerSigAccuracy: f.sigStrikeAccuracy,
    careerGroundPct: f.groundPct,
  }).grappling;
}

// Per-division sorted grappling distribution over the 3+-fight pool, memoized.
// WeakMap-keyed by LoadedData so a data reload naturally drops the cache.
const poolCache = new WeakMap<LoadedData, Map<string, number[]>>();

function divisionPool(data: LoadedData, division: string): number[] {
  let per = poolCache.get(data);
  if (!per) {
    per = new Map();
    poolCache.set(data, per);
  }
  const hit = per.get(division);
  if (hit) return hit;

  const vals: number[] = [];
  for (const [id, f] of data.fighterMap) {
    if (f.weightClass !== division) continue;
    const dated = (data.fighterFights.get(id) || []).filter((x) => x.eventDate).length;
    if (dated < RANKING_CONFIG.minUFCFights) continue;
    const g = grapplingValue(data, id);
    if (g != null) vals.push(g);
  }
  vals.sort((a, b) => a - b);
  per.set(division, vals);
  return vals;
}

// ─── Per-fighter "why they sit here" breakdown ───────────────────────────
// The ramp percentile is driven by the recency-weighted grappling signals the
// radar uses (fighterRadar.ts). We recompute the three that are directly
// readable — TAKEDOWNS (differential), CONTROL time, and SUBMISSION threat — so
// the profile can name, per fighter, WHAT places them on the ramp: a
// control-heavy wrestler (Makhachev), a submission hunter (Oliveira) and a
// stand-up striker all get different sentences. (Career ground-share also feeds
// the axis at a small weight but the CSV column isn't cleanly interpretable per
// fighter, so it is deliberately left out of the narrative.) Display-only.

export interface GrappleTrait {
  key: 'takedowns' | 'control' | 'subs';
  label: string;   // "Control time"
  detail: string;  // human value, e.g. "2:40 / fight"
  strength: number; // -1..1 vs a neutral grappler (>0 asset, <0 gap)
}

export interface GrappleBreakdown {
  traits: GrappleTrait[]; // ordered strongest signal → weakest
  summary: string;        // per-fighter one-liner explaining the placement
  sampleFights: number;   // recent metric fights the read is built on
}

function fmtCtrl(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const clamp01x = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Recency-weighted grappling signals for a fighter over their recent division
 * fights, turned into a ranked, human-readable trait list + a summary sentence
 * describing why they sit where they do on the ramp. Null if unknown fighter.
 */
export function grappleBreakdown(
  data: LoadedData,
  fighterId: string,
  division: string | null,
  percentile: number
): GrappleBreakdown | null {
  const f = data.fighterMap.get(fighterId);
  if (!f) return null;

  const cfg = RANKING_CONFIG.radar;
  const norm = RANKING_CONFIG.metricsNorm;
  const now = new Date();
  const halfLife = RANKING_CONFIG.recencyHalfLifeMonths;

  const fights = (data.fighterFights.get(fighterId) || [])
    .filter(
      (x) =>
        x.eventDate &&
        x.hasMetrics !== false &&
        (!division || x.weightClass === division)
    )
    .sort((a, b) => b.eventDate!.getTime() - a.eventDate!.getTime())
    .slice(0, cfg.recentFights);

  let wSum = 0;
  let tdDiff = 0;
  let ctrl = 0;
  let sub = 0;
  for (const x of fights) {
    const p = getFighterPerspective(x, fighterId);
    if (!p) continue;
    const w = recencyWeight(x.eventDate, now, halfLife);
    const ctrlSelf = x.fighterId1 === fighterId ? x.ctrl1 : x.ctrl2;
    tdDiff += (p.tdSelf - p.tdOpp) * w;
    ctrl += (ctrlSelf || 0) * w;
    sub += p.subSelf * w;
    wSum += w;
  }

  if (wSum === 0) {
    // No per-fight metric sample (e.g. a Sherdog-recency-only fighter).
    return {
      traits: [],
      summary:
        'Not enough metric-tracked fights to break down takedowns, control or submissions — the ramp position leans on career grappling share alone.',
      sampleFights: 0,
    };
  }

  const avgTdDiff = tdDiff / wSum;
  const avgCtrl = ctrl / wSum;
  const avgSub = sub / wSum;

  // Each trait carries a signed strength vs a neutral grappler (>0 asset). For
  // takedowns, parity is neutral; for control and submissions, zero is neutral.
  const traits: GrappleTrait[] = ([
    {
      key: 'takedowns',
      label: 'Takedowns',
      detail:
        avgTdDiff >= 0.15
          ? `+${avgTdDiff.toFixed(1)} TD/fight edge`
          : avgTdDiff <= -0.15
            ? `${avgTdDiff.toFixed(1)} TD/fight against`
            : 'an even takedown battle',
      // avgTdDiff / norm → clamp to [-1,1]; e.g. +3 TD/fight ≈ full asset.
      strength: Math.max(-1, Math.min(1, avgTdDiff / norm.takedownsPerFight)),
    },
    {
      key: 'control',
      label: 'Control time',
      detail: `${fmtCtrl(avgCtrl)} of control / fight`,
      // 0s → -1 (nothing), controlSecondsFull → +1 (mat-dominant).
      strength: clamp01x(avgCtrl / cfg.controlSecondsFull) * 2 - 1,
    },
    {
      key: 'subs',
      label: 'Submission threat',
      detail:
        avgSub >= 0.05 ? `${avgSub.toFixed(1)} sub attempts / fight` : 'no sub attempts',
      strength: clamp01x(avgSub / norm.submissionsPerFight) * 2 - 1,
    },
  ] as GrappleTrait[]).sort((a, b) => b.strength - a.strength);

  const assets = traits.filter((t) => t.strength > 0.05);
  const worstGap = traits[traits.length - 1];

  let summary: string;
  if (assets.length === 0) {
    // No positive grappling signal — a striker who keeps it standing.
    summary =
      'Sits low — a stand-up fighter with no standout takedowns, control or submission threat; the division out-grapples them.';
  } else {
    const drivers = assets.slice(0, 2);
    const driverPhrase = drivers
      .map((t) => `${t.label.toLowerCase()} (${t.detail})`)
      .join(' and ');
    const anchor =
      percentile >= 75 ? 'Ranks high on' : percentile >= 45 ? 'Placed by' : 'Held up mainly by';
    // Call out a real gap only when it isn't already one of the named drivers.
    const gapPhrase =
      assets.length < 3 && worstGap.strength < -0.3
        ? ` — but light on ${worstGap.label.toLowerCase()} (${worstGap.detail})`
        : '';
    summary = `${anchor} ${driverPhrase}${gapPhrase}.`;
  }

  return { traits, summary, sampleFights: fights.length };
}

export interface GrappleGradient {
  value: number; // raw grappling axis, 0–1
  percentile: number; // 0–100 within the fighter's own-division 3+-fight pool
  color: string; // ramp colour at the percentile position
  breakdown: GrappleBreakdown | null; // per-fighter "why they sit here"
}

/**
 * Grappling proficiency for a fighter, ranked against their own division's
 * 3+-fight pool. `division` is the pool to rank against (null → fall back to the
 * raw value as its own percentile). Pass a precomputed `value` (e.g. the
 * profile's already-built radar.grappling) to avoid recomputing the axis.
 */
export function grappleGradient(
  data: LoadedData,
  fighterId: string,
  division: string | null,
  value?: number
): GrappleGradient | null {
  const g = value ?? grapplingValue(data, fighterId);
  if (g == null) return null;

  let percentile = Math.round(g * 100); // fallback when no usable division pool
  if (division) {
    const pool = divisionPool(data, division);
    if (pool.length >= 8) {
      const below = pool.filter((v) => v <= g).length;
      percentile = Math.round((below / pool.length) * 100);
    }
  }
  return {
    value: g,
    percentile,
    color: rampColor(percentile / 100),
    breakdown: grappleBreakdown(data, fighterId, division, percentile),
  };
}
