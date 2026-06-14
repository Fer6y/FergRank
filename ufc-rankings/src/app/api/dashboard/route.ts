import { NextRequest, NextResponse } from 'next/server';
import { getData } from '@/lib/dataCache';
import { generateDivisionRankings } from '@/lib/scoringEngine';
import { attachMedia } from '@/lib/fighterMedia';
import { ALL_DIVISIONS } from '@/lib/types';
import type { RankedFighter } from '@/lib/types';

export const revalidate = 86400; // 24 hours ISR

// Dashboard payload: champion + top-N contenders for every division, generated
// with the house algorithm (no live filters). One call powers the homepage grid
// so the client doesn't fan out 12 separate /api/rankings fetches.
export interface DashboardDivision {
  division: string;
  gender: string;
  champion: RankedFighter | null;
  fighters: RankedFighter[]; // top-N contenders (champion excluded)
}

export async function GET(request: NextRequest) {
  const topRaw = parseInt(request.nextUrl.searchParams.get('top') || '5', 10);
  const top = Number.isFinite(topRaw) ? Math.max(1, Math.min(15, topRaw)) : 5;

  const data = getData();

  const divisions = await Promise.all(
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
      };
    })
  );

  return NextResponse.json({ divisions, generatedAt: new Date().toISOString() });
}
