// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/recentVsClose.ts — model picks vs the CLOSING LINE, over
//  the last N UFC cards, restricted to bouts where BOTH fighters had >5 prior
//  UFC fights (both fightNo ≥ 6, i.e. their 7th career bout or later).
//
//  Firewall-respecting: lives in research/, reads the engine's point-in-time
//  traces + BestFightOdds closes, never writes back to any rating. Uses the
//  PRODUCTION win-prob (winProbability → winProbDenominator) so this scores the
//  model as actually shipped, and the de-vigged BFO close as the market truth.
//
//  Odds source: data/bfo_odds.csv (BestFightOdds, 2021→2026 — the recent feed;
//  the 2014–2023 closing_odds.csv does not reach these cards).
//    columns: date,event_slug,fighter1,fighter2,open1,open2,close1,close2,n_books
//
//  Run: node_modules/.bin/jiti research/backtest/recentVsClose.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData, type LoadedData } from '../../src/lib/loadData';
import type { Fight } from '../../src/lib/types';
import { winProbability } from '../../src/lib/eloEngine';
import { buildNameIndex } from '../../src/lib/nameResolver';
import { buildPointInTimeIndex, resolveOddsName } from './pointInTime';
import { devig, type DevigMethod } from './devig';
import { score, type Prediction } from './metrics';

const N_CARDS = process.env.NCARDS ? Number(process.env.NCARDS) : 30;
const MIN_FIGHTNO = 6;                 // both fighters ≥6 prior bouts → ">5 UFC fights"
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

// eventName for a fight (primary via Events.csv; recency via the patch pairs).
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

// The last N UFC cards → the cutoff date (min event date among the 30 newest).
function lastNCardCutoff(data: LoadedData): string {
  const nameOf = buildEventNameLookup(data);
  const byEvent = new Map<string, string>(); // name → max date
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
  eloPFav: number; mktPFav: number; favWon: boolean; edge: number;
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
    const p1 = lookup(id1, id2, day);       // fighter1 perspective
    if (!p1) { noElo++; continue; }
    if (p1.date.slice(0, 10) < cutoff) { outOfWindow++; continue; }
    const p2 = lookup(id2, id1, day);       // fighter2 perspective (for its fightNo)
    if (p1.selfFightNo < MIN_FIGHTNO || (p2?.selfFightNo ?? 0) < MIN_FIGHTNO) { notEstab++; continue; }
    matched++;

    // Frame from the MARKET FAVOURITE (lower decimal close).
    const f1IsFav = c1 <= c2;
    const favClose = f1IsFav ? c1 : c2;
    const dogClose = f1IsFav ? c2 : c1;
    const favPit = f1IsFav ? p1 : p2!;
    const eloPFav = winProbability(favPit.selfRating, favPit.oppRating);
    const mktPFav = devig(favClose, dogClose, DEVIG).pFav;
    const favWon = favPit.result === 'W';
    rows.push({
      date: p1.date.slice(0, 10),
      div: p1.weightClass,
      fav: f1IsFav ? r['fighter1'] : r['fighter2'],
      dog: f1IsFav ? r['fighter2'] : r['fighter1'],
      eloPFav, mktPFav, favWon, edge: eloPFav - mktPFav,
    });
  }

  const modelPreds: Prediction[] = rows.map((r) => ({ p: r.eloPFav, won: r.favWon }));
  const mktPreds: Prediction[] = rows.map((r) => ({ p: r.mktPFav, won: r.favWon }));
  const m = score(modelPreds); const k = score(mktPreds);

  const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '  –  ');
  console.log(`MODEL vs CLOSING LINE — last ${N_CARDS} UFC cards, both fighters >5 UFC fights`);
  console.log(`(cutoff ${cutoff} · de-vig=${DEVIG} · model win-prob = production denominator)\n`);
  console.log(`Matched bouts: ${matched}   [dropped: ${noElo} no-Elo, ${unresolved} name, ${notEstab} not-established, ${outOfWindow} older-than-30-cards]\n`);

  console.log('                 n    logloss   brier   accuracy   ECE');
  console.log(`  MODEL (Elo)   ${String(m.n).padStart(3)}   ${fmt(m.logLoss)}    ${fmt(m.brier)}   ${(100 * m.accuracy).toFixed(1)}%     ${fmt(m.ece)}`);
  console.log(`  MARKET close  ${String(k.n).padStart(3)}   ${fmt(k.logLoss)}    ${fmt(k.brier)}   ${(100 * k.accuracy).toFixed(1)}%     ${fmt(k.ece)}`);
  console.log(`  (lower logloss/brier/ECE = better; market is the benchmark to beat)\n`);

  // Agreement: does the model favour the same side as the market?
  const agree = rows.filter((r) => r.eloPFav >= 0.5);
  const disagree = rows.filter((r) => r.eloPFav < 0.5); // model backs the market underdog
  const agreeWon = agree.filter((r) => r.favWon).length;
  const disagreeDogWon = disagree.filter((r) => !r.favWon).length; // model's contrarian pick won
  console.log(`AGREEMENT: model sided with the market favourite in ${agree.length}/${rows.length} (${(100 * agree.length / rows.length).toFixed(0)}%).`);
  console.log(`  • when AGREE, the pick won ${agreeWon}/${agree.length} (${(100 * agreeWon / (agree.length || 1)).toFixed(0)}%)`);
  console.log(`  • when the model went CONTRARIAN (${disagree.length} bouts), its underdog won ${disagreeDogWon}/${disagree.length} (${(100 * disagreeDogWon / (disagree.length || 1)).toFixed(0)}%)\n`);

  // Where the model most disagreed with the price (|edge|), and how it resolved.
  const byEdge = [...rows].sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));
  console.log('BIGGEST MODEL vs MARKET DISAGREEMENTS (edge = model P(fav) − market P(fav)):');
  for (const r of byEdge.slice(0, 14)) {
    const lean = r.edge > 0 ? `+${(100 * r.edge).toFixed(0)}% on ${r.fav}` : `+${(100 * -r.edge).toFixed(0)}% on ${r.dog}`;
    const modelSide = r.eloPFav >= 0.5 ? r.fav : r.dog;
    const winner = r.favWon ? r.fav : r.dog;
    const hit = modelSide === winner ? 'MODEL ✓' : 'mkt  ✓';
    console.log(`  ${r.date}  Elo ${(100 * r.eloPFav).toFixed(0)}% / mkt ${(100 * r.mktPFav).toFixed(0)}% P(${r.fav})  → model leans ${lean.padEnd(22)} | won: ${winner.padEnd(20)} ${hit}`);
  }
}

main();
