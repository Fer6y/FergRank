// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/mgs/reach.ts — MARKET-GAP SWEEP candidate T1: REACH.
//  PLAN + VERDICT RULE PRE-REGISTERED in docs/plans/MARKET_GAP_SWEEP_PLAN.md
//  (2026-09-01) BEFORE this script ran. Single feature, no variants.
//
//  Question: does the reach differential (inches, data/Fighters.csv via the
//  canonical-id join fighterPhysical.ts uses) carry information about the
//  outcome beyond the production win probability? Elo carries no
//  anthropometry; the market plausibly prices it.
//
//  Construction copied from trendStudy.ts exactly: PIT ratings
//  (buildPointInTimeIndex + PitAdjuster + predictFight), Shin de-vig,
//  DAY_TOL matching, pair+date dedupe of BFO rows, orientation-symmetrized
//  logistic with a FIXED OFFSET (production arm = ship gate; market arm =
//  informational), fit <2024-01-01, score 2024+, held-out refit sign check.
//
//  Feature: reachDiff = (fav reach − dog reach) in inches when BOTH sides
//  have a recorded reach; bouts with either side missing are UNAFFECTED
//  (feature 0 AND excluded from the affected slice). Reach is a static
//  physical attribute — no settled/current-day rating leak is possible.
//
//  DIAGNOSTIC ONLY. Research zone; odds feed no rating.
//  Run: node_modules/.bin/jiti research/backtest/mgs/reach.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../../../src/lib/loadData';
import { normalizeWeightClassForMove } from '../../../src/lib/eloEngine';
import { predictFight } from '../../../src/lib/fightPrediction';
import { buildNameIndex } from '../../../src/lib/nameResolver';
import { getReach } from '../../../src/lib/fighterPhysical';
import { buildPointInTimeIndex, resolveOddsName } from '../pointInTime';
import { PitAdjuster } from '../pitAdjust';
import { devig, type DevigMethod } from '../devig';
import { score, sigmoid, logit, fitLogistic, type Prediction } from '../metrics';

const DEVIG: DevigMethod = 'shin';
const DAY_TOL = [0, 1, -1, 2, -2];
const SPLIT = '2024-01-01';

function dayNum(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? NaN : Math.floor(t / 86_400_000);
}
const ll = (p: number, won: boolean): number =>
  -Math.log(Math.max(1e-12, won ? p : 1 - p));

function pairedT(diffs: number[]): { mean: number; t: number } {
  const n = diffs.length;
  if (n < 2) return { mean: NaN, t: NaN };
  const mean = diffs.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(diffs.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (n - 1));
  return { mean, t: sd > 0 ? mean / (sd / Math.sqrt(n)) : NaN };
}
const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);

interface Row {
  date: string;
  fav: string;
  dog: string;
  pProd: number;
  pMkt: number;
  favWon: boolean;
  favReach: number | null; // inches, null when unrecorded
  dogReach: number | null;
  reachDiff: number;       // fav − dog inches when both known, else 0 (unaffected)
  bothKnown: boolean;
}

function main(): void {
  const data = loadAllData();
  const idx = buildPointInTimeIndex(data);
  const nameIndex = buildNameIndex(data.fighters);
  const adjuster = new PitAdjuster(data);

  const lookup = (a: string, b: string, day: number) => {
    for (const off of DAY_TOL) {
      const hit = idx.get(`${a}#${b}#${day + off}`);
      if (hit) return hit;
    }
    return null;
  };

  const bfo = Papa.parse<Record<string, string>>(
    fs.readFileSync(path.join(process.cwd(), 'data', 'bfo_odds.csv'), 'utf-8'),
    { header: true, skipEmptyLines: true }
  ).data;

  const rows: Row[] = [];
  const seenPair = new Set<string>(); // pair+date dedupe (the BFO duplicate-slug bug)
  for (const r of bfo) {
    const c1 = parseFloat(r['close1']);
    const c2 = parseFloat(r['close2']);
    if (!(c1 > 1) || !(c2 > 1)) continue;
    const id1 = resolveOddsName(r['fighter1'], nameIndex);
    const id2 = resolveOddsName(r['fighter2'], nameIndex);
    if (!id1 || !id2) continue;
    const day = dayNum(r['date']);
    const pairKey = [id1, id2].sort().join('#') + '#' + day;
    if (seenPair.has(pairKey)) continue;
    const p1 = lookup(id1, id2, day);
    const p2 = lookup(id2, id1, day);
    if (!p1 || !p2) continue;
    seenPair.add(pairKey);

    const f1IsFav = c1 <= c2;
    const favId = f1IsFav ? id1 : id2;
    const dogId = f1IsFav ? id2 : id1;
    const favPit = f1IsFav ? p1 : p2;
    const dogPit = f1IsFav ? p2 : p1;
    const division = normalizeWeightClassForMove(favPit.weightClass) ?? favPit.weightClass;
    const adjFav = adjuster.adjustment(favId, favPit.date, division);
    const adjDog = adjuster.adjustment(dogId, dogPit.date, division);

    const pred = predictFight(
      data, favId, dogId,
      favPit.selfRating + adjFav, favPit.oppRating + adjDog,
      favPit.selfFightNo + 1, dogPit.selfFightNo + 1,
      new Date(favPit.date),
    );

    const favReach = getReach(favId);
    const dogReach = getReach(dogId);
    const bothKnown = favReach != null && dogReach != null;

    rows.push({
      date: favPit.date.slice(0, 10),
      fav: f1IsFav ? r['fighter1'] : r['fighter2'],
      dog: f1IsFav ? r['fighter2'] : r['fighter1'],
      pProd: pred.probA,
      pMkt: devig(f1IsFav ? c1 : c2, f1IsFav ? c2 : c1, DEVIG).pFav,
      favWon: favPit.result === 'W',
      favReach, dogReach,
      reachDiff: bothKnown ? (favReach as number) - (dogReach as number) : 0,
      bothKnown,
    });
  }

  const affected = (r: Row) => r.bothKnown;
  console.log(`MGS T1 REACH — ${rows.length} odds-matched bouts (pair+date deduped); both-reach-known on ${rows.filter(affected).length}\n`);

  // ── hand-verification aid: print a few concrete rows to check vs the CSV ──
  console.log('━━ SPOT ROWS (for independent hand-verification vs data/Fighters.csv) ━━');
  for (const r of rows.filter((x) => x.bothKnown && Math.abs(x.reachDiff) >= 5).slice(-3)) {
    console.log(`  ${r.date}  ${r.fav} (reach ${r.favReach}") vs ${r.dog} (reach ${r.dogReach}")  diff ${r.reachDiff >= 0 ? '+' : ''}${r.reachDiff}"  favWon=${r.favWon}`);
  }

  // ── descriptive phase: side-level win rate by reach-advantage band ──
  console.log('\n━━ DESCRIPTIVE (per-side entries, both reaches known; win rate vs model/market price) ━━');
  const sides = rows.filter(affected).flatMap((r) => [
    { adv: r.reachDiff, won: r.favWon, pModel: r.pProd, pMkt: r.pMkt },
    { adv: -r.reachDiff, won: !r.favWon, pModel: 1 - r.pProd, pMkt: 1 - r.pMkt },
  ]);
  const bands: [string, (a: number) => boolean][] = [
    ['adv <= -4"', (a) => a <= -4],
    ['-3..-1"   ', (a) => a >= -3 && a <= -1],
    ['0"        ', (a) => a === 0],
    ['+1..+3"   ', (a) => a >= 1 && a <= 3],
    ['adv >= +4"', (a) => a >= 4],
  ];
  for (const [label, f] of bands) {
    const sl = sides.filter((s) => f(s.adv));
    if (!sl.length) continue;
    const wr = sl.filter((s) => s.won).length / sl.length;
    console.log(`  ${label}  n=${String(sl.length).padStart(4)}  won ${(100 * wr).toFixed(1)}%  model ${(100 * mean(sl.map((s) => s.pModel))).toFixed(1)}%  mkt ${(100 * mean(sl.map((s) => s.pMkt))).toFixed(1)}%`);
  }
  const reaches = rows.filter(affected).flatMap((r) => [r.favReach as number, r.dogReach as number]).sort((a, b) => a - b);
  console.log(`  reach distribution: p10 ${reaches[Math.floor(0.1 * reaches.length)]}" median ${reaches[Math.floor(0.5 * reaches.length)]}" p90 ${reaches[Math.floor(0.9 * reaches.length)]}"`);
  const absd = rows.filter(affected).map((r) => Math.abs(r.reachDiff)).sort((a, b) => a - b);
  console.log(`  |reachDiff|: median ${absd[Math.floor(0.5 * absd.length)]}" p90 ${absd[Math.floor(0.9 * absd.length)]}"`);

  // ── inferential phase: the pre-registered model, both offsets ──
  const train = rows.filter((r) => r.date < SPLIT);
  const test = rows.filter((r) => r.date >= SPLIT);
  const testAff = test.filter(affected);
  const testUnaff = test.filter((r) => !affected(r));

  type FeatFn = (r: Row) => number[];
  const M: { name: string; feats: FeatFn }[] = [
    { name: 'T1 reachDiff (inches, fav − dog)', feats: (r) => [r.reachDiff] },
  ];

  for (const [offLabel, offOf] of [
    ['offset = PRODUCTION logit (the ship gate)', (r: Row) => logit(r.pProd)],
    ['offset = MARKET logit (informational: does the market already price it?)', (r: Row) => logit(r.pMkt)],
  ] as const) {
    console.log(`\n━━ INFERENTIAL — ${offLabel}; symmetrized; fit <${SPLIT}, score ${SPLIT}+ ━━`);
    console.log(`  train n=${train.length} (affected ${train.filter(affected).length}) · test n=${test.length} (affected ${testAff.length})`);

    const fitOn = (set: Row[], feats: FeatFn): number[] => {
      const X: number[][] = [];
      const y: number[] = [];
      const off: number[] = [];
      for (const r of set) {
        const f = feats(r);
        const o = offOf(r);
        X.push(f); y.push(r.favWon ? 1 : 0); off.push(o);
        X.push(f.map((v) => -v)); y.push(r.favWon ? 0 : 1); off.push(-o);
      }
      return fitLogistic(X, y, 40, 1e-6, off);
    };
    const predict = (r: Row, w: number[], feats: FeatFn): number =>
      sigmoid(offOf(r) + feats(r).reduce((s, v, j) => s + v * w[j + 1], 0));

    for (const m of M) {
      const w = fitOn(train, m.feats);
      const wHold = fitOn(test, m.feats); // sign-stability check only
      const coefs = w.slice(1).map((c) => c.toFixed(4)).join(', ');
      const coefsH = wHold.slice(1).map((c) => c.toFixed(4)).join(', ');
      console.log(`\n  ${m.name}: train coef [${coefs}] · held-out refit [${coefsH}] (sign check)`);
      for (const [label, set] of [['test affected', testAff], ['test unaffected', testUnaff], ['test all', test]] as const) {
        if (set.length < 10) { console.log(`    ${label}: n=${set.length} thin`); continue; }
        const base = score(set.map((r): Prediction => ({ p: sigmoid(offOf(r)), won: r.favWon })));
        const cand = score(set.map((r): Prediction => ({ p: predict(r, w, m.feats), won: r.favWon })));
        const d = pairedT(set.map((r) => ll(predict(r, w, m.feats), r.favWon) - ll(sigmoid(offOf(r)), r.favWon)));
        console.log(`    ${label.padEnd(16)} n=${String(set.length).padStart(3)}  LL ${base.logLoss.toFixed(4)} → ${cand.logLoss.toFixed(4)}  paired Δ ${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(4)} (t ${d.t.toFixed(2)})`);
      }
    }
  }

  console.log('\nVERDICT RULE (pre-registered, production offset only): CONFIRMED iff test-affected t ≤ −2 AND test-unaffected t < +2 AND held-out refit keeps the sign.');
}

main();
