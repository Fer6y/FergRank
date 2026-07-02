import { NextRequest, NextResponse } from 'next/server';
import { buildDashboard } from '@/lib/dashboard';

// Dashboard payload builder lives in src/lib/dashboard.ts, shared with the
// server-rendered homepage. This route remains for programmatic access; the
// homepage no longer fetches it (it calls the lib directly and ISR-caches).
export type { DashboardDivision } from '@/lib/dashboard';

export async function GET(request: NextRequest) {
  const topRaw = parseInt(request.nextUrl.searchParams.get('top') || '5', 10);
  const top = Number.isFinite(topRaw) ? Math.max(1, Math.min(15, topRaw)) : 5;

  const divisions = await buildDashboard(top);
  return NextResponse.json({ divisions, generatedAt: new Date().toISOString() });
}
