import { notFound } from 'next/navigation';
import DivisionClient from './DivisionClient';
import { getData } from '@/lib/dataCache';
import { generateDivisionRankings } from '@/lib/scoringEngine';
import { attachMedia } from '@/lib/fighterMedia';
import { ALL_DIVISIONS } from '@/lib/types';

// Server-rendered + ISR: the route division's house rankings are computed here
// (memoized lib call), streamed as HTML, and cached for a day — the default
// view needs zero client fetches and is visible to crawlers. Filter-slider and
// in-place division changes still go through /api/rankings client-side.
export const revalidate = 86400;

// Prerender all 12 divisions at build time.
export function generateStaticParams() {
  return ALL_DIVISIONS.map((division) => ({ division }));
}

export default async function DivisionPage({
  params,
}: {
  params: Promise<{ division: string }>;
}) {
  const { division: raw } = await params;
  const division = decodeURIComponent(raw);
  if (!ALL_DIVISIONS.includes(division as (typeof ALL_DIVISIONS)[number])) notFound();

  const rankings = await generateDivisionRankings(division, getData());
  attachMedia(rankings.fighters);

  return <DivisionClient division={division} initialRankings={rankings} />;
}
