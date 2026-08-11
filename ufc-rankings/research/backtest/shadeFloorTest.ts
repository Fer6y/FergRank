// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/shadeFloorTest.ts — the debutant shade-floor test.
//  Pre-registered in docs/plans/DWCS_PLAN.md (addendum 3) BEFORE first run.
//
//  newcomerRetest.ts found the full model slightly HURTS vs pure un-shaded
//  Elo on 0–2-prior bouts. Two mechanisms are confounded in that comparison:
//  the context overlay (age/style/flags/pedigree) and the provisional SHADE
//  (probability pulled toward 0.5 by confidence = max(winProbShadeFloor,
//  minFights/provisionalFights); floor 0.25 binds for every ≤4-prior bout).
//
//  Step 1 — decompose. Four arms per bout:
//     A  pure Elo              sigmoid(base)
//     B  shade only            sigmoid(base × conf)
//     C  overlay only          sigmoid(base + adj)
//     D  full production       sigmoid((base + adj) × conf)
//   SHADE effect   = D vs C (and B vs A);  OVERLAY effect = D vs B (and C vs A).
//
//  Step 2 — floor sweep {0.25, 0.5, 0.75, 1.0}, chosen on the temporally
//  EARLIER half of 0–2-prior bouts, confirmed on the LATER half.
//  BAR to ship: confirm-half paired Δlogloss vs floor 0.25 with t ≤ −2 on
//  0–2, and no t ≥ +2 degradation on 3–5. Miss → floor stays, negative
//  result recorded. Display-only knob either way.
//
//  Run: node_modules/.bin/jiti research/backtest/shadeFloorTest.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../../src/lib/loadData';
import { predictFight, eloLogit } from '../../src/lib/fightPrediction';
import { RANKING_CONFIG } from '../../src/lib/rankingConfig';
import { buildNameIndex } from '../../src/lib/nameResolver';
import { buildPointInTimeIndex, resolveOddsName } from './pointInTime';
import { devig } from './devig';
import { score, sigmoid, type Prediction } from './metrics';

const DAY_TOL = [0, 1, -1, 2, -2];
const GRID = [0.25, 0.5, 0.75, 1.0];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const dayNum = (iso: string): number => Math.floor(new Date(iso).getTime() / 86_400_000);

interface Row {
  date: string;
  base: number;      // elo logit (fav perspective)
  adj: number;       // clamped overlay logit
  minFights: number; // min(favFights, dogFights), 1-based as predictFight sees it
  mktPFav: number;
  favWon: boolean;
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

// Probability under a hypothetical floor (overlay kept — production shape).
function probAtFloor(r: Row, floor: number): number {
  const conf = Math.max(floor, Math.min(1, r.minFights / RANKING_CONFIG.elo.provisionalFights));
  return sigmoid((r.base + r.adj) * conf);
}

function main(): void {
  const data = loadAllData();
  const idx = buildPointInTimeIndex(data);
  const nameIndex = buildNameIndex(data.fighters);
  const cfg = RANKING_CONFIG.winProbModel;
  const FLOOR = RANKING_CONFIG.elo.winProbShadeFloor;

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

    const pred = predictFight(
      data, favId, dogId,
      favPit.selfRating, favPit.oppRating,
      favPit.selfFightNo + 1, dogPit.selfFightNo + 1,
      new Date(favPit.date)
    );
    rows.push({
      date: favPit.date.slice(0, 10),
      base: eloLogit(favPit.selfRating, favPit.oppRating),
      adj: clamp(pred.ageLogit + pred.styleLogit + pred.flagLogit + pred.pedigreeLogit, -cfg.maxAdjustmentLogit, cfg.maxAdjustmentLogit),
      minFights: Math.min(favPit.selfFightNo, dogPit.selfFightNo) + 1,
      mktPFav: devig(f1IsFav ? c1 : c2, f1IsFav ? c2 : c1, 'shin').pFav,
      favWon: favPit.result === 'W',
    });
  }
  console.log(`SHADE-FLOOR TEST — full BFO span, ${rows.length} matched bouts, current floor ${FLOOR}\n`);

  // ── step 1: decomposition per bucket ─────────────────────────────────
  const conf = (r: Row) => Math.max(FLOOR, Math.min(1, r.minFights / RANKING_CONFIG.elo.provisionalFights));
  const arms: [string, (r: Row) => number][] = [
    ['A pure Elo', (r) => sigmoid(r.base)],
    ['B shade only', (r) => sigmoid(r.base * conf(r))],
    ['C overlay only', (r) => sigmoid(r.base + r.adj)],
    ['D full (prod)', (r) => sigmoid((r.base + r.adj) * conf(r))],
    ['market', (r) => r.mktPFav],
  ];
  const buckets: [string, (r: Row) => boolean][] = [
    ['0–2 prior', (r) => r.minFights <= 3],           // minFights is 1-based: ≤3 ⇒ 0–2 prior
    ['3–5 prior', (r) => r.minFights >= 4 && r.minFights <= 6],
    ['6+ prior', (r) => r.minFights >= 7],
  ];
  for (const [blabel, btest] of buckets) {
    const sub = rows.filter(btest);
    console.log(`── ${blabel} ──  n=${sub.length}`);
    for (const [label, fn] of arms) {
      const s = score(sub.map((r): Prediction => ({ p: fn(r), won: r.favWon })));
      console.log(`   ${label.padEnd(14)} LL ${s.logLoss.toFixed(4)}  acc ${(100 * s.accuracy).toFixed(1)}%  ECE ${s.ece.toFixed(3)}`);
    }
    const shadeD = pairedT(sub.map((r) => ll(sigmoid((r.base + r.adj) * conf(r)), r.favWon) - ll(sigmoid(r.base + r.adj), r.favWon)));
    const overlayD = pairedT(sub.map((r) => ll(sigmoid((r.base + r.adj) * conf(r)), r.favWon) - ll(sigmoid(r.base * conf(r)), r.favWon)));
    console.log(`   SHADE effect (D−C):   ΔLL ${shadeD.mean >= 0 ? '+' : ''}${shadeD.mean.toFixed(5)}  t ${shadeD.t.toFixed(2)}`);
    console.log(`   OVERLAY effect (D−B): ΔLL ${overlayD.mean >= 0 ? '+' : ''}${overlayD.mean.toFixed(5)}  t ${overlayD.t.toFixed(2)}   (negative = helps)\n`);
  }

  // ── step 2: floor sweep, choose on early half of 0–2, confirm on late ──
  const zero2 = rows.filter((r) => r.minFights <= 3).sort((a, b) => (a.date < b.date ? -1 : 1));
  const mid = Math.floor(zero2.length / 2);
  const chooseHalf = zero2.slice(0, mid);
  const confirmHalf = zero2.slice(mid);
  console.log(`FLOOR SWEEP on 0–2 prior — choose on ${chooseHalf.length} early bouts (${chooseHalf[0]?.date}…${chooseHalf[mid - 1]?.date}), confirm on ${confirmHalf.length} late\n`);
  console.log('   floor   choose-LL   confirm-LL');
  let best = FLOOR;
  let bestLL = Infinity;
  for (const f of GRID) {
    const cLL = score(chooseHalf.map((r): Prediction => ({ p: probAtFloor(r, f), won: r.favWon }))).logLoss;
    const vLL = score(confirmHalf.map((r): Prediction => ({ p: probAtFloor(r, f), won: r.favWon }))).logLoss;
    if (cLL < bestLL) { bestLL = cLL; best = f; }
    console.log(`   ${f.toFixed(2)}    ${cLL.toFixed(4)}      ${vLL.toFixed(4)}${f === FLOOR ? '   ← current' : ''}`);
  }
  console.log(`\n   chosen on early half: floor ${best.toFixed(2)}`);
  if (best === FLOOR) {
    console.log('   → the current floor already wins the choose half; nothing to confirm. Floor stays.');
    return;
  }
  const confirmD = pairedT(confirmHalf.map((r) => ll(probAtFloor(r, best), r.favWon) - ll(probAtFloor(r, FLOOR), r.favWon)));
  const three5 = rows.filter((r) => r.minFights >= 4 && r.minFights <= 6);
  const degrade = pairedT(three5.map((r) => ll(probAtFloor(r, best), r.favWon) - ll(probAtFloor(r, FLOOR), r.favWon)));
  const ships = confirmD.t <= -2 && degrade.t < 2;
  console.log(`   confirm half, ${best.toFixed(2)} vs ${FLOOR}: ΔLL ${confirmD.mean >= 0 ? '+' : ''}${confirmD.mean.toFixed(5)}  t ${confirmD.t.toFixed(2)}   (bar: t ≤ −2)`);
  console.log(`   3–5 degradation check:   ΔLL ${degrade.mean >= 0 ? '+' : ''}${degrade.mean.toFixed(5)}  t ${degrade.t.toFixed(2)}   (bar: t < +2)`);
  console.log(`\nVERDICT: ${ships ? `floor ${best.toFixed(2)} CLEARS the pre-registered bar — a config change may be proposed` : 'does NOT clear — floor stays at ' + FLOOR + ', negative result recorded'}`);
}

main();
