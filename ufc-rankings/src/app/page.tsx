'use client';

import { useState, useEffect } from 'react';
import DivisionCard from '@/components/DivisionCard';
import type { DashboardDivision } from '@/app/api/dashboard/route';
import { WOMENS_DIVISIONS } from '@/lib/types';

type GenderFilter = 'all' | 'male' | 'female';

const isWomens = (division: string) =>
  (WOMENS_DIVISIONS as readonly string[]).includes(division);

const GENDER_TABS: { key: GenderFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'male', label: 'Men' },
  { key: 'female', label: 'Women' },
];

export default function HomePage() {
  const [divisions, setDivisions] = useState<DashboardDivision[] | null>(null);
  const [gender, setGender] = useState<GenderFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/dashboard?top=5');
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const data: { divisions: DashboardDivision[] } = await res.json();
        if (!cancelled) setDivisions(data.divisions);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setDivisions(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = (divisions ?? []).filter((d) =>
    gender === 'all' ? true : gender === 'female' ? isWomens(d.division) : !isWomens(d.division)
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
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

      {/* Error */}
      {error && (
        <div
          className="text-center py-12 rounded-lg border"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--accent-red)' }}
        >
          <p className="text-sm font-medium">Failed to load divisions</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{error}</p>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-72 rounded-xl animate-pulse"
              style={{ backgroundColor: 'var(--bg-card)', opacity: 1 - i * 0.08 }}
            />
          ))}
        </div>
      )}

      {/* Division grid */}
      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((d) => (
            <DivisionCard key={d.division} data={d} />
          ))}
        </div>
      )}

      <div className="text-center py-6 text-xs space-y-1" style={{ color: 'var(--text-muted)' }}>
        <p>Rankings generated algorithmically from UFC fight data.</p>
        <p>No media votes. No popularity bias. Pure in-cage performance.</p>
      </div>
    </div>
  );
}
