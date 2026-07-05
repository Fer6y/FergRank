import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import type { OfficialRankingsMap } from './types';

const OCTAGON_API_URL = 'https://api.octagon-api.com/rankings';
const SNAPSHOT_PATH = path.join(process.cwd(), 'data', 'official_rankings.csv');

let cachedRankings: OfficialRankingsMap | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Runtime entry point for the official UFC rankings.
//
// The app reads a COMMITTED SNAPSHOT (data/official_rankings.csv) as the source
// of truth rather than hitting the live Octagon API on every request. The
// snapshot is refreshed at build time by scripts/buildOfficialRankings.ts (wired
// into the weekly ingest), which makes the "UFC Rank" the app displays
// versioned, git-visible, and hand-overridable — and removes the uncontrolled
// live third-party fetch that was the source of staleness. This is a SOURCE
// swap only: the returned shape is identical, so every downstream behaviour
// (trend chip, champion "C", floors, seed) is unchanged.
//
// The live fetch is kept only as a fallback for the case where no snapshot has
// been generated yet (e.g. a fresh checkout before the first build script run);
// an empty map is the final degrade (pure Elo).
export async function fetchOfficialRankings(): Promise<OfficialRankingsMap> {
  const now = Date.now();
  if (cachedRankings && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRankings;
  }

  const snapshot = readSnapshot();
  if (snapshot && Object.keys(snapshot).length > 0) {
    cachedRankings = snapshot;
    cacheTimestamp = now;
    return cachedRankings;
  }

  console.warn('[fetchOfficialRankings] No committed snapshot found — falling back to live Octagon fetch.');
  cachedRankings = await fetchLiveOfficialRankings();
  cacheTimestamp = now;
  return cachedRankings;
}

// Read the committed rankings snapshot from disk. Returns null when the file is
// absent/unreadable so the caller can fall back to the live fetch. Row order is
// preserved (champion "C" then #1..#15), though the `rank` field is authoritative.
function readSnapshot(): OfficialRankingsMap | null {
  try {
    if (!fs.existsSync(SNAPSHOT_PATH)) return null;
    const raw = fs.readFileSync(SNAPSHOT_PATH, 'utf-8');
    const parsed = Papa.parse<Record<string, string>>(raw, {
      header: true,
      skipEmptyLines: true,
    });
    const result: OfficialRankingsMap = {};
    for (const row of parsed.data) {
      const division = (row.division ?? '').trim();
      const rank = (row.rank ?? '').trim();
      const name = (row.name ?? '').trim();
      if (!division || !rank || !name) continue;
      (result[division] ??= []).push({ rank, name, record: (row.record ?? '').trim() });
    }
    return result;
  } catch (error) {
    console.warn('[fetchOfficialRankings] Failed to read snapshot:', error);
    return null;
  }
}

// Live Octagon fetch + normalize. Used by the build-time snapshot script
// (scripts/buildOfficialRankings.ts) and as the runtime fallback above.
export async function fetchLiveOfficialRankings(): Promise<OfficialRankingsMap> {
  try {
    const response = await fetch(OCTAGON_API_URL);

    if (!response.ok) {
      console.warn(`[fetchOfficialRankings] API returned ${response.status}, using empty rankings`);
      return {};
    }

    const data = await response.json();
    const normalized = normalizeApiResponse(data);
    console.log(`[fetchOfficialRankings] Loaded live official rankings for ${Object.keys(normalized).length} divisions`);
    return normalized;
  } catch (error) {
    console.warn('[fetchOfficialRankings] Failed to fetch live, using empty rankings:', error);
    return {};
  }
}

// Actual API response structure (array of division objects):
// [
//   {
//     "id": "welterweight",
//     "categoryName": "Welterweight",
//     "champion": { "id": "jack-della-maddalena", "championName": "Jack Della Maddalena" },
//     "fighters": [
//       { "id": "belal-muhammad", "name": "Belal Muhammad" },  // #1
//       { "id": "sean-brady", "name": "Sean Brady" },          // #2
//       ...
//     ]
//   }
// ]

interface ApiDivision {
  id: string;
  categoryName: string;
  champion?: { id: string; championName: string };
  fighters: { id: string; name: string }[];
}

function normalizeApiResponse(data: unknown): OfficialRankingsMap {
  if (!data || !Array.isArray(data)) return {};

  const result: OfficialRankingsMap = {};

  for (const div of data as ApiDivision[]) {
    if (!div.categoryName || !div.fighters) continue;

    // Skip P4P lists — they're cross-division and not useful for seeding
    if (div.id?.includes('pound-for-pound')) continue;

    const rankings = [];

    // Add champion first with rank "C"
    if (div.champion?.championName) {
      rankings.push({
        rank: 'C',
        name: div.champion.championName,
        record: '',
      });
    }

    // Fighters array is ordered #1 through #15
    for (let i = 0; i < div.fighters.length; i++) {
      rankings.push({
        rank: String(i + 1),
        name: div.fighters[i].name,
        record: '',
      });
    }

    // Map API categoryName to our internal division name
    const internalName = API_TO_INTERNAL_NAME[div.categoryName] || div.categoryName;
    result[internalName] = rankings;
  }

  return result;
}

// API categoryName → our internal division names
const API_TO_INTERNAL_NAME: Record<string, string> = {
  'Heavyweight': 'Heavyweight',
  'Light Heavyweight': 'Light Heavyweight',
  'Middleweight': 'Middleweight',
  'Welterweight': 'Welterweight',
  'Lightweight': 'Lightweight',
  'Featherweight': 'Featherweight',
  'Bantamweight': 'Bantamweight',
  'Flyweight': 'Flyweight',
  "Women's Strawweight": "Women's Strawweight",
  "Women's Flyweight": "Women's Flyweight",
  "Women's Bantamweight": "Women's Bantamweight",
};

export function getOfficialRankingsForDivision(
  rankings: OfficialRankingsMap,
  division: string
): { rank: string; name: string; record: string }[] {
  return rankings[division] || [];
}
