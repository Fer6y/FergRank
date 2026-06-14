// ─────────────────────────────────────────────────────────────────────────
//  filters.ts — user-facing live-ranking filters (DESIGN_VISION §6)
//
//  The four sliders re-run the real algorithm. Each maps onto Elo-core knobs.
//  CRITICAL INVARIANT: the neutral position (era=null, all weights = 0.5)
//  reproduces RANKING_CONFIG EXACTLY, so default rankings are byte-identical to
//  the un-filtered engine. Verify with scripts after touching the mappings.
// ─────────────────────────────────────────────────────────────────────────

import { RANKING_CONFIG } from './rankingConfig';

export interface FilterParams {
  eraStartYear: number | null; // only count fights from this year onward; null = all-time
  finishWeight: number;        // 0..1, 0.5 = neutral (how much finishing matters)
  recencyWeight: number;       // 0..1, 0.5 = neutral (how much recent fights dominate)
  activityWeight: number;      // 0..1, 0.5 = neutral (how hard layoffs are penalized)
}

export const DEFAULT_FILTERS: FilterParams = {
  eraStartYear: null,
  finishWeight: 0.5,
  recencyWeight: 0.5,
  activityWeight: 0.5,
};

export function isDefaultFilters(f: FilterParams): boolean {
  return (
    f.eraStartYear == null &&
    f.finishWeight === 0.5 &&
    f.recencyWeight === 0.5 &&
    f.activityWeight === 0.5
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Elo params the engine reads. Structural (number-typed) so computed overrides
// assign cleanly — RANKING_CONFIG.elo is `as const` (literal types) and can't
// take a computed baseK directly.
export interface EloParams {
  initialRating: number;
  baseK: number;
  provisionalFights: number;
  provisionalKMultiplier: number;
  inactivityRetentionPerYear: number;
  inactivityGraceMonths: number;
  moveDecayPenalty: number;
  displayEloFloor: number;
  displayEloCeil: number;
}

export interface EffectiveEngine {
  elo: EloParams;
  finishMultipliers: Record<string, number>;
  eraStartYear: number | null;
  recencyHalfLifeMonths: number; // scoring-side metric/SoS window
  signature: string;             // cache key
  isDefault: boolean;
}

export function effectiveEngine(filters: FilterParams): EffectiveEngine {
  const def = isDefaultFilters(filters);
  const base = RANKING_CONFIG.elo;

  // finishWeight: scale the deviation of each multiplier from 1.0. 0.5→×1 (base),
  // 0→all multipliers collapse to 1.0 (finishing irrelevant), 1→double the spread.
  const finishScale = filters.finishWeight / 0.5;
  const finishMultipliers: Record<string, number> = {};
  for (const [k, v] of Object.entries(RANKING_CONFIG.finishMultipliers)) {
    finishMultipliers[k] = 1 + (v - 1) * finishScale;
  }

  // recencyWeight: higher → bigger K (more reactive) + shorter metric half-life.
  const baseK = base.baseK * (0.6 + filters.recencyWeight * 0.8); // 0.5→×1
  const recencyHalfLifeMonths = clamp(
    RANKING_CONFIG.recencyHalfLifeMonths * (1.5 - filters.recencyWeight), // 0.5→×1
    3,
    36
  );

  // activityWeight: higher → harsher inactivity regression (lower retention).
  const inactivityRetentionPerYear = clamp(
    base.inactivityRetentionPerYear - (filters.activityWeight - 0.5) * 0.4, // 0.5→base
    0.5,
    0.99
  );

  const elo: EloParams = {
    ...base,
    baseK,
    inactivityRetentionPerYear,
  };

  return {
    elo,
    finishMultipliers,
    eraStartYear: filters.eraStartYear,
    recencyHalfLifeMonths,
    signature: def ? 'default' : JSON.stringify(filters),
    isDefault: def,
  };
}

// Parse filter params from a URLSearchParams (API route / client fetch).
export function parseFilters(params: URLSearchParams): FilterParams {
  const num = (key: string, fallback: number) => {
    const v = params.get(key);
    if (v == null || v === '') return fallback;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const eraRaw = params.get('era');
  const eraStartYear = eraRaw && eraRaw !== 'all' ? parseInt(eraRaw, 10) : null;
  return {
    eraStartYear: Number.isFinite(eraStartYear as number) ? eraStartYear : null,
    finishWeight: clamp(num('finish', 0.5), 0, 1),
    recencyWeight: clamp(num('recency', 0.5), 0, 1),
    activityWeight: clamp(num('activity', 0.5), 0, 1),
  };
}
