'use client';

// ─────────────────────────────────────────────────────────────────────────
//  ProspectsList — the two prospect tiers plus the sort-view toggle.
//
//  Client-side on purpose. The alternative (a `?sort=` searchParam) would make
//  /prospects a dynamic route and lose its ISR caching, and the ranking pass is
//  too CPU-heavy to run per request. The full pool is generated once at build
//  time; re-ordering ~100 pre-computed entries in the browser is free.
//
//  DEFAULT IS RATING (raw Elo) and should stay that way — a held-out backtest
//  (2026-08-05) found it beats climb rate on every outcome, including reaching
//  the UFC's own official top 15. The climb view is an opt-in second lens, not
//  a correction. See RANKING_CONFIG.prospects for the numbers.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import Link from 'next/link';
import type { ProspectEntry } from '@/lib/prospects';
import { RANKING_CONFIG } from '@/lib/rankingConfig';
import { shortDivision } from '@/lib/divisions';
import FighterAvatar from '@/components/FighterAvatar';
import DistinctionDecals from '@/components/DistinctionDecals';

type SortKey = 'rating' | 'climb';

const LIMIT = RANKING_CONFIG.prospects.listLimit;

const resultColor = (r: string) =>
  r === 'W' ? 'var(--accent-green)' : r === 'L' ? 'var(--accent-red-light)' : 'var(--text-muted)';

export default function ProspectsList({
  prospects,
  newcomers,
}: {
  prospects: ProspectEntry[];
  newcomers: ProspectEntry[];
}) {
  const [sort, setSort] = useState<SortKey>('rating');

  // Sort the FULL pool, then take the top N — slicing first would pre-filter by
  // the default key and defeat the point of the alternate view.
  const rank = (list: ProspectEntry[]) =>
    [...list]
      .sort((a, b) => (sort === 'rating' ? b.elo - a.elo : b.shrunkClimb - a.shrunkClimb))
      .slice(0, LIMIT);

  return (
    <div className="space-y-8">
      <SortToggle sort={sort} onChange={setSort} />

      <Section
        title="PROSPECTS"
        blurb="Young risers — still building a UFC record, ceiling unknown."
        entries={rank(prospects)}
        total={prospects.length}
        sort={sort}
        emptyLabel="No qualifying prospects right now."
      />

      <Section
        title="NEW TO THE UFC"
        blurb={`Established fighters inside their first UFC bouts — ${RANKING_CONFIG.prospects.veteranAgeYears}+ years old, or arriving on a long professional record. Strong fighters, but not prospects.`}
        entries={rank(newcomers)}
        total={newcomers.length}
        sort={sort}
        emptyLabel="No established newcomers on the current roster."
      />
    </div>
  );
}

function SortToggle({ sort, onChange }: { sort: SortKey; onChange: (s: SortKey) => void }) {
  const options: { key: SortKey; label: string; hint: string }[] = [
    { key: 'rating', label: 'Rating', hint: 'Raw Elo — the default, and the best predictor we have of who actually breaks through.' },
    { key: 'climb', label: 'Climb rate', hint: 'Elo gained per fight, shrunk for small samples. Surfaces fast starters the rating ceiling hides — but predicts breakthrough worse than rating. A second lens, not a better one.' },
  ];
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        Sort
      </span>
      <div className="inline-flex rounded-lg p-0.5" style={{ backgroundColor: 'var(--bg-elevated)' }}>
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            title={o.hint}
            aria-pressed={sort === o.key}
            className="px-3 py-1 text-xs rounded-md transition-colors"
            style={
              sort === o.key
                ? { backgroundColor: 'var(--accent-red)', color: '#fff' }
                : { color: 'var(--text-secondary)' }
            }
          >
            {o.label}
          </button>
        ))}
      </div>
      {sort === 'climb' && (
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Rating predicts breakthrough better — this view is for spotting fast starters, not ranking them.
        </span>
      )}
    </div>
  );
}

function Section({
  title, blurb, entries, total, sort, emptyLabel,
}: {
  title: string;
  blurb: string;
  entries: ProspectEntry[];
  total: number;
  sort: SortKey;
  emptyLabel: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="font-display text-xl sm:text-2xl leading-none" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h2>
        <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
          {entries.length < total ? `${entries.length} of ${total}` : total}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{blurb}</span>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{emptyLabel}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {entries.map((p, i) => (
            <ProspectCard key={p.fighterId} p={p} index={i + 1} sort={sort} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProspectCard({ p, index, sort }: { p: ProspectEntry; index: number; sort: SortKey }) {
  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-3">
        <span className="font-display text-xl w-7 text-right shrink-0" style={{ color: 'var(--text-muted)' }}>
          {index}
        </span>
        <FighterAvatar
          src={p.avatarUrl ?? undefined}
          name={p.fullName}
          sizeClass="w-11 h-11"
          initialsClass="text-xs"
          bg="var(--bg-elevated)"
          initialsColor="var(--text-secondary)"
        />
        <div className="flex-1 min-w-0">
          <Link
            href={`/fighter/${p.fighterId}`}
            className="text-sm font-medium hover:underline flex items-center gap-1.5"
            style={{ color: 'var(--text-primary)' }}
          >
            <span className="truncate">{p.fullName}</span>
            {p.flag && <span className="text-sm leading-none shrink-0">{p.flag}</span>}
            {p.distinctions.length > 0 && <DistinctionDecals distinctions={p.distinctions} max={2} size={13} />}
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            >
              {shortDivision(p.division)}
            </span>
            <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
              {p.ufcRecord} UFC
            </span>
            {p.age != null && (
              <span
                className="font-mono text-xs"
                style={{ color: p.age <= 27 ? 'var(--accent-green)' : p.age >= 33 ? 'var(--accent-gold)' : 'var(--text-secondary)' }}
                title={p.age <= 27 ? 'Young for the level — projection upside' : p.age >= 33 ? 'Old for a prospect — shorter runway' : undefined}
              >
                {p.age} yrs
              </span>
            )}
            {p.ourRank != null && p.ourRank <= 40 && (
              <span
                className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                style={{ color: 'var(--accent-red-light)', backgroundColor: 'rgba(210,10,10,0.16)' }}
              >
                our #{p.ourRank}
              </span>
            )}
          </div>
        </div>
        {/* The active sort key leads; the other stays visible as context. */}
        <div className="text-right shrink-0">
          <div
            className="font-mono text-sm"
            style={{ color: sort === 'rating' ? 'var(--text-primary)' : 'var(--text-muted)' }}
          >
            {p.elo}
          </div>
          <div
            className="font-mono text-[10px]"
            style={{
              color:
                sort === 'climb'
                  ? p.climbPerFight >= 0 ? 'var(--accent-green)' : 'var(--accent-red-light)'
                  : 'var(--text-muted)',
            }}
          >
            {p.climbPerFight >= 0 ? '+' : ''}{p.climbPerFight}/fight
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 pl-10">
        {p.lastTwo.map((rf, i) => (
          <span key={i} className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            <span className="font-medium" style={{ color: resultColor(rf.result) }}>{rf.result}</span>
            {' '}· {rf.label}
          </span>
        ))}
        {(p.preUFC || p.dwcs) && (
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {p.preUFC && (
              <>
                Pre-UFC: <span className="font-mono">{p.preUFC.record}</span> over {p.preUFC.fights} fights outside the UFC
              </>
            )}
            {p.preUFC && p.preUFC.ufcBoundBeaten > 0 && (
              <>
                {' · '}beat <span className="font-mono">{p.preUFC.ufcBoundBeaten}</span> future UFC fighter{p.preUFC.ufcBoundBeaten > 1 ? 's' : ''}
                {p.preUFC.bestScalp ? ` (incl. ${p.preUFC.bestScalp})` : ''}
              </>
            )}
            {p.dwcs && (
              <span
                className={`px-1.5 py-px rounded font-mono text-[10px] align-middle${p.preUFC ? ' ml-1.5' : ''}`}
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: p.dwcs.result === 'W' ? 'var(--accent-gold)' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}
                title={`Came through the Contender Series (${p.dwcs.year})`}
              >
                DWCS &rsquo;{String(p.dwcs.year).slice(2)} {p.dwcs.result}
              </span>
            )}
          </span>
        )}
        {p.nextFight && (
          <span className="text-[11px]" style={{ color: 'var(--accent-red-light)' }}>
            Next: vs {p.nextFight.opponentName}
            {p.nextFight.eventDate ? ` · ${p.nextFight.eventDate}` : ''}
            {p.nextFight.isMainEvent && <span style={{ color: 'var(--accent-gold)' }}> · main event</span>}
          </span>
        )}
      </div>
    </div>
  );
}
