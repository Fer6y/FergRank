// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/newcomerRetest.ts — the newcomer win-prob re-test.
//  Pre-registered in docs/plans/DWCS_PLAN.md (addendum 2) BEFORE first run.
//
//  History: win-prob accuracy vs the closing line is measurably WORST on
//  newcomers (2026-07-03: −9.8pt acc gap at 3–5 prior fights vs −6.4pt at
//  6+), and the fix built for it — the B.1 pre-UFC pedigree prior
//  (winProbModel.pedigreeEdgeCoef) — was judged "flat" on a 61-bout slice.
//  That n cannot distinguish "no signal" from "underpowered". This re-test
//  widens the slice to the FULL BFO span (no card window) and buckets by the
//  thinner fighter's prior UFC bouts: 0–2 / 3–5 / 6+ (the pedigree taper is
//  live below 6).
//
//  Ablation (no config mutation, no cache poisoning): predictFight returns
//  its full logit decomposition, so per bout
//     adjNoPed = clamp(ageLogit + styleLogit + flagLogit, ±maxAdjustmentLogit)
//     pNoPed   = sigmoid((eloLogit + adjNoPed) × confidence)
//  reconstructs the production model with only the pedigree prior removed.
//
//  VERDICT RULE (pre-registered): the pedigree prior HELPS if paired per-bout
//  Δlogloss (full − ablated) on the ≤5-prior slice has t ≤ −2 at n ≥ 150.
//  Otherwise this is a REAL negative result at respectable n: record it, keep
//  pedigreeEdgeCoef as-is, B.2 stays shelved with upgraded evidence.
//
//  Run: node_modules/.bin/jiti research/backtest/newcomerRetest.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../../src/lib/loadData';
import { winProbability } from '../../src/lib/eloEngine';
import { predictFight, eloLogit } from '../../src/lib/fightPrediction';
import { RANKING_CONFIG } from '../../src/lib/rankingConfig';
import { buildNameIndex } from '../../src/lib/nameResolver';
import { buildPointInTimeIndex, resolveOddsName } from './pointInTime';
import { devig, type DevigMethod } from './devig';
import { score, sigmoid, type Prediction } from './metrics';

const DEVIG: DevigMethod = 'shin';
const DAY_TOL = [0, 1, -1, 2, -2];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function dayNum(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? NaN : Math.floor(t / 86_400_000);
}

interface Row {
  date: string;
  fav: string;
  dog: string;
  eloPFav: number;
  fullPFav: number;
  noPedPFav: number;
  mktPFav: number;
  favWon: boolean;
  pedLogit: number; // pedigree logit as applied (A = favourite perspective)
  minFightNo: number;
}

const ll = (p: number, won: boolean): number => {
  const c = Math.min(1 - 1e-12, Math.max(1e-12, p));
  return won ? -Math.log(c) : -Math.log(1 - c);
};

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
  const cfg = RANKING_CONFIG.winProbModel;

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
  let unresolved = 0, noElo = 0;
  for (const r of bfo) {
    const c1 = parseFloat(r['close1']);
    const c2 = parseFloat(r['close2']);
    if (!(c1 > 1) || !(c2 > 1)) continue;
    const id1 = resolveOddsName(r['fighter1'], nameIndex);
    const id2 = resolveOddsName(r['fighter2'], nameIndex);
    if (!id1 || !id2) { unresolved++; continue; }
    const day = dayNum(r['date']);
    const p1 = lookup(id1, id2, day);
    const p2 = lookup(id2, id1, day);
    if (!p1 || !p2) { noElo++; continue; }

    const f1IsFav = c1 <= c2;
    const favId = f1IsFav ? id1 : id2;
    const dogId = f1IsFav ? id2 : id1;
    const favClose = f1IsFav ? c1 : c2;
    const dogClose = f1IsFav ? c2 : c1;
    const favPit = f1IsFav ? p1 : p2;
    const dogPit = f1IsFav ? p2 : p1;

    const asOf = new Date(favPit.date);
    const pred = predictFight(
      data, favId, dogId,
      favPit.selfRating, favPit.oppRating,
      favPit.selfFightNo + 1, dogPit.selfFightNo + 1,
      asOf
    );
    // Ablate ONLY the pedigree prior, reproducing the production clamp+shade.
    const base = eloLogit(favPit.selfRating, favPit.oppRating);
    const adjNoPed = clamp(
      pred.ageLogit + pred.styleLogit + pred.flagLogit,
      -cfg.maxAdjustmentLogit, cfg.maxAdjustmentLogit
    );
    const noPedPFav = sigmoid((base + adjNoPed) * pred.confidence);

    rows.push({
      date: favPit.date.slice(0, 10),
      fav: f1IsFav ? r['fighter1'] : r['fighter2'],
      dog: f1IsFav ? r['fighter2'] : r['fighter1'],
      eloPFav: winProbability(favPit.selfRating, favPit.oppRating),
      fullPFav: pred.probA,
      noPedPFav,
      mktPFav: devig(favClose, dogClose, DEVIG).pFav,
      favWon: favPit.result === 'W',
      pedLogit: pred.pedigreeLogit,
      minFightNo: Math.min(favPit.selfFightNo, dogPit.selfFightNo),
    });
  }

  console.log(`NEWCOMER WIN-PROB RE-TEST — full BFO span, no card window`);
  console.log(`matched ${rows.length} bouts (${unresolved} unresolved names, ${noElo} no PIT record)\n`);

  const buckets: { label: string; test: (r: Row) => boolean }[] = [
    { label: '0–2 prior', test: (r) => r.minFightNo <= 2 },
    { label: '3–5 prior', test: (r) => r.minFightNo >= 3 && r.minFightNo <= 5 },
    { label: '≤5 prior (VERDICT slice)', test: (r) => r.minFightNo <= 5 },
    { label: '6+ prior', test: (r) => r.minFightNo >= 6 },
  ];

  const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : '  –  ');
  for (const b of buckets) {
    const sub = rows.filter(b.test);
    if (sub.length < 5) { console.log(`${b.label}: n=${sub.length} — too thin\n`); continue; }
    const sE = score(sub.map((r): Prediction => ({ p: r.eloPFav, won: r.favWon })));
    const sF = score(sub.map((r): Prediction => ({ p: r.fullPFav, won: r.favWon })));
    const sN = score(sub.map((r): Prediction => ({ p: r.noPedPFav, won: r.favWon })));
    const sM = score(sub.map((r): Prediction => ({ p: r.mktPFav, won: r.favWon })));
    const withPed = sub.filter((r) => Math.abs(r.pedLogit) > 1e-9);
    const d = pairedT(sub.map((r) => ll(r.fullPFav, r.favWon) - ll(r.noPedPFav, r.favWon)));

    console.log(`── ${b.label} ──  n=${sub.length} (pedigree logit nonzero on ${withPed.length})`);
    console.log(`   pure Elo     LL ${fmt(sE.logLoss)}  acc ${(100 * sE.accuracy).toFixed(1)}%`);
    console.log(`   full model   LL ${fmt(sF.logLoss)}  acc ${(100 * sF.accuracy).toFixed(1)}%`);
    console.log(`   − pedigree   LL ${fmt(sN.logLoss)}  acc ${(100 * sN.accuracy).toFixed(1)}%`);
    console.log(`   market       LL ${fmt(sM.logLoss)}  acc ${(100 * sM.accuracy).toFixed(1)}%   gap(full−mkt) LL ${(sF.logLoss - sM.logLoss >= 0 ? '+' : '')}${(sF.logLoss - sM.logLoss).toFixed(4)}, acc ${(100 * (sF.accuracy - sM.accuracy)).toFixed(1)}pt`);
    console.log(`   PEDIGREE EFFECT (full − ablated, paired): ΔLL ${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(5)}   t ${d.t.toFixed(2)}   (negative ΔLL = pedigree helps)\n`);
  }

  const verdictSlice = rows.filter((r) => r.minFightNo <= 5);
  const d = pairedT(verdictSlice.map((r) => ll(r.fullPFav, r.favWon) - ll(r.noPedPFav, r.favWon)));
  const helps = d.t <= -2 && verdictSlice.length >= 150;
  console.log(`VERDICT (pre-registered: helps iff t ≤ −2 at n ≥ 150 on ≤5-prior): n=${verdictSlice.length}, t=${d.t.toFixed(2)} → ${
    helps ? 'PEDIGREE PRIOR HELPS — a tuning follow-up may be proposed (own gate)' :
    'FLAT at respectable n — real negative result; pedigreeEdgeCoef stays, B.2 stays shelved'
  }`);
}

main();
