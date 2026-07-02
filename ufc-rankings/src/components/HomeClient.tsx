'use client';

import { useState } from 'react';
import DivisionCard from '@/components/DivisionCard';
import DepthHeatmap from '@/components/DepthHeatmap';
import type { DashboardDivision } from '@/lib/dashboard';
import { WOMENS_DIVISIONS } from '@/lib/types';

type GenderFilter = 'all' | 'male' | 'female';

const isWomens = (division: string) =>
  (WOMENS_DIVISIONS as readonly string[]).includes(division);

const GENDER_TABS: { key: GenderFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'male', label: 'Men' },
  { key: 'female', label: 'Women' },
];

// Client island of the (server-rendered) homepage: the gender toggle and
// everything it filters. Data arrives fully formed as props from the server
// page — no client fetch, so the whole grid is in the initial HTML (SSR'd,
// then ISR-cached at the page level).
export default function HomeClient({ divisions }: { divisions: DashboardDivision[] }) {
  const [gender, setGender] = useState<GenderFilter>('all');

  const visible = divisions.filter((d) =>
    gender === 'all' ? true : gender === 'female' ? isWomens(d.division) : !isWomens(d.division)
  );

  return (
    <>
      {/* Header band */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl leading-none" style={{ color: 'var(--text-primary)' }}>
            DIVISIONS
          </h1>
          <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
            Every weight class at a glance — champion and top 5, ranked on in-cage performance.
          </p>
        </div>

        {/* Gender filter */}
        <div
          className="flex items-center gap-1 p-1 rounded-lg w-fit"
          style={{ backgroundColor: 'var(--bg-elevated)' }}
        >
          {GENDER_TABS.map((t) => {
            const active = gender === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setGender(t.key)}
                className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
                style={{
                  backgroundColor: active ? 'var(--accent-red)' : 'transparent',
                  color: active ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Division grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {visible.map((d) => (
          <DivisionCard key={d.division} data={d} />
        ))}
      </div>

      {/* Depth heatmap — same gender filter as the grid */}
      {visible.length > 0 && <DepthHeatmap divisions={visible} />}
    </>
  );
}
