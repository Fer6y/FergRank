// ─────────────────────────────────────────────────────────────────────────
//  research/auditOdds.ts — match-rate audit for the closing-odds join.
//
//  Mirrors src/lib/auditOfficialMatches.ts: tells you what fraction of odds
//  rows resolve to a fighter id and find a matching Elo bout, and prints a
//  sample of the misses so name/date gaps can be fixed. Run this after every
//  fetchClosingOdds refresh — a silently-dropped row is a silently-wrong stat.
//
//  Run:  node_modules/.bin/jiti research/auditOdds.ts
// ─────────────────────────────────────────────────────────────────────────

import { loadAllData } from '../src/lib/loadData';
import { buildNameIndex, resolveNameToId } from '../src/lib/nameResolver';
import { joinOddsToElo } from './oddsVsElo';
import { loadClosingOdds } from './loadOdds';
import { ODDS_NAME_OVERRIDES } from './oddsNameOverrides';

function main(): void {
  const data = loadAllData();
  const odds = loadClosingOdds();
  const res = joinOddsToElo(data);

  const matchRate = res.totalOdds ? (res.rows.length / res.totalOdds) * 100 : 0;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  CLOSING-ODDS JOIN AUDIT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  odds rows                 : ${res.totalOdds}`);
  console.log(`  matched (decided) bouts   : ${res.rows.length}  (${matchRate.toFixed(1)}%)`);
  console.log(`  dropped: unresolved name  : ${res.unresolvedNames}`);
  console.log(`  dropped: no matching bout : ${res.noEloFight}`);
  console.log(`  dropped: matched, no winner: ${res.unknownOutcome}`);
  console.log('───────────────────────────────────────────────────────────────');

  // Sample the unresolved names so the KNOWN_NAME_OVERRIDES table (or a fix in
  // the source) can absorb them. Re-resolve here just to collect examples.
  const nameIndex = buildNameIndex(data.fighters);
  const resolve = (name: string): string | null =>
    resolveNameToId(ODDS_NAME_OVERRIDES[name] ?? name, nameIndex, {
      allowLastFirst: false,
      quiet: true,
    });
  const unresolved: string[] = [];
  for (const o of odds) {
    if (!resolve(o.favourite)) unresolved.push(o.favourite);
    if (!resolve(o.underdog)) unresolved.push(o.underdog);
  }
  const uniqueUnresolved = [...new Set(unresolved)].sort();
  console.log(`  distinct unresolved fighter names: ${uniqueUnresolved.length}`);
  for (const name of uniqueUnresolved.slice(0, 30)) {
    console.log(`    · ${name}`);
  }
  if (uniqueUnresolved.length > 30) {
    console.log(`    … and ${uniqueUnresolved.length - 30} more`);
  }
}

main();
