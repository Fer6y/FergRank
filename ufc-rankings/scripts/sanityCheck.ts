import { loadAllData } from '../src/lib/loadData';
import { generateDivisionRankings } from '../src/lib/scoringEngine';

async function main() {
  console.log('Loading data...');
  const data = loadAllData();
  console.log(`Loaded ${data.fighters.length} fighters, ${data.fights.length} fights, ${data.events.size} events`);

  // Count WW fighters
  const wwFighters = data.fighters.filter(f => f.weightClass === 'Welterweight');
  console.log(`\nWelterweight fighters in dataset: ${wwFighters.length}`);

  const wwWithFights = wwFighters.filter(f => {
    const fights = data.fighterFights.get(f.fighterId) || [];
    return fights.length >= 3;
  });
  console.log(`Welterweight fighters with 3+ fights: ${wwWithFights.length}`);

  console.log('\nGenerating Welterweight rankings...\n');
  const rankings = await generateDivisionRankings('Welterweight', data);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  TOP 15 WELTERWEIGHT RANKINGS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  for (const f of rankings.fighters.slice(0, 15)) {
    const badge = f.belt ? ' 🏆' : '';
    console.log(
      `#${String(f.rank).padStart(2)} | ${f.fullName.padEnd(25)} | ${f.record.padEnd(8)} | ` +
      `Score: ${String(f.rankScore).padStart(6)} | Elo: ${String(f.eloRating).padStart(7)} | ` +
      `Metrics: ${String(f.metricsBonus).padStart(6)} | SoS+: ${String(f.sosNudge).padStart(6)} | ` +
      `SoSelo: ${f.sosElo} | UFC: ${f.officialRank ?? '-'}${badge}`
    );
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`Generated at: ${rankings.generatedAt}`);
}

main().catch(console.error);
