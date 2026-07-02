// ─────────────────────────────────────────────────────────────────────────
//  dashboard.ts — the homepage payload: champion + top-N contenders for every
//  division, generated with the house algorithm (no live filters). Shared by
//  the server-rendered homepage and the /api/dashboard route so the two can
//  never disagree. Division rankings underneath are memoized per process/day.
// ─────────────────────────────────────────────────────────────────────────

import { getData } from './dataCache';
import { generateDivisionRankings } from './scoringEngine';
import { attachMedia } from './fighterMedia';
import { ALL_DIVISIONS } from './types';
import type { RankedFighter } from './types';

export interface DashboardDivision {
  division: string;
  gender: string;
  champion: RankedFighter | null;
  fighters: RankedFighter[]; // top-N contenders (champion excluded)
  // Full ranked list (champion first) as name + raw core Elo, for the depth
  // heatmap. Raw Elo is one global pool, so cells are comparable ACROSS
  // divisions — that's the whole point of the visual.
  depth: { name: string; elo: number }[];
}

export async function buildDashboard(top: number): Promise<DashboardDivision[]> {
  const data = getData();

  return Promise.all(
    ALL_DIVISIONS.map(async (division): Promise<DashboardDivision> => {
      const rankings = await generateDivisionRankings(division, data);
      attachMedia(rankings.fighters);
      // Champion = official "C" (authoritative) or stale belt flag fallback,
      // mirroring RankingTable's split.
      const isChampion = (f: RankedFighter) => f.officialRank === 'C' || f.belt;
      const champion = rankings.fighters.find(isChampion) ?? null;
      const contenders = rankings.fighters.filter((f) => !isChampion(f)).slice(0, top);
      return {
        division,
        gender: rankings.gender,
        champion,
        fighters: contenders,
        depth: rankings.fighters.map((f) => ({
          name: f.fullName,
          elo: Math.round(f.eloRating),
        })),
      };
    })
  );
}
