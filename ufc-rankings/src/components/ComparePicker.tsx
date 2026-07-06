'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { SearchHit } from '@/app/api/search/route';
import { ALL_DIVISIONS } from '@/lib/types';
import { shortDivision } from '@/lib/divisions';

interface ComparePickerProps {
  slot: 'a' | 'b';
  selectedName: string | null; // current fighter's name in this slot, if any
  a: string | null;            // current ids in both slots (to preserve the other)
  b: string | null;
}

// A ranked fighter as browsed from the division dropdown (subset of RankedFighter).
interface DivisionEntry {
  fighterId: string;
  fullName: string;
  record: string;
  displayRank: number;
  officialRank: string | null;
}

// Module-level cache so re-opening a division (or the other slot's picker) doesn't refetch.
const divisionCache = new Map<string, DivisionEntry[]>();

// Inline mini-search for one comparison slot. Two ways to pick: type a name, or
// drop down a division and choose from its ranked list. On pick, navigates to
// /compare?a=…&b=… preserving the other slot.
export default function ComparePicker({ slot, selectedName, a, b }: ComparePickerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [division, setDivision] = useState('');
  const [roster, setRoster] = useState<DivisionEntry[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    let cancelled = false;
    const t = setTimeout(async () => {
      if (q.length < 2) {
        setHits([]);
        return;
      }
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!cancelled) setHits(data.hits || []);
      } catch {
        if (!cancelled) setHits([]);
      }
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  // Fetch (or reuse a cached) division roster when a division is chosen. A
  // stale roster is never shown — the render guards on `division`. All state is
  // set from the async callback (never synchronously in the effect body, which
  // would cascade renders); a cache hit resolves immediately without a fetch.
  useEffect(() => {
    if (!division) return;
    let cancelled = false;
    const cached = divisionCache.get(division);
    (async () => {
      if (!cached) setRosterLoading(true);
      try {
        const list =
          cached ??
          (await (async () => {
            const res = await fetch(`/api/rankings?division=${encodeURIComponent(division)}`);
            const data = await res.json();
            const parsed: DivisionEntry[] = (data.fighters || []).map(
              (f: { fighterId: string; fullName: string; record: string; rank: number; officialRank: string | null }) => ({
                fighterId: f.fighterId,
                fullName: f.fullName,
                record: f.record,
                displayRank: f.rank,
                officialRank: f.officialRank,
              })
            );
            divisionCache.set(division, parsed);
            return parsed;
          })());
        if (!cancelled) setRoster(list);
      } catch {
        if (!cancelled) setRoster([]);
      } finally {
        if (!cancelled) setRosterLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [division]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pick = (fighterId: string) => {
    const aId = slot === 'a' ? fighterId : a;
    const bId = slot === 'b' ? fighterId : b;
    const params = new URLSearchParams();
    if (aId) params.set('a', aId);
    if (bId) params.set('b', bId);
    setOpen(false);
    setQuery('');
    router.push(`/compare?${params.toString()}`);
  };

  const searching = query.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative flex-1 min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-left"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)' }}
      >
        <span className="text-sm truncate" style={{ color: selectedName ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          {selectedName || `Pick fighter ${slot.toUpperCase()}…`}
        </span>
        <span aria-hidden style={{ color: 'var(--text-muted)' }}>⌕</span>
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full rounded-lg overflow-hidden"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name…"
            className="w-full bg-transparent outline-none text-sm px-3 py-2.5"
            style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}
          />

          {/* Browse-by-division dropdown — the click-to-pick alternative to typing */}
          <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="text-[10px] uppercase tracking-wider shrink-0" style={{ color: 'var(--text-muted)' }}>
              Division
            </span>
            <select
              value={division}
              onChange={(e) => setDivision(e.target.value)}
              className="flex-1 min-w-0 bg-transparent outline-none text-sm py-1 rounded"
              style={{ color: division ? 'var(--text-primary)' : 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              <option value="">Browse a division…</option>
              {ALL_DIVISIONS.map((d) => (
                <option key={d} value={d} style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                  {d} ({shortDivision(d)})
                </option>
              ))}
            </select>
          </div>

          <div className="max-h-60 overflow-y-auto">
            {searching ? (
              <>
                {hits.map((hit) => (
                  <button
                    key={hit.fighterId}
                    type="button"
                    onClick={() => pick(hit.fighterId)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[var(--bg-card-hover)]"
                  >
                    <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {hit.fullName}
                    </span>
                    <span className="text-xs font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>
                      {hit.record}
                    </span>
                  </button>
                ))}
                {hits.length === 0 && (
                  <p className="px-3 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    No matches.
                  </p>
                )}
              </>
            ) : division ? (
              rosterLoading ? (
                <p className="px-3 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Loading {shortDivision(division)}…
                </p>
              ) : roster.length === 0 ? (
                <p className="px-3 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  No ranked fighters.
                </p>
              ) : (
                roster.map((f) => {
                  const champ = f.officialRank === 'C';
                  return (
                    <button
                      key={f.fighterId}
                      type="button"
                      onClick={() => pick(f.fighterId)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--bg-card-hover)]"
                    >
                      <span
                        className="font-mono text-xs w-6 shrink-0 text-right"
                        style={{ color: champ ? 'var(--accent-gold)' : 'var(--text-muted)' }}
                      >
                        {champ ? 'C' : f.displayRank}
                      </span>
                      <span className="text-sm truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                        {f.fullName}
                      </span>
                      <span className="text-xs font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {f.record}
                      </span>
                    </button>
                  );
                })
              )
            ) : (
              <p className="px-3 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                Search by name, or pick a division to browse its ranked fighters.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
