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

export interface GrappleGradient {
  value: number; // raw grappling axis, 0–1
  percentile: number; // 0–100 within the fighter's own-division 3+-fight pool
  color: string; // ramp colour at the percentile position
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
  return { value: g, percentile, color: rampColor(percentile / 100) };
}
