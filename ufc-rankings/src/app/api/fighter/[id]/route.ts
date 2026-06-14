import { NextRequest, NextResponse } from 'next/server';
import { getFighterProfile } from '@/lib/fighterProfile';

export const revalidate = 86400; // 24 hours ISR

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const division = request.nextUrl.searchParams.get('d');

  const profile = await getFighterProfile(id, division);
  if (!profile) {
    return NextResponse.json({ error: `Fighter not found: ${id}` }, { status: 404 });
  }

  return NextResponse.json(profile);
}
