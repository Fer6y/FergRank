// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/rankedVsClose.ts — does the RANKING layer help or hurt
//  prediction? Scores THREE predictors against the de-vigged closing line:
//     1. PURE ELO      — winProbability(favElo, dogElo)   (the production
//                        head-to-head number, ratingBefore from the trace)
//     2. RANKED SCORE  — winProbability over point-in-time finalRating:
//                        elo + metricsBonus + sosNudge + pedigreeBonus
//                        + untestedPenalty, each recomputed AS OF the fight
//                        date from pre-fight data only (same formulas and
//                        config as scoringEngine.ts).
//     3. MARKET close  — de-vigged BestFightOdds close    (benchmark)
//
//  Answers: "is pure Elo closer to the closing line than the full ranking
//  score?" — the ranking adjustments exist to ORDER divisions, not to predict
//  fights, so this measures what they'd cost if used as a predictor.
//
//  Honest limitation: officialBonus is OMITTED (we keep no historical official
//  -rankings snapshots, so it cannot be computed point-in-time). It is bounded
//  ≤ ~10 Elo and touches only currently-ranked names. H2H leapfrog / champion
//  floor reorder lists without changing ratings, so they have no probability
//  analogue and are out of scope by construction.
//
//  Firewall-respecting: lives in research/, reads engine traces + BFO closes,
//  feeds odds to NO rating.
//
//  Run: node_modules/.bin/jiti research/backtest/rankedVsClose.ts
//       MINFIGHTNO=6 NCARDS=30 node_modules/.bin/jiti research/backtest/rankedVsClose.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../../src/lib/loadData';
import { winProbability, normalizeWeightClassForMove } from '../../src/lib/eloEngine';
import { buildNameIndex } from '../../src/lib/nameResolver';
import { PitAdjuster } from './pitAdjust';
import { buildPointInTimeIndex, resolveOddsName } from './pointInTime';
import { devig, type DevigMethod } from './devig';
import { score, type Prediction } from './metrics';

const MIN_FIGHTNO = process.env.MINFIGHTNO ? Number(process.env.MINFIGHTNO) : 3; // both fighters ≥N prior bouts
const N_CARDS = process.env.NCARDS ? Number(process.env.NCARDS) : 30;            // "recent window" subset size
const DEVIG: DevigMethod = 'shin';
const DAY_TOL = [0, 1, -1, 2, -2];

function dayNum(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? NaN : Math.floor(t / 86_400_000);
}


interface Row {
  date: string; fav: string; dog: string;
  eloPFav: number; rankedPFav: number; mktPFav: number; favWon: boolean;
  adjFav: number; adjDog: number;
  minFightNo: number;
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

  const rows: Row[] = [];
  let matched = 0, noElo = 0, unresolved = 0, notEstab = 0;

  for (const r of bfo) {
    const c1 = parseFloat(r['close1']); const c2 = parseFloat(r['close2']);
    if (!(c1 > 1) || !(c2 > 1)) continue;
    const id1 = resolveOddsName(r['fighter1'], nameIndex);
    const id2 = resolveOddsName(r['fighter2'], nameIndex);
    if (!id1 || !id2) { unresolved++; continue; }
    const day = dayNum(r['date']);
    const p1 = lookup(id1, id2, day);
    const p2 = lookup(id2, id1, day);
    if (!p1 || !p2) { noElo++; continue; }
    if (p1.selfFightNo < MIN_FIGHTNO || p2.selfFightNo < MIN_FIGHTNO) { notEstab++; continue; }
    matched++;

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

    const eloPFav = winProbability(favPit.selfRating, favPit.oppRating);
    const rankedPFav = winProbability(favPit.selfRating + adjFav, favPit.oppRating + adjDog);
    const mktPFav = devig(favClose, dogClose, DEVIG).pFav;

    rows.push({
      date: favPit.date.slice(0, 10),
      fav: f1IsFav ? r['fighter1'] : r['fighter2'],
      dog: f1IsFav ? r['fighter2'] : r['fighter1'],
      eloPFav, rankedPFav, mktPFav,
      favWon: favPit.result === 'W',
      adjFav, adjDog,
      minFightNo: Math.min(favPit.selfFightNo, dogPit.selfFightNo),
    });
  }

  const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : '  –   ');
  const gap = (x: number, base: number) => {
    const d = x - base; const s = d >= 0 ? '+' : '−';
    return `${s}${Math.abs(d).toFixed(4)}`;
  };
  const report = (label: string, sub: Row[]) => {
    if (!sub.length) { console.log(`${label}: (no bouts)`); return; }
    const e = score(sub.map((r): Prediction => ({ p: r.eloPFav, won: r.favWon })));
    const g = score(sub.map((r): Prediction => ({ p: r.rankedPFav, won: r.favWon })));
    const k = score(sub.map((r): Prediction => ({ p: r.mktPFav, won: r.favWon })));
    console.log(`${label}  (n=${e.n})`);
    console.log('                    logloss    brier    accuracy   ECE');
    console.log(`  PURE ELO          ${fmt(e.logLoss)}   ${fmt(e.brier)}   ${(100 * e.accuracy).toFixed(1)}%      ${fmt(e.ece)}`);
    console.log(`  RANKED SCORE      ${fmt(g.logLoss)}   ${fmt(g.brier)}   ${(100 * g.accuracy).toFixed(1)}%      ${fmt(g.ece)}`);
    console.log(`  MARKET close      ${fmt(k.logLoss)}   ${fmt(k.brier)}   ${(100 * k.accuracy).toFixed(1)}%      ${fmt(k.ece)}`);
    console.log('  GAP TO PAR (model − market; closer to 0 = nearer the closing line):');
    console.log(`    PURE ELO      logloss ${gap(e.logLoss, k.logLoss)}   brier ${gap(e.brier, k.brier)}   acc ${gap(100 * e.accuracy, 100 * k.accuracy)}pt`);
    console.log(`    RANKED SCORE  logloss ${gap(g.logLoss, k.logLoss)}   brier ${gap(g.brier, k.brier)}   acc ${gap(100 * g.accuracy, 100 * k.accuracy)}pt`);
    console.log(`  RANKING LAYER EFFECT (ranked − pure; negative logloss/brier = the layer HELPS prediction):`);
    console.log(`    Δlogloss ${gap(g.logLoss, e.logLoss)}   Δbrier ${gap(g.brier, e.brier)}   Δacc ${gap(100 * g.accuracy, 100 * e.accuracy)}pt   ΔECE ${gap(g.ece, e.ece)}`);
    // Paired t on per-bout logloss differences (ranked − pure) — is the
    // direction real or noise? |t| ≳ 2 ≈ p < 0.05.
    const ll = (p: number, won: boolean) => -Math.log(Math.max(1e-12, won ? p : 1 - p));
    const diffs = sub.map((r) => ll(r.rankedPFav, r.favWon) - ll(r.eloPFav, r.favWon));
    const mean = diffs.reduce((s, d) => s + d, 0) / diffs.length;
    const sd = Math.sqrt(diffs.reduce((s, d) => s + (d - mean) ** 2, 0) / Math.max(1, diffs.length - 1));
    const t = mean / (sd / Math.sqrt(diffs.length));
    console.log(`    paired t on per-bout Δlogloss: mean ${mean.toFixed(4)}, t = ${t.toFixed(2)} (negative = ranked better)\n`);
  };

  console.log(`RANKED SCORE vs PURE ELO vs CLOSING LINE — both fighters ≥${MIN_FIGHTNO} prior UFC fights`);
  console.log(`(de-vig=${DEVIG}; ranked score = elo + PIT metrics/SoS/pedigree/untested; officialBonus omitted — no historical snapshots)`);
  console.log(`Matched bouts: ${matched}   [dropped: ${noElo} no-Elo, ${unresolved} name, ${notEstab} <${MIN_FIGHTNO} fights]\n`);

  report('FULL SAMPLE', rows);
  report('ESTABLISHED (both ≥6 prior)', rows.filter((r) => r.minFightNo >= 6));
  report('NEWCOMER-ADJACENT (thinner side 3–5 prior)', rows.filter((r) => r.minFightNo >= 3 && r.minFightNo <= 5));

  const dates = [...new Set(rows.map((r) => r.date))].sort().reverse();
  const cutoff = dates[Math.min(N_CARDS, dates.length) - 1];
  report(`RECENT WINDOW (last ~${N_CARDS} dated cards, since ${cutoff})`, rows.filter((r) => r.date >= cutoff));

  // Where the ranking layer most changed the number — and whether it helped.
  const byShift = [...rows].sort(
    (a, b) => Math.abs(b.rankedPFav - b.eloPFav) - Math.abs(a.rankedPFav - a.eloPFav)
  );
  console.log('BIGGEST RANKING-LAYER SHIFTS (ranked P(fav) vs pure-Elo P(fav)):');
  for (const r of byShift.slice(0, 12)) {
    const winner = r.favWon ? r.fav : r.dog;
    const eloRight = (r.eloPFav >= 0.5) === r.favWon;
    const rankedRight = (r.rankedPFav >= 0.5) === r.favWon;
    const flip = eloRight !== rankedRight ? (rankedRight ? ' [FLIP→right]' : ' [FLIP→wrong]') : '';
    console.log(
      `  ${r.date}  ${r.fav.padEnd(22)} Elo ${(100 * r.eloPFav).toFixed(0)}% → ranked ${(100 * r.rankedPFav).toFixed(0)}%  ` +
      `(adj fav ${r.adjFav >= 0 ? '+' : ''}${r.adjFav.toFixed(1)} / dog ${r.adjDog >= 0 ? '+' : ''}${r.adjDog.toFixed(1)})  won: ${winner.padEnd(18)}${flip}`
    );
  }
}

main();
