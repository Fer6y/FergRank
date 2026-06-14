import { NextRequest, NextResponse } from 'next/server';
import { getData } from '@/lib/dataCache';
import { generateDivisionRankings } from '@/lib/scoringEngine';
import { auditOfficialMatches } from '@/lib/auditOfficialMatches';
import { parseFilters } from '@/lib/filters';
import { attachMedia } from '@/lib/fighterMedia';
import { ALL_DIVISIONS } from '@/lib/types';

export const revalidate = 86400; // 24 hours ISR

export async function GET(request: NextRequest) {
  const division = request.nextUrl.searchParams.get('division');

  if (!division) {
    return NextResponse.json(
      { error: 'Missing required parameter: division', validDivisions: ALL_DIVISIONS },
      { status: 400 }
    );
  }

  if (!ALL_DIVISIONS.includes(division as (typeof ALL_DIVISIONS)[number])) {
    return NextResponse.json(
      { error: `Invalid division: ${division}`, validDivisions: ALL_DIVISIONS },
      { status: 400 }
    );
  }

  const data = getData();
  const filters = parseFilters(request.nextUrl.searchParams);
  const audit = request.nextUrl.searchParams.get('audit') === 'true';

  if (audit) {
    const auditResults = await auditOfficialMatches(data);
    const rankings = await generateDivisionRankings(division, data, filters);
    attachMedia(rankings.fighters);
    return NextResponse.json({ rankings, audit: auditResults });
  }

  const rankings = await generateDivisionRankings(division, data, filters);
  attachMedia(rankings.fighters);
  return NextResponse.json(rankings);
}
