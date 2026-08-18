// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/skidStudy.ts — the skidding-fighters study.
//  PLAN + VERDICT RULE PRE-REGISTERED in docs/plans/SKID_STUDY_PLAN.md
//  (commit e2db5d9) BEFORE this script ran. Feature definitions, the four
//  models and the temporal split are exactly the plan's — no variants.
//
//  Question: does entering on a ≥2-loss streak carry information about the
//  outcome BEYOND the production model's probability? The audit's two skid
//  slices point in opposite naive directions, so this is settled by an
//  orientation-symmetrized logistic with the production logit as a fixed
//  offset — never by slice-gazing.
//
//  DIAGNOSTIC ONLY. Research zone; odds feed no rating.
//  Run: node_modules/.bin/jiti research/backtest/skidStudy.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../../src/lib/loadData';
import { normalizeWeightClassForMove, buildEloWithTraces, type FightTrace } from '../../src/lib/eloEngine';
import { predictFight } from '../../src/lib/fightPrediction';
import { buildNameIndex } from '../../src/lib/nameResolver';
import { buildPointInTimeIndex, resolveOddsName } from './pointInTime';
import { PitAdjuster } from './pitAdjust';
import { devig, type DevigMethod } from './devig';
import { score, sigmoid, logit, fitLogistic, type Prediction } from './metrics';

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

// ── pre-registered per-fighter skid features, strictly pre-bout ──
interface SkidRead {
  skid: 0 | 1;          // ≥2 consecutive losses entering (draws break the streak)
  streakLen: number;    // loss count in the streak (0 when not skidding)
  quality: number;      // skid only: mean fight-time opp rating of streak losses, −1500, /100
  finishedFrac: number; // skid only: fraction of streak losses by KO/TKO/SUB
}

function skidRead(traces: FightTrace[], dateIso: string): SkidRead {
  const losses: FightTrace[] = [];
  for (let i = traces.length - 1; i >= 0; i--) {
    const t = traces[i];
    if (t.date >= dateIso) continue;
    if (t.result !== 'L') break; // a win or draw ends the streak
    losses.push(t);
  }
  if (losses.length < 2) return { skid: 0, streakLen: losses.length, quality: 0, finishedFrac: 0 };
  const meanOpp = losses.reduce((s, t) => s + t.opponentRating, 0) / losses.length;
  const fin = losses.filter((t) => /ko|tko|sub/i.test(t.method)).length / losses.length;
  return { skid: 1, streakLen: losses.length, quality: (meanOpp - 1500) / 100, finishedFrac: fin };
}

interface Row {
  date: string;
  fav: string;
  dog: string;
  pProd: number;
  pMkt: number;
  favWon: boolean;
  favSkid: SkidRead;
  dogSkid: SkidRead;
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
  for (const r of bfo) {
    const c1 = parseFloat(r['close1']);
    const c2 = parseFloat(r['close2']);
    if (!(c1 > 1) || !(c2 > 1)) continue;
    const id1 = resolveOddsName(r['fighter1'], nameIndex);
    const id2 = resolveOddsName(r['fighter2'], nameIndex);
    if (!id1 || !id2) continue;
    const day = dayNum(r['date']);
    const p1 = lookup(id1, id2, day);
    const p2 = lookup(id2, id1, day);
    if (!p1 || !p2) continue;

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
      favSkid: skidRead(tracesById.get(favId) ?? [], favPit.date),
      dogSkid: skidRead(tracesById.get(dogId) ?? [], favPit.date),
    });
  }

  const affected = (r: Row) => r.favSkid.skid === 1 || r.dogSkid.skid === 1;
  console.log(`SKID STUDY — ${rows.length} odds-matched bouts; either-side skid on ${rows.filter(affected).length}\n`);

  // ── descriptive phase ──
  console.log('━━ DESCRIPTIVE ━━');
  const skidders = rows.flatMap((r) => [
    ...(r.favSkid.skid ? [{ read: r.favSkid, won: r.favWon, isFav: true, pModel: r.pProd, pMkt: r.pMkt }] : []),
    ...(r.dogSkid.skid ? [{ read: r.dogSkid, won: !r.favWon, isFav: false, pModel: 1 - r.pProd, pMkt: 1 - r.pMkt }] : []),
  ]);
  const n = skidders.length;
  console.log(`  skidding fighters entering a bout: ${n} (${skidders.filter((s) => s.isFav).length} as market favourite)`);
  console.log(`  streak length: 2 → ${skidders.filter((s) => s.read.streakLen === 2).length}, 3 → ${skidders.filter((s) => s.read.streakLen === 3).length}, 4+ → ${skidders.filter((s) => s.read.streakLen >= 4).length}`);
  const q = skidders.map((s) => s.read.quality * 100 + 1500).sort((a, b) => a - b);
  console.log(`  loss-quality (mean opp Elo of streak losses): p10 ${q[Math.floor(0.1 * n)].toFixed(0)} · median ${q[Math.floor(0.5 * n)].toFixed(0)} · p90 ${q[Math.floor(0.9 * n)].toFixed(0)}`);
  console.log(`  fully finished skids (all losses KO/SUB): ${skidders.filter((s) => s.read.finishedFrac === 1).length}; no-finish skids: ${skidders.filter((s) => s.read.finishedFrac === 0).length}`);
  const wr = skidders.filter((s) => s.won).length / n;
  const mModel = skidders.reduce((s2, s) => s2 + s.pModel, 0) / n;
  const mMkt = skidders.reduce((s2, s) => s2 + s.pMkt, 0) / n;
  console.log(`  skidder win rate ${(100 * wr).toFixed(1)}% — model priced them ${(100 * mModel).toFixed(1)}%, market ${(100 * mMkt).toFixed(1)}%`);
  for (const [label, filt] of [
    ['losses to elites (quality ≥ 1550)', (s: typeof skidders[0]) => s.read.quality >= 0.5],
    ['losses to mid/low (quality < 1550)', (s: typeof skidders[0]) => s.read.quality < 0.5],
    ['≥half the skid by finish', (s: typeof skidders[0]) => s.read.finishedFrac >= 0.5],
    ['decision-only skid', (s: typeof skidders[0]) => s.read.finishedFrac === 0],
  ] as const) {
    const sub = skidders.filter(filt);
    if (sub.length < 10) continue;
    const w = sub.filter((s) => s.won).length / sub.length;
    const pm = sub.reduce((s2, s) => s2 + s.pModel, 0) / sub.length;
    const pk = sub.reduce((s2, s) => s2 + s.pMkt, 0) / sub.length;
    console.log(`    ${label}: n=${sub.length}  won ${(100 * w).toFixed(1)}%  model ${(100 * pm).toFixed(1)}%  mkt ${(100 * pk).toFixed(1)}%`);
  }

  // ── inferential phase: the four pre-registered models ──
  console.log('\n━━ INFERENTIAL (offset = production logit; symmetrized; fit <2024, score 2024+) ━━');
  const train = rows.filter((r) => r.date < SPLIT);
  const test = rows.filter((r) => r.date >= SPLIT);
  const testAff = test.filter(affected);
  const testUnaff = test.filter((r) => !affected(r));
  console.log(`  train n=${train.length} (affected ${train.filter(affected).length}) · test n=${test.length} (affected ${testAff.length})`);

  type FeatFn = (r: Row) => number[];
  const skidDiff: FeatFn = (r) => [r.favSkid.skid - r.dogSkid.skid];
  const M: { name: string; feats: FeatFn }[] = [
    { name: 'M1 skidDiff', feats: skidDiff },
    { name: 'M2 + skidQualityDiff', feats: (r) => [...skidDiff(r), r.favSkid.quality * r.favSkid.skid - r.dogSkid.quality * r.dogSkid.skid] },
    { name: 'M3 + skidFinishedDiff', feats: (r) => [...skidDiff(r), r.favSkid.finishedFrac * r.favSkid.skid - r.dogSkid.finishedFrac * r.dogSkid.skid] },
  ];

  const fitOn = (set: Row[], feats: FeatFn): number[] => {
    const X: number[][] = [];
    const y: number[] = [];
    const off: number[] = [];
    for (const r of set) {
      const f = feats(r);
      const o = logit(r.pProd);
      X.push(f); y.push(r.favWon ? 1 : 0); off.push(o);
      X.push(f.map((v) => -v)); y.push(r.favWon ? 0 : 1); off.push(-o);
    }
    return fitLogistic(X, y, 40, 1e-6, off);
  };
  const predict = (r: Row, w: number[], feats: FeatFn): number =>
    sigmoid(logit(r.pProd) + feats(r).reduce((s, v, j) => s + v * w[j + 1], 0));

  for (const m of M) {
    const w = fitOn(train, m.feats);
    const wHold = fitOn(test, m.feats); // sign-stability check only
    const coefs = w.slice(1).map((c) => c.toFixed(3)).join(', ');
    const coefsH = wHold.slice(1).map((c) => c.toFixed(3)).join(', ');
    console.log(`\n  ${m.name}: train coef [${coefs}] · held-out refit [${coefsH}] (sign check)`);
    for (const [label, set] of [['test affected', testAff], ['test unaffected', testUnaff], ['test all', test]] as const) {
      if (set.length < 10) { console.log(`    ${label}: n=${set.length} thin`); continue; }
      const base = score(set.map((r): Prediction => ({ p: r.pProd, won: r.favWon })));
      const cand = score(set.map((r): Prediction => ({ p: predict(r, w, m.feats), won: r.favWon })));
      const mkt = score(set.map((r): Prediction => ({ p: r.pMkt, won: r.favWon })));
      const d = pairedT(set.map((r) => ll(predict(r, w, m.feats), r.favWon) - ll(r.pProd, r.favWon)));
      console.log(`    ${label.padEnd(16)} n=${String(set.length).padStart(3)}  LL ${base.logLoss.toFixed(4)} → ${cand.logLoss.toFixed(4)} (mkt ${mkt.logLoss.toFixed(4)})  paired Δ ${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(4)} (t ${d.t.toFixed(2)})`);
    }
  }

  console.log('\nVERDICT RULE (pre-registered): CONFIRMED iff test-affected t ≤ −2 AND test-unaffected t < +2 AND held-out refit keeps the sign.');
}

main();
