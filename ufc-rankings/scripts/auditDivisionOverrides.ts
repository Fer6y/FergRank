// ─────────────────────────────────────────────────────────────────────────
//  auditDivisionOverrides.ts — are any RANKING_CONFIG.divisionOverrides STALE?
//
//  A divisionOverride is a manual pin that intentionally contradicts the
//  official feed (a permanent weight move, or a title change the feed hasn't
//  caught up to). That is fine — until the feed catches up, at which point the
//  pin becomes redundant or, worse, actively wrong (the Paulo Costa 'NR' bug:
//  an override kept suppressing his real #8 seed long after ufc.com ranked him).
//
//  This cross-checks every override against the committed official snapshot
//  (data/official_rankings.csv, via fetchOfficialRankings) and classifies it:
//
//    ✗ HARMFUL   — rank:'NR' pin while the snapshot now RANKS the fighter in
//                  that division (a real seed is being suppressed). The Costa bug.
//    ⚠ REDUNDANT — the snapshot already agrees (same division + rank, and any
//                  removeFrom division no longer lists the fighter). Safe to delete.
//    ⚠ MOOT-EVICT— removeFrom division no longer lists the fighter, so the
//                  eviction does nothing now (the rest of the pin may still be live).
//    ⚠ UNRESOLVED— the override name matches no fighter (typo / roster change).
//    ✓ ACTIVE    — still contradicts the feed by design (e.g. a champ correction
//                  the feed hasn't caught up to). Left alone; shown for eyeballing.
//
//  Exits 1 if any HARMFUL override is found (wire into CI if desired); other
//  classes are advisory (exit 0). Run:
//    node_modules/.bin/jiti scripts/auditDivisionOverrides.ts
// ─────────────────────────────────────────────────────────────────────────

import { loadAllData } from '../src/lib/loadData';
import { RANKING_CONFIG } from '../src/lib/rankingConfig';
import {
  fetchOfficialRankings,
  getOfficialRankingsForDivision,
} from '../src/lib/fetchOfficialRankings';
import { buildNameIndex, resolveNameToId } from '../src/lib/nameResolver';
import { getRegistry } from '../src/lib/registry';
import type { OfficialRankingsMap } from '../src/lib/types';

// Same resolution path the scoring engine uses for official names: canonical
// registry first (curated aliases), fuzzy fallback.
function makeResolver(fighters: ReturnType<typeof loadAllData>['fighters']) {
  const nameIndex = buildNameIndex(fighters);
  const registry = getRegistry();
  return (name: string): string | null =>
    registry.resolve(name) ?? resolveNameToId(name, nameIndex);
}

// The rank (as a string like "C"/"1".../"8") the snapshot lists this fighterId
// at within a given division, or null if the snapshot doesn't rank them there.
function snapshotRankIn(
  snapshot: OfficialRankingsMap,
  division: string,
  fighterId: string,
  resolve: (name: string) => string | null
): string | null {
  for (const entry of getOfficialRankingsForDivision(snapshot, division)) {
    if (resolve(entry.name) === fighterId) return entry.rank;
  }
  return null;
}

async function main(): Promise<void> {
  const data = loadAllData();
  const resolve = makeResolver(data.fighters);
  const snapshot = await fetchOfficialRankings();

  const overrides = RANKING_CONFIG.divisionOverrides as Record<
    string,
    { division: string; rank: string; removeFrom?: string }
  >;

  const harmful: string[] = [];
  const redundant: string[] = [];
  const mootEvict: string[] = [];
  const unresolved: string[] = [];
  const active: string[] = [];

  for (const [name, ov] of Object.entries(overrides)) {
    const id = resolve(name);
    if (!id) {
      unresolved.push(`${name} → { division: ${ov.division}, rank: ${ov.rank} }`);
      continue;
    }

    const snapRank = snapshotRankIn(snapshot, ov.division, id, resolve);
    const evictMoot =
      ov.removeFrom != null &&
      snapshotRankIn(snapshot, ov.removeFrom, id, resolve) == null;

    // HARMFUL: pinning to no-seed while the feed now ranks them in this division.
    if (ov.rank === 'NR' && snapRank != null) {
      harmful.push(
        `${name}: pinned rank:'NR' in ${ov.division}, but the snapshot now ranks ` +
          `them #${snapRank} there — a real seed is being suppressed. Set rank:'${snapRank}' or delete the override.`
      );
      continue;
    }

    // REDUNDANT: the feed already places them exactly as the override does, and
    // any eviction is moot → the whole pin can be retired.
    const rankAgrees =
      ov.rank !== 'NR' ? snapRank === ov.rank : snapRank == null;
    if (rankAgrees && (ov.removeFrom == null || evictMoot)) {
      redundant.push(
        `${name}: snapshot already lists ${ov.division} ${ov.rank === 'NR' ? '(unranked)' : '#' + ov.rank}` +
          `${ov.removeFrom ? ` and no longer lists them at ${ov.removeFrom}` : ''} — override is redundant, safe to delete.`
      );
      continue;
    }

    // MOOT-EVICT: the eviction no longer does anything (rest of the pin may be live).
    if (evictMoot) {
      mootEvict.push(
        `${name}: removeFrom:'${ov.removeFrom}' no longer lists them — that eviction is a no-op now (rank pin ${ov.rank} may still be intended).`
      );
      continue;
    }

    // Otherwise the override is still actively overriding the feed by design.
    active.push(
      `${name}: pins ${ov.division} ${ov.rank === 'NR' ? '(unranked)' : '#' + ov.rank}` +
        `${snapRank != null ? ` (snapshot: #${snapRank})` : ' (snapshot: not ranked there)'}` +
        `${ov.removeFrom ? `, evicts from ${ov.removeFrom}` : ''}.`
    );
  }

  const section = (title: string, rows: string[]) => {
    if (rows.length === 0) return;
    console.log(`\n${title}`);
    for (const r of rows) console.log(`  ${r}`);
  };

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  DIVISION-OVERRIDE STALENESS AUDIT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  ${Object.keys(overrides).length} overrides checked against the official snapshot.`);

  section('✗ HARMFUL — actively suppressing a real seed:', harmful);
  section('⚠ REDUNDANT — feed caught up, safe to delete:', redundant);
  section('⚠ MOOT EVICTION — removeFrom no longer applies:', mootEvict);
  section('⚠ UNRESOLVED — override name matches no fighter:', unresolved);
  section('✓ ACTIVE — still overriding the feed by design:', active);

  console.log('\n───────────────────────────────────────────────────────────────');
  if (harmful.length > 0) {
    console.log(`  ✗ FAIL — ${harmful.length} harmful override(s). Fix in rankingConfig.ts.`);
    process.exit(1);
  }
  const advisory = redundant.length + mootEvict.length + unresolved.length;
  console.log(
    advisory > 0
      ? `  ✓ no harmful overrides. ${advisory} advisory item(s) worth cleaning up.`
      : '  ✓ all overrides are clean (harmful: 0, redundant: 0).'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
