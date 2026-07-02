'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import FighterAvatar from '@/components/FighterAvatar';
import type { UpcomingEvent, CardFighter, CardBout } from '@/app/api/upcoming/route';

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const resultColor = (r: 'W' | 'L' | 'D') =>
  r === 'W' ? 'var(--accent-green)' : r === 'L' ? 'var(--accent-red-light)' : 'var(--text-muted)';

function FighterSide({ f, align }: { f: CardFighter; align: 'left' | 'right' }) {
  const right = align === 'right';
  const name = (
    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
      {f.name}
    </span>
  );

  return (
    <div className={`p-3.5 sm:p-4 ${right ? 'sm:text-right' : ''}`}>
      <div className={`flex items-center gap-2.5 mb-2 ${right ? 'sm:flex-row-reverse' : ''}`}>
        <FighterAvatar
          src={f.avatarUrl ?? undefined}
          name={f.name}
          sizeClass="w-11 h-11"
          initialsClass="text-xs"
          bg="var(--bg-elevated)"
          initialsColor="var(--text-secondary)"
          border={f.isChampion ? '2px solid var(--accent-gold)' : undefined}
        />
        <div className="min-w-0">
          <div className={`flex items-center gap-1.5 ${right ? 'sm:flex-row-reverse' : ''}`}>
            {f.fighterId ? (
              <Link href={`/fighter/${f.fighterId}`} className="hover:underline">
                {name}
              </Link>
            ) : (
              name
            )}
            {f.flag && <span className="text-sm leading-none">{f.flag}</span>}
          </div>
          <div className={`mt-1 ${right ? 'sm:flex sm:justify-end' : ''}`}>
            {f.rankLabel ? (
              <span
                className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                style={{
                  color: f.isChampion ? '#13131a' : 'var(--accent-red-light)',
                  backgroundColor: f.isChampion ? 'var(--accent-gold)' : 'rgba(210,10,10,0.16)',
                }}
              >
                {f.rankLabel}
              </span>
            ) : (
              <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Unranked
              </span>
            )}
            {f.age != null && (
              <span className="font-mono text-[10px] ml-1.5" style={{ color: 'var(--text-muted)' }}>
                {f.age} yrs
              </span>
            )}
          </div>
        </div>
      </div>

      {f.description && (
        <p className="text-xs leading-snug mb-2" style={{ color: 'var(--text-secondary)' }}>
          {f.description}
        </p>
      )}

      <div className={`flex flex-col gap-1 items-start ${right ? 'sm:items-end' : ''}`}>
        {f.recentFights.length === 0 && (
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            No UFC fights on record
          </span>
        )}
        {f.recentFights.map((rf, i) => (
          <span key={i} className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            <span className="font-medium" style={{ color: resultColor(rf.result) }}>
              {rf.result}
            </span>{' '}
            · {rf.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProbabilityStrip({ bout }: { bout: CardBout }) {
  if (bout.prob1 == null) return null;
  const p1 = Math.round(bout.prob1 * 100);
  const p2 = 100 - p1;
  const fp1 = bout.formProb1 != null ? Math.round(bout.formProb1 * 100) : null;
  const showForm = fp1 != null && Math.abs(fp1 - p1) >= 2;
  return (
    <div className="col-span-full px-3.5 pt-3 sm:px-4">
      <div className="flex items-baseline justify-between font-mono text-[10px] mb-1">
        <span style={{ color: p1 >= p2 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{p1}%</span>
        <span className="tracking-widest" style={{ color: 'var(--text-muted)' }}>
          OUR MODEL{showForm ? ` · FORM-ADJ ${fp1}–${100 - fp1!}` : ''}
        </span>
        <span style={{ color: p2 > p1 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{p2}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
        <div className="h-full" style={{ width: `${p1}%`, backgroundColor: 'var(--accent-red)' }} />
      </div>
    </div>
  );
}

function Bout({ bout }: { bout: CardBout }) {
  const main = bout.isMainEvent;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 px-0.5">
        {main && (
          <span
            className="text-[10px] tracking-widest uppercase font-medium"
            style={{ color: 'var(--accent-gold)' }}
          >
            ★ Main event
          </span>
        )}
        <span className="text-[10px] tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>
          {main ? '· ' : `Bout ${bout.boutOrder} · `}
          {bout.weightClass}
          {main ? ' · 5 rounds' : ''}
        </span>
      </div>
      <div
        className="grid grid-cols-1 sm:grid-cols-[1fr_40px_1fr] items-stretch rounded-xl overflow-hidden border"
        style={{
          backgroundColor: main ? 'var(--bg-card)' : 'var(--bg-secondary)',
          borderColor: main ? 'var(--border-light)' : 'var(--border)',
        }}
      >
        <ProbabilityStrip bout={bout} />
        <FighterSide f={bout.fighter1} align="left" />
        <div
          className="flex items-center justify-center font-display text-sm py-1 sm:py-0 border-y sm:border-y-0 sm:border-x"
          style={{
            color: 'var(--text-muted)',
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border)',
          }}
        >
          VS
        </div>
        <FighterSide f={bout.fighter2} align="right" />
      </div>
    </div>
  );
}

export default function UpcomingPage() {
  const [events, setEvents] = useState<UpcomingEvent[] | null>(null);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/upcoming');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { events: UpcomingEvent[] } = await res.json();
        if (!cancelled) setEvents(data.events);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const event = events?.[active];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl leading-none" style={{ color: 'var(--text-primary)' }}>
          UPCOMING
        </h1>
        <p className="text-xs mt-1.5 max-w-2xl" style={{ color: 'var(--text-muted)' }}>
          Every announced card, bout by bout in fight order. Each fighter shows our rank, fighting
          identity, and last two results — so you can read the matchup before the walkouts.
        </p>
      </div>

      {loading && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading cards…</p>}
      {error && <p className="text-sm" style={{ color: 'var(--accent-red-light)' }}>Failed to load: {error}</p>}
      {!loading && !error && (!events || events.length === 0) && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No upcoming cards announced.</p>
      )}

      {events && events.length > 0 && (
        <>
          <div className="flex gap-2 flex-wrap">
            {events.map((ev, i) => (
              <button
                key={ev.eventId ?? ev.eventName}
                onClick={() => setActive(i)}
                className="px-3.5 py-2 rounded-lg border text-left transition-colors"
                style={{
                  backgroundColor: i === active ? 'var(--bg-card)' : 'var(--bg-secondary)',
                  borderColor: i === active ? 'var(--accent-red)' : 'var(--border)',
                }}
              >
                <div
                  className="font-mono text-xs"
                  style={{ color: i === active ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                >
                  {ev.eventName.split(' - ')[0]}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {formatDate(ev.eventDate)}
                  {ev.eventName.includes(' - ') ? ` · ${ev.eventName.split(' - ')[1]}` : ''}
                </div>
              </button>
            ))}
          </div>

          {event && (
            <div className="space-y-4">
              <div
                className="flex items-baseline justify-between border-b pb-2"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="font-display text-2xl leading-none" style={{ color: 'var(--text-primary)' }}>
                  {event.eventName.split(' - ')[0].toUpperCase()}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {event.bouts.length} bouts · ranks vs UFC
                </div>
              </div>
              {event.bouts.map((b) => (
                // boutOrder alone can collide (missing values default to 999).
                <Bout key={`${b.boutOrder}-${b.fighter1.name}-${b.fighter2.name}`} bout={b} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
