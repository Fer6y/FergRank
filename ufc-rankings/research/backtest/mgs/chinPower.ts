// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/mgs/chinPower.ts — MARKET-GAP SWEEP candidate T3:
//  CHIN/POWER ON THE MONEYLINE.
//  PLAN + VERDICT RULE PRE-REGISTERED in docs/plans/MARKET_GAP_SWEEP_PLAN.md
//  (2026-09-01) BEFORE this script ran. Feature definitions fixed there —
//  no variants, no post-hoc edits.
//
//  Question: the finishSignal study (2026-08-21) validated strictly-prior
//  career finish-win rate ("power") and times-finished rate ("chin") for
//  ITD/KO PROPS only. Do the same two career rates carry MONEYLINE
//  information beyond the production win probability?
//
//  Features (strictly pre-bout, off FightTrace, both sides ≥3 prior UFC
//  bouts else unaffected/zeroed):
//    powerDiff = own prior finish-win rate  − opponent's
//    chinDiff  = own prior times-finished-per-fight rate − opponent's
//  Two coefficients, orientation-symmetrized, production logit as fixed
//  offset (ship gate) + market logit arm (informational).
//
//  Harness copied from trendStudy.ts exactly: PIT ratings via
//  buildPointInTimeIndex + PitAdjuster + predictFight, Shin de-vig,
//  DAY_TOL matching, pair+date dedupe of BFO rows, SPLIT 2024-01-01
//  (fit strictly earlier, score 2024+), held-out refit for sign stability.
//
//  DIAGNOSTIC ONLY. Research zone; odds feed no rating.
//  Run: node_modules/.bin/jiti research/backtest/mgs/chinPower.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../../../src/lib/loadData';
import { normalizeWeightClassForMove, buildEloWithTraces, type FightTrace } from '../../../src/lib/eloEngine';
import { predictFight } from '../../../src/lib/fightPrediction';
import { buildNameIndex } from '../../../src/lib/nameResolver';
import { buildPointInTimeIndex, resolveOddsName } from '../pointInTime';
import { PitAdjuster } from '../pitAdjust';
import { devig, type DevigMethod } from '../devig';
import { score, sigmoid, logit, fitLogistic, type Prediction } from '../metrics';

const DEVIG: DevigMethod = 'shin';
const DAY_TOL = [0, 1, -1, 2, -2];
const SPLIT = '2024-01-01';
const MIN_PRIOR = 3; // both sides ≥3 prior UFC bouts, else unaffected (plan T3)

// Same method classifiers as finishSignal.ts — the validated construction.
const isFinish = (m: string) => /^(KO\/TKO|TKO|SUB)/i.test(m.trim());

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

// ── per-fighter chin/power snapshot, strictly pre-bout ──
interface CPRead {
  ok: boolean;   // ≥ MIN_PRIOR prior traced UFC bouts
  power: number; // prior finish-win rate: finish wins / prior bouts
  chin: number;  // prior times-finished rate: finish losses / prior bouts
  n: number;     // prior traced bouts (denominator, draws included — finishSignal's n)
}

function main(): void {
  const data = loadAllData();
  const idx = buildPointInTimeIndex(data);
  const nameIndex = buildNameIndex(data.fighters);
  const adjuster = new PitAdjuster(data);
  const { history } = buildEloWithTraces(data);
  const tracesById = new Map<string, FightTrace[]>();
  for (const [id, traces] of history) {
    tracesById.set(id, [...traces].sort((a, b) => (a.date < b.date ? -1 : 1)));
  }

  const cpRead = (fid: string, dateIso: string): CPRead => {
    const prior = (tracesById.get(fid) ?? []).filter((t) => t.date < dateIso);
    const n = prior.length;
    if (n < MIN_PRIOR) return { ok: false, power: 0, chin: 0, n };
    let finWins = 0, finLosses = 0;
    for (const t of prior) {
      if (t.result === 'W' && isFinish(t.method)) finWins++;
      if (t.result === 'L' && isFinish(t.method)) finLosses++;
    }
    return { ok: true, power: finWins / n, chin: finLosses / n, n };
  };

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

  interface Row {
    date: string;
    fav: string;
    dog: string;
    favId: string;
    dogId: string;
    pProd: number;
    pMkt: number;
    favWon: boolean;
    favCP: CPRead;
    dogCP: CPRead;
  }
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

    rows.push({
      date: favPit.date.slice(0, 10),
      fav: f1IsFav ? r['fighter1'] : r['fighter2'],
      dog: f1IsFav ? r['fighter2'] : r['fighter1'],
      favId, dogId,
      pProd: pred.probA,
      pMkt: devig(f1IsFav ? c1 : c2, f1IsFav ? c2 : c1, DEVIG).pFav,
      favWon: favPit.result === 'W',
      favCP: cpRead(favId, favPit.date),
      dogCP: cpRead(dogId, favPit.date),
    });
  }

  // Affected = feature live: BOTH sides ≥ MIN_PRIOR priors (plan: "else unaffected").
  const affected = (r: Row) => r.favCP.ok && r.dogCP.ok;
  console.log(`MGS T3 CHIN/POWER (moneyline) — ${rows.length} odds-matched bouts (pair+date deduped); both sides ≥${MIN_PRIOR} priors on ${rows.filter(affected).length}\n`);

  // ── HAND-VERIFICATION dump: Pereira–Hill, UFC 300 (2024-04-13) ──
  // Independently checkable against Pereira's public UFC record entering UFC 300.
  const hand = rows.find((r) => r.date === '2024-04-13' && /pereira/i.test(r.fav + r.dog));
  if (hand) {
    console.log('━━ HAND-CHECK BOUT ━━');
    console.log(`  ${hand.fav} (fav) vs ${hand.dog} (dog) on ${hand.date}`);
    for (const [label, fid, cp] of [['fav', hand.favId, hand.favCP], ['dog', hand.dogId, hand.dogCP]] as const) {
      const prior = (tracesById.get(fid) ?? []).filter((t) => t.date < hand.date + 'T99');
      const priorStrict = prior.filter((t) => t.date < hand.date);
      console.log(`  ${label} prior bouts (n=${cp.n}, power=${cp.power.toFixed(4)}, chin=${cp.chin.toFixed(4)}):`);
      for (const t of priorStrict) {
        console.log(`    ${t.date.slice(0, 10)}  ${t.result}  ${t.method.padEnd(22)} vs ${t.opponentName}`);
      }
    }
    console.log(`  powerDiff (fav−dog) = ${(hand.favCP.power - hand.dogCP.power).toFixed(4)} · chinDiff = ${(hand.favCP.chin - hand.dogCP.chin).toFixed(4)}\n`);
  }

  // ── descriptive phase: quartiles of each bout-level diff (fav orientation) ──
  console.log('━━ DESCRIPTIVE (affected bouts, fav orientation; win rate vs model/market price) ━━');
  const affRows = rows.filter(affected);
  const qReport = (label: string, get: (r: Row) => number) => {
    const sorted = [...affRows].sort((a, b) => get(a) - get(b));
    const q = Math.floor(sorted.length / 4);
    console.log(`  ${label}:`);
    for (let i = 0; i < 4; i++) {
      const sl = sorted.slice(i * q, i === 3 ? sorted.length : (i + 1) * q);
      const wr = sl.filter((s) => s.favWon).length / sl.length;
      const vals = sl.map(get);
      console.log(
        `    Q${i + 1} [${mean(vals).toFixed(3).padStart(7)}]  n=${String(sl.length).padStart(4)}  fav won ${(100 * wr).toFixed(1)}%  model ${(100 * mean(sl.map((s) => s.pProd))).toFixed(1)}%  mkt ${(100 * mean(sl.map((s) => s.pMkt))).toFixed(1)}%`
      );
    }
  };
  qReport('powerDiff (fav finish-win rate − dog)', (r) => r.favCP.power - r.dogCP.power);
  qReport('chinDiff  (fav times-finished rate − dog)', (r) => r.favCP.chin - r.dogCP.chin);

  // ── inferential phase: the pre-registered 2-coefficient model, both offsets ──
  const train = rows.filter((r) => r.date < SPLIT);
  const test = rows.filter((r) => r.date >= SPLIT);
  const testAff = test.filter(affected);
  const testUnaff = test.filter((r) => !affected(r));

  type FeatFn = (r: Row) => number[];
  const feats: FeatFn = (r) =>
    affected(r)
      ? [r.favCP.power - r.dogCP.power, r.favCP.chin - r.dogCP.chin]
      : [0, 0];

  for (const [offLabel, offOf] of [
    ['offset = PRODUCTION logit (the ship gate)', (r: Row) => logit(r.pProd)],
    ['offset = MARKET logit (informational: does the market already price it?)', (r: Row) => logit(r.pMkt)],
  ] as const) {
    console.log(`\n━━ INFERENTIAL — ${offLabel}; symmetrized; fit <${SPLIT}, score ${SPLIT}+ ━━`);
    console.log(`  train n=${train.length} (affected ${train.filter(affected).length}) · test n=${test.length} (affected ${testAff.length})`);

    const fitOn = (set: Row[]): number[] => {
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
    const predict = (r: Row, w: number[]): number =>
      sigmoid(offOf(r) + feats(r).reduce((s, v, j) => s + v * w[j + 1], 0));

    const w = fitOn(train);
    const wHold = fitOn(test); // sign-stability check only
    console.log(`\n  T3 [powerDiff, chinDiff]: train coef [${w.slice(1).map((c) => c.toFixed(3)).join(', ')}] · held-out refit [${wHold.slice(1).map((c) => c.toFixed(3)).join(', ')}] (sign check)`);
    for (const [label, set] of [['test affected', testAff], ['test unaffected', testUnaff], ['test all', test]] as const) {
      if (set.length < 10) { console.log(`    ${label}: n=${set.length} thin`); continue; }
      const base = score(set.map((r): Prediction => ({ p: sigmoid(offOf(r)), won: r.favWon })));
      const cand = score(set.map((r): Prediction => ({ p: predict(r, w), won: r.favWon })));
      const mkt = score(set.map((r): Prediction => ({ p: r.pMkt, won: r.favWon })));
      const d = pairedT(set.map((r) => ll(predict(r, w), r.favWon) - ll(sigmoid(offOf(r)), r.favWon)));
      console.log(`    ${label.padEnd(16)} n=${String(set.length).padStart(3)}  LL ${base.logLoss.toFixed(4)} → ${cand.logLoss.toFixed(4)} (mkt ${mkt.logLoss.toFixed(4)})  paired Δ ${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(4)} (t ${d.t.toFixed(2)})`);
    }
  }

  console.log('\nVERDICT RULE (pre-registered, production offset only): CONFIRMED iff test-affected t ≤ −2 AND test-unaffected t < +2 AND held-out refit keeps every sign.');
}

main();
