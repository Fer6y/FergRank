// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/exportAnalysis.ts — precompute the model-vs-market history
//  for the app's /odds explorer (Option B).
//
//  Runs the (research-zone) odds × point-in-time-Elo join ONCE and writes a
//  display-only JSON to data/odds_analysis.json. The app reads that JSON; it
//  never runs the join itself and odds never reach the engine — the firewall
//  holds (research → JSON → app display).
//
//  Run:  node_modules/.bin/jiti research/backtest/exportAnalysis.ts
// ─────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { loadAllData } from '../../src/lib/loadData';
import { joinOddsToPredictions } from './pointInTime';
import { devig } from './devig';
import { score, type Prediction } from './metrics';

const OUT = path.join(process.cwd(), 'data', 'odds_analysis.json');
const r3 = (x: number) => Math.round(x * 1000) / 1000;

function main(): void {
  const data = loadAllData();
  const { samples } = joinOddsToPredictions(data);

  const records = samples.map((s) => {
    const market = devig(s.favOdds, s.dogOdds, 'power').pFav; // de-vigged P(favourite)
    return {
      date: s.date,
      event: s.event,
      division: s.division,
      favName: s.favName,
      dogName: s.dogName,
      favOdds: s.favOdds,
      dogOdds: s.dogOdds,
      modelFavProb: r3(s.eloProbFav),   // point-in-time model P(favourite)
      marketFavProb: r3(market),
      edge: r3(s.eloProbFav - market),  // model − market on the favourite
      favWon: s.favWon,
      bothEstablished: s.bothEstablished, // neither fighter was a debutant
    };
  });

  // Headline track record: model vs market as predictors of the favourite.
  const modelP: Prediction[] = samples.map((s) => ({ p: s.eloProbFav, won: s.favWon }));
  const mktP: Prediction[] = records.map((r) => ({ p: r.marketFavProb, won: r.favWon }));
  const mScore = score(modelP);
  const kScore = score(mktP);

  // When the model DISAGREED with the market (backed the dog), how did it do?
  const disagree = records.filter((r) => r.modelFavProb < 0.5);
  const dogHits = disagree.filter((r) => !r.favWon).length;

  const years = records.map((r) => r.date.slice(0, 4)).filter(Boolean).sort();

  const summary = {
    generatedAt: new Date().toISOString(),
    n: records.length,
    span: years.length ? `${years[0]}–${years[years.length - 1]}` : '',
    model: { accuracy: r3(mScore.accuracy), logLoss: r3(mScore.logLoss), brier: r3(mScore.brier), ece: r3(mScore.ece) },
    market: { accuracy: r3(kScore.accuracy), logLoss: r3(kScore.logLoss), brier: r3(kScore.brier), ece: r3(kScore.ece) },
    disagreements: disagree.length,
    modelDogWinRate: disagree.length ? r3(dogHits / disagree.length) : 0,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ summary, records }));
  console.log(`✓ wrote ${records.length} fights → ${OUT}`);
  console.log(`  model acc ${summary.model.accuracy} (logloss ${summary.model.logLoss}) vs market acc ${summary.market.accuracy} (logloss ${summary.market.logLoss})`);
  console.log(`  ${summary.disagreements} disagreements; model's dog picks won ${(summary.modelDogWinRate * 100).toFixed(1)}%`);
}

main();
