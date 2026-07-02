import { NextRequest, NextResponse } from 'next/server';
import { searchFighters } from '@/lib/searchFighters';

// Search scoring lives in src/lib/searchFighters.ts, shared with the analyst
// agent's search_fighter tool.
export type { SearchHit } from '@/lib/searchFighters';

export const revalidate = 86400;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') || '';
  return NextResponse.json({ hits: searchFighters(q) });
}
