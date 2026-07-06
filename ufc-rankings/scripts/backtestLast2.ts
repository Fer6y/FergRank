import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../src/lib/loadData';
import { buildEloWithTraces, winProbability, type FightTrace } from '../src/lib/eloEngine';

// The two most recent full UFC cards present in data/recent_ufc_fights.csv.
const CARDS = [
  'UFC Fight Night 280 - Fiziev vs. Torres',
  'UFC Fight Night 279 - Kape vs. Horiguchi 2',
];

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

interface Row {
  f1id: string; f1: string; f2id: string; f2: string;
  date: string; r1: string; r2: string; method: string; round: string;
  wc: string; event: string;
}

function loadCardRows(): Row[] {
  const fp = path.join(__dirname, '..', 'data', 'recent_ufc_fights.csv');
  const rows = Papa.parse<Record<string, string>>(fs.readFileSync(fp, 'utf-8'), { header: true, skipEmptyLines: true }).data;
  return rows
    .filter((r) => CARDS.includes(r['eventName'] || ''))
    .map((r) => ({
      f1id: r['fighter1_ourId'] || '', f1: r['fighter1_name'] || '',
      f2id: r['fighter2_ourId'] || '', f2: r['fighter2_name'] || '',
      date: r['date'] || '', r1: r['result1'] || '', r2: r['result2'] || '',
      method: r['method'] || '', round: r['round'] || '', wc: r['weightClass'] || '',
      event: r['eventName'] || '',
    }));
}

function findTrace(hist: FightTrace[] | undefined, date: string, oppName: string): FightTrace | undefined {
  if (!hist) return undefined;
  return hist.find((t) => t.date.slice(0, 10) === date && norm(t.opponentName) === norm(oppName));
}

function main() {
  const data = loadAllData();
  const { history } = buildEloWithTraces(data);

  const rows = loadCardRows();

  interface Result {
    event: string; wc: string;
    winner: string; loser: string; method: string; round: string;
    winnerPreWinPct: number | null; // model win% assigned to actual winner, pre-fight
    winnerElo: number | null; loserElo: number | null;
    note: string;
  }
  const results: Result[] = [];

  for (const row of rows) {
    // Identify winner/loser from result columns.
    let winnerId: string, winnerName: string, loserId: string, loserName: string;
    if (row.r1 === 'W' && row.r2 === 'L') {
      winnerId = row.f1id; winnerName = row.f1; loserId = row.f2id; loserName = row.f2;
    } else if (row.r1 === 'L' && row.r2 === 'W') {
      winnerId = row.f2id; winnerName = row.f2; loserId = row.f1id; loserName = row.f1;
    } else {
      // draw / NC — record but no clean winner
      results.push({ event: row.event, wc: row.wc, winner: `${row.f1}/${row.f2}`, loser: '', method: row.method, round: row.round, winnerPreWinPct: null, winnerElo: null, loserElo: null, note: `non-decisive (${row.r1}/${row.r2})` });
      continue;
    }

    // Pull the winner's trace for this fight → point-in-time pre-fight ratings.
    const t = findTrace(history.get(winnerId), row.date, loserName)
      ?? findTrace(history.get(loserId), row.date, winnerName);

    let winnerPreWinPct: number | null = null;
    let winnerElo: number | null = null, loserElo: number | null = null;
    let note = '';
    if (t) {
      // If we matched via loser's trace, flip perspective.
      const matchedViaWinner = findTrace(history.get(winnerId), row.date, loserName) != null;
      if (matchedViaWinner) {
        winnerElo = t.ratingBefore; loserElo = t.opponentRating;
      } else {
        winnerElo = t.opponentRating; loserElo = t.ratingBefore;
      }
      winnerPreWinPct = winProbability(winnerElo, loserElo);
    } else {
      note = 'no trace (one/both fighters not rated — thin/unranked)';
    }

    results.push({ event: row.event, wc: row.wc, winner: winnerName, loser: loserName, method: row.method, round: row.round, winnerPreWinPct, winnerElo, loserElo, note });
  }

  // Report per card.
  for (const card of CARDS) {
    const cardRes = results.filter((r) => r.event === card);
    console.log('\n' + '='.repeat(80));
    console.log(card);
    console.log('='.repeat(80));
    const rated = cardRes.filter((r) => r.winnerPreWinPct != null);
    let correct = 0, briersum = 0;
    for (const r of cardRes) {
      const pct = r.winnerPreWinPct;
      if (pct == null) {
        console.log(`  ${r.wc.padEnd(22)} ${r.winner} def. ${r.loser}  [${r.method} R${r.round}]  — ${r.note}`);
        continue;
      }
      const favored = pct >= 0.5;
      if (favored) correct++;
      briersum += Math.pow(1 - pct, 2); // winner actually won → outcome=1
      const tag = favored ? 'HIT ' : 'MISS';
      const swing = favored ? '' : `  (model favored ${r.loser} @ ${((1 - pct) * 100).toFixed(0)}%)`;
      console.log(`  [${tag}] winner ${r.winner} pre-fight ${(pct * 100).toFixed(0)}%  (Elo ${r.winnerElo?.toFixed(0)} vs ${r.loserElo?.toFixed(0)})  vs ${r.loser}  [${r.method} R${r.round}]${swing}`);
    }
    console.log(`  ---`);
    console.log(`  Rated fights: ${rated.length}/${cardRes.length}  |  Model picked winner: ${correct}/${rated.length} (${rated.length ? (100 * correct / rated.length).toFixed(0) : '–'}%)  |  Brier: ${rated.length ? (briersum / rated.length).toFixed(3) : '–'}`);
  }

  // Overall
  const allRated = results.filter((r) => r.winnerPreWinPct != null);
  const allCorrect = allRated.filter((r) => (r.winnerPreWinPct as number) >= 0.5).length;
  const allBrier = allRated.reduce((s, r) => s + Math.pow(1 - (r.winnerPreWinPct as number), 2), 0) / (allRated.length || 1);
  console.log('\n' + '#'.repeat(80));
  console.log(`OVERALL (both cards): picked winner ${allCorrect}/${allRated.length} (${(100 * allCorrect / (allRated.length || 1)).toFixed(0)}%)  |  Brier ${allBrier.toFixed(3)}`);
  console.log('#'.repeat(80));

  // Biggest hits (confident + correct) and misses (confident + wrong)
  const sortedByConf = [...allRated].sort((a, b) => (b.winnerPreWinPct as number) - (a.winnerPreWinPct as number));
  const misses = allRated.filter((r) => (r.winnerPreWinPct as number) < 0.5).sort((a, b) => (a.winnerPreWinPct as number) - (b.winnerPreWinPct as number));
  console.log('\nBIGGEST HITS (most confident, correct):');
  for (const r of sortedByConf.filter((r) => (r.winnerPreWinPct as number) >= 0.5).slice(0, 5)) {
    console.log(`  ${(r.winnerPreWinPct! * 100).toFixed(0)}%  ${r.winner} def. ${r.loser} (${r.wc}) [${r.method}]`);
  }
  console.log('\nBIGGEST MISSES (most confident, wrong — upsets the model did not see):');
  for (const r of misses.slice(0, 8)) {
    console.log(`  model gave winner ${r.winner} only ${(r.winnerPreWinPct! * 100).toFixed(0)}% (favored ${r.loser} @ ${((1 - r.winnerPreWinPct!) * 100).toFixed(0)}%) — ${r.winner} won by ${r.method} (${r.wc})`);
  }
}

main();
