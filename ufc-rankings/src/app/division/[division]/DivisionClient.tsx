'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import DivisionSelector from '@/components/DivisionSelector';
import FilterBar from '@/components/FilterBar';
import RankingTable from '@/components/RankingTable';
import type { DivisionRankings } from '@/lib/types';
import { MENS_DIVISIONS, WOMENS_DIVISIONS } from '@/lib/types';
import { DEFAULT_FILTERS, isDefaultFilters, type FilterParams } from '@/lib/filters';

function buildQuery(division: string, f: FilterParams): string {
  const p = new URLSearchParams({ division });
  if (f.eraStartYear != null) p.set('era', String(f.eraStartYear));
  if (f.finishWeight !== 0.5) p.set('finish', String(f.finishWeight));
  if (f.recencyWeight !== 0.5) p.set('recency', String(f.recencyWeight));
  if (f.activityWeight !== 0.5) p.set('activity', String(f.activityWeight));
  if (f.pureElo) p.set('pure', '1');
  return p.toString();
}

function genderOf(division: string): 'male' | 'female' {
  return (WOMENS_DIVISIONS as readonly string[]).includes(division) ? 'female' : 'male';
}

// Client island of the (server-rendered) division page. The route's division
// arrives pre-ranked as initialRankings (house algorithm, ISR-cached), so the
// default view paints with zero client fetches; only changing the division
// in-place or moving a filter slider hits /api/rankings.
export default function DivisionClient({
  division,
  initialRankings,
}: {
  division: string;
  initialRankings: DivisionRankings;
}) {
  const [gender, setGender] = useState<'male' | 'female'>(genderOf(division));
  const [selectedDivision, setSelectedDivision] = useState<string>(division);
  const [filters, setFilters] = useState<FilterParams>(DEFAULT_FILTERS);
  // Holds ONLY the result of a non-neutral fetch (a different division or moved
  // filters). The neutral view is derived straight from initialRankings, so this
  // stays null until the user actually asks for something the server didn't render.
  const [fetched, setFetched] = useState<DivisionRankings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep local selection in sync if the user navigates to a different
  // /division/[division] URL (e.g. via browser back/forward). Render-time
  // adjustment (not an effect) so the stale division never paints.
  const [prevRouteDivision, setPrevRouteDivision] = useState(division);
  if (prevRouteDivision !== division) {
    setPrevRouteDivision(division);
    setSelectedDivision(division);
    setGender(genderOf(division));
  }

  // The neutral view (route's own division, house filters) is exactly what the
  // server already rendered — render derives it from initialRankings directly
  // (see displayRankings below), so the effect neither fetches nor writes state.
  const neutral = selectedDivision === division && isDefaultFilters(filters);

  useEffect(() => {
    if (neutral) return; // nothing to fetch; render falls back to initialRankings
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/rankings?${buildQuery(selectedDivision, filters)}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const data: DivisionRankings = await res.json();
        if (!cancelled) setFetched(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setFetched(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neutral, selectedDivision, filters.eraStartYear, filters.finishWeight, filters.recencyWeight, filters.activityWeight, filters.pureElo]);

  const handleGenderChange = (newGender: 'male' | 'female') => {
    setGender(newGender);
    setSelectedDivision(newGender === 'male' ? MENS_DIVISIONS[0] : WOMENS_DIVISIONS[0]);
  };

  // What the table shows: the server-rendered data for the neutral view, else
  // the fetched result (falling back to initialRankings during the debounce so
  // stale-but-present rows show instead of an empty flash). loading/error only
  // apply while a fetch is the source of truth — never over the neutral view.
  const displayRankings = neutral ? initialRankings : (fetched ?? initialRankings);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <Link href="/" className="inline-block text-xs" style={{ color: 'var(--text-muted)' }}>
        ← All divisions
      </Link>

      <DivisionSelector
        selectedDivision={selectedDivision}
        gender={gender}
        onDivisionChange={setSelectedDivision}
        onGenderChange={handleGenderChange}
      />

      <FilterBar filters={filters} onChange={setFilters} />

      <RankingTable rankings={displayRankings} loading={!neutral && loading} error={neutral ? null : error} />

      <div className="text-center py-6 text-xs space-y-1" style={{ color: 'var(--text-muted)' }}>
        <p>Rankings generated algorithmically from UFC fight data.</p>
        <p>No media votes. No popularity bias. Pure in-cage performance.</p>
      </div>
    </div>
  );
}
