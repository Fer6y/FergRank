// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/runBacktest.ts — the accuracy report (Phase 1).
//
//  Answers, honestly: how good is the Elo at predicting fights, how good is the
//  closing line, and does Elo carry signal the market doesn't already have?
//
//  Run:  node_modules/.bin/jiti research/backtest/runBacktest.ts
//
//  Method notes:
//   • Each fight is ONE prediction: p = P(favourite), y = favourite won.
//   • De-vig method is chosen by which one makes the MARKET best-calibrated
//     against realised results (its own log-loss).
//   • The blend(Elo, market) is the only FITTED model, so it is trained on the
//     earlier 70% of fights and scored only on the held-out later 30% — Elo and
//     market are scored on that same held-out slice for a fair comparison.
//     (Phase 2 replaces this single split with full walk-forward.)
// ─────────────────────────────────────────────────────────────────────────

import { loadAllData } from '../../src/lib/loadData';
import { joinOddsToPredictions, type JoinedSample } from './pointInTime';
import { devig, DEVIG_METHODS, type DevigMethod } from './devig';
import {
  score, logLoss, reliability, fitLogistic, predictLogistic, logit,
  type Prediction, type ScoreSet,
} from './metrics';
import { computeCoverage, printCoverage } from './coverage';

const pct = (x: number) => (x * 100).toFixed(1) + '%';
const f3 = (x: number) => x.toFixed(4);

function marketProb(s: JoinedSample, m: DevigMethod): number {
  return devig(s.favOdds, s.dogOdds, m).pFav;
}
const eloPred = (s: JoinedSample): Prediction => ({ p: s.eloProbFav, won: s.favWon });
const mktPred = (s: JoinedSample, m: DevigMethod): Prediction => ({ p: marketProb(s, m), won: s.favWon });

function printScoreRow(label: string, sc: ScoreSet): void {
  console.log(
    `   ${label.padEnd(22)} n=${String(sc.n).padStart(4)}  ` +
      `logloss ${f3(sc.logLoss)}  brier ${f3(sc.brier)}  ` +
      `acc ${pct(sc.accuracy)}  ece ${f3(sc.ece)}`
  );
}

function main(): void {
  const data = loadAllData();
  const { samples } = joinOddsToPredictions(data);
  const decided = samples; // already decided-only
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ELO × CLOSING ODDS — accuracy backtest');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  decided matched bouts: ${decided.length}`);

  // ── 1. choose the de-vig method by market self-calibration ──
  console.log('\n  De-vig method → market log-loss (lower = better calibrated):');
  let best: DevigMethod = 'multiplicative';
  let bestLL = Infinity;
  for (const m of DEVIG_METHODS) {
    const ll = logLoss(decided.map((s) => mktPred(s, m)));
    if (ll < bestLL) { bestLL = ll; best = m; }
    console.log(`    ${m.padEnd(15)} ${f3(ll)}`);
  }
  console.log(`  → using "${best}" de-vig for the market below.`);

  // ── 2. headline: Elo vs market over the full matched sample ──
  console.log('\n  Full matched sample — Elo vs market:');
  printScoreRow('Elo only', score(decided.map(eloPred)));
  printScoreRow('Market (close)', score(decided.map((s) => mktPred(s, best))));

  // ── 3. segments (does Elo improve where it should?) ──
  const established = decided.filter((s) => s.bothEstablished);
  const hasProvisional = decided.filter((s) => !s.bothEstablished);
  console.log('\n  Both fighters established (no provisional) — the clean signal:');
  printScoreRow('Elo only', score(established.map(eloPred)));
  printScoreRow('Market (close)', score(established.map((s) => mktPred(s, best))));
  console.log('\n  At least one provisional fighter (≤5 UFC fights):');
  printScoreRow('Elo only', score(hasProvisional.map(eloPred)));
  printScoreRow('Market (close)', score(hasProvisional.map((s) => mktPred(s, best))));

  // ── 4. held-out blend: does Elo add signal beyond the close? ──
  const chron = [...decided].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const cut = Math.floor(chron.length * 0.7);
  const train = chron.slice(0, cut);
  const test = chron.slice(cut);
  const yTrain = train.map((s) => (s.favWon ? 1 : 0));
  // (a) calibrated Elo: Platt-scale the Elo logit (fixes the wrong /400 scale).
  const eloFeat = (s: JoinedSample) => [logit(s.eloProbFav)];
  const wElo = fitLogistic(train.map(eloFeat), yTrain);
  const eloCalTest: Prediction[] = test.map((s) => ({ p: predictLogistic(wElo, eloFeat(s)), won: s.favWon }));
  // (b) blend of calibrated Elo + market.
  const feats = (s: JoinedSample) => [logit(s.eloProbFav), logit(marketProb(s, best))];
  const w = fitLogistic(train.map(feats), yTrain);
  const blendTest: Prediction[] = test.map((s) => ({ p: predictLogistic(w, feats(s)), won: s.favWon }));

  console.log('\n───────────────────────────────────────────────────────────────');
  console.log(`  Held-out test (last 30% by date, n=${test.length}) — fit on earlier 70%:`);
  printScoreRow('Elo raw', score(test.map(eloPred)));
  printScoreRow('Elo calibrated', score(eloCalTest));
  printScoreRow('Market (close)', score(test.map((s) => mktPred(s, best))));
  printScoreRow('Blend(Elo,market)', score(blendTest));
  console.log(
    `   Elo calibration: intercept ${wElo[0].toFixed(3)}  slope ${wElo[1].toFixed(3)}  ` +
      `(slope<1 ⇒ raw Elo was over-confident)`
  );
  console.log(
    `   blend weights:   intercept ${w[0].toFixed(3)}  ` +
      `Elo ${w[1].toFixed(3)}  market ${w[2].toFixed(3)}`
  );
  console.log(
    '   → blend Elo weight > 0 AND blend logloss < market ⇒ Elo carries signal\n' +
      '     the closing line does not already contain.'
  );

  // ── 5. reliability of the market (sanity: should be near-diagonal) ──
  console.log('\n  Market reliability (predicted P(fav) vs realised, deciles):');
  for (const b of reliability(decided.map((s) => mktPred(s, best)))) {
    if (!b.n) continue;
    console.log(
      `   [${b.lo.toFixed(1)}-${b.hi.toFixed(1)})  n=${String(b.n).padStart(4)}  ` +
        `pred ${pct(b.predMean)}  realised ${pct(b.realized)}`
    );
  }

  // ── 6. coverage / missingness ──
  console.log('');
  printCoverage(computeCoverage(data));
}

main();
