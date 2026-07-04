// gradePromotions.ts — Workstream A: empirical promotion grading.
//
// "How well do fighters who graduate from promotion X actually perform in the
// UFC?" — measured, not guessed. For every fighter with pre-UFC history we:
//   1. attribute them to a FEEDER promotion (plurality of their last ~5 pre-UFC
//      fights — shared with pedigreeSeed.ts so it matches the seed exactly),
//   2. score their UFC outcome as settled Elo GAIN (getElo().rating − 1500),
//   3. per promotion, take the empirical-Bayes SHRUNK mean gain (small-sample
//      orgs pulled toward the global mean), and
//   4. squash it to a multiplier in the promotionTiers range, with a bootstrap
//      CI for trust.
//
// Output: data/promotion_grades.csv — consumed by src/lib/promotionGrades.ts →
// pedigreeSeed.ts (blended with the static tier multiplier). Build-time only;
// reads engine OUTPUT (Elo), never writes back. No odds anywhere.
//
// Run: node_modules/.bin/jiti scripts/sherdog/gradePromotions.ts
import fs from 'fs';
import path from 'path';
import { loadAllData } from '../../src/lib/loadData';
import { buildEloRatings } from '../../src/lib/eloEngine';
import { collectPreUFCFights, attributeFeeder } from '../../src/lib/pedigreeSeed';
import { RANKING_CONFIG } from '../../src/lib/rankingConfig';

const KAPPA = RANKING_CONFIG.preUFCPedigree.gradeShrinkageKappa; // shrinkage pseudo-count
// Empirical Elo-gain is a WEAK, compressed signal (Elo regresses toward the mean,
// so between-promotion variance is small and survivorship makes regional
// graduates look ~as good as elite-feeder graduates). Squashing to an ABSOLUTE
// grade would flatten the hand-tuned tier hierarchy — which encodes real prior
// knowledge (a Bellator bout IS tougher than a regional bout). So we emit a
// HIERARCHY-PRESERVING RELATIVE factor centred at 1.0: the empirical signal only
// NUDGES a promotion up/down (±REL_SPREAD) around its static tier multiplier.
const REL_SPREAD = 0.20; // max ±20% nudge on the static tier multiplier
const MIN_GRADS_OUTPUT = 2; // don't emit an org grade off a single graduate
const BOOT = 500;        // bootstrap resamples for the CI

interface OrgAgg { tier: string; gains: number[] }

function mean(xs: number[]): number { return xs.reduce((s, v) => s + v, 0) / xs.length; }
function sd(xs: number[], mu: number): number {
  return Math.sqrt(xs.reduce((s, v) => s + (v - mu) * (v - mu), 0) / Math.max(1, xs.length));
}

function main() {
  const data = loadAllData();
  const ratings = buildEloRatings(data);
  const { perFighter } = collectPreUFCFights(data);

  // Attribute each graduate to a feeder org, score their UFC Elo gain.
  const byOrg = new Map<string, OrgAgg>();
  const allGains: number[] = [];
  let graded = 0, noFeeder = 0, noUFC = 0;

  for (const [fid, fights] of perFighter) {
    const feeder = attributeFeeder(fights);
    if (!feeder) { noFeeder++; continue; }
    const st = ratings.get(fid);
    if (!st || st.fights < 1) { noUFC++; continue; } // never fought in the UFC (or no decisive bout)
    const eloGain = st.rating - RANKING_CONFIG.elo.initialRating;
    let agg = byOrg.get(feeder.org);
    if (!agg) { agg = { tier: feeder.tier, gains: [] }; byOrg.set(feeder.org, agg); }
    agg.gains.push(eloGain);
    allGains.push(eloGain);
    graded++;
  }

  const globalMean = mean(allGains);
  const globalSd = sd(allGains, globalMean) || 1;

  const shrink = (gains: number[]): number => {
    const n = gains.length;
    return (n * mean(gains) + KAPPA * globalMean) / (n + KAPPA);
  };
  // Relative factor centred at 1.0: tanh keeps it bounded to ±REL_SPREAD.
  const relFactorOf = (shrunk: number): number =>
    1 + REL_SPREAD * Math.tanh((shrunk - globalMean) / globalSd);

  interface Out {
    org: string; tier: string; n: number;
    rawMean: number; shrunk: number; relFactor: number; ciLo: number; ciHi: number;
  }
  const outRows: Out[] = [];
  for (const [org, agg] of byOrg) {
    if (agg.gains.length < MIN_GRADS_OUTPUT) continue;
    const rawMean = mean(agg.gains);
    const shrunk = shrink(agg.gains);
    const relFactor = relFactorOf(shrunk);

    // Bootstrap the CI: resample graduates, re-shrink, re-factor.
    const boot: number[] = [];
    for (let b = 0; b < BOOT; b++) {
      const rs: number[] = [];
      for (let i = 0; i < agg.gains.length; i++) rs.push(agg.gains[(Math.random() * agg.gains.length) | 0]);
      boot.push(relFactorOf(shrink(rs)));
    }
    boot.sort((a, b) => a - b);
    const ciLo = boot[Math.floor(0.05 * BOOT)];
    const ciHi = boot[Math.floor(0.95 * BOOT)];

    outRows.push({ org, tier: agg.tier, n: agg.gains.length, rawMean, shrunk, relFactor, ciLo, ciHi });
  }

  outRows.sort((a, b) => b.relFactor - a.relFactor);

  // ── Write CSV ──
  const header = 'canonicalOrg,tier,graduates,meanEloGain,shrunkEloGain,relFactor,ciLo,ciHi';
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [header];
  for (const r of outRows) {
    lines.push([
      esc(r.org), r.tier, String(r.n),
      r.rawMean.toFixed(1), r.shrunk.toFixed(1),
      r.relFactor.toFixed(4), r.ciLo.toFixed(4), r.ciHi.toFixed(4),
    ].join(','));
  }
  const outFile = path.join(process.cwd(), 'data', RANKING_CONFIG.preUFCPedigree.gradeSourceFile);
  fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf-8');

  // ── Console report ──
  const minG = RANKING_CONFIG.preUFCPedigree.gradeMinGraduates;
  console.log(`Promotion grading — ${graded} graduates attributed (${noFeeder} no-feeder, ${noUFC} no-UFC)`);
  console.log(`global mean Elo gain: ${globalMean.toFixed(1)}  (sd ${globalSd.toFixed(1)}, κ=${KAPPA}, ±${(REL_SPREAD * 100).toFixed(0)}% max nudge)\n`);
  console.log('  promotion                    tier    grads   rawGain  shrunk   relFACTOR  [90% CI]     trusted?');
  for (const r of outRows) {
    const trusted = r.n >= minG ? '✓ seed' : `– static (need ${minG})`;
    console.log(
      `  ${r.org.padEnd(28)} ${r.tier.padEnd(7)} ${String(r.n).padStart(4)}   ` +
      `${r.rawMean.toFixed(0).padStart(6)}   ${r.shrunk.toFixed(0).padStart(5)}   ` +
      `${r.relFactor.toFixed(3).padStart(7)}  [${r.ciLo.toFixed(2)},${r.ciHi.toFixed(2)}]   ${trusted}`,
    );
  }
  console.log(`\nwrote ${path.relative(process.cwd(), outFile)} (${outRows.length} promotions, ≥${MIN_GRADS_OUTPUT} graduates)`);
  console.log(`relFactor multiplies the STATIC tier multiplier (1.0 = neutral), preserving the tier hierarchy.`);
  console.log(`seed trusts factors with ≥${minG} graduates; below that it uses the static tier multiplier as-is.`);
}

main();
