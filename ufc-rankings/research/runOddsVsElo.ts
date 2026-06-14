// ─────────────────────────────────────────────────────────────────────────
//  research/runOddsVsElo.ts — print the odds-vs-Elo research summary.
//
//  Run:  node_modules/.bin/jiti research/runOddsVsElo.ts
//
//  Reads Elo (from the engine, untouched) + closing odds, joins them, and
//  reports how Elo's pre-fight probabilities compare to the closing line —
//  including where Elo disagreed with the market and who was right. Pure
//  output; writes nothing back into any rating.
// ─────────────────────────────────────────────────────────────────────────

import { joinOddsToElo, summarise } from './oddsVsElo';

function pct(x: number): string {
  return (x * 100).toFixed(1) + '%';
}

function main(): void {
  const res = joinOddsToElo();
  const s = summarise(res.rows);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  CLOSING ODDS  ×  ELO   — research summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  odds rows loaded     : ${res.totalOdds}`);
  console.log(`  matched (decided) bouts: ${s.matched}`);
  console.log(`    unresolved names   : ${res.unresolvedNames}`);
  console.log(`    no matching bout   : ${res.noEloFight}`);
  console.log(`    matched, no winner : ${res.unknownOutcome}`);
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`  decided matched bouts: ${s.decided}`);
  console.log(`  market favourite win rate: ${pct(s.marketFavWinRate)}`);
  console.log(`  Elo pick win rate        : ${pct(s.eloFavWinRate)}`);
  console.log(`  Elo / market agreement   : ${pct(s.agreementRate)}`);
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`  disagreements (Elo backs the dog): ${s.disagreements}`);
  console.log(`    → Elo's underdog pick win rate : ${pct(s.eloUnderdogWinRate)}`);
  console.log(`  mean |Elo prob − market prob|    : ${pct(s.meanAbsProbGap)}`);
  console.log('───────────────────────────────────────────────────────────────');

  // Top value spots: biggest positive edge (Elo much higher on the favourite
  // than the closing line) where the favourite actually won.
  const hits = res.rows
    .filter((r) => r.outcome === 'favourite' && r.edge > 0)
    .sort((a, b) => b.edge - a.edge)
    .slice(0, 10);
  console.log('  Top 10 favourite-edge spots Elo got right (edge = Elo − market):');
  for (const r of hits) {
    console.log(
      `   ${r.date}  ${r.favouriteName} vs ${r.underdogName.padEnd(22)} ` +
        `Elo ${pct(r.eloFavProb)} | mkt ${pct(r.marketFavProb)} ` +
        `| edge +${(r.edge * 100).toFixed(1)}pts @ ${r.favouriteOdds}`
    );
  }

  console.log('\n  Top 10 live dogs Elo flagged that WON (Elo backed the market underdog):');
  const dogs = res.rows
    .filter((r) => !r.agree && r.outcome === 'underdog')
    .sort((a, b) => a.eloFavProb - b.eloFavProb) // lowest fav prob = strongest dog lean
    .slice(0, 10);
  for (const r of dogs) {
    console.log(
      `   ${r.date}  ${r.underdogName} (dog @ ${r.underdogOdds}) beat ${r.favouriteName.padEnd(20)} ` +
        `| Elo gave fav only ${pct(r.eloFavProb)}`
    );
  }
}

main();
