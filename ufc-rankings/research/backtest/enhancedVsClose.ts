// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/enhancedVsClose.ts — scores THREE predictors against the
//  de-vigged closing line, over the last N UFC cards, both fighters >5 UFC
//  fights:
//     1. PURE ELO      — winProbability(fav, dog)             (production Elo)
//     2. FULL MODEL    — predictFight(...)  Elo + age + style (the shipped
//                        head-to-head model, fightPrediction.ts)
//     3. MARKET close  — de-vigged BestFightOdds close        (benchmark)
//
//  Answers: "how far off is our algo from PAR with the closing line, and does
//  the age/style layer actually close the gap over pure Elo?" — WITHOUT ever
//  copying the market: the model is built from our own fight data only.
//
//  Firewall-respecting: lives in research/, reads the engine's point-in-time
//  traces (ratingBefore) + BFO closes, feeds odds to NO rating. predictFight is
//  called with asOf = fight date so age + style are leak-free (pre-fight only).
//
//  Run: node_modules/.bin/jiti research/backtest/enhancedVsClose.ts
//       NCARDS=40 node_modules/.bin/jiti research/backtest/enhancedVsClose.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData, type LoadedData } from '../../src/lib/loadData';
import type { Fight } from '../../src/lib/types';
import { winProbability } from '../../src/lib/eloEngine';
import { predictFight } from '../../src/lib/fightPrediction';
import { buildNameIndex } from '../../src/lib/nameResolver';
import { buildPointInTimeIndex, resolveOddsName } from './pointInTime';
import { devig, type DevigMethod } from './devig';
import { score, type Prediction } from './metrics';

const N_CARDS = process.env.NCARDS ? Number(process.env.NCARDS) : 30;
const MIN_FIGHTNO = process.env.MINFIGHTNO ? Number(process.env.MINFIGHTNO) : 6; // both fighters ≥N prior bouts
const DEVIG: DevigMethod = 'shin';     // principled favourite-longshot correction
const EXCLUDE = /road to ufc|contender series|dana white/i;
const DAY_TOL = [0, 1, -1, 2, -2];

function dayNum(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? NaN : Math.floor(t / 86_400_000);
}
function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}
function pairKey(a: string, b: string): string {
  return [norm(a), norm(b)].sort().join('|');
}

function buildEventNameLookup(data: LoadedData): (f: Fight) => string {
  const fp = path.join(process.cwd(), 'data', 'recent_ufc_fights.csv');
  const recByPairDate = new Map<string, string>();
  if (fs.existsSync(fp)) {
    const rows = Papa.parse<Record<string, string>>(fs.readFileSync(fp, 'utf-8'), { header: true, skipEmptyLines: true }).data;
    for (const r of rows) if (r['eventName']) recByPairDate.set(`${pairKey(r['fighter1_name'], r['fighter2_name'])}|${r['date']}`, r['eventName']);
  }
  return (f: Fight) => {
    if (f.eventId) { const ev = data.events.get(f.eventId); if (ev?.name) return ev.name; }
    const d = f.eventDate ? f.eventDate.toISOString().slice(0, 10) : '';
    return recByPairDate.get(`${pairKey(f.fighter1Name, f.fighter2Name)}|${d}`) ?? `(unknown ${d})`;
  };
}

function lastNCardCutoff(data: LoadedData): string {
  const nameOf = buildEventNameLookup(data);
  const byEvent = new Map<string, string>();
  for (const f of data.fights) {
    if (!f.eventDate) continue;
    const name = nameOf(f);
    if (EXCLUDE.test(name)) continue;
    const d = f.eventDate.toISOString().slice(0, 10);
    if (!byEvent.has(name) || d > byEvent.get(name)!) byEvent.set(name, d);
  }
  const dates = [...byEvent.values()].sort((a, b) => (a < b ? 1 : -1)).slice(0, N_CARDS);
  return dates[dates.length - 1];
}

interface Row {
  date: string; div: string; fav: string; dog: string;
  eloPFav: number; fullPFav: number; mktPFav: number; favWon: boolean;
  ageEdge: number; styleLogit: number;
  minFightNo: number; // prior UFC bouts of the THINNER fighter (drives the newcomer gap)
}

function main() {
  const data = loadAllData();
  const idx = buildPointInTimeIndex(data);
  const nameIndex = buildNameIndex(data.fighters);
  const cutoff = lastNCardCutoff(data);

  const lookup = (a: string, b: string, day: number) => {
    for (const off of DAY_TOL) { const hit = idx.get(`${a}#${b}#${day + off}`); if (hit) return hit; }
    return null;
  };

  const bfoFp = path.join(process.cwd(), 'data', 'bfo_odds.csv');
  const bfo = Papa.parse<Record<string, string>>(fs.readFileSync(bfoFp, 'utf-8'), { header: true, skipEmptyLines: true }).data;

  const rows: Row[] = [];
  let matched = 0, noElo = 0, unresolved = 0, notEstab = 0, outOfWindow = 0;

  for (const r of bfo) {
    const c1 = parseFloat(r['close1']); const c2 = parseFloat(r['close2']);
    if (!(c1 > 1) || !(c2 > 1)) continue;
    const id1 = resolveOddsName(r['fighter1'], nameIndex);
    const id2 = resolveOddsName(r['fighter2'], nameIndex);
    if (!id1 || !id2) { unresolved++; continue; }
    const day = dayNum(r['date']);
    const p1 = lookup(id1, id2, day);
    if (!p1) { noElo++; continue; }
    if (p1.date.slice(0, 10) < cutoff) { outOfWindow++; continue; }
    const p2 = lookup(id2, id1, day);
    if (p1.selfFightNo < MIN_FIGHTNO || (p2?.selfFightNo ?? 0) < MIN_FIGHTNO) { notEstab++; continue; }
    matched++;

    const f1IsFav = c1 <= c2;
    const favId = f1IsFav ? id1 : id2;
    const dogId = f1IsFav ? id2 : id1;
    const favClose = f1IsFav ? c1 : c2;
    const dogClose = f1IsFav ? c2 : c1;
    const favPit = f1IsFav ? p1 : p2!;
    const dogPit = f1IsFav ? p2! : p1;

    const eloPFav = winProbability(favPit.selfRating, favPit.oppRating);

    // FULL MODEL — Elo + age + style, leak-free via asOf = fight date.
    const asOf = new Date(favPit.date);
    const pred = predictFight(
      data, favId, dogId,
      favPit.selfRating, favPit.oppRating,
      favPit.selfFightNo + 1, dogPit.selfFightNo + 1,
      asOf,
    );

    const mktPFav = devig(favClose, dogClose, DEVIG).pFav;
    const favWon = favPit.result === 'W';
    rows.push({
      date: p1.date.slice(0, 10),
      div: p1.weightClass,
      fav: f1IsFav ? r['fighter1'] : r['fighter2'],
      dog: f1IsFav ? r['fighter2'] : r['fighter1'],
      eloPFav, fullPFav: pred.probA, mktPFav, favWon,
      ageEdge: pred.ageEdgeYears, styleLogit: pred.styleLogit,
      minFightNo: Math.min(favPit.selfFightNo, dogPit.selfFightNo),
    });
  }

  const eloPreds: Prediction[] = rows.map((r) => ({ p: r.eloPFav, won: r.favWon }));
  const fullPreds: Prediction[] = rows.map((r) => ({ p: r.fullPFav, won: r.favWon }));
  const mktPreds: Prediction[] = rows.map((r) => ({ p: r.mktPFav, won: r.favWon }));
  const e = score(eloPreds); const g = score(fullPreds); const k = score(mktPreds);

  const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '  –  ');
  const gap = (x: number, base: number) => {
    const d = x - base; const s = d >= 0 ? '+' : '−';
    return `${s}${Math.abs(d).toFixed(3)}`;
  };
  console.log(`FULL MODEL vs PURE ELO vs CLOSING LINE — last ${N_CARDS} UFC cards, both fighters ≥${MIN_FIGHTNO} prior UFC fights`);
  console.log(`(cutoff ${cutoff} · de-vig=${DEVIG} · full model = Elo + age + style, leak-free)\n`);
  console.log(`Matched bouts: ${matched}   [dropped: ${noElo} no-Elo, ${unresolved} name, ${notEstab} not-established, ${outOfWindow} older-than-${N_CARDS}-cards]\n`);

  console.log('                    n    logloss   brier   accuracy   ECE');
  console.log(`  PURE ELO         ${String(e.n).padStart(3)}   ${fmt(e.logLoss)}    ${fmt(e.brier)}   ${(100 * e.accuracy).toFixed(1)}%     ${fmt(e.ece)}`);
  console.log(`  FULL MODEL       ${String(g.n).padStart(3)}   ${fmt(g.logLoss)}    ${fmt(g.brier)}   ${(100 * g.accuracy).toFixed(1)}%     ${fmt(g.ece)}`);
  console.log(`  MARKET close     ${String(k.n).padStart(3)}   ${fmt(k.logLoss)}    ${fmt(k.brier)}   ${(100 * k.accuracy).toFixed(1)}%     ${fmt(k.ece)}`);
  console.log(`  (lower = better; market is the benchmark to beat)\n`);

  console.log('GAP TO PAR (model − market; closer to 0 = nearer the closing line):');
  console.log(`  PURE ELO    logloss ${gap(e.logLoss, k.logLoss)}   brier ${gap(e.brier, k.brier)}   acc ${gap(100 * e.accuracy, 100 * k.accuracy)}pt   ECE ${gap(e.ece, k.ece)}`);
  console.log(`  FULL MODEL  logloss ${gap(g.logLoss, k.logLoss)}   brier ${gap(g.brier, k.brier)}   acc ${gap(100 * g.accuracy, 100 * k.accuracy)}pt   ECE ${gap(g.ece, k.ece)}\n`);

  console.log('DOES THE AGE/STYLE LAYER HELP? (full model − pure Elo; negative logloss/brier = improvement):');
  console.log(`  Δlogloss ${gap(g.logLoss, e.logLoss)}   Δbrier ${gap(g.brier, e.brier)}   Δacc ${gap(100 * g.accuracy, 100 * e.accuracy)}pt   ΔECE ${gap(g.ece, e.ece)}\n`);

  // ── FIGHT-EXPERIENCE BUCKETS ────────────────────────────────────────────
  // The newcomer gap: bucket each bout by the THINNER fighter's prior UFC
  // bouts. This is where any pedigree/pre-UFC-SoS improvement must show up —
  // the 3–5 bucket should close toward the market; the 6+ bucket should barely
  // move (the seed tapers out by 6 fights). Run at MINFIGHTNO=3 to fill both.
  const buckets: { label: string; test: (r: Row) => boolean }[] = [
    { label: '3–5 prior (newcomer)', test: (r) => r.minFightNo >= 3 && r.minFightNo <= 5 },
    { label: '6+ prior (established)', test: (r) => r.minFightNo >= 6 },
  ];
  console.log('BY FIGHT EXPERIENCE (thinner fighter\'s prior UFC bouts) — full model vs market:');
  console.log('  bucket                    n    full LL  mkt LL   ΔLL     full acc  mkt acc  Δacc');
  for (const b of buckets) {
    const sub = rows.filter(b.test);
    if (!sub.length) { console.log(`  ${b.label.padEnd(24)}  (no bouts in window)`); continue; }
    const gf = score(sub.map((r) => ({ p: r.fullPFav, won: r.favWon })));
    const kf = score(sub.map((r) => ({ p: r.mktPFav, won: r.favWon })));
    console.log(
      `  ${b.label.padEnd(24)} ${String(gf.n).padStart(3)}   ${fmt(gf.logLoss)}   ${fmt(kf.logLoss)}  ${gap(gf.logLoss, kf.logLoss)}   ` +
      `${(100 * gf.accuracy).toFixed(1)}%    ${(100 * kf.accuracy).toFixed(1)}%   ${gap(100 * gf.accuracy, 100 * kf.accuracy)}pt`,
    );
  }
  console.log('  (Δ = full model − market; the newcomer bucket is the target for pre-UFC pedigree work)\n');

  // Where the full model most changed the pure-Elo number.
  const byShift = [...rows].sort((a, b) => Math.abs(b.fullPFav - b.eloPFav) - Math.abs(a.fullPFav - a.eloPFav));
  console.log('BIGGEST AGE/STYLE ADJUSTMENTS (full P(fav) vs pure-Elo P(fav)):');
  for (const r of byShift.slice(0, 12)) {
    const winner = r.favWon ? r.fav : r.dog;
    const eloRight = (r.eloPFav >= 0.5) === r.favWon;
    const fullRight = (r.fullPFav >= 0.5) === r.favWon;
    const flip = eloRight !== fullRight ? (fullRight ? ' [FLIP→right]' : ' [FLIP→wrong]') : '';
    console.log(`  ${r.date}  ${r.fav.padEnd(20)} Elo ${(100 * r.eloPFav).toFixed(0)}% → full ${(100 * r.fullPFav).toFixed(0)}%  (age ${r.ageEdge >= 0 ? '+' : ''}${r.ageEdge.toFixed(0)}y, style ${r.styleLogit >= 0 ? '+' : ''}${r.styleLogit.toFixed(2)})  won: ${winner.padEnd(18)}${flip}`);
  }
}

main();
