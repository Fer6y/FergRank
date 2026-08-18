// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/calibrationDecomp.ts — how much of the market gap is
//  CALIBRATION (probabilities too flat — fixable by re-scaling one knob) vs
//  INFORMATION (the market knowing things the model doesn't)?
//
//  Motivated by marketGapAudit.ts: the production model under-states the
//  favourite in nearly every slice (bias −10…−24pt vs the market's ~0), the
//  same signature everywhere → suspicion: the logit scale is too flat
//  (winProbDenominator anchored too high for today's compressed rating
//  spread), compounded on newcomers by the shade floor.
//
//  Method: temperature T on the model's own logit — p' = sigmoid(T·logit(p)).
//  Orientation-free (deployable: equivalent to winProbDenominator/T plus a
//  proportional overlay re-scale). T is FIT on 2021–2023 and SCORED on 2024+
//  (temporal split — the shadeFloorTest lesson). Variants:
//    A production as-is
//    B production × T*
//    C production with the provisional shade removed (conf → 1)
//    D unshaded × T* (own T fit)
//    E pure Elo × T* (reference: does the ranked layer still earn its keep
//       after everyone is calibrated?)
//  The residual test-set gap of the best calibrated variant vs the market is
//  the honest INFORMATION gap — what no re-scaling can recover.
//
//  DIAGNOSTIC ONLY — no config change here. Run:
//  node_modules/.bin/jiti research/backtest/calibrationDecomp.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../../src/lib/loadData';
import { winProbability, normalizeWeightClassForMove } from '../../src/lib/eloEngine';
import { predictFight } from '../../src/lib/fightPrediction';
import { buildNameIndex } from '../../src/lib/nameResolver';
import { buildPointInTimeIndex, resolveOddsName } from './pointInTime';
import { PitAdjuster } from './pitAdjust';
import { devig, type DevigMethod } from './devig';
import { score, reliability, sigmoid, logit, type Prediction } from './metrics';

const DEVIG: DevigMethod = 'shin';
const DAY_TOL = [0, 1, -1, 2, -2];
const SPLIT = '2024-01-01'; // fit < SPLIT, score ≥ SPLIT

function dayNum(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? NaN : Math.floor(t / 86_400_000);
}
const ll = (p: number, won: boolean): number =>
  -Math.log(Math.max(1e-12, won ? p : 1 - p));

interface Row {
  date: string;
  pElo: number;
  pProd: number;
  conf: number;
  pMkt: number;
  favWon: boolean;
  minFightNo: number;
}

function fitT(rows: Row[], get: (r: Row) => number): number {
  let bestT = 1, bestLL = Infinity;
  for (let T = 0.6; T <= 3.5; T += 0.02) {
    let s = 0;
    for (const r of rows) s += ll(sigmoid(T * logit(get(r))), r.favWon);
    if (s < bestLL) { bestLL = s; bestT = T; }
  }
  return Math.round(bestT * 100) / 100;
}

function pairedT(diffs: number[]): { mean: number; t: number } {
  const n = diffs.length;
  const mean = diffs.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(diffs.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (n - 1));
  return { mean, t: mean / (sd / Math.sqrt(n)) };
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
      pElo: winProbability(favPit.selfRating, favPit.oppRating),
      pProd: pred.probA,
      conf: pred.confidence,
      pMkt: devig(f1IsFav ? c1 : c2, f1IsFav ? c2 : c1, DEVIG).pFav,
      favWon: favPit.result === 'W',
      minFightNo: Math.min(favPit.selfFightNo, dogPit.selfFightNo),
    });
  }

  const train = rows.filter((r) => r.date < SPLIT);
  const test = rows.filter((r) => r.date >= SPLIT);
  console.log(`CALIBRATION vs INFORMATION DECOMPOSITION — fit <${SPLIT} (n=${train.length}), score ≥${SPLIT} (n=${test.length})\n`);

  const unshade = (r: Row) => sigmoid(logit(r.pProd) / r.conf);

  const tProd = fitT(train, (r) => r.pProd);
  const tUnsh = fitT(train, unshade);
  const tElo = fitT(train, (r) => r.pElo);
  console.log(`fitted temperatures (train): production T*=${tProd} · unshaded T*=${tUnsh} · pure Elo T*=${tElo}`);
  console.log(`equivalent winProbDenominator: 140/${tProd} ≈ ${(140 / tProd).toFixed(0)} (production) · 140/${tElo} ≈ ${(140 / tElo).toFixed(0)} (pure Elo)\n`);

  const models: { name: string; get: (r: Row) => number }[] = [
    { name: 'A production as-is   ', get: (r) => r.pProd },
    { name: 'B production × T*    ', get: (r) => sigmoid(tProd * logit(r.pProd)) },
    { name: 'C unshaded (conf→1)  ', get: unshade },
    { name: 'D unshaded × T*      ', get: (r) => sigmoid(tUnsh * logit(unshade(r))) },
    { name: 'E pure Elo × T*      ', get: (r) => sigmoid(tElo * logit(r.pElo)) },
    { name: 'M market close       ', get: (r) => r.pMkt },
  ];

  const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : '  –  ');
  for (const [label, set] of [['TEST (2024+)', test], ['train (reference only)', train]] as const) {
    console.log(`── ${label} ──`);
    const mkt = score(set.map((r): Prediction => ({ p: r.pMkt, won: r.favWon })));
    for (const m of models) {
      const s = score(set.map((r): Prediction => ({ p: m.get(r), won: r.favWon })));
      const d = pairedT(set.map((r) => ll(m.get(r), r.favWon) - ll(r.pMkt, r.favWon)));
      const gap = s.logLoss - mkt.logLoss;
      console.log(`  ${m.name} LL ${fmt(s.logLoss)}  acc ${(100 * s.accuracy).toFixed(1)}%  ECE ${fmt(s.ece)}  gap→mkt ${gap >= 0 ? '+' : ''}${gap.toFixed(4)} (t ${d.t.toFixed(1)})`);
    }
    console.log('');
  }

  // per-slice: does the calibrated variant fix the two worst pockets?
  console.log('WORST POCKETS, before → after calibration (TEST set):');
  const pockets: { label: string; test: (r: Row) => boolean }[] = [
    { label: '0–2 prior fights', test: (r) => r.minFightNo <= 2 },
    { label: '3–5 prior fights', test: (r) => r.minFightNo >= 3 && r.minFightNo <= 5 },
    { label: '6+ prior fights', test: (r) => r.minFightNo >= 6 },
    { label: 'mkt fav 70%+', test: (r) => r.pMkt >= 0.7 },
  ];
  for (const p of pockets) {
    const sub = test.filter(p.test);
    if (sub.length < 10) { console.log(`  ${p.label}: n=${sub.length} thin`); continue; }
    const a = score(sub.map((r): Prediction => ({ p: r.pProd, won: r.favWon })));
    const d = score(sub.map((r): Prediction => ({ p: sigmoid(tUnsh * logit(unshade(r))), won: r.favWon })));
    const m = score(sub.map((r): Prediction => ({ p: r.pMkt, won: r.favWon })));
    console.log(`  ${p.label.padEnd(18)} n=${String(sub.length).padStart(3)}  LL ${a.logLoss.toFixed(4)} → ${d.logLoss.toFixed(4)}  (mkt ${m.logLoss.toFixed(4)})  acc ${(100 * a.accuracy).toFixed(0)}% → ${(100 * d.accuracy).toFixed(0)}% (mkt ${(100 * m.accuracy).toFixed(0)}%)`);
  }

  console.log('\nCALIBRATION (D unshaded × T*, TEST set):');
  for (const b of reliability(test.map((r): Prediction => ({ p: sigmoid(tUnsh * logit(unshade(r))), won: r.favWon })), 10)) {
    if (!b.n) continue;
    console.log(`  ${(100 * b.lo).toFixed(0).padStart(3)}–${(100 * b.hi).toFixed(0).padEnd(3)}%  n=${String(b.n).padStart(4)}  pred ${(100 * b.predMean).toFixed(1)}%  realized ${(100 * b.realized).toFixed(1)}%  ${b.realized - b.predMean >= 0 ? '+' : ''}${(100 * (b.realized - b.predMean)).toFixed(1)}pt`);
  }
}

main();
