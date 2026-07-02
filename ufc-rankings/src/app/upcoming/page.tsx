'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import FighterAvatar from '@/components/FighterAvatar';
import FormPips, { resultColor } from '@/components/FormPips';
import type { UpcomingEvent, CardFighter, CardBout } from '@/app/api/upcoming/route';

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function daysUntil(iso: string): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((new Date(iso + 'T00:00:00').getTime() - today) / 86400000);
}

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

// Event names arrive as "UFC 329 - McGregor vs. Holloway 2" — the suffix is
// the billed matchup, not a venue.
function splitEventName(name: string): { title: string; subtitle: string | null } {
  const idx = name.indexOf(' - ');
  return idx === -1
    ? { title: name, subtitle: null }
    : { title: name.slice(0, idx), subtitle: name.slice(idx + 3) };
}

function RankChip({ f, compact = false }: { f: CardFighter; compact?: boolean }) {
  if (!f.rankLabel) {
    return (
      <span className="font-mono text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
        {compact ? 'UNR' : 'Unranked'}
      </span>
    );
  }
  return (
    <span
      className={`font-mono text-[10px] shrink-0 ${compact ? 'px-1' : 'px-1.5'} py-0.5 rounded`}
      style={{
        color: f.isChampion ? '#13131a' : 'var(--accent-red-light)',
        backgroundColor: f.isChampion ? 'var(--accent-gold)' : 'rgba(210,10,10,0.16)',
      }}
    >
      {f.rankLabel}
    </span>
  );
}

function MainSide({ f, align }: { f: CardFighter; align: 'left' | 'right' }) {
  const right = align === 'right';
  const name = (
    <span
      className="font-display text-lg sm:text-xl uppercase leading-tight"
      style={{ color: 'var(--text-primary)' }}
    >
      {f.name}
    </span>
  );
  return (
    <div className={`p-4 ${right ? 'sm:text-right' : ''}`}>
      <div className={`flex items-center gap-3 mb-2.5 ${right ? 'sm:flex-row-reverse' : ''}`}>
        <FighterAvatar
          src={f.avatarUrl ?? undefined}
          name={f.name}
          sizeClass="w-14 h-14"
          initialsClass="text-sm"
          bg="var(--bg-elevated)"
          initialsColor="var(--text-secondary)"
          border={f.isChampion ? '2px solid var(--accent-gold)' : undefined}
        />
        <div className="min-w-0">
          <div className={`flex items-center gap-2 ${right ? 'sm:flex-row-reverse' : ''}`}>
            {f.fighterId ? (
              <Link href={`/fighter/${f.fighterId}`} className="hover:underline">
                {name}
              </Link>
            ) : (
              name
            )}
            {f.flag && <span className="text-sm leading-none">{f.flag}</span>}
          </div>
          <div className={`mt-1 flex items-center gap-2 ${right ? 'sm:flex-row-reverse' : ''}`}>
            <RankChip f={f} />
            {f.age != null && (
              <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {f.age} yrs
              </span>
            )}
          </div>
        </div>
      </div>

      {f.description && (
        <p className="text-xs leading-snug mb-2.5" style={{ color: 'var(--text-secondary)' }}>
          {f.description}
        </p>
      )}

      <FormPips fights={f.recentFights} justifyEnd={right} />
      <div className={`mt-2 flex flex-col gap-1 items-start ${right ? 'sm:items-end' : ''}`}>
        {f.recentFights.slice(0, 2).map((rf, i) => (
          <span key={i} className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            <span className="font-medium" style={{ color: resultColor(rf.result) }}>
              {rf.result}
            </span>{' '}
            · {rf.label}
            {rf.isTitle && (
              <span
                className="font-mono text-[10px] ml-1.5 px-1 py-px rounded-sm"
                style={{ color: 'var(--accent-gold)', border: '1px solid rgba(212,168,67,0.45)' }}
              >
                TITLE
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProbabilitySpine({ bout }: { bout: CardBout }) {
  if (bout.prob1 == null) return null;
  const p1 = Math.round(bout.prob1 * 100);
  const p2 = 100 - p1;
  const fp1 = bout.formProb1 != null ? Math.round(bout.formProb1 * 100) : null;
  const showForm = fp1 != null && Math.abs(fp1 - p1) >= 2;
  return (
    <div className="px-4 pb-4">
      <div className="flex items-baseline justify-between mb-1.5">
        <span
          className="font-display text-lg leading-none"
          style={{ color: p1 >= p2 ? 'var(--text-primary)' : 'var(--text-muted)' }}
        >
          {p1}%
        </span>
        <span className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--text-muted)' }}>
          WIN PROBABILITY{showForm ? ` · FORM-ADJ ${fp1}–${100 - fp1!}` : ''}
        </span>
        <span
          className="font-display text-lg leading-none"
          style={{ color: p2 > p1 ? 'var(--text-primary)' : 'var(--text-muted)' }}
        >
          {p2}%
        </span>
      </div>
      <div className="relative h-1.5 rounded-full" style={{ backgroundColor: 'var(--bg-elevated)' }}>
        <div
          className="absolute inset-y-0 left-0 rounded-l-full"
          style={{ width: `${p1}%`, backgroundColor: 'var(--accent-red)' }}
        />
        <div
          className="absolute top-1/2 w-2 h-2"
          style={{
            left: `${p1}%`,
            transform: 'translate(-50%,-50%) rotate(45deg)',
            backgroundColor: 'var(--bg-primary)',
            border: '1.5px solid var(--text-primary)',
          }}
        />
      </div>
    </div>
  );
}

// Per-row accent: schedule → blue (SoS), finish → red, reach → neutral.
const TAPE_ACCENT: Record<string, string> = {
  schedule: 'var(--accent-blue)',
  finish: 'var(--accent-red-light)',
  reach: 'var(--text-primary)',
};

// Middle band of the hero: the VS diamond, a short tale-of-the-tape, and a
// link to the full compare page. A row only shows when both corners have the
// stat; the tape as a whole is dropped below two rows (diamond + link remain).
function TaleOfTape({ bout }: { bout: CardBout }) {
  const { fighter1: f1, fighter2: f2 } = bout;
  type Row = { key: string; label: string; v1: number; v2: number; fmt: (n: number) => string };
  const rows: Row[] = [];
  if (f1.reach != null && f2.reach != null)
    rows.push({ key: 'reach', label: 'Reach', v1: f1.reach, v2: f2.reach, fmt: (n) => `${n}"` });
  if (f1.scheduleStrength != null && f2.scheduleStrength != null)
    rows.push({ key: 'schedule', label: 'Sched str', v1: f1.scheduleStrength, v2: f2.scheduleStrength, fmt: (n) => `${Math.round(n)}` });
  if (f1.finishRate != null && f2.finishRate != null)
    rows.push({ key: 'finish', label: 'Finish', v1: f1.finishRate, v2: f2.finishRate, fmt: (n) => `${Math.round(n * 100)}%` });

  const compareHref =
    f1.fighterId && f2.fighterId ? `/compare?a=${f1.fighterId}&b=${f2.fighterId}` : null;

  const qualityTip = (q: number | null) =>
    q != null ? `Opponent quality ${Math.round(q)} of 100, discounted for activity` : undefined;

  return (
    <div className="flex flex-col items-center px-2 py-2 sm:py-0">
      <div
        className="w-8 h-8 flex items-center justify-center rounded shrink-0 sm:mt-7"
        style={{ transform: 'rotate(45deg)', border: '1px solid var(--accent-red)', backgroundColor: 'var(--bg-primary)' }}
      >
        <span className="block font-display text-xs leading-none" style={{ transform: 'rotate(-45deg)', color: 'var(--text-primary)' }}>
          VS
        </span>
      </div>

      {rows.length >= 2 && (
        <div className="w-full mt-3.5 flex flex-col gap-1.5">
          {rows.map((r) => {
            const accent = TAPE_ACCENT[r.key] ?? 'var(--text-primary)';
            const tie = r.v1 === r.v2;
            return (
              <div key={r.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <span
                  className="font-mono text-xs text-left"
                  title={r.key === 'schedule' ? qualityTip(f1.scheduleQuality) : undefined}
                  style={{ color: !tie && r.v1 > r.v2 ? accent : 'var(--text-muted)' }}
                >
                  {r.fmt(r.v1)}
                </span>
                <span className="text-[9px] tracking-widest uppercase text-center whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                  {r.label}
                </span>
                <span
                  className="font-mono text-xs text-right"
                  title={r.key === 'schedule' ? qualityTip(f2.scheduleQuality) : undefined}
                  style={{ color: !tie && r.v2 > r.v1 ? accent : 'var(--text-muted)' }}
                >
                  {r.fmt(r.v2)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {compareHref && (
        <Link
          href={compareHref}
          className="mt-3 pt-2.5 w-full text-center text-[11px] hover:underline border-t"
          style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
        >
          Full comparison →
        </Link>
      )}
    </div>
  );
}

function MainEventBout({ bout }: { bout: CardBout }) {
  return (
    <div
      className="rounded-xl overflow-hidden border"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}
    >
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ backgroundColor: 'var(--bg-card-hover)', borderColor: 'var(--border)' }}
      >
        <span
          className="text-[10px] tracking-widest uppercase font-medium"
          style={{ color: 'var(--accent-gold)' }}
        >
          ★ Main event
        </span>
        <span className="text-[10px] tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>
          {bout.weightClass} · 5 rounds
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_200px_minmax(0,1fr)] items-start">
        <MainSide f={bout.fighter1} align="left" />
        <TaleOfTape bout={bout} />
        <MainSide f={bout.fighter2} align="right" />
      </div>
      <ProbabilitySpine bout={bout} />
    </div>
  );
}

function DenseSide({ f, align }: { f: CardFighter; align: 'left' | 'right' }) {
  const right = align === 'right';
  const name = (
    <span className="block truncate font-display text-sm uppercase" style={{ color: 'var(--text-primary)' }}>
      {f.name}
    </span>
  );
  return (
    <div className={`flex items-center gap-2 min-w-0 ${right ? 'sm:flex-row-reverse' : ''}`}>
      {f.fighterId ? (
        <Link href={`/fighter/${f.fighterId}`} className="hover:underline min-w-0">
          {name}
        </Link>
      ) : (
        <span className="min-w-0">{name}</span>
      )}
      <RankChip f={f} compact />
      <FormPips fights={f.recentFights} compact />
    </div>
  );
}

function DenseBout({ bout }: { bout: CardBout }) {
  const p1 = bout.prob1 != null ? Math.round(bout.prob1 * 100) : null;
  return (
    <div
      className="rounded-lg border px-4 py-2.5"
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
    >
      <div className="text-[10px] tracking-widest uppercase mb-1.5" style={{ color: 'var(--text-muted)' }}>
        Bout {bout.boutOrder} · {bout.weightClass}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
        <DenseSide f={bout.fighter1} align="left" />
        <div>
          {p1 != null ? (
            <>
              <div className="flex justify-between font-mono text-[10px] mb-1">
                <span style={{ color: p1 >= 50 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{p1}</span>
                <span style={{ color: p1 < 50 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {100 - p1}
                </span>
              </div>
              <div className="relative h-1 rounded-full" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                <div
                  className="absolute inset-y-0 left-0 rounded-l-full"
                  style={{ width: `${p1}%`, backgroundColor: 'var(--accent-red)' }}
                />
              </div>
            </>
          ) : (
            <div className="text-center font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
              —
            </div>
          )}
        </div>
        <DenseSide f={bout.fighter2} align="right" />
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
  const evParts = event ? splitEventName(event.eventName) : null;
  const hero = event ? event.bouts.find((b) => b.isMainEvent) ?? event.bouts[0] : null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl leading-none" style={{ color: 'var(--text-primary)' }}>
          UPCOMING
        </h1>
        <p className="text-xs mt-1.5 max-w-2xl" style={{ color: 'var(--text-muted)' }}>
          Every announced card, bout by bout in fight order. Each fighter shows our rank and last
          five results — gold-underlined when the fight was for a belt — with the model&apos;s win
          probability as the spine of every matchup.
        </p>
      </div>

      {loading && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading cards…</p>}
      {error && <p className="text-sm" style={{ color: 'var(--accent-red-light)' }}>Failed to load: {error}</p>}
      {!loading && !error && (!events || events.length === 0) && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No upcoming cards announced.</p>
      )}

      {events && events.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2.5 pt-1.5">
            {events.map((ev, i) => {
              const { title, subtitle } = splitEventName(ev.eventName);
              const me = ev.bouts.find((b) => b.isMainEvent) ?? ev.bouts[0];
              const teaser =
                subtitle ??
                (me ? `${lastName(me.fighter1.name)} vs ${lastName(me.fighter2.name)}` : null);
              const d = new Date(ev.eventDate + 'T00:00:00');
              const days = daysUntil(ev.eventDate);
              const isActive = i === active;
              return (
                <button
                  key={ev.eventId ?? ev.eventName}
                  onClick={() => setActive(i)}
                  className="relative flex items-center gap-3 px-3.5 py-2.5 rounded-lg border text-left transition-colors min-w-0"
                  style={{
                    backgroundColor: isActive ? 'var(--bg-card)' : 'var(--bg-secondary)',
                    borderColor: isActive ? 'var(--accent-red)' : 'var(--border)',
                  }}
                >
                  {i === 0 && days >= 0 && (
                    <span
                      className="absolute -top-2 left-3 font-mono text-[10px] tracking-wider uppercase px-1.5 py-px rounded-full"
                      style={{ backgroundColor: 'var(--accent-red)', color: '#fff' }}
                    >
                      {days === 0 ? 'Tonight' : days === 1 ? 'Tomorrow' : `Next · ${days} days`}
                    </span>
                  )}
                  <div className="text-center shrink-0">
                    <div
                      className="font-display text-xl leading-none"
                      style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                    >
                      {d.getDate()}
                    </div>
                    <div className="text-[10px] tracking-widest uppercase mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {d.toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div
                      className="font-display text-sm uppercase leading-tight truncate"
                      style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                    >
                      {title}
                    </div>
                    {teaser && (
                      <div
                        className="text-[11px] truncate"
                        style={{ color: isActive ? 'var(--text-secondary)' : 'var(--text-muted)' }}
                      >
                        {teaser}
                      </div>
                    )}
                    <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                      {ev.bouts.length} bouts
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {event && evParts && (
            <div className="space-y-4">
              <div className="border-b pb-2.5" style={{ borderColor: 'var(--border)' }}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="font-display text-2xl leading-none uppercase" style={{ color: 'var(--text-primary)' }}>
                    {evParts.title}
                    {evParts.subtitle && (
                      <span style={{ color: 'var(--text-secondary)' }}> · {evParts.subtitle}</span>
                    )}
                  </div>
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {formatDate(event.eventDate)} · {event.bouts.length} bouts
                  </span>
                </div>
                <div
                  className="mt-2 flex items-center gap-1.5 text-[10px] tracking-wider uppercase"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <span>Last 5, newest first ·</span>
                  <span
                    className="inline-block w-3 h-3 rounded-[3px]"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      boxShadow: 'inset 0 -2px 0 0 var(--accent-gold)',
                    }}
                  />
                  <span>= title fight</span>
                </div>
              </div>
              {event.bouts.map((b) => (
                // boutOrder alone can collide (missing values default to 999).
                <div key={`${b.boutOrder}-${b.fighter1.name}-${b.fighter2.name}`}>
                  {b === hero ? <MainEventBout bout={b} /> : <DenseBout bout={b} />}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
