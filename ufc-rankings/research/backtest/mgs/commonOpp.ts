// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/mgs/commonOpp.ts — MARKET-GAP SWEEP candidate T4:
//  COMMON OPPONENTS. Pre-registered in docs/plans/MARKET_GAP_SWEEP_PLAN.md
//  (2026-09-01) BEFORE this script ran. Feature definition + verdict rule are
//  the plan's — no variants, no post-hoc edits.
//
//  Feature (per bout, fav − dog orientation): from each fighter's FightTrace
//  strictly BEFORE the bout, intersect opponentId sets. For each shared
//  opponent X: s = 1 win / 0.5 draw / 0 loss, using each fighter's MOST
//  RECENT result vs X. commonNet = clamp(Σ (s_fav − s_dog), −3, +3).
//  Bouts with ZERO shared opponents are UNAFFECTED.
//
//  Harness = the skidStudy/trendStudy construction, exactly: PIT ratings
//  (buildPointInTimeIndex + PitAdjuster + predictFight), Shin de-vig,
//  pair+date DEDUPE of BFO rows, orientation-symmetrized logistic with a
//  FIXED OFFSET (production logit = ship gate; market logit = informational),
//  fit < 2024-01-01, score 2024-01-01+; held-out refit for sign stability.
//
//  DIAGNOSTIC ONLY. Research zone; odds feed no rating.
//  Run: node_modules/.bin/jiti research/backtest/mgs/commonOpp.ts
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
const CLAMP = 3;

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

const resScore = (r: 'W' | 'L' | 'D'): number => (r === 'W' ? 1 : r === 'D' ? 0.5 : 0);

// ── the pre-registered feature, strictly pre-bout ──
interface CommonRead {
  nShared: number;   // number of shared opponents (0 ⇒ unaffected)
  net: number;       // clamp(Σ s_fav − s_dog, −CLAMP, +CLAMP)
  detail: string[];  // per-shared-opponent lines for hand verification
}

// Most recent pre-bout result vs each opponent, from a chronological trace.
function lastResultByOpp(traces: FightTrace[], dateIso: string): Map<string, { s: number; name: string; date: string; result: string }> {
  const m = new Map<string, { s: number; name: string; date: string; result: string }>();
  for (const t of traces) {           // chronological ⇒ later entries overwrite
    if (t.date >= dateIso) break;
    m.set(t.opponentId, { s: resScore(t.result), name: t.opponentName, date: t.date.slice(0, 10), result: t.result });
  }
  return m;
}

function commonRead(favTraces: FightTrace[], dogTraces: FightTrace[], dateIso: string): CommonRead {
  const favMap = lastResultByOpp(favTraces, dateIso);
  const dogMap = lastResultByOpp(dogTraces, dateIso);
  let sum = 0;
  let nShared = 0;
  const detail: string[] = [];
  for (const [oppId, fav] of favMap) {
    const dog = dogMap.get(oppId);
    if (!dog) continue;
    nShared++;
    sum += fav.s - dog.s;
    detail.push(`vs ${fav.name} [${oppId}]: fav ${fav.result} (${fav.date}, s=${fav.s}) · dog ${dog.result} (${dog.date}, s=${dog.s}) → ${(fav.s - dog.s).toFixed(1)}`);
  }
  return { nShared, net: Math.max(-CLAMP, Math.min(CLAMP, sum)), detail };
}

interface Row {
  date: string;
  fav: string;
  dog: string;
  pProd: number;
  pMkt: number;
  favWon: boolean;
  common: CommonRead;
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

    rows.push({
      date: favPit.date.slice(0, 10),
      fav: f1IsFav ? r['fighter1'] : r['fighter2'],
      dog: f1IsFav ? r['fighter2'] : r['fighter1'],
      pProd: pred.probA,
      pMkt: devig(f1IsFav ? c1 : c2, f1IsFav ? c2 : c1, DEVIG).pFav,
      favWon: favPit.result === 'W',
      common: commonRead(tracesById.get(favId) ?? [], tracesById.get(dogId) ?? [], favPit.date),
    });
  }

  const affected = (r: Row) => r.common.nShared >= 1;
  console.log(`MGS T4 COMMON OPPONENTS — ${rows.length} odds-matched bouts (pair+date deduped); ≥1 shared opponent on ${rows.filter(affected).length}\n`);

  // ── descriptive phase ──
  console.log('━━ DESCRIPTIVE ━━');
  const aff = rows.filter(affected);
  console.log(`  shared-opponent count: 1 → ${aff.filter((r) => r.common.nShared === 1).length}, 2 → ${aff.filter((r) => r.common.nShared === 2).length}, 3+ → ${aff.filter((r) => r.common.nShared >= 3).length}`);
  console.log(`  commonNet distribution (affected): mean ${mean(aff.map((r) => r.common.net)).toFixed(3)}, |net|>0 on ${aff.filter((r) => r.common.net !== 0).length}`);
  const bands: [string, (r: Row) => boolean][] = [
    ['net ≤ −1.5        ', (r) => r.common.net <= -1.5],
    ['−1.5 < net ≤ −0.5 ', (r) => r.common.net > -1.5 && r.common.net <= -0.5],
    ['−0.5 < net < +0.5 ', (r) => r.common.net > -0.5 && r.common.net < 0.5],
    ['+0.5 ≤ net < +1.5 ', (r) => r.common.net >= 0.5 && r.common.net < 1.5],
    ['net ≥ +1.5        ', (r) => r.common.net >= 1.5],
  ];
  console.log('  fav win rate by commonNet band (affected bouts; fav orientation):');
  for (const [label, filt] of bands) {
    const sub = aff.filter(filt);
    if (sub.length < 10) { console.log(`    ${label} n=${sub.length} thin`); continue; }
    const wr = sub.filter((r) => r.favWon).length / sub.length;
    console.log(`    ${label} n=${String(sub.length).padStart(4)}  fav won ${(100 * wr).toFixed(1)}%  model ${(100 * mean(sub.map((r) => r.pProd))).toFixed(1)}%  mkt ${(100 * mean(sub.map((r) => r.pMkt))).toFixed(1)}%`);
  }

  // ── HAND-VERIFY dump: the affected 2024+ bout with the largest |net| plus one rematch-rich bout ──
  const testAffAll = rows.filter((r) => r.date >= SPLIT && affected(r));
  const dumpTargets = [...testAffAll].sort((a, b) => Math.abs(b.common.net) - Math.abs(a.common.net) || b.common.nShared - a.common.nShared).slice(0, 2);
  console.log('\n━━ HAND-VERIFY DUMP (held-out affected, largest |net|) ━━');
  for (const r of dumpTargets) {
    console.log(`  ${r.date}  ${r.fav} (fav) vs ${r.dog}  net=${r.common.net}  nShared=${r.common.nShared}  favWon=${r.favWon}`);
    for (const d of r.common.detail) console.log(`    ${d}`);
  }

  // ── inferential phase: single pre-registered model, both offsets ──
  const train = rows.filter((r) => r.date < SPLIT);
  const test = rows.filter((r) => r.date >= SPLIT);
  const testAff = test.filter(affected);
  const testUnaff = test.filter((r) => !affected(r));

  type FeatFn = (r: Row) => number[];
  const feats: FeatFn = (r) => [r.common.net];

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
    console.log(`\n  T4 commonNet: train coef [${w.slice(1).map((c) => c.toFixed(3)).join(', ')}] · held-out refit [${wHold.slice(1).map((c) => c.toFixed(3)).join(', ')}] (sign check)`);
    for (const [label, set] of [['test affected', testAff], ['test unaffected', testUnaff], ['test all', test]] as const) {
      if (set.length < 10) { console.log(`    ${label}: n=${set.length} thin`); continue; }
      const base = score(set.map((r): Prediction => ({ p: sigmoid(offOf(r)), won: r.favWon })));
      const cand = score(set.map((r): Prediction => ({ p: predict(r, w), won: r.favWon })));
      const d = pairedT(set.map((r) => ll(predict(r, w), r.favWon) - ll(sigmoid(offOf(r)), r.favWon)));
      console.log(`    ${label.padEnd(16)} n=${String(set.length).padStart(4)}  LL ${base.logLoss.toFixed(4)} → ${cand.logLoss.toFixed(4)}  paired Δ ${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(4)} (t ${d.t.toFixed(2)})`);
    }
  }

  console.log('\nVERDICT RULE (pre-registered, production offset only): CONFIRMED iff test-affected t ≤ −2 AND test-unaffected t < +2 AND held-out refit keeps the sign.');
}

main();
