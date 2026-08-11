// ─────────────────────────────────────────────────────────────────────────
//  research/prospects/promotionBacktest.ts — Phase B.ii of DWCS_PLAN.md.
//
//  Does FEEDER PROMOTION identity add point-in-time predictive value for
//  prospects, beyond their own early-UFC Elo? gradePromotions.ts grades orgs
//  on settled Elo gain (career-to-date, look-ahead); this asks the honest
//  prospective question on the B.i cohorts: given Elo@T, do feeder tier /
//  empirical grade move the needle on reaching the official top 15?
//
//  Per-tier outcome table + nested in-sample logistics:
//     M0: reachedTop15 ~ elo@T
//     M1: reachedTop15 ~ elo@T + feederMult + relFactor
//  Report ΔAUC with a 90% bootstrap CI. TIER-level only — per-org cells are
//  single digits on a ~115-fighter cohort.
//
//  Run: node_modules/.bin/jiti research/prospects/promotionBacktest.ts
// ─────────────────────────────────────────────────────────────────────────
import { loadAllData } from '../../src/lib/loadData';
import { collectPreUFCFights, attributeFeeder } from '../../src/lib/pedigreeSeed';
import { loadPromotionGrades } from '../../src/lib/promotionGrades';
import { RANKING_CONFIG } from '../../src/lib/rankingConfig';
import { fitLogistic, predictLogistic, auc, type Prediction } from '../backtest/metrics';
import {
  buildProspectCohort, currentTop15Ids, bootstrapDeltaAuc, type CohortMember,
} from './harness';

const HORIZONS = ['2023-08-05', '2024-08-05'];

interface Enriched extends CohortMember {
  feederTier: string;   // 'none' when no feeder attributable
  feederMult: number;   // static tier multiplier (0 when none)
  relFactor: number;    // empirical grade (1 = neutral / ungraded)
}

async function main(): Promise<void> {
  const data = loadAllData();
  const top15 = await currentTop15Ids(data);
  const pre = collectPreUFCFights(data);
  const grades = loadPromotionGrades();
  const minGrads = RANKING_CONFIG.preUFCPedigree.gradeMinGraduates;

  console.log('Feeder-promotion backtest on the B.i prospect cohorts (tier-level).\n');

  for (const T of HORIZONS) {
    const cohort: Enriched[] = buildProspectCohort(data, T, top15).map((m) => {
      const feeder = attributeFeeder(pre.perFighter.get(m.fighterId) ?? []);
      const g = feeder ? grades.get(feeder.org) : undefined;
      return {
        ...m,
        feederTier: feeder?.tier ?? 'none',
        feederMult: feeder?.staticMult ?? 0,
        relFactor: g && g.graduates >= minGrads ? g.relFactor : 1,
      };
    });

    console.log(`── T = ${T} ──  n = ${cohort.length}`);
    console.log('   tier         n   top15%   later win%   mean netElo');
    const tiers = [...new Set(cohort.map((m) => m.feederTier))].sort();
    for (const tier of tiers) {
      const g = cohort.filter((m) => m.feederTier === tier);
      const pct = (x: number) => (100 * x).toFixed(0).padStart(4) + '%';
      const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : NaN);
      console.log(
        `   ${tier.padEnd(10)} ${String(g.length).padStart(3)}   ${pct(mean(g.map((m) => (m.reachedTop15 ? 1 : 0))))}   ` +
          `${pct(mean(g.map((m) => m.laterWinRate)))}        ${mean(g.map((m) => m.netEloAfterT)).toFixed(1)}`
      );
    }

    // Nested logistics (features centred/scaled for IRLS conditioning).
    const y = cohort.map((m) => (m.reachedTop15 ? 1 : 0));
    const x0 = cohort.map((m) => [(m.eloAtT - 1500) / 50]);
    const x1 = cohort.map((m) => [(m.eloAtT - 1500) / 50, m.feederMult, (m.relFactor - 1) * 5]);
    const w0 = fitLogistic(x0, y);
    const w1 = fitLogistic(x1, y);
    const p0: Prediction[] = cohort.map((m, i) => ({ p: predictLogistic(w0, x0[i]), won: m.reachedTop15 }));
    const p1: Prediction[] = cohort.map((m, i) => ({ p: predictLogistic(w1, x1[i]), won: m.reachedTop15 }));
    const a0 = auc(p0);
    const a1 = auc(p1);

    // Bootstrap the ΔAUC of the FITTED orderings (fits held fixed — this CIs
    // the ordering difference, not refit variance; honest for a screen).
    const f0 = new Map(cohort.map((m, i) => [m.fighterId, p0[i].p]));
    const f1 = new Map(cohort.map((m, i) => [m.fighterId, p1[i].p]));
    const d = bootstrapDeltaAuc(cohort, (m) => f1.get(m.fighterId)!, (m) => f0.get(m.fighterId)!);

    console.log(`   M0 elo@T only:            AUC ${a0.toFixed(3)}`);
    console.log(`   M1 + feederMult+grade:    AUC ${a1.toFixed(3)}   ΔAUC ${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(3)}  [90% CI ${d.ciLo.toFixed(3)}, ${d.ciHi.toFixed(3)}] (in-sample)`);
    console.log('');
  }
  console.log('Bar (DWCS_PLAN.md): ΔAUC ≥ +0.02 at BOTH horizons with CI excluding 0.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
