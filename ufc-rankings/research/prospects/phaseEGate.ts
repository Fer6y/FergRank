// ─────────────────────────────────────────────────────────────────────────
//  research/prospects/phaseEGate.ts — Phase E of docs/plans/DWCS_PLAN.md.
//
//  Scores the pre-registered model-change candidates against the committed
//  bar: on the B.i harness, adding the candidate to the incumbent predictor
//  (elo@T) must improve reachedTop15 AUC by ≥ +0.02 at BOTH horizons with a
//  90% bootstrap CI on ΔAUC excluding 0, with stable direction. Candidates
//  (nothing else may be proposed from this work):
//    C1a  pre-UFC loss count        (record-shape term in pedigreeStrength)
//    C1b  pre-UFC undefeated flag   (record-shape term, binary form)
//    C2   DWCS passage (came through the tryout), and won-on-DWCS
//    C3   feeder tier/grade — ALREADY measured by promotionBacktest.ts:
//         ΔAUC +0.030/+0.046 but the 2023 CI includes 0 → does not clear.
//
//  Pre-UFC records come from loadPedigreeStrength (production settings), so a
//  cleared candidate maps directly onto a pedigreeStrength term.
//
//  Run: node_modules/.bin/jiti research/prospects/phaseEGate.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import { loadAllData } from '../../src/lib/loadData';
import { loadPedigreeStrength } from '../../src/lib/pedigreeSeed';
import { fitLogistic, predictLogistic, auc, type Prediction } from '../backtest/metrics';
import {
  buildProspectCohort, currentTop15Ids, bootstrapDeltaAuc, type CohortMember,
} from './harness';

const HORIZONS = ['2023-08-05', '2024-08-05'];
const BAR = 0.02;

async function main(): Promise<void> {
  const data = loadAllData();
  const top15 = await currentTop15Ids(data);
  const pedigree = loadPedigreeStrength(data);

  const dwcsIds = new Set<string>();
  const dwcsWinnerIds = new Set<string>();
  const chipsPath = path.join(process.cwd(), 'data', 'dwcs_analysis.json');
  if (fs.existsSync(chipsPath)) {
    const chips = JSON.parse(fs.readFileSync(chipsPath, 'utf8')).chips as Record<string, { result: string }>;
    for (const [id, c] of Object.entries(chips)) {
      dwcsIds.add(id);
      if (c.result === 'W') dwcsWinnerIds.add(id);
    }
  }

  console.log('Phase E gate — candidates vs the pre-registered bar');
  console.log(`(ΔAUC ≥ +${BAR} at BOTH horizons, 90% CI excluding 0, stable direction)\n`);

  const candidates: [string, (m: CohortMember) => number][] = [
    ['C1a pre-UFC losses', (m) => pedigree.get(m.fighterId)?.losses ?? 0],
    ['C1b undefeated pre-UFC', (m) => {
      const p = pedigree.get(m.fighterId);
      return p && p.fights > 0 && p.losses === 0 ? 1 : 0;
    }],
    ['C2a DWCS passage', (m) => (dwcsIds.has(m.fighterId) ? 1 : 0)],
    ['C2b DWCS winner', (m) => (dwcsWinnerIds.has(m.fighterId) ? 1 : 0)],
  ];

  const verdicts: string[] = [];
  for (const [label, feat] of candidates) {
    const perHorizon: { delta: number; ciLo: number; ciHi: number; a0: number; a1: number; coef: number }[] = [];
    for (const T of HORIZONS) {
      const cohort = buildProspectCohort(data, T, top15);
      const y = cohort.map((m) => (m.reachedTop15 ? 1 : 0));
      const x0 = cohort.map((m) => [(m.eloAtT - 1500) / 50]);
      const x1 = cohort.map((m) => [(m.eloAtT - 1500) / 50, feat(m)]);
      const w0 = fitLogistic(x0, y);
      const w1 = fitLogistic(x1, y);
      const p0 = new Map(cohort.map((m, i) => [m.fighterId, predictLogistic(w0, x0[i])]));
      const p1 = new Map(cohort.map((m, i) => [m.fighterId, predictLogistic(w1, x1[i])]));
      const a0 = auc(cohort.map((m) => ({ p: p0.get(m.fighterId)!, won: m.reachedTop15 } as Prediction)));
      const a1 = auc(cohort.map((m) => ({ p: p1.get(m.fighterId)!, won: m.reachedTop15 } as Prediction)));
      const d = bootstrapDeltaAuc(cohort, (m) => p1.get(m.fighterId)!, (m) => p0.get(m.fighterId)!);
      perHorizon.push({ ...d, a0, a1, coef: w1[2] });
    }
    const clears =
      perHorizon.every((h) => h.delta >= BAR && h.ciLo > 0) &&
      perHorizon.every((h) => Math.sign(h.coef) === Math.sign(perHorizon[0].coef));
    console.log(`${label}:`);
    perHorizon.forEach((h, i) => {
      console.log(
        `   T=${HORIZONS[i]}  AUC ${h.a0.toFixed(3)} → ${h.a1.toFixed(3)}   ΔAUC ${h.delta >= 0 ? '+' : ''}${h.delta.toFixed(3)}` +
          `  [${h.ciLo.toFixed(3)}, ${h.ciHi.toFixed(3)}]   coef ${h.coef.toFixed(2)}`
      );
    });
    console.log(`   → ${clears ? 'CLEARS the bar (pending modeling-discipline review)' : 'does NOT clear'}\n`);
    verdicts.push(`${label}: ${clears ? 'CLEARS' : 'no'}`);
  }
  console.log('C3 feeder tier/grade: does NOT clear (promotionBacktest.ts — 2023 CI includes 0)');
  console.log('\nSummary:', verdicts.join(' · '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
