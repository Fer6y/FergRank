import { NextRequest, NextResponse } from 'next/server';
import { getData } from '@/lib/dataCache';
import { ALL_DIVISIONS } from '@/lib/types';

export const revalidate = 86400;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

export interface SearchHit {
  fighterId: string;
  fullName: string;
  nickname: string;
  weightClass: string;
  division: string | null; // valid ranked division if weightClass maps to one
  record: string;
  fightCount: number;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') || '';
  const nq = normalize(q);
  if (nq.length < 2) return NextResponse.json({ hits: [] });

  const data = getData();

  // Score each fighter: exact (3) > starts-with (2) > word-start (1.5) >
  // substring (1). Tiebreak by UFC fight count so well-known names surface.
  const scored: { hit: SearchHit; score: number }[] = [];
  for (const f of data.fighters) {
    const name = normalize(f.fullName);
    const nick = normalize(f.nickname);
    let score = 0;
    if (name === nq || nick === nq) score = 3;
    else if (name.startsWith(nq) || nick.startsWith(nq)) score = 2;
    else if (name.split(' ').some((w) => w.startsWith(nq))) score = 1.5;
    else if (name.includes(nq) || nick.includes(nq)) score = 1;
    if (score === 0) continue;

    const fightCount = (data.fighterFights.get(f.fighterId) || []).length;
    const division = ALL_DIVISIONS.includes(f.weightClass as (typeof ALL_DIVISIONS)[number])
      ? f.weightClass
      : null;
    scored.push({
      hit: {
        fighterId: f.fighterId,
        fullName: f.fullName,
        nickname: f.nickname,
        weightClass: f.weightClass,
        division,
        record: `${f.wins}-${f.losses}-${f.draws}`,
        fightCount,
      },
      score,
    });
  }

  scored.sort((a, b) => (b.score - a.score) || (b.hit.fightCount - a.hit.fightCount));
  return NextResponse.json({ hits: scored.slice(0, 8).map((s) => s.hit) });
}
