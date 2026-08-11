// ─────────────────────────────────────────────────────────────────────────
//  research/prospects/runProspectBacktest.ts — Phase B.i of DWCS_PLAN.md.
//
//  ACCEPTANCE GATE for the committed harness: reproduce the 2026-08-05
//  scratchpad backtest's headline numbers — raw Elo@T AUC ≈ 0.716 / 0.744 on
//  reachedTop15, n ≈ 112 / 118 at T = 2023-08-05 / 2024-08-05 — before any
//  downstream analysis is trusted. Data has moved since (three backfilled
//  cards, the recency dedup fix), so small drift is expected; large drift
//  means the harness diverges from the recorded method and must be chased.
//
//  Also re-scores the REFUTED climb-rate orderings — as harness calibration,
//  not to re-litigate them (raw Elo must beat both, as it did).
//
//  Run: node_modules/.bin/jiti research/prospects/runProspectBacktest.ts
// ─────────────────────────────────────────────────────────────────────────
import { loadAllData } from '../../src/lib/loadData';
import { RANKING_CONFIG } from '../../src/lib/rankingConfig';
import {
  buildProspectCohort, currentTop15Ids, evaluateFeature, type CohortMember,
} from './harness';

const HORIZONS = ['2023-08-05', '2024-08-05'];
const RECORDED = new Map([
  ['2023-08-05', { n: 112, aucElo: 0.716 }],
  ['2024-08-05', { n: 118, aucElo: 0.744 }],
]);

const INIT = RANKING_CONFIG.elo.initialRating;
const K = RANKING_CONFIG.prospects.climbShrinkK;

async function main(): Promise<void> {
  console.log('Prospect ordering backtest — committed rebuild of the 2026-08-05 method.');
  console.log('CAVEAT (inherited): fighters who never fought again after T are excluded,');
  console.log('which drops some of the clearest failures. External target = the CURRENT');
  console.log('official board (no historical snapshots exist).\n');

  const data = loadAllData();
  const top15 = await currentTop15Ids(data);

  const features: [string, (m: CohortMember) => number][] = [
    ['raw Elo@T', (m) => m.eloAtT],
    ['climb rate', (m) => (m.eloAtT - INIT) / m.fightsAtT],
    [`shrunk climb k=${K}`, (m) => (m.eloAtT - INIT) / (m.fightsAtT + K)],
  ];

  for (const T of HORIZONS) {
    const cohort = buildProspectCohort(data, T, top15);
    const rec = RECORDED.get(T)!;
    console.log(`── T = ${T} ──  n = ${cohort.length} (recorded ≈ ${rec.n}), top-15 positives = ${cohort.filter((m) => m.reachedTop15).length}`);
    for (const [label, fn] of features) {
      const e = evaluateFeature(cohort, fn, label);
      const gate = label === 'raw Elo@T' ? `   [recorded ≈ ${rec.aucElo}]` : '';
      console.log(
        `   ${label.padEnd(18)} AUC(top15) ${e.aucTop15.toFixed(3)}${gate}` +
          `  ρ(laterWin%) ${e.rhoLaterWinRate.toFixed(3)}  ρ(netElo) ${e.rhoNetElo.toFixed(3)}`
      );
    }
    console.log('');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
