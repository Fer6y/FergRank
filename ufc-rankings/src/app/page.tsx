import HomeClient from '@/components/HomeClient';
import { buildDashboard } from '@/lib/dashboard';

// Server-rendered + ISR: the division grid is computed here (memoized lib
// call), streamed as HTML, and cached for a day — no client fetch, no
// loading skeletons, and the rankings are visible to crawlers.
export const revalidate = 86400;

export default async function HomePage() {
  const divisions = await buildDashboard(5);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <HomeClient divisions={divisions} />

      <div className="text-center py-6 text-xs space-y-1" style={{ color: 'var(--text-muted)' }}>
        <p>Rankings generated algorithmically from UFC fight data.</p>
        <p>No media votes. No popularity bias. Pure in-cage performance.</p>
      </div>
    </div>
  );
}
