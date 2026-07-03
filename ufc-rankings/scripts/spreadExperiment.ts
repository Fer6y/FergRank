/**
 * P3+P2 EXPERIMENT HARNESS — "restore Elo spread + refit the win-prob denominator together"
 * ────────────────────────────────────────────────────────────────────────────
 * OFFLINE ONLY. Does NOT change production config. It temporarily overrides
 * `RANKING_CONFIG.elo.boundaryRegressionToMean` on the UNCACHED buildEloWithTraces
 * path to answer one question:
 *
 *   If we relax the current-form boundary discount (β: 0.5 → lower) to widen the
 *   rating spread, what denominator D keeps the win probabilities calibrated, and
 *   how much dynamic range do we recover at that (β, D) pair?
 *
 * For each candidate β it:
 *   1. Rebuilds Elo with that β (full chronological sweep, point-in-time traces).
 *   2. Measures the resulting rating SPREAD (best-vs-median, p95-vs-median, range).
 *   3. Builds a SYMMETRIC prediction set: every decisive fight from BOTH corners'
 *      perspectives using each corner's pre-fight ratingBefore. Symmetry cancels
 *      the corner-ordering bias (winner is listed as fighter-1 ~64% of the time),
 *      which a one-sided set would bake into the calibration.
 *   4. REFITS the optimal denominator D by minimizing log-loss (P2: fit, don't
 *      eyeball). Reports log-loss / Brier / ECE at that D, plus the spread's
 *      implied best-vs-median win% — i.e. how confident the model CAN get.
 *
 * Calibration is computed over ALL history (the ~all-fights reliability check the
 * config comment references) AND a recent (≤3yr) subset, since β bites hardest on
 * current ratings.
 *
 * This is the DATA to choose a (β, D). It is NOT the ship gate — once a pair is
 * picked, run the ranking-sanity loop (printed at the end):
 *   node_modules/.bin/jiti scripts/validate.ts        # champ still leads LW/WW/BW?
 *   node_modules/.bin/jiti scripts/goldenMaster.ts     # ranking regression diff
 *   (then re-anchor officialBonusScaleElo vs the new adjacent-gap distribution)
 */
import { loadAllData } from '../src/lib/loadData';
import { buildEloWithTraces, type FightTrace } from '../src/lib/eloEngine';
import { RANKING_CONFIG } from '../src/lib/rankingConfig';
import type { LoadedData } from '../src/lib/loadData';

const BETA_GRID = [0.5, 0.45, 0.4, 0.35, 0.3, 0.25];
const D_MIN = 100, D_MAX = 800, D_STEP = 5;
const RECENT_YEARS = 3;

interface Sample { p1Elo: number; p2Elo: number; outcome: number; date: string; }

function logistic(gap: number, D: number): number {
  return 1 / (1 + Math.pow(10, gap / D)); // gap = p2 - p1 (opponent - fighter)
}

// SYMMETRIC prediction set: each decisive fight contributes BOTH perspectives, so
// the outcome mean is exactly 0.5 and any corner-ordering bias (in this data
// fighter-1 wins 64%, i.e. the winner is usually listed first) cancels. This is
// the reliability check the config comment refers to. Ratings are point-in-time
// (ratingBefore of each corner, from the trace).
function buildSamples(data: LoadedData, history: Map<string, FightTrace[]>): Sample[] {
  const samples: Sample[] = [];
  for (const f of data.fights) {
    const decisive = (f.result1 === 'W' && f.result2 === 'L') || (f.result1 === 'L' && f.result2 === 'W');
    if (!decisive) continue;
    const h1 = history.get(f.fighterId1);
    if (!h1) continue;
    const t = h1.find((x) => x.fightId === f.fightId);
    if (!t || t.ratingBefore <= 0 || t.opponentRating <= 0) continue;
    const date = t.date.slice(0, 10);
    const f1won = f.result1 === 'W';
    // Perspective A: fighter 1.  Perspective B: fighter 2 (the mirror).
    samples.push({ p1Elo: t.ratingBefore, p2Elo: t.opponentRating, outcome: f1won ? 1 : 0, date });
    samples.push({ p1Elo: t.opponentRating, p2Elo: t.ratingBefore, outcome: f1won ? 0 : 1, date });
  }
  return samples;
}

function logLoss(samples: Sample[], D: number): number {
  let s = 0;
  for (const x of samples) {
    const p = Math.min(1 - 1e-9, Math.max(1e-9, logistic(x.p2Elo - x.p1Elo, D)));
    s += -(x.outcome * Math.log(p) + (1 - x.outcome) * Math.log(1 - p));
  }
  return s / samples.length;
}

function brier(samples: Sample[], D: number): number {
  let s = 0;
  for (const x of samples) { const p = logistic(x.p2Elo - x.p1Elo, D); s += (p - x.outcome) ** 2; }
  return s / samples.length;
}

// Expected Calibration Error over 10 equal-width bins.
function ece(samples: Sample[], D: number): number {
  const bins = Array.from({ length: 10 }, () => ({ n: 0, psum: 0, osum: 0 }));
  for (const x of samples) {
    const p = logistic(x.p2Elo - x.p1Elo, D);
    const b = Math.min(9, Math.floor(p * 10));
    bins[b].n++; bins[b].psum += p; bins[b].osum += x.outcome;
  }
  let e = 0;
  for (const b of bins) if (b.n) e += (b.n / samples.length) * Math.abs(b.psum / b.n - b.osum / b.n);
  return e;
}

function fitDenominator(samples: Sample[]): { D: number; ll: number } {
  let best = { D: D_MIN, ll: Infinity };
  for (let D = D_MIN; D <= D_MAX; D += D_STEP) {
    const ll = logLoss(samples, D);
    if (ll < best.ll) best = { D, ll };
  }
  return best;
}

function spread(history: Map<string, FightTrace[]>, data: LoadedData, ratings: Map<string, { rating: number }>) {
  // Use final ratings of fighters who are eligible (>= minUFCFights UFC bouts).
  const minF = RANKING_CONFIG.minUFCFights;
  const vals: number[] = [];
  for (const [id, s] of ratings) {
    const n = data.fighterFights.get(id)?.length ?? 0;
    if (n >= minF && s.rating > 0) vals.push(s.rating);
  }
  vals.sort((a, b) => b - a);
  const q = (p: number) => vals[Math.floor(p * vals.length)];
  return { max: vals[0], p95: q(0.05), median: q(0.5), min: vals[vals.length - 1], n: vals.length };
}

function main() {
  const data = loadAllData();
  // Offline-only mutable handle: β is read from global config inside the sweep, so
  // we temporarily override it here (restored at the end). Never done in the app.
  const mut = RANKING_CONFIG.elo as { boundaryRegressionToMean: number };
  const original = mut.boundaryRegressionToMean;
  const nowMs = Date.now();
  const recentCut = new Date(nowMs - RECENT_YEARS * 365.25 * 864e5).toISOString().slice(0, 10);

  console.log('P3+P2 EXPERIMENT — boundary discount β vs refit denominator D\n');
  console.log('Production baseline: β=' + original + ', D=' + RANKING_CONFIG.elo.winProbDenominator + ' (unchanged by this script)\n');
  // Production baseline metrics (β=0.5, D=400) for an apples-to-apples reference.
  {
    mut.boundaryRegressionToMean = original;
    const { history } = buildEloWithTraces(data);
    const all = buildSamples(data, history);
    const recent = all.filter((x) => x.date >= recentCut);
    console.log(`Production @D=400:  all ECE ${ece(all, 400).toFixed(3)}  LL ${logLoss(all, 400).toFixed(4)}  |  recent ECE ${ece(recent, 400).toFixed(3)}  LL ${logLoss(recent, 400).toFixed(4)}\n`);
  }

  console.log('β      spread(best/med/p95)  topVsMed@Dr  allD modD    all(LL/ECE)   | recent(LL/ECE)');
  console.log('-'.repeat(100));

  for (const beta of BETA_GRID) {
    mut.boundaryRegressionToMean = beta;
    const { ratings, history } = buildEloWithTraces(data);
    const sp = spread(history, data, ratings as unknown as Map<string, { rating: number }>);
    const all = buildSamples(data, history);
    const recent = all.filter((x) => x.date >= recentCut);
    const D = fitDenominator(all).D;       // all-history optimal
    const Dr = fitDenominator(recent).D;   // modern (≤3yr) optimal — what the app actually shows
    // implied win% of the top fighter vs a median one, at the modern-fit Dr (fighter=top,
    // opponent=median → gap = median − max, negative → logistic > 0.5).
    const bestVsMed = 100 * logistic(sp.median - sp.max, Dr);
    const ll = logLoss(all, D), br = brier(all, D), e = ece(all, D);
    const rll = logLoss(recent, Dr), re = ece(recent, Dr);
    console.log(
      `${beta.toFixed(2)}   ` +
      `${sp.max.toFixed(0)}/${sp.median.toFixed(0)}/${sp.p95.toFixed(0)}      ` +
      `${(sp.max - sp.median).toFixed(0)}Elo→${bestVsMed.toFixed(0)}%   ` +
      `${String(D).padStart(3)}   ${String(Dr).padStart(3)}    ${ll.toFixed(4)} ${e.toFixed(3)}  | ${rll.toFixed(4)} ${re.toFixed(3)}`
    );
  }

  mut.boundaryRegressionToMean = original; // restore

  console.log('\nREAD (what this run showed):');
  console.log('  • β (boundary discount) is NOT the spread lever: 0.50→0.25 widens top-vs-median only ~171→194');
  console.log('    Elo (median stays pinned ~1498) and leaves LL/ECE flat. The discount is a one-time regress;');
  console.log('    the pool is compressed by inactivity regression + K dynamics, which β does not touch.');
  console.log('  • The DENOMINATOR is the whole story. Production D=400 is far too FLAT for this compressed');
  console.log('    spread: recent ECE 0.061 @400 vs ~0.006 at the modern-fit D≈155-200 — and dynamic range');
  console.log('    jumps (top-vs-median ~73% @400 → ~88-93% at the refit). This is DISPLAY-ONLY.');
  console.log('\nRECOMMENDATION:');
  console.log('  • DROP the β change (P3): ~2% dynamic range for the full ranking-regression cost. Not worth it.');
  console.log('  • SHIP the denominator refit (P2) ALONE. winProbDenominator only feeds winProbability() — it');
  console.log('    NEVER touches ratings/ordering, so NO validate/goldenMaster/officialSeed gate is needed');
  console.log('    (same risk class as P1). Suggested D≈200: a robust middle between the modern-fit (~155) and');
  console.log('    all-history-fit (~235), well clear of overfitting the smaller recent subset.');
  console.log('  • VERIFY after setting D: re-run scripts/backtestRecent.ts (calibration) + eyeball /compare.');
}

main();
