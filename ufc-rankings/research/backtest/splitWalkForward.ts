// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/splitWalkForward.ts — expanding-window train/test splits.
//
//  The anti-leakage spine of parameter selection. We never score a param set on
//  fights it was tuned on: for each test year we train (calibrate) only on
//  earlier fights, predict that year, and pool the held-out predictions.
//
//  Note the Elo ratings themselves are already point-in-time (a fight's
//  ratingBefore uses only earlier fights — chronological sweep). The fold split
//  governs the CALIBRATION fit and the scoring window, so the reported log-loss
//  is genuinely out-of-sample.
// ─────────────────────────────────────────────────────────────────────────

export interface Fold<T> {
  testLabel: number;
  train: T[]; // strictly-earlier fights (for calibration)
  test: T[];  // the held-out year
}

// Expanding window: for each year in `testYears`, train = rows before that year,
// test = rows in that year. Folds with an empty side are dropped.
export function expandingWalkForward<T>(
  rows: T[],
  year: (t: T) => number,
  testYears: number[]
): Fold<T>[] {
  const folds: Fold<T>[] = [];
  for (const ty of testYears) {
    const train = rows.filter((r) => year(r) < ty);
    const test = rows.filter((r) => year(r) === ty);
    if (train.length && test.length) folds.push({ testLabel: ty, train, test });
  }
  return folds;
}

// Default: hold out the most recent `nTest` years, requiring at least
// `minTrainYears` of history before the first test year.
export function defaultTestYears<T>(
  rows: T[],
  year: (t: T) => number,
  nTest = 5,
  minTrainYears = 3
): number[] {
  const years = [...new Set(rows.map(year))].filter((y) => !Number.isNaN(y)).sort((a, b) => a - b);
  if (years.length <= minTrainYears) return [];
  const firstTestable = years[minTrainYears];
  const testable = years.filter((y) => y >= firstTestable);
  return testable.slice(-nTest);
}
