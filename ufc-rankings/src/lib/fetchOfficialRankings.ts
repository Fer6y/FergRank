import type { OfficialRankingsMap } from './types';

const OCTAGON_API_URL = 'https://api.octagon-api.com/rankings';

let cachedRankings: OfficialRankingsMap | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function fetchOfficialRankings(): Promise<OfficialRankingsMap> {
  const now = Date.now();
  if (cachedRankings && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRankings;
  }

  try {
    const response = await fetch(OCTAGON_API_URL);

    if (!response.ok) {
      console.warn(`[fetchOfficialRankings] API returned ${response.status}, using empty rankings`);
      return {};
    }

    const data = await response.json();
    cachedRankings = normalizeApiResponse(data);
    cacheTimestamp = now;
    console.log(`[fetchOfficialRankings] Loaded official rankings for ${Object.keys(cachedRankings).length} divisions`);
    return cachedRankings;
  } catch (error) {
    console.warn('[fetchOfficialRankings] Failed to fetch, using empty rankings:', error);
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
  "Women's Featherweight": "Women's Featherweight",
};

export function getOfficialRankingsForDivision(
  rankings: OfficialRankingsMap,
  division: string
): { rank: string; name: string; record: string }[] {
  return rankings[division] || [];
}
