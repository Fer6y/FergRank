import { NextResponse } from 'next/server';
import { getUpcomingCards } from '@/lib/loadUpcoming';
import { enrichCards } from '@/lib/upcomingEnrich';

// Bout enrichment lives in src/lib/upcomingEnrich.ts, shared with the analyst
// agent's get_card tool so the agent and the UI can never disagree about a card.
export type { CardFighter, CardBout, UpcomingEvent } from '@/lib/upcomingEnrich';

export const revalidate = 86400; // 24 hours ISR

export async function GET() {
  const events = await enrichCards(getUpcomingCards());
  return NextResponse.json({ events });
}
