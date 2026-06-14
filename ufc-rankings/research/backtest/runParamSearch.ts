// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/runParamSearch.ts — walk-forward Elo parameter search.
//
//  Run:  node_modules/.bin/jiti research/backtest/runParamSearch.ts
//
//  Searches Elo params for the best out-of-sample (held-out) calibrated
//  log-loss, then prints a reviewable proposal + per-division raw-Elo ranking
//  diff. Does NOT edit rankingConfig.ts — adopting a proposal is a manual step.
// ─────────────────────────────────────────────────────────────────────────

import { loadAllData } from '../../src/lib/loadData';
import { coordinateSearch, evaluateParams, CURRENT } from './paramSearch';
import { printProposal } from './proposeConfig';

function main(): void {
  const data = loadAllData();

  const baseEval = evaluateParams(data, CURRENT);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  WALK-FORWARD ELO PARAMETER SEARCH');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(
    `  baseline (current config): OOS logloss ${baseEval.oosLogLoss.toFixed(4)}  ` +
      `(n=${baseEval.n} over ${baseEval.nFolds} yearly folds)`
  );
  console.log('  coordinate descent (each line: value:logloss, * = new best):');

  const result = coordinateSearch(data, 2, true);

  console.log('');
  printProposal(data, result);
}

main();
