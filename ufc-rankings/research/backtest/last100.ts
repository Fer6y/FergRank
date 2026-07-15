// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/last100.ts — "best model" bake-off over the most recent
//  N odds-matched UFC bouts (default 100) where BOTH fighters entered with
//  ≥ MINFIGHTNO prior UFC fights (default 5). Candidates:
//     1. PURE ELO         winProbability(favElo, dogElo)
//     2. RANKED SCORE     winProbability over point-in-time finalRating
//                         (elo + PIT metrics/SoS/pedigree/untested — the
//                         rankedVsClose.ts reconstruction; official seed
//                         omitted, no historical snapshots)
//     3. FULL MODEL       predictFight() — Elo + age/style overlay (shipped)
//     4. RANKED + OVERLAY predictFight() fed the ranked-score ratings
//     5. MARKET close     de-vigged BestFightOdds close (benchmark)
//
//  Firewall-respecting: research/ only; odds feed NO rating.
//  Run: node_modules/.bin/jiti research/backtest/last100.ts
//       NBOUTS=150 MINFIGHTNO=6 node_modules/.bin/jiti research/backtest/last100.ts
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
import { score, type Prediction } from './metrics';

const N_BOUTS = process.env.NBOUTS ? Number(process.env.NBOUTS) : 100;
const MIN_FIGHTNO = process.env.MINFIGHTNO ? Number(process.env.MINFIGHTNO) : 5;
const DEVIG: DevigMethod = 'shin';
const DAY_TOL = [0, 1, -1, 2, -2];

function dayNum(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? NaN : Math.floor(t / 86_400_000);
}

interface Row {
  date: string; fav: string; dog: string;
  pElo: number; pRanked: number; pFull: number; pRankedFull: number; pMkt: number;
  favWon: boolean;
}

function main() {
  const data = loadAllData();
  const idx = buildPointInTimeIndex(data);
  const nameIndex = buildNameIndex(data.fighters);
  const adjuster = new PitAdjuster(data);

  const lookup = (a: string, b: string, day: number) => {
    for (const off of DAY_TOL) { const hit = idx.get(`${a}#${b}#${day + off}`); if (hit) return hit; }
    return null;
  };

  const bfoFp = path.join(process.cwd(), 'data', 'bfo_odds.csv');
  const bfo = Papa.parse<Record<string, string>>(fs.readFileSync(bfoFp, 'utf-8'), { header: true, skipEmptyLines: true }).data;

  const all: Row[] = [];
  for (const r of bfo) {
    const c1 = parseFloat(r['close1']); const c2 = parseFloat(r['close2']);
    if (!(c1 > 1) || !(c2 > 1)) continue;
    const id1 = resolveOddsName(r['fighter1'], nameIndex);
    const id2 = resolveOddsName(r['fighter2'], nameIndex);
    if (!id1 || !id2) continue;
    const day = dayNum(r['date']);
    const p1 = lookup(id1, id2, day);
    const p2 = lookup(id2, id1, day);
    if (!p1 || !p2) continue;
    if (p1.selfFightNo < MIN_FIGHTNO || p2.selfFightNo < MIN_FIGHTNO) continue;

    const f1IsFav = c1 <= c2;
    const favId = f1IsFav ? id1 : id2;
    const dogId = f1IsFav ? id2 : id1;
    const favClose = f1IsFav ? c1 : c2;
    const dogClose = f1IsFav ? c2 : c1;
    const favPit = f1IsFav ? p1 : p2;
    const dogPit = f1IsFav ? p2 : p1;

    const division = normalizeWeightClassForMove(favPit.weightClass) ?? favPit.weightClass;
    const adjFav = adjuster.adjustment(favId, favPit.date, division);
    const adjDog = adjuster.adjustment(dogId, dogPit.date, division);
    const asOf = new Date(favPit.date);

    const full = predictFight(
      data, favId, dogId,
      favPit.selfRating, favPit.oppRating,
      favPit.selfFightNo + 1, dogPit.selfFightNo + 1,
      asOf,
    );
    const rankedFull = predictFight(
      data, favId, dogId,
      favPit.selfRating + adjFav, favPit.oppRating + adjDog,
      favPit.selfFightNo + 1, dogPit.selfFightNo + 1,
      asOf,
    );

    all.push({
      date: favPit.date.slice(0, 10),
      fav: f1IsFav ? r['fighter1'] : r['fighter2'],
      dog: f1IsFav ? r['fighter2'] : r['fighter1'],
      pElo: winProbability(favPit.selfRating, favPit.oppRating),
      pRanked: winProbability(favPit.selfRating + adjFav, favPit.oppRating + adjDog),
      pFull: full.probA,
      pRankedFull: rankedFull.probA,
      pMkt: devig(favClose, dogClose, DEVIG).pFav,
      favWon: favPit.result === 'W',
    });
  }

  // Most recent N matched bouts (stable within a day by insertion order).
  all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const rows = all.slice(0, N_BOUTS);
  const first = rows[rows.length - 1]?.date;
  const last = rows[0]?.date;

  const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : '  –   ');
  const models: { name: string; get: (r: Row) => number }[] = [
    { name: 'PURE ELO        ', get: (r) => r.pElo },
    { name: 'RANKED SCORE    ', get: (r) => r.pRanked },
    { name: 'FULL MODEL      ', get: (r) => r.pFull },
    { name: 'RANKED + OVERLAY', get: (r) => r.pRankedFull },
    { name: 'MARKET close    ', get: (r) => r.pMkt },
  ];

  console.log(`BEST-MODEL BAKE-OFF — most recent ${rows.length} odds-matched UFC bouts, both fighters ≥${MIN_FIGHTNO} prior UFC fights`);
  console.log(`(window ${first} → ${last} · de-vig=${DEVIG} · ranked = PIT metrics/SoS/pedigree/untested, no official seed)`);
  console.log(`(matched pool: ${all.length} bouts total)\n`);
  console.log('                      logloss    brier    accuracy   ECE      LL gap to mkt');
  const mkt = score(rows.map((r): Prediction => ({ p: r.pMkt, won: r.favWon })));
  for (const m of models) {
    const s = score(rows.map((r): Prediction => ({ p: m.get(r), won: r.favWon })));
    const g = s.logLoss - mkt.logLoss;
    const gs = m.name.startsWith('MARKET') ? '   (benchmark)' : `   ${g >= 0 ? '+' : '−'}${Math.abs(g).toFixed(4)}`;
    console.log(`  ${m.name}    ${fmt(s.logLoss)}   ${fmt(s.brier)}   ${(100 * s.accuracy).toFixed(1)}%      ${fmt(s.ece)}${gs}`);
  }

  // Paired t vs PURE ELO on per-bout logloss (negative mean = candidate better).
  const ll = (p: number, won: boolean) => -Math.log(Math.max(1e-12, won ? p : 1 - p));
  console.log('\nPAIRED vs PURE ELO (per-bout Δlogloss; negative = better than pure Elo):');
  for (const m of models.slice(1, 4)) {
    const diffs = rows.map((r) => ll(m.get(r), r.favWon) - ll(r.pElo, r.favWon));
    const mean = diffs.reduce((s, d) => s + d, 0) / diffs.length;
    const sd = Math.sqrt(diffs.reduce((s, d) => s + (d - mean) ** 2, 0) / Math.max(1, diffs.length - 1));
    const t = mean / (sd / Math.sqrt(diffs.length));
    console.log(`  ${m.name}  mean ${mean >= 0 ? '+' : ''}${mean.toFixed(4)}   t = ${t.toFixed(2)}`);
  }

  console.log('\nPAIRED vs MARKET (per-bout Δlogloss; negative = better than the close):');
  for (const m of models.slice(0, 4)) {
    const diffs = rows.map((r) => ll(m.get(r), r.favWon) - ll(r.pMkt, r.favWon));
    const mean = diffs.reduce((s, d) => s + d, 0) / diffs.length;
    const sd = Math.sqrt(diffs.reduce((s, d) => s + (d - mean) ** 2, 0) / Math.max(1, diffs.length - 1));
    const t = mean / (sd / Math.sqrt(diffs.length));
    console.log(`  ${m.name}  mean ${mean >= 0 ? '+' : ''}${mean.toFixed(4)}   t = ${t.toFixed(2)}`);
  }

  // Accuracy is decided ONLY by bouts where the model and the market pick
  // opposite sides of 50% — count them and who won them.
  const best = models[3].get; // ranked + overlay
  const dis = rows.filter((r) => (best(r) >= 0.5) !== (r.pMkt >= 0.5));
  const modelWins = dis.filter((r) => ((best(r) >= 0.5) === r.favWon)).length;
  console.log(`\nPICK DISAGREEMENTS (ranked+overlay vs market): ${dis.length} of ${rows.length} bouts — model right ${modelWins}, market right ${dis.length - modelWins}`);
  const scored = rows.map((r) => ({ r, edge: best(r) - r.pMkt }));
  scored.sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));
  console.log('\nBIGGEST DISAGREEMENTS WITH THE MARKET (ranked + overlay vs close):');
  for (const { r, edge } of scored.slice(0, 10)) {
    const winner = r.favWon ? r.fav : r.dog;
    const modelRight = (best(r) >= 0.5) === r.favWon;
    const mktRight = (r.pMkt >= 0.5) === r.favWon;
    const verdict = modelRight === mktRight ? '' : modelRight ? '  [model right, market wrong]' : '  [market right, model wrong]';
    console.log(
      `  ${r.date}  ${r.fav.padEnd(22)} model ${(100 * best(r)).toFixed(0)}% vs mkt ${(100 * r.pMkt).toFixed(0)}%  (edge ${edge >= 0 ? '+' : ''}${(100 * edge).toFixed(0)}pt)  won: ${winner}${verdict}`
    );
  }
}

main();
