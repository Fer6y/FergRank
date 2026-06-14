'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import DivisionSelector from '@/components/DivisionSelector';
import FilterBar from '@/components/FilterBar';
import RankingTable from '@/components/RankingTable';
import type { DivisionRankings } from '@/lib/types';
import { MENS_DIVISIONS, WOMENS_DIVISIONS } from '@/lib/types';
import { DEFAULT_FILTERS, type FilterParams } from '@/lib/filters';

function buildQuery(division: string, f: FilterParams): string {
  const p = new URLSearchParams({ division });
  if (f.eraStartYear != null) p.set('era', String(f.eraStartYear));
  if (f.finishWeight !== 0.5) p.set('finish', String(f.finishWeight));
  if (f.recencyWeight !== 0.5) p.set('recency', String(f.recencyWeight));
  if (f.activityWeight !== 0.5) p.set('activity', String(f.activityWeight));
  return p.toString();
}

function genderOf(division: string): 'male' | 'female' {
  return (WOMENS_DIVISIONS as readonly string[]).includes(division) ? 'female' : 'male';
}

export default function DivisionPage() {
  const params = useParams<{ division: string }>();
  const routeDivision = decodeURIComponent(params.division);

  const [gender, setGender] = useState<'male' | 'female'>(genderOf(routeDivision));
  const [selectedDivision, setSelectedDivision] = useState<string>(routeDivision);
  const [filters, setFilters] = useState<FilterParams>(DEFAULT_FILTERS);
  const [rankings, setRankings] = useState<DivisionRankings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep local selection in sync if the user navigates to a different
  // /division/[division] URL (e.g. via browser back/forward).
  useEffect(() => {
    setSelectedDivision(routeDivision);
    setGender(genderOf(routeDivision));
  }, [routeDivision]);

  useEffect(() => {
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
        if (!cancelled) setRankings(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setRankings(null);
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
  }, [selectedDivision, filters.eraStartYear, filters.finishWeight, filters.recencyWeight, filters.activityWeight]);

  const handleGenderChange = (newGender: 'male' | 'female') => {
    setGender(newGender);
    setSelectedDivision(newGender === 'male' ? MENS_DIVISIONS[0] : WOMENS_DIVISIONS[0]);
  };

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

      <RankingTable rankings={rankings} loading={loading} error={error} />

      <div className="text-center py-6 text-xs space-y-1" style={{ color: 'var(--text-muted)' }}>
        <p>Rankings generated algorithmically from UFC fight data.</p>
        <p>No media votes. No popularity bias. Pure in-cage performance.</p>
      </div>
    </div>
  );
}
