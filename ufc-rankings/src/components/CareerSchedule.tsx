// CareerSchedule — all-time strength of schedule panel (DISPLAY ONLY).
//
// Renders lib/careerSos.ts: the mean rating of every opponent a fighter faced,
// each taken at the time of that fight, as a percentile of the all-era pool.
// Blue family per DESIGN_VISION §2.1 (blue = grappling & schedule).
//
// Deliberately NOT the same stat as the hero's SCHEDULE rank-card, which is the
// recency-windowed SoS that feeds the ranking. This one is career-wide and never
// touches the rating — the copy says so, because two schedule numbers on one
// page would otherwise read as a contradiction rather than two questions.

import Link from 'next/link';
import type { CareerSos } from '@/lib/careerSos';

const TRACK = 'linear-gradient(90deg, #3a3a44 0%, #2f6fb0 55%, #4a9eff 100%)';

function tierWord(p: number): string {
  return p >= 95 ? 'brutal' : p >= 80 ? 'tough' : p >= 55 ? 'above average' : p >= 25 ? 'moderate' : 'soft';
}

// Colour at the fighter's position on the track, matching the gradient stops.
function trackColor(p: number): string {
  const x = Math.max(0, Math.min(100, p)) / 100;
  const [from, to, k] =
    x < 0.55
      ? ([[58, 58, 68], [47, 111, 176], x / 0.55] as const)
      : ([[47, 111, 176], [74, 158, 255], (x - 0.55) / 0.45] as const);
  const c = from.map((v, i) => Math.round(v + (to[i] - v) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] tracking-wider whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="text-[13px] mt-0.5 truncate" style={{ color: 'var(--text-primary)' }}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default function CareerSchedule({
  sos,
  hasWindowedSos = false,
}: {
  sos: CareerSos;
  /** True when the hero shows the recency-windowed SCHEDULE card (ranked fighters
   *  only) — the footnote points at it, so it must not claim a card that isn't there. */
  hasWindowedSos?: boolean;
}) {
  const color = trackColor(sos.percentile);
  const pos = Math.max(0, Math.min(100, sos.percentile));

  return (
    <section>
      <div className="flex items-baseline flex-wrap gap-x-2 mb-2.5">
        <h2 className="text-[10px] tracking-widest" style={{ color: 'var(--text-muted)' }}>
          ALL-TIME SCHEDULE
        </h2>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          — every opponent faced, rated as they were on the night
        </span>
      </div>

      <div
        className="rounded-xl p-4"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        {/* Headline: percentile as the anchor, raw mean as the number of record */}
        <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
          <div>
            <div className="text-[9px] tracking-wider" style={{ color: 'var(--text-muted)' }}>
              AVG OPPONENT RATING
            </div>
            <div className="font-mono text-2xl leading-none mt-1" style={{ color: 'var(--text-primary)' }}>
              {Math.round(sos.meanOpponentElo)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] tracking-wider" style={{ color: 'var(--text-muted)' }}>
              {tierWord(sos.percentile).toUpperCase()} · VS {sos.poolSize.toLocaleString()} FIGHTERS
            </div>
            <div className="font-mono text-2xl leading-none mt-1" style={{ color }}>
              p{sos.percentile}
            </div>
          </div>
        </div>

        {/* Percentile track */}
        <div
          className="relative rounded-full"
          role="img"
          aria-label={
            `All-time strength of schedule: average opponent rating ${Math.round(sos.meanOpponentElo)}, ` +
            `${sos.percentile}th percentile of ${sos.poolSize} fighters (${tierWord(sos.percentile)}).`
          }
          style={{ height: 14, background: TRACK }}
        >
          <div
            className="absolute"
            style={{
              left: `${pos}%`,
              top: -4,
              height: 22,
              width: 0,
              borderLeft: '2px solid #fff',
              boxShadow: '0 0 4px #000',
              transform: 'translateX(-1px)',
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              left: `${pos}%`,
              top: 4,
              width: 6,
              height: 6,
              background: color,
              border: '1.5px solid #fff',
              transform: 'translate(-50%, 0)',
            }}
          />
        </div>
        <div className="flex justify-between mt-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <span>soft</span>
          <span>brutal</span>
        </div>

        {/* Supporting detail */}
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3.5 pt-3.5"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <Stat
            label="TOUGHEST FACED"
            value={
              sos.toughest ? (
                <Link
                  href={`/fighter/${sos.toughest.fighterId}`}
                  className="underline"
                  style={{ textDecorationColor: 'var(--border-light)', textUnderlineOffset: '3px' }}
                >
                  {sos.toughest.name}
                </Link>
              ) : (
                '—'
              )
            }
            sub={
              sos.toughest
                ? `${Math.round(sos.toughest.elo)} · ${sos.toughest.date.slice(0, 4)} · ${
                    sos.toughest.result === 'W' ? 'won' : sos.toughest.result === 'L' ? 'lost' : 'drew'
                  }`
                : undefined
            }
          />
          <Stat
            label="ELITE FACED"
            value={`${sos.eliteBeaten} / ${sos.eliteFaced}`}
            sub={sos.eliteFaced > 0 ? 'beaten / faced' : 'none at 1550+'}
          />
          <Stat label="TOP-5 SLATE" value={Math.round(sos.topOpponentElo)} sub="avg of 5 toughest" />
          <Stat label="CAREER" value={`${sos.fights} fights`} sub={`${sos.firstYear}–${sos.lastYear}`} />
        </div>

        <p className="text-[11px] leading-snug mt-3" style={{ color: 'var(--text-secondary)' }}>
          {sos.summary}
        </p>

        <p className="text-[10px] leading-snug mt-2" style={{ color: 'var(--text-muted)' }}>
          Career-wide and un-weighted, so it does not move with current form — and it never feeds the
          rating.
          {hasWindowedSos
            ? ' The SCHEDULE figure in the header is the recent-window version that does.'
            : ''}
        </p>
      </div>
    </section>
  );
}
