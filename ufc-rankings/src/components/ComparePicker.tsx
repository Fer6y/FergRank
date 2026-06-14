'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { SearchHit } from '@/app/api/search/route';

interface ComparePickerProps {
  slot: 'a' | 'b';
  selectedName: string | null; // current fighter's name in this slot, if any
  a: string | null;            // current ids in both slots (to preserve the other)
  b: string | null;
}

// Inline mini-search for one comparison slot. On pick, navigates to
// /compare?a=…&b=… preserving the other slot.
export default function ComparePicker({ slot, selectedName, a, b }: ComparePickerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
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

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pick = (hit: SearchHit) => {
    const aId = slot === 'a' ? hit.fighterId : a;
    const bId = slot === 'b' ? hit.fighterId : b;
    const params = new URLSearchParams();
    if (aId) params.set('a', aId);
    if (bId) params.set('b', bId);
    setOpen(false);
    setQuery('');
    router.push(`/compare?${params.toString()}`);
  };

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
            placeholder="Search…"
            className="w-full bg-transparent outline-none text-sm px-3 py-2.5"
            style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}
          />
          <div className="max-h-60 overflow-y-auto">
            {hits.map((hit) => (
              <button
                key={hit.fighterId}
                type="button"
                onClick={() => pick(hit)}
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
            {query.trim().length >= 2 && hits.length === 0 && (
              <p className="px-3 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                No matches.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
