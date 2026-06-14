// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/metrics.ts — proper scoring + calibration + a blend model.
//
//  Win rates don't tell you if a model is GOOD; proper scores do. Each fight is
//  one prediction: p = P(favourite wins), y = did the favourite win. We report:
//    • log-loss  — the betting-relevant score (punishes confident errors hard)
//    • Brier     — mean squared error of the probability
//    • accuracy  — fraction the >0.5 side got right
//    • reliability/ECE — are the probabilities themselves honest?
//  Plus a logistic blend(Elo, market) fit by IRLS — the test of whether Elo
//  carries information the closing line doesn't already contain.
// ─────────────────────────────────────────────────────────────────────────

export interface Prediction {
  p: number;     // predicted P(favourite wins)
  won: boolean;  // did the favourite win?
}

const EPS = 1e-12;
const clampP = (p: number): number => Math.min(1 - EPS, Math.max(EPS, p));

export function logLoss(rows: Prediction[]): number {
  if (!rows.length) return NaN;
  let s = 0;
  for (const r of rows) {
    const p = clampP(r.p);
    s += r.won ? -Math.log(p) : -Math.log(1 - p);
  }
  return s / rows.length;
}

export function brier(rows: Prediction[]): number {
  if (!rows.length) return NaN;
  let s = 0;
  for (const r of rows) {
    const y = r.won ? 1 : 0;
    s += (r.p - y) * (r.p - y);
  }
  return s / rows.length;
}

export function accuracy(rows: Prediction[]): number {
  if (!rows.length) return NaN;
  let c = 0;
  for (const r of rows) if ((r.p >= 0.5) === r.won) c++;
  return c / rows.length;
}

export interface ReliabilityBin {
  lo: number;
  hi: number;
  n: number;
  predMean: number; // mean predicted prob in the bin
  realized: number; // realised win frequency in the bin
}

// Bucket predictions and compare predicted vs realised — the calibration curve.
export function reliability(rows: Prediction[], bins = 10): ReliabilityBin[] {
  const out: ReliabilityBin[] = [];
  for (let i = 0; i < bins; i++) {
    const lo = i / bins;
    const hi = (i + 1) / bins;
    const inBin = rows.filter((r) => (i === bins - 1 ? r.p >= lo && r.p <= hi : r.p >= lo && r.p < hi));
    const n = inBin.length;
    const predMean = n ? inBin.reduce((s, r) => s + r.p, 0) / n : 0;
    const realized = n ? inBin.filter((r) => r.won).length / n : 0;
    out.push({ lo, hi, n, predMean, realized });
  }
  return out;
}

// Expected Calibration Error: n-weighted mean |predMean − realized|. 0 = perfect.
export function ece(rows: Prediction[], bins = 10): number {
  const rel = reliability(rows, bins);
  const n = rows.length || 1;
  return rel.reduce((s, b) => s + (b.n / n) * Math.abs(b.predMean - b.realized), 0);
}

export interface ScoreSet {
  n: number;
  logLoss: number;
  brier: number;
  accuracy: number;
  ece: number;
}

export function score(rows: Prediction[]): ScoreSet {
  return {
    n: rows.length,
    logLoss: logLoss(rows),
    brier: brier(rows),
    accuracy: accuracy(rows),
    ece: ece(rows),
  };
}

// ── logistic helpers + IRLS fit (for the Elo/market blend) ──
export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
export const logit = (p: number): number => {
  const c = clampP(p);
  return Math.log(c / (1 - c));
};

// Solve A x = b for small dense A (Gauss-Jordan with partial pivoting).
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col] || 1e-12;
    for (let c = col; c <= n; c++) M[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

// Fit logistic regression by IRLS. X is n×k (no intercept column — added here).
// Returns weights of length k+1, intercept first. Small ridge keeps it stable
// under separation. Reusable for the walk-forward blend in Phase 2.
export function fitLogistic(X: number[][], y: number[], iters = 30, ridge = 1e-6): number[] {
  const n = X.length;
  const k = X[0]?.length ?? 0;
  const Z = X.map((row) => [1, ...row]); // design matrix with intercept
  let w = new Array(k + 1).fill(0);
  for (let it = 0; it < iters; it++) {
    // Build ZᵀWZ (+ridge) and ZᵀW z_work
    const H = Array.from({ length: k + 1 }, () => new Array(k + 1).fill(0));
    const g = new Array(k + 1).fill(0);
    for (let i = 0; i < n; i++) {
      const eta = Z[i].reduce((s, v, j) => s + v * w[j], 0);
      const mu = sigmoid(eta);
      const wgt = Math.max(mu * (1 - mu), 1e-9);
      const zwork = eta + (y[i] - mu) / wgt;
      for (let a = 0; a <= k; a++) {
        g[a] += Z[i][a] * wgt * zwork;
        for (let b = 0; b <= k; b++) H[a][b] += Z[i][a] * wgt * Z[i][b];
      }
    }
    for (let a = 0; a <= k; a++) H[a][a] += ridge;
    w = solveLinear(H, g);
  }
  return w;
}

export function predictLogistic(weights: number[], xRow: number[]): number {
  const eta = weights[0] + xRow.reduce((s, v, j) => s + v * weights[j + 1], 0);
  return sigmoid(eta);
}
