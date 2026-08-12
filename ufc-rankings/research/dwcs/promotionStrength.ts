// research/dwcs/promotionStrength.ts — grade promotions AGAINST THE REGIONAL
// POOL, never against UFC outcomes.
//
// WHY THIS REPLACES THE FIRST ATTEMPT. regionalElo.ts validated promotion field
// strength against graduates' settled UFC Elo gain and got ρ=0.083. That target
// was wrong on its face: it asks "how did this org's alumni fare against UFC
// competition", which is downstream of UFC matchmaking, style match-ups and age
// at entry — none of which is a property of the promotion. We are grading
// PROSPECTS, so every number here is measured inside the prospect world:
//
//   1. WALK-FORWARD VALIDATION — sweep chronologically and score each bout with
//      the ratings held BEFORE it is processed. If regional Elo can predict
//      regional fights out of sample, the ratings are real. That is the test
//      the rating system must pass on its own turf, and it needs no UFC data.
//   2. POOL PERCENTILE — where a promotion's fighters sit in the distribution of
//      ALL rated regional fighters. "Measured against the larger pool", literally.
//   3. CROSS-PROMOTION HEAD-TO-HEAD — when a fighter whose home org is X meets
//      one whose home org is Y, who wins? An assumption-free strength ordering
//      built only from results between regional fighters. This is the ground
//      truth a tier ladder should answer to.
//
// FIREWALL: research-zone. Reads a frozen CSV, writes a CSV + console. No Elo,
// no rankings, no UFC outcome ever enters a number below.
//
// Run: node_modules/.bin/jiti research/dwcs/promotionStrength.ts
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { score, type Prediction } from '../backtest/metrics';

const K = 32;
const INIT = 1500;
const BURN_IN = '2015-01-01';   // predictions scored only after this date
const MIN_FIGHTS = 3;           // a fighter must have this many bouts to be rated
const MIN_POOL = 20;            // promotions smaller than this are not reported
const MIN_H2H = 15;             // cross-promotion cells below this are noise

interface Row {
  sherdogId: string; date: string; canonicalOrg: string; tier: string;
  tierMultiplier: string; opponentSherdogId: string; result: string;
}
interface Bout { date: string; org: string; a: string; b: string; resA: number }

function main(): void {
  const rows = Papa.parse<Row>(
    fs.readFileSync(path.join(process.cwd(), 'data', 'sherdog_fights.csv'), 'utf-8'),
    { header: true, skipEmptyLines: true }
  ).data;

  const bouts = new Map<string, Bout>();
  for (const r of rows) {
    if (!r.sherdogId || !r.opponentSherdogId || !r.date) continue;
    const resA = r.result === 'win' ? 1 : r.result === 'loss' ? 0 : r.result === 'draw' ? 0.5 : -1;
    if (resA < 0) continue;
    const [x, y] = [r.sherdogId, r.opponentSherdogId].sort();
    const key = `${x}|${y}|${r.date}`;
    if (!bouts.has(key)) {
      bouts.set(key, { date: r.date, org: r.canonicalOrg || 'Unknown', a: r.sherdogId, b: r.opponentSherdogId, resA });
    }
  }
  const ordered = [...bouts.values()].sort((p, q) => (p.date < q.date ? -1 : p.date > q.date ? 1 : 0));

  // Home promotion = where a fighter has the most bouts (tryout orgs excluded:
  // DWCS is a one-night audition, not where anyone came up).
  const orgCount = new Map<string, Map<string, number>>();
  const isTryout = (o: string) => /contender series|dana white/i.test(o);
  for (const r of rows) {
    if (!r.sherdogId || !r.canonicalOrg || isTryout(r.canonicalOrg)) continue;
    const m = orgCount.get(r.sherdogId) ?? new Map<string, number>();
    m.set(r.canonicalOrg, (m.get(r.canonicalOrg) ?? 0) + 1);
    orgCount.set(r.sherdogId, m);
  }
  const homeOrg = new Map<string, string>();
  for (const [id, m] of orgCount) {
    homeOrg.set(id, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  }

  // ── 1. walk-forward: predict each bout from ratings held BEFORE it ──
  const rating = new Map<string, number>();
  const fights = new Map<string, number>();
  const get = (id: string) => rating.get(id) ?? INIT;
  const preds: Prediction[] = [];
  const tierPreds: Prediction[] = [];
  const tierOf = new Map<string, number>();
  for (const r of rows) if (r.canonicalOrg) tierOf.set(r.canonicalOrg, Number(r.tierMultiplier) || 0);

  for (const b of ordered) {
    const ra = get(b.a);
    const rb = get(b.b);
    const na = fights.get(b.a) ?? 0;
    const nb = fights.get(b.b) ?? 0;
    // Score only settled match-ups after burn-in, and only decisive results.
    if (b.date >= BURN_IN && na >= MIN_FIGHTS && nb >= MIN_FIGHTS && b.resA !== 0.5) {
      const p = 1 / (1 + 10 ** ((rb - ra) / 400));
      preds.push({ p, won: b.resA === 1 });
      // Same bout, predicted from HOME-PROMOTION TIER alone — the ladder's own
      // out-of-sample test on regional fights.
      const ta = tierOf.get(homeOrg.get(b.a) ?? '') ?? 0.35;
      const tb = tierOf.get(homeOrg.get(b.b) ?? '') ?? 0.35;
      tierPreds.push({ p: 1 / (1 + 10 ** ((tb - ta) * -400 / 0.4 / 400)), won: b.resA === 1 });
    }
    const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
    rating.set(b.a, ra + K * (b.resA - ea));
    rating.set(b.b, rb + K * ((1 - b.resA) - (1 - ea)));
    fights.set(b.a, na + 1);
    fights.set(b.b, nb + 1);
  }

  const s = score(preds);
  const st = score(tierPreds);
  console.log(`PROMOTION STRENGTH — measured inside the regional pool, no UFC outcome used\n`);
  console.log(`${ordered.length} bouts, ${rating.size} regional fighters\n`);
  console.log(`1. WALK-FORWARD VALIDATION (${s.n} bouts after ${BURN_IN}, both sides ${MIN_FIGHTS}+ fights)`);
  console.log(`   regional Elo      acc ${(100 * s.accuracy).toFixed(1)}%   logloss ${s.logLoss.toFixed(4)}   ECE ${s.ece.toFixed(3)}`);
  console.log(`   home-org tier     acc ${(100 * st.accuracy).toFixed(1)}%   logloss ${st.logLoss.toFixed(4)}`);
  console.log(`   coin flip         acc 50.0%   logloss 0.6931`);
  console.log(`   → Elo beating the coin flip means the regional ratings carry real signal.\n`);

  // ── 2. pool percentile ──
  const rated = [...rating.entries()].filter(([id]) => (fights.get(id) ?? 0) >= MIN_FIGHTS);
  const allRatings = rated.map(([, v]) => v).sort((a, b) => a - b);
  const pctOf = (v: number) => {
    let lo = 0, hi = allRatings.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (allRatings[m] < v) lo = m + 1; else hi = m; }
    return (100 * lo) / allRatings.length;
  };
  const byOrg = new Map<string, number[]>();
  for (const [id, v] of rated) {
    const org = homeOrg.get(id);
    if (!org) continue;
    byOrg.set(org, [...(byOrg.get(org) ?? []), pctOf(v)]);
  }
  const median = (xs: number[]) => { const s2 = [...xs].sort((a, b) => a - b); return s2[Math.floor(s2.length / 2)]; };
  const pools = [...byOrg.entries()]
    .filter(([, v]) => v.length >= MIN_POOL)
    .map(([org, v]) => ({ org, n: v.length, medPct: median(v), tier: tierOf.get(org) ?? 0 }))
    .sort((a, b) => b.medPct - a.medPct);

  console.log(`2. POOL PERCENTILE — median position of a promotion's fighters within ALL`);
  console.log(`   ${allRatings.length} rated regional fighters (50 = the median regional fighter)\n`);
  console.log('   promotion                  n    median %ile   current tier');
  for (const p of pools.slice(0, 30)) {
    console.log(`   ${p.org.slice(0, 24).padEnd(24)} ${String(p.n).padStart(4)}   ${p.medPct.toFixed(1).padStart(9)}   ${p.tier.toFixed(2)}`);
  }

  // ── 3. cross-promotion head-to-head ──
  const h2h = new Map<string, { w: number; n: number }>();
  for (const b of ordered) {
    if (b.resA === 0.5) continue;
    const oa = homeOrg.get(b.a);
    const ob = homeOrg.get(b.b);
    if (!oa || !ob || oa === ob) continue;
    const rec = h2h.get(oa) ?? { w: 0, n: 0 };
    rec.w += b.resA;
    rec.n += 1;
    h2h.set(oa, rec);
    const rec2 = h2h.get(ob) ?? { w: 0, n: 0 };
    rec2.w += 1 - b.resA;
    rec2.n += 1;
    h2h.set(ob, rec2);
  }
  const h2hRows = [...h2h.entries()]
    .filter(([, v]) => v.n >= MIN_H2H)
    .map(([org, v]) => ({ org, n: v.n, winPct: (100 * v.w) / v.n, tier: tierOf.get(org) ?? 0 }))
    .sort((a, b) => b.winPct - a.winPct);

  console.log(`\n3. CROSS-PROMOTION HEAD-TO-HEAD — record when a fighter from this org meets`);
  console.log(`   a fighter whose home org is different. Ground truth, no model involved.\n`);
  console.log('   promotion                  bouts   win%   current tier');
  for (const r of h2hRows.slice(0, 30)) {
    console.log(`   ${r.org.slice(0, 24).padEnd(24)} ${String(r.n).padStart(5)}   ${r.winPct.toFixed(1).padStart(5)}   ${r.tier.toFixed(2)}`);
  }

  // ── 4. ORG-LEVEL BRADLEY-TERRY, temporally validated ──
  // Raw cross-org win% is contaminated by OPPONENT MIX: an org whose fighters
  // mostly draw Bellator opposition looks weak whatever its quality. Treat each
  // cross-org bout as a match between the two ORGS and fit org strengths, which
  // prices the mix out. Fitted on the early half, scored on the late half — so
  // the ladder is judged on regional fights it has never seen.
  const crossBouts = ordered
    .filter((b) => b.resA !== 0.5)
    .map((b) => ({ ...b, oa: homeOrg.get(b.a), ob: homeOrg.get(b.b) }))
    .filter((b) => b.oa && b.ob && b.oa !== b.ob) as (Bout & { oa: string; ob: string })[];
  const cut = crossBouts[Math.floor(crossBouts.length / 2)]?.date ?? BURN_IN;
  const train = crossBouts.filter((b) => b.date < cut);
  const test = crossBouts.filter((b) => b.date >= cut);

  const orgR = new Map<string, number>();
  const oget = (o: string) => orgR.get(o) ?? INIT;
  for (let epoch = 0; epoch < 12; epoch++) {
    const k = 24 / (1 + epoch); // annealed — approximates the Bradley-Terry MLE
    for (const b of train) {
      const ra = oget(b.oa);
      const rb = oget(b.ob);
      const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
      orgR.set(b.oa, ra + k * (b.resA - ea));
      orgR.set(b.ob, rb + k * ((1 - b.resA) - (1 - ea)));
    }
  }
  const orgTrainN = new Map<string, number>();
  for (const b of train) {
    orgTrainN.set(b.oa, (orgTrainN.get(b.oa) ?? 0) + 1);
    orgTrainN.set(b.ob, (orgTrainN.get(b.ob) ?? 0) + 1);
  }

  const btPreds: Prediction[] = [];
  const ladderPreds: Prediction[] = [];
  for (const b of test) {
    if ((orgTrainN.get(b.oa) ?? 0) < MIN_H2H || (orgTrainN.get(b.ob) ?? 0) < MIN_H2H) continue;
    btPreds.push({ p: 1 / (1 + 10 ** ((oget(b.ob) - oget(b.oa)) / 400)), won: b.resA === 1 });
    const ta = tierOf.get(b.oa) ?? 0.35;
    const tb = tierOf.get(b.ob) ?? 0.35;
    ladderPreds.push({ p: 1 / (1 + Math.exp(-(ta - tb) * 2)), won: b.resA === 1 });
  }
  const sb = score(btPreds);
  const sl = score(ladderPreds);
  console.log(`\n4. ORG STRENGTH (Bradley-Terry over cross-org bouts), fitted on ${train.length}`);
  console.log(`   bouts before ${cut}, scored on ${sb.n} held-out bouts after it:\n`);
  console.log(`   fitted org strength   acc ${(100 * sb.accuracy).toFixed(1)}%   logloss ${sb.logLoss.toFixed(4)}`);
  console.log(`   current tier ladder   acc ${(100 * sl.accuracy).toFixed(1)}%   logloss ${sl.logLoss.toFixed(4)}`);
  console.log(`   coin flip             acc 50.0%   logloss 0.6931`);

  const btTable = [...orgR.entries()]
    .filter(([o]) => (orgTrainN.get(o) ?? 0) >= MIN_H2H)
    .map(([org, r]) => ({ org, r, n: orgTrainN.get(org) ?? 0, tier: tierOf.get(org) ?? 0 }))
    .sort((a, b) => b.r - a.r);
  console.log(`\n   DATA-DERIVED LADDER (org strength, ${btTable.length} orgs with ${MIN_H2H}+ fitted bouts):`);
  console.log('   promotion                  strength  bouts  current tier');
  for (const t of btTable) {
    console.log(`   ${t.org.slice(0, 24).padEnd(24)} ${t.r.toFixed(0).padStart(8)} ${String(t.n).padStart(6)}   ${t.tier.toFixed(2)}`);
  }

  const out = path.join(process.cwd(), 'data', 'promotion_strength.csv');
  const poolMap = new Map(pools.map((p) => [p.org, p]));
  const merged = h2hRows.map((r) => ({
    canonicalOrg: r.org,
    currentTier: r.tier.toFixed(2),
    poolN: poolMap.get(r.org)?.n ?? '',
    medianPercentile: poolMap.get(r.org)?.medPct.toFixed(1) ?? '',
    crossOrgBouts: r.n,
    crossOrgWinPct: r.winPct.toFixed(1),
  }));
  fs.writeFileSync(out, Papa.unparse(merged) + '\n');
  console.log(`\nwrote ${out} (${merged.length} promotions)`);
}

main();
