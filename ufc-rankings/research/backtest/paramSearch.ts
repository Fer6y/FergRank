// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/paramSearch.ts — choose Elo params by OOS prediction.
//
//  Replaces hand-tuning-to-champion-order with empirical selection: the params
//  that best predict HELD-OUT fights win. For each candidate we run the real
//  engine (buildEloWithTraces via the join), walk-forward-calibrate, and pool
//  the out-of-sample predictions.
//
//  Calibration is fit PER FOLD, so the search optimises the quality of the
//  ratings themselves — not the prob mapping (the Platt step already handles
//  that). Coordinate descent keeps it to ~sum-of-grids sweeps, not the product.
// ─────────────────────────────────────────────────────────────────────────

import { RANKING_CONFIG } from '../../src/lib/rankingConfig';
import { type EffectiveEngine, type EloParams } from '../../src/lib/filters';
import type { LoadedData } from '../../src/lib/loadData';
import { joinOddsToPredictions } from './pointInTime';
import { fitLogistic, predictLogistic, logit, logLoss, brier, type Prediction } from './metrics';
import { expandingWalkForward, defaultTestYears } from './splitWalkForward';

const BASE = RANKING_CONFIG.elo;

export interface SearchParams {
  baseK: number;
  provisionalFights: number;
  provisionalKMultiplier: number;
  inactivityRetentionPerYear: number;
  moveDecayPenalty: number;
  finishSpread: number; // scales (multiplier−1) of finishMultipliers; 1.0 = current
}

// The current production config, as a search point (the baseline to beat).
export const CURRENT: SearchParams = {
  baseK: BASE.baseK,
  provisionalFights: BASE.provisionalFights,
  provisionalKMultiplier: BASE.provisionalKMultiplier,
  inactivityRetentionPerYear: BASE.inactivityRetentionPerYear,
  moveDecayPenalty: BASE.moveDecayPenalty,
  finishSpread: 1.0,
};

export function paramsToEngine(p: SearchParams): EffectiveEngine {
  const elo: EloParams = {
    initialRating: BASE.initialRating,
    baseK: p.baseK,
    provisionalFights: p.provisionalFights,
    provisionalKMultiplier: p.provisionalKMultiplier,
    inactivityRetentionPerYear: p.inactivityRetentionPerYear,
    inactivityGraceMonths: BASE.inactivityGraceMonths,
    moveDecayPenalty: p.moveDecayPenalty,
    displayEloFloor: BASE.displayEloFloor,
    displayEloCeil: BASE.displayEloCeil,
  };
  const finishMultipliers: Record<string, number> = {};
  for (const [k, v] of Object.entries(RANKING_CONFIG.finishMultipliers)) {
    finishMultipliers[k] = 1 + (v - 1) * p.finishSpread;
  }
  return {
    elo,
    finishMultipliers,
    eraStartYear: null,
    recencyHalfLifeMonths: RANKING_CONFIG.recencyHalfLifeMonths,
    signature: 'search:' + JSON.stringify(p),
    isDefault: false,
  };
}

export interface EvalResult {
  oosLogLoss: number;
  oosBrier: number;
  n: number;
  nFolds: number;
}

const evalCache = new Map<string, EvalResult>();

// Out-of-sample calibrated log-loss for a param set (expanding walk-forward).
export function evaluateParams(data: LoadedData, p: SearchParams): EvalResult {
  const key = JSON.stringify(p);
  const cached = evalCache.get(key);
  if (cached) return cached;

  const engine = paramsToEngine(p);
  const { samples } = joinOddsToPredictions(data, engine);
  const testYears = defaultTestYears(samples, (s) => s.era, 5, 3);
  const folds = expandingWalkForward(samples, (s) => s.era, testYears);

  const pooled: Prediction[] = [];
  for (const f of folds) {
    const X = f.train.map((s) => [logit(s.eloProbFav)]);
    const y = f.train.map((s) => (s.favWon ? 1 : 0));
    const w = fitLogistic(X, y);
    for (const s of f.test) pooled.push({ p: predictLogistic(w, [logit(s.eloProbFav)]), won: s.favWon });
  }
  const res: EvalResult = {
    oosLogLoss: logLoss(pooled),
    oosBrier: brier(pooled),
    n: pooled.length,
    nFolds: folds.length,
  };
  evalCache.set(key, res);
  return res;
}

const GRIDS: Record<keyof SearchParams, number[]> = {
  baseK: [12, 18, 24, 32, 40, 50],
  provisionalFights: [3, 5, 8, 10],
  provisionalKMultiplier: [1.0, 1.25, 1.5, 2.0],
  inactivityRetentionPerYear: [0.8, 0.86, 0.92, 0.96, 1.0],
  moveDecayPenalty: [0, 0.1, 0.2, 0.3],
  finishSpread: [0, 0.5, 1.0, 1.5, 2.0],
};

export interface SearchResult {
  best: SearchParams;
  bestScore: number;
  baseline: SearchParams;
  baselineScore: number;
}

// Coordinate descent from the current config. Each pass sweeps one knob at a
// time over its grid, keeping any improvement, then moves to the next knob.
export function coordinateSearch(data: LoadedData, passes = 2, log = true): SearchResult {
  const baseline = { ...CURRENT };
  const baselineScore = evaluateParams(data, baseline).oosLogLoss;
  let best = { ...CURRENT };
  let bestScore = baselineScore;

  for (let pass = 0; pass < passes; pass++) {
    if (log) console.log(`\n  ── pass ${pass + 1} (current best logloss ${bestScore.toFixed(4)}) ──`);
    for (const key of Object.keys(GRIDS) as (keyof SearchParams)[]) {
      let lineBest = '';
      for (const val of GRIDS[key]) {
        const cand = { ...best, [key]: val } as SearchParams;
        const score = evaluateParams(data, cand).oosLogLoss;
        const mark = score < bestScore - 1e-6 ? ' *' : '';
        lineBest += `${val}:${score.toFixed(4)}${mark}  `;
        if (score < bestScore - 1e-6) { bestScore = score; best = cand; }
      }
      if (log) console.log(`   ${key.padEnd(26)} ${lineBest}`);
    }
  }
  return { best, bestScore, baseline, baselineScore };
}
