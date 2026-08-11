// ─────────────────────────────────────────────────────────────────────────
//  research/prospects/sortKeyBacktest.ts — the /prospects sort-key test.
//  Pre-registered in docs/plans/DWCS_PLAN.md (2026-08-11 addendum) BEFORE
//  this first ran.
//
//  /prospects sorts on raw elo, so pedigreeBonus — the one bounded term built
//  for fighters with a thin UFC sample, live for exactly this ≤5-fight
//  population — never reaches the ordering. Candidates (no new mechanism, no
//  new knob — the production composite reconstructed point-in-time):
//    ranked  = elo@T + metricsBonus + sosNudge + pedigreeBonus + untestedPenalty
//    unheld  = ranked − untestedPenalty          (mirrors crossDivision.ts)
//
//  BAR (pre-registered): swap ships only if ΔAUC vs elo@T ≥ +0.01 at BOTH
//  horizons, 90% bootstrap CI excluding 0 at both, and neither Spearman
//  target degrades. Otherwise: negative result, raw Elo stays.
//
//  Run: node_modules/.bin/jiti research/prospects/sortKeyBacktest.ts
// ─────────────────────────────────────────────────────────────────────────
import { loadAllData } from '../../src/lib/loadData';
import { PitAdjuster } from '../backtest/pitAdjust';
import {
  buildProspectCohort, currentTop15Ids, evaluateFeature, bootstrapDeltaAuc,
  type CohortMember,
} from './harness';

const HORIZONS = ['2023-08-05', '2024-08-05'];
const BAR = 0.01;

async function main(): Promise<void> {
  const data = loadAllData();
  const top15 = await currentTop15Ids(data);
  const adjuster = new PitAdjuster(data);

  console.log('/prospects sort-key backtest — ranked vs raw Elo (pre-registered bar:');
  console.log(`ΔAUC ≥ +${BAR} at both horizons, 90% CI excluding 0, no Spearman degradation)\n`);

  let clearsAll: Record<string, boolean> = { ranked: true, unheld: true };
  for (const T of HORIZONS) {
    const cohort = buildProspectCohort(data, T, top15);

    // Point-in-time production adjustment, in the fighter's home division
    // (matching predictiveRatingAdjustment's division choice).
    const parts = new Map(
      cohort.map((m) => {
        const division = data.fighterMap.get(m.fighterId)?.weightClass ?? '';
        return [m.fighterId, adjuster.adjustmentParts(m.fighterId, T, division)];
      })
    );
    const ranked = (m: CohortMember) => {
      const p = parts.get(m.fighterId)!;
      return m.eloAtT + p.metricsBonus + p.sosNudge + p.pedigreeBonus + p.untestedPenalty;
    };
    const unheld = (m: CohortMember) => {
      const p = parts.get(m.fighterId)!;
      return m.eloAtT + p.metricsBonus + p.sosNudge + p.pedigreeBonus;
    };
    const rawElo = (m: CohortMember) => m.eloAtT;

    // Prevalence: how much work would the swap actually do on this cohort?
    const adjs = cohort.map((m) => ranked(m) - m.eloAtT);
    const nonzeroPed = cohort.filter((m) => parts.get(m.fighterId)!.pedigreeBonus > 0.5).length;
    const meanAbs = adjs.reduce((s, v) => s + Math.abs(v), 0) / adjs.length;
    console.log(`── T = ${T} ──  n = ${cohort.length}`);
    console.log(`   adjustment prevalence: mean |adj| ${meanAbs.toFixed(1)} Elo, ${nonzeroPed}/${cohort.length} with a live pedigree seed`);

    const base = evaluateFeature(cohort, rawElo, 'raw elo@T');
    console.log(`   ${'raw elo@T'.padEnd(12)} AUC ${base.aucTop15.toFixed(3)}   ρ(win%) ${base.rhoLaterWinRate.toFixed(3)}   ρ(netElo) ${base.rhoNetElo.toFixed(3)}`);
    for (const [label, fn] of [['ranked', ranked], ['unheld', unheld]] as const) {
      const e = evaluateFeature(cohort, fn, label);
      const d = bootstrapDeltaAuc(cohort, fn, rawElo);
      const clears =
        d.delta >= BAR && d.ciLo > 0 &&
        e.rhoLaterWinRate >= base.rhoLaterWinRate - 0.02 &&
        e.rhoNetElo >= base.rhoNetElo - 0.02;
      if (!clears) clearsAll[label] = false;
      console.log(
        `   ${label.padEnd(12)} AUC ${e.aucTop15.toFixed(3)}   ρ(win%) ${e.rhoLaterWinRate.toFixed(3)}   ρ(netElo) ${e.rhoNetElo.toFixed(3)}` +
          `   ΔAUC ${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(3)} [${d.ciLo.toFixed(3)}, ${d.ciHi.toFixed(3)}]${clears ? '' : '   ✗'}`
      );
    }
    console.log('');
  }
  for (const [label, ok] of Object.entries(clearsAll)) {
    console.log(`${label}: ${ok ? 'CLEARS the pre-registered bar' : 'does NOT clear'}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
