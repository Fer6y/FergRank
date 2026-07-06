import fs from 'fs';
import Papa from 'papaparse';
import { loadAllData } from '../src/lib/loadData';
import { generateDivisionRankings } from '../src/lib/scoringEngine';
import type { OfficialRankingsMap } from '../src/lib/types';

// Load a provided official-rankings CSV (division,rank,name[,record]).
function loadOfficialFromPath(p: string): OfficialRankingsMap {
  const raw = fs.readFileSync(p, 'utf-8');
  const parsed = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true });
  const result: OfficialRankingsMap = {};
  for (const row of parsed.data) {
    const division = (row.division ?? '').trim();
    const rank = (row.rank ?? '').trim();
    const name = (row.name ?? '').trim();
    if (!division || !rank || !name) continue;
    (result[division] ??= []).push({ rank, name, record: (row.record ?? '').trim() });
  }
  return result;
}

// Normalize a name for fuzzy matching (lowercase, strip accents/punct).
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lastFirst(s: string): string {
  const p = norm(s).split(' ');
  if (p.length < 2) return norm(s);
  return `${p[p.length - 1]} ${p[0][0]}`;
}

const DIVISIONS = [
  'Heavyweight',
  'Light Heavyweight',
  'Middleweight',
  'Welterweight',
  'Lightweight',
  'Featherweight',
  'Bantamweight',
  'Flyweight',
  "Women's Strawweight",
  "Women's Flyweight",
  "Women's Bantamweight",
];

async function main() {
  const data = loadAllData();
  // Default to the committed snapshot; pass a path to diff against any other CSV.
  const officialPath = process.argv[2] || 'data/official_rankings.csv';
  const official = loadOfficialFromPath(officialPath);

  let totalMatched = 0;
  let totalDelta = 0;
  let exactCount = 0;
  let within1 = 0;
  let within2 = 0;
  const bigDiffs: string[] = [];

  for (const div of DIVISIONS) {
    const ours = await generateDivisionRankings(div, data);
    const off = official[div] || [];
    if (off.length === 0) {
      console.log(`\n### ${div} — no official data`);
      continue;
    }

    // Build our name -> our-rank map (champion = rank we assign; official "C" handled separately)
    const ourByNorm = new Map<string, { rank: number; name: string; belt: boolean }>();
    const ourByLast = new Map<string, { rank: number; name: string; belt: boolean }>();
    for (const f of ours.fighters) {
      ourByNorm.set(norm(f.fullName), { rank: f.rank, name: f.fullName, belt: !!f.belt });
      const lf = lastFirst(f.fullName);
      if (!ourByLast.has(lf)) ourByLast.set(lf, { rank: f.rank, name: f.fullName, belt: !!f.belt });
    }

    console.log(`\n## ${div}`);
    console.log('UFC# | OUR# | Δ    | Fighter');
    console.log('-----|------|------|--------------------');

    const officialNormSet = new Set<string>();

    for (const o of off) {
      officialNormSet.add(norm(o.name));
      const ufcRankLabel = o.rank; // "C","1",...
      const ufcRankNum = o.rank === 'C' ? 0 : parseInt(o.rank, 10);
      let hit = ourByNorm.get(norm(o.name)) || ourByLast.get(lastFirst(o.name));
      if (!hit) {
        console.log(`${String(ufcRankLabel).padStart(4)} |  ??  |  --  | ${o.name}  (NOT in our top ${ours.fighters.length})`);
        bigDiffs.push(`${div}: UFC #${ufcRankLabel} ${o.name} — absent from our ranked pool`);
        continue;
      }
      // Compare: UFC "C" ~ our champ. Use rank numbers; our champ is rank 1 typically but belt flag matters.
      const ourRank = hit.rank;
      // For delta, treat UFC C as 0 baseline vs our rank; but cleaner: compare ordinal positions.
      const delta = ufcRankNum === 0 ? (hit.belt ? 0 : ourRank) : ourRank - ufcRankNum;
      totalMatched++;
      totalDelta += Math.abs(delta);
      if (delta === 0) exactCount++;
      if (Math.abs(delta) <= 1) within1++;
      if (Math.abs(delta) <= 2) within2++;
      const flag = Math.abs(delta) >= 3 ? '  <<<' : '';
      const dStr = delta > 0 ? `+${delta}` : `${delta}`;
      console.log(`${String(ufcRankLabel).padStart(4)} | ${String(ourRank).padStart(4)} | ${dStr.padStart(4)} | ${hit.name}${flag}`);
      if (Math.abs(delta) >= 3) {
        bigDiffs.push(`${div}: ${hit.name} — UFC #${ufcRankLabel}, us #${ourRank} (Δ${dStr})`);
      }
    }

    // Fighters WE rank in top 15 that UFC does NOT rank
    const weRankTheyDont = ours.fighters
      .slice(0, 15)
      .filter((f) => !officialNormSet.has(norm(f.fullName)) &&
        ![...officialNormSet].some((on) => lastFirst(on) === lastFirst(f.fullName)));
    if (weRankTheyDont.length) {
      console.log(`  We rank (top15) but UFC doesn't: ${weRankTheyDont.map((f) => `#${f.rank} ${f.fullName}`).join(', ')}`);
    }
  }

  console.log('\n\n════════ SUMMARY ════════');
  console.log(`Matched fighters: ${totalMatched}`);
  console.log(`Exact same rank: ${exactCount} (${((exactCount / totalMatched) * 100).toFixed(0)}%)`);
  console.log(`Within ±1: ${within1} (${((within1 / totalMatched) * 100).toFixed(0)}%)`);
  console.log(`Within ±2: ${within2} (${((within2 / totalMatched) * 100).toFixed(0)}%)`);
  console.log(`Mean absolute rank delta: ${(totalDelta / totalMatched).toFixed(2)}`);
  console.log(`\nBig differences (|Δ|≥3 or absent): ${bigDiffs.length}`);
  for (const b of bigDiffs) console.log('  • ' + b);
}

main().catch((e) => { console.error(e); process.exit(1); });
