import { fetchOfficialRankings, getOfficialRankingsForDivision } from './fetchOfficialRankings';
import { buildNameIndex, resolveNameToId } from './nameResolver';
import { ALL_DIVISIONS } from './types';
import type { LoadedData } from './loadData';

export interface AuditRow {
  division: string;
  officialRank: string;
  officialName: string;
  csvName: string | null;
  fighterId: string | null;
  status: 'MATCHED' | 'UNMATCHED';
}

export async function auditOfficialMatches(data: LoadedData): Promise<AuditRow[]> {
  const { fighters, fighterMap } = data;
  const nameIndex = buildNameIndex(fighters);
  const officialRankings = await fetchOfficialRankings();
  const results: AuditRow[] = [];

  for (const division of ALL_DIVISIONS) {
    const divRankings = getOfficialRankingsForDivision(officialRankings, division);
    if (divRankings.length === 0) continue;

    console.log(`\n=== ${division} ===`);
    console.log('Rank'.padEnd(6) + 'Official Name'.padEnd(30) + 'CSV Name'.padEnd(30) + 'Fighter ID'.padEnd(15) + 'Status');
    console.log('-'.repeat(85));

    for (const ranked of divRankings) {
      const fighterId = resolveNameToId(ranked.name, nameIndex);
      const csvFighter = fighterId ? fighterMap.get(fighterId) : null;
      const csvName = csvFighter?.fullName || null;
      const status = fighterId ? 'MATCHED' : 'UNMATCHED';

      console.log(
        ranked.rank.padEnd(6) +
        ranked.name.padEnd(30) +
        (csvName || '???').padEnd(30) +
        (fighterId || '???').padEnd(15) +
        status
      );

      results.push({
        division,
        officialRank: ranked.rank,
        officialName: ranked.name,
        csvName,
        fighterId,
        status,
      });
    }
  }

  // Summary
  const matched = results.filter(r => r.status === 'MATCHED').length;
  const unmatched = results.filter(r => r.status === 'UNMATCHED').length;
  console.log(`\n=== SUMMARY: ${matched} matched, ${unmatched} unmatched out of ${results.length} total ===`);

  if (unmatched > 0) {
    console.log('\nUNMATCHED fighters:');
    for (const r of results.filter(r => r.status === 'UNMATCHED')) {
      console.log(`  ${r.division}: ${r.officialName} (rank ${r.officialRank})`);
    }
  }

  return results;
}
