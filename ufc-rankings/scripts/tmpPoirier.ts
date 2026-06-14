// TEMP case study: Poirier vs Holloway at Lightweight.
import { loadAllData } from '../src/lib/loadData';
import { generateDivisionRankings } from '../src/lib/scoringEngine';
import { getFighterHistory } from '../src/lib/eloEngine';

async function main() {
  const data = loadAllData();
  const lw = await generateDivisionRankings('Lightweight', data);

  console.log('=== LIGHTWEIGHT TOP 15 ===');
  lw.fighters.slice(0, 15).forEach((f) => {
    console.log(
      `#${String(f.rank).padStart(2)}  ${f.rankScore.toFixed(1).padStart(5)}  final ${f.finalRating.toFixed(0)}  elo ${f.eloRating.toFixed(0)}  off#${f.officialRank ?? '-'}  ${f.fullName} (${f.record})`
    );
  });

  const find = (needle: string) =>
    [...data.fighters.values()].find((f) =>
      f.fullName.toLowerCase().includes(needle.toLowerCase())
    );

  for (const name of ['Poirier', 'Holloway']) {
    const f = find(name);
    if (!f) { console.log(`\n${name}: NOT FOUND`); continue; }
    const hist = getFighterHistory(data, f.fighterId);
    console.log(`\n=== ${f.fullName} (${f.fighterId}) — last 8 fights (newest first) ===`);
    hist.slice(0, 8).forEach((h) => {
      const d = h.date.slice(0, 10);
      console.log(
        `  ${d}  ${h.result}  vs ${h.opponentName.padEnd(22)} ${h.method.padEnd(10)} [${h.weightClass}]  Δ${h.delta >= 0 ? '+' : ''}${h.delta.toFixed(1)}  (oppElo ${h.opponentRating.toFixed(0)} → me ${h.ratingAfter.toFixed(0)})`
      );
    });
    // where is this fighter ranked across divisions?
    console.log(`  rankedIn Lightweight? ${lw.fighters.find((x) => x.fighterId === f.fighterId)?.rank ?? 'NO'}`);
  }
}
main();
