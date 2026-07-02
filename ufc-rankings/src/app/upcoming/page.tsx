import UpcomingClient from './UpcomingClient';
import { getUpcomingCards } from '@/lib/loadUpcoming';
import { enrichCards } from '@/lib/upcomingEnrich';

// Server-rendered + ISR: cards are enriched here (memoized lib call shared
// with /api/upcoming and the analyst's get_card tool), streamed as HTML, and
// cached for a day — no client fetch, and the card is visible to crawlers.
export const revalidate = 86400;

export default async function UpcomingPage() {
  const events = await enrichCards(getUpcomingCards());

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl leading-none" style={{ color: 'var(--text-primary)' }}>
          UPCOMING
        </h1>
        <p className="text-xs mt-1.5 max-w-2xl" style={{ color: 'var(--text-muted)' }}>
          Every announced card, bout by bout in fight order. Each fighter shows our rank and last
          five results — gold-underlined when the fight was for a belt — with the model&apos;s win
          probability as the spine of every matchup.
        </p>
      </div>

      <UpcomingClient events={events} />
    </div>
  );
}
