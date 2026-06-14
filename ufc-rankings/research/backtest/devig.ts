// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/devig.ts — turn two decimal prices into true probabilities.
//
//  A book's implied probabilities (1/odds) sum to >1; the excess is the vig.
//  How you strip it matters: the naive proportional method leaves favourite-
//  longshot bias (it overstates heavy dogs, understates heavy favourites).
//  We offer three methods so runBacktest can pick whichever is best-calibrated
//  against realised results:
//    • multiplicative — proportional 1/odds. Simple, biased at the extremes.
//    • power          — p_i ∝ (1/odds_i)^τ. Shrinks the tails, cheap FLB fix.
//    • shin           — models a share of insider money; principled FLB fix.
// ─────────────────────────────────────────────────────────────────────────

export type DevigMethod = 'multiplicative' | 'power' | 'shin';

export const DEVIG_METHODS: DevigMethod[] = ['multiplicative', 'power', 'shin'];

export interface TwoWayProbs {
  pFav: number;     // de-vigged P(favourite)
  pDog: number;     // de-vigged P(underdog)
  overround: number; // booksum (1/favOdds + 1/dogOdds); >1
}

function multiplicative(piF: number, piD: number): TwoWayProbs {
  const b = piF + piD;
  return { pFav: piF / b, pDog: piD / b, overround: b };
}

// p_i ∝ pi_i^τ, with τ ≥ 1 chosen so the two sum to 1. f(τ) = piF^τ + piD^τ is
// strictly decreasing in τ (both bases < 1), so a bisection converges cleanly.
function power(piF: number, piD: number): TwoWayProbs {
  const overround = piF + piD;
  let lo = 1;
  let hi = 100;
  const f = (t: number) => Math.pow(piF, t) + Math.pow(piD, t) - 1;
  // f(1) = overround - 1 > 0; f(hi) → -1 < 0.
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  const t = (lo + hi) / 2;
  const a = Math.pow(piF, t);
  const c = Math.pow(piD, t);
  const s = a + c;
  return { pFav: a / s, pDog: c / s, overround };
}

// Shin (1992): assumes a fraction z of money is from insiders; backs out the
// "true" probabilities that, marked up for that adverse selection, reproduce the
// quoted prices. p_i(z) = (√(z² + 4(1−z)·pi_i²/b) − z) / (2(1−z)). Σ p_i is
// decreasing in z; bisect z so it equals 1. Falls back to multiplicative if the
// solve misbehaves (e.g. tiny/degenerate overround).
function shin(piF: number, piD: number): TwoWayProbs {
  const b = piF + piD;
  const p = (z: number, pi: number) =>
    (Math.sqrt(z * z + (4 * (1 - z) * pi * pi) / b) - z) / (2 * (1 - z));
  const sum = (z: number) => p(z, piF) + p(z, piD);
  // sum(0) = √b > 1; sum grows then we need it = 1 → z in (0, ~0.5).
  let lo = 0;
  let hi = 0.999;
  if (sum(lo) < 1) return multiplicative(piF, piD); // degenerate; no insider share
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (sum(mid) > 1) lo = mid;
    else hi = mid;
  }
  const z = (lo + hi) / 2;
  const pFav = p(z, piF);
  const pDog = p(z, piD);
  const s = pFav + pDog;
  if (!Number.isFinite(s) || s <= 0) return multiplicative(piF, piD);
  return { pFav: pFav / s, pDog: pDog / s, overround: b };
}

export function devig(favOdds: number, dogOdds: number, method: DevigMethod): TwoWayProbs {
  const piF = 1 / favOdds;
  const piD = 1 / dogOdds;
  switch (method) {
    case 'power':
      return power(piF, piD);
    case 'shin':
      return shin(piF, piD);
    case 'multiplicative':
    default:
      return multiplicative(piF, piD);
  }
}
