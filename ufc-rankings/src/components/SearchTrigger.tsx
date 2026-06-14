'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { SearchHit } from '@/app/api/search/route';

const DIVISION_SHORT: Record<string, string> = {
  Heavyweight: 'HW', 'Light Heavyweight': 'LHW', Middleweight: 'MW', Welterweight: 'WW',
  Lightweight: 'LW', Featherweight: 'FW', Bantamweight: 'BW', Flyweight: 'FLW',
  "Women's Strawweight": 'WSW', "Women's Flyweight": 'WFLW', "Women's Bantamweight": 'WBW',
  "Women's Featherweight": 'WFW',
};

export default function SearchTrigger() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global ⌘K / Ctrl+K to open, Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      if (open) {
        inputRef.current?.focus();
      } else {
        setQuery('');
        setHits([]);
        setActive(0);
      }
    }, open ? 20 : 0);
    return () => clearTimeout(id);
  }, [open]);

  // Debounced search. All setState lives inside the timeout callback so the
  // effect body itself never sets state synchronously.
  useEffect(() => {
    const q = query.trim();
    let cancelled = false;
    const t = setTimeout(async () => {
      if (q.length < 2) {
        setHits([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!cancelled) {
          setHits(data.hits || []);
          setActive(0);
        }
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, q.length < 2 ? 0 : 160);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const go = useCallback(
    (hit: SearchHit) => {
      setOpen(false);
      const d = hit.division ? `?d=${encodeURIComponent(hit.division)}` : '';
      router.push(`/fighter/${hit.fighterId}${d}`);
    },
    [router]
  );

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && hits[active]) {
      e.preventDefault();
      go(hits[active]);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs shrink-0"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
        aria-label="Search fighters"
      >
        <span aria-hidden>⌕</span>
        <span className="hidden md:inline">Search fighters</span>
        <span className="hidden md:inline font-mono text-[10px] px-1 rounded" style={{ backgroundColor: 'var(--bg-elevated)' }}>
          ⌘K
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-xl overflow-hidden"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <span aria-hidden style={{ color: 'var(--text-muted)' }}>⌕</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Search any fighter…"
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: 'var(--text-primary)' }}
              />
              <kbd className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                ESC
              </kbd>
            </div>

            <div className="max-h-[50vh] overflow-y-auto py-1">
              {query.trim().length < 2 ? (
                <p className="px-4 py-6 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                  Type a name to search all {''}fighters in the dataset.
                </p>
              ) : loading && hits.length === 0 ? (
                <p className="px-4 py-6 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                  Searching…
                </p>
              ) : hits.length === 0 ? (
                <p className="px-4 py-6 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                  No fighters match &quot;{query}&quot;.
                </p>
              ) : (
                hits.map((hit, i) => (
                  <button
                    key={hit.fighterId}
                    type="button"
                    onClick={() => go(hit)}
                    onMouseEnter={() => setActive(i)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
                    style={{ backgroundColor: i === active ? 'var(--bg-card-hover)' : 'transparent' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                        {hit.fullName}
                        {hit.nickname && (
                          <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                            &quot;{hit.nickname}&quot;
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                        {hit.record} · {hit.fightCount} UFC
                      </div>
                    </div>
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
                      style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                    >
                      {DIVISION_SHORT[hit.weightClass] || hit.weightClass || '—'}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
