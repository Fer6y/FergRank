import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../src/lib/loadData';
import { buildEloWithTraces, winProbability, type FightTrace } from '../src/lib/eloEngine';
import type { Fight } from '../src/lib/types';

const N_CARDS = 10;
const PROVISIONAL = 5; // RANKING_CONFIG.elo.provisionalFights

// Events we don't treat as "real" ranked UFC cards for this backtest.
const EXCLUDE = /road to ufc|contender series|dana white/i;

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}
function pairKey(a: string, b: string): string {
  return [norm(a), norm(b)].sort().join('|');
}

// eventName lookup: recency file gives (pair,date)->name; primary via eventId->Events.csv
function buildEventNameLookup(data: ReturnType<typeof loadAllData>): (f: Fight) => string {
  const recFp = path.join(__dirname, '..', 'data', 'recent_ufc_fights.csv');
  const recRows = Papa.parse<Record<string, string>>(fs.readFileSync(recFp, 'utf-8'), { header: true, skipEmptyLines: true }).data;
  const recByPairDate = new Map<string, string>();
  for (const r of recRows) {
    if (!r['eventName']) continue;
    recByPairDate.set(`${pairKey(r['fighter1_name'], r['fighter2_name'])}|${r['date']}`, r['eventName']);
  }
  return (f: Fight) => {
    if (f.eventId) {
      const ev = data.events.get(f.eventId);
      if (ev?.name) return ev.name;
    }
    const d = f.eventDate ? f.eventDate.toISOString().slice(0, 10) : '';
    return recByPairDate.get(`${pairKey(f.fighter1Name, f.fighter2Name)}|${d}`) ?? `(unknown ${d})`;
  };
}

function findTrace(hist: FightTrace[] | undefined, date: string, oppName: string): FightTrace | undefined {
  if (!hist) return undefined;
  return hist.find((t) => t.date.slice(0, 10) === date && norm(t.opponentName) === norm(oppName));
}

// Count a fighter's prior UFC fights strictly before `date` (for provisional split).
function priorFightCount(hist: FightTrace[] | undefined, date: string): number {
  if (!hist) return 0;
  return hist.filter((t) => t.date.slice(0, 10) < date).length;
}

interface FightResult {
  event: string; date: string; wc: string;
  winner: string; loser: string; method: string; round: string;
  favPct: number | null;      // model prob assigned to the actual FAVORITE (>=0.5)
  favIsWinner: boolean;       // did the model's favorite win?
  winnerPct: number | null;   // prob assigned to actual winner
  winnerElo: number | null; loserElo: number | null;
  minPrior: number;           // min(prior UFC fights of the two corners)
  note: string;
}

function main() {
  const data = loadAllData();
  const { history } = buildEloWithTraces(data);
  const eventNameOf = buildEventNameLookup(data);

  // Group decisive fights by event, keep only non-excluded UFC cards.
  const byEvent = new Map<string, { date: string; fights: Fight[] }>();
  for (const f of data.fights) {
    if (!f.eventDate) continue;
    const decisive = (f.result1 === 'W' && f.result2 === 'L') || (f.result1 === 'L' && f.result2 === 'W');
    if (!decisive) continue;
    const name = eventNameOf(f);
    if (EXCLUDE.test(name)) continue;
    const d = f.eventDate.toISOString().slice(0, 10);
    const cur = byEvent.get(name) ?? { date: d, fights: [] };
    if (d > cur.date) cur.date = d;
    cur.fights.push(f);
    byEvent.set(name, cur);
  }

  const lastCards = [...byEvent.entries()]
    .sort((a, b) => (a[1].date < b[1].date ? 1 : -1))
    .slice(0, N_CARDS);

  const all: FightResult[] = [];

  for (const [name, { fights }] of lastCards) {
    for (const f of fights) {
      const winnerIsF1 = f.result1 === 'W';
      const winnerId = winnerIsF1 ? f.fighterId1 : f.fighterId2;
      const loserId = winnerIsF1 ? f.fighterId2 : f.fighterId1;
      const winnerName = winnerIsF1 ? f.fighter1Name : f.fighter2Name;
      const loserName = winnerIsF1 ? f.fighter2Name : f.fighter1Name;
      const date = f.eventDate!.toISOString().slice(0, 10);

      const tw = findTrace(history.get(winnerId), date, loserName);
      const tl = findTrace(history.get(loserId), date, winnerName);
      let winnerElo: number | null = null, loserElo: number | null = null, note = '';
      if (tw) { winnerElo = tw.ratingBefore; loserElo = tw.opponentRating; }
      else if (tl) { winnerElo = tl.opponentRating; loserElo = tl.ratingBefore; }
      else note = 'no trace';

      const winnerPct = winnerElo != null && loserElo != null ? winProbability(winnerElo, loserElo) : null;
      const favPct = winnerPct != null ? Math.max(winnerPct, 1 - winnerPct) : null;
      const favIsWinner = winnerPct != null ? winnerPct >= 0.5 : false;

      const minPrior = Math.min(
        priorFightCount(history.get(winnerId), date),
        priorFightCount(history.get(loserId), date),
      );

      all.push({ event: name, date, wc: f.weightClass, winner: winnerName, loser: loserName,
        method: f.method, round: String(f.round), favPct, favIsWinner, winnerPct,
        winnerElo, loserElo, minPrior, note });
    }
  }

  // Optional established-only filter: keep fights where BOTH corners had MORE than
  // MINPRIOR prior UFC fights going in (MINPRIOR=5 → both >5). Restricts every
  // downstream stat (per-card, overall, calibration, misses). Set via env.
  const MINPRIOR = process.env.MINPRIOR != null ? Number(process.env.MINPRIOR) : -1;
  const analyzed = MINPRIOR >= 0 ? all.filter((r) => r.minPrior > MINPRIOR) : all;

  // Per-card summary
  if (MINPRIOR >= 0) console.log(`[FILTER] both corners > ${MINPRIOR} prior UFC fights — ${analyzed.length}/${all.length} fights qualify\n`);
  console.log('LAST', N_CARDS, 'UFC CARDS — pre-fight win% backtest (point-in-time Elo, production formula)\n');
  console.log('DATE        HIT/TOT  ACC   BRIER  EVENT');
  for (const [name, { date }] of lastCards) {
    const rs = analyzed.filter((r) => r.event === name && r.winnerPct != null);
    const hit = rs.filter((r) => r.favIsWinner).length;
    const brier = rs.reduce((s, r) => s + Math.pow(1 - (r.winnerPct as number), 2), 0) / (rs.length || 1);
    console.log(`${date}  ${String(hit).padStart(2)}/${String(rs.length).padStart(2)}   ${(100 * hit / (rs.length || 1)).toFixed(0).padStart(3)}%  ${brier.toFixed(3)}  ${name}`);
  }

  const rated = analyzed.filter((r) => r.winnerPct != null);
  const hit = rated.filter((r) => r.favIsWinner).length;
  const brier = rated.reduce((s, r) => s + Math.pow(1 - (r.winnerPct as number), 2), 0) / (rated.length || 1);
  console.log(`\nOVERALL: favorite won ${hit}/${rated.length} (${(100 * hit / rated.length).toFixed(1)}%)  |  Brier ${brier.toFixed(3)}  |  coin-flip baseline 0.250`);

  // Confidence range
  const favs = rated.map((r) => r.favPct as number);
  console.log(`Favorite-confidence range: ${(100 * Math.min(...favs)).toFixed(0)}%–${(100 * Math.max(...favs)).toFixed(0)}%  (mean ${(100 * favs.reduce((a, b) => a + b, 0) / favs.length).toFixed(0)}%)`);

  // Calibration buckets (by favorite confidence)
  console.log('\nCALIBRATION (grouped by model favorite confidence):');
  console.log('  bucket        n    predicted   actual fav win-rate');
  const buckets: [number, number, string][] = [
    [0.50, 0.55, '50-55%'], [0.55, 0.60, '55-60%'], [0.60, 0.65, '60-65%'],
    [0.65, 0.75, '65-75%'], [0.75, 1.01, '75%+'],
  ];
  for (const [lo, hi, lab] of buckets) {
    const b = rated.filter((r) => (r.favPct as number) >= lo && (r.favPct as number) < hi);
    if (!b.length) { console.log(`  ${lab.padEnd(10)}   0`); continue; }
    const pred = b.reduce((s, r) => s + (r.favPct as number), 0) / b.length;
    const act = b.filter((r) => r.favIsWinner).length / b.length;
    console.log(`  ${lab.padEnd(10)} ${String(b.length).padStart(3)}    ${(100 * pred).toFixed(0)}%        ${(100 * act).toFixed(0)}%`);
  }

  // Sample-size split: does either corner have < PROVISIONAL prior UFC fights?
  console.log('\nSAMPLE-SIZE SPLIT (min prior UFC fights across the two corners):');
  for (const [lab, pred] of [
    ['THIN  (a corner < 5 UFC fights)', (r: FightResult) => r.minPrior < PROVISIONAL],
    ['ESTAB (both >= 5 UFC fights)', (r: FightResult) => r.minPrior >= PROVISIONAL],
  ] as [string, (r: FightResult) => boolean][]) {
    const b = rated.filter(pred);
    const h = b.filter((r) => r.favIsWinner).length;
    const br = b.reduce((s, r) => s + Math.pow(1 - (r.winnerPct as number), 2), 0) / (b.length || 1);
    const mc = b.reduce((s, r) => s + (r.favPct as number), 0) / (b.length || 1);
    console.log(`  ${lab.padEnd(34)} n=${String(b.length).padStart(3)}  acc ${(100 * h / (b.length || 1)).toFixed(0)}%  Brier ${br.toFixed(3)}  mean-conf ${(100 * mc).toFixed(0)}%`);
  }

  // Biggest misses across all 10 cards
  console.log('\nBIGGEST MISSES (model most confident on the fighter who lost):');
  const misses = rated.filter((r) => !r.favIsWinner).sort((a, b) => (a.winnerPct as number) - (b.winnerPct as number));
  for (const r of misses.slice(0, 12)) {
    console.log(`  ${r.date}  model favored ${r.loser} @ ${(100 * (r.favPct as number)).toFixed(0)}%  — ${r.winner} won (${r.method}, ${r.wc})`);
  }

  console.log(`\nUnrated fights (thin/unresolved, excluded from stats): ${analyzed.length - rated.length}`);
}

main();
