'use client';

import { useState } from 'react';
import type { ScheduleContext, OpponentStyle } from '@/lib/advancedStats';

// The schedule-context strip that sits above the PACE grid: a compact,
// scannable answer to "was this recent window a step up, and against what
// styles?" — with an ⓘ that opens a popover detailing the opponent-adjusted
// absorption read and the per-fight breakdown. Display-only; nothing here
// touches the rank.

const STYLE_LABEL: Record<OpponentStyle, string> = {
  striker: 'striker',
  grappler: 'grappler',
  balanced: 'balanced',
  unknown: '—',
};

const STYLE_COLOR: Record<OpponentStyle, string> = {
  striker: 'var(--accent-red-light)',
  grappler: 'var(--accent-blue, #5b8def)',
  balanced: 'var(--text-secondary)',
  unknown: 'var(--text-muted)',
};

function fmtDate(iso: string): string {
  const [y, m] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[(Number(m) || 1) - 1]} '${y.slice(2)}`;
}

export default function ScheduleContextStrip({ ctx, name }: { ctx: ScheduleContext; name?: string }) {
  const [open, setOpen] = useState(false);

  const step = ctx.oppEloStep;
  const stepColor =
    step == null || Math.abs(step) < 15
      ? 'var(--text-muted)'
      : step > 0
        ? 'var(--accent-green)'
        : 'var(--text-secondary)';
  const stepLabel =
    step == null ? '' : `${step > 0 ? '+' : ''}${step} vs career`;

  // Style summary: name the two dominant archetypes faced in the window.
  const mixParts: string[] = [];
  (['striker', 'grappler', 'balanced'] as OpponentStyle[]).forEach((s) => {
    const n = ctx.styleMix[s];
    if (n > 0) mixParts.push(`${n} ${STYLE_LABEL[s]}${n > 1 ? 's' : ''}`);
  });

  const ave = ctx.absorbedVsExpected;
  const aveColor =
    ave == null ? 'var(--text-muted)' : ave <= 1 ? 'var(--accent-green)' : 'var(--accent-red-light)';

  return (
    <div className="relative mb-2">
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] rounded-md px-2.5 py-1.5"
        style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
      >
        <span className="tracking-widest truncate" style={{ color: 'var(--text-muted)' }}>
          {name ? `${name.toUpperCase()} · LAST ${ctx.windowSize}` : `SCHEDULE · LAST ${ctx.windowSize}`}
        </span>

        {ctx.oppEloRecent != null && (
          <span className="font-mono">
            opp Elo {ctx.oppEloRecent}
            {stepLabel && (
              <span style={{ color: stepColor }}> ({stepLabel})</span>
            )}
          </span>
        )}

        {mixParts.length > 0 && (
          <span className="hidden sm:inline" style={{ color: 'var(--text-muted)' }}>
            faced {mixParts.join(' · ')}
          </span>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors"
          style={{
            color: open ? 'var(--text-primary)' : 'var(--text-muted)',
            border: '1px solid var(--border)',
          }}
          aria-expanded={open}
          aria-label="Schedule context details"
        >
          <span
            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] font-bold"
            style={{ border: '1px solid currentColor' }}
          >
            i
          </span>
          details
        </button>
      </div>

      {open && (
        <>
          {/* click-away backdrop */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 z-40 mt-1 w-[min(360px,90vw)] rounded-lg p-3.5 shadow-xl"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            {/* Opponent-adjusted absorption — the headline of the popup */}
            <div className="text-[10px] tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
              ABSORBED VS SCHEDULE
            </div>
            {ave != null && ctx.oppExpectedLandedPer15 != null ? (
              <p className="text-sm leading-snug mb-3" style={{ color: 'var(--text-secondary)' }}>
                Took <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{ctx.absorbedRecentPer15.toFixed(1)}</span> strikes/15
                against opponents who land{' '}
                <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{ctx.oppExpectedLandedPer15.toFixed(1)}</span>/15 on
                average —{' '}
                <span className="font-mono font-semibold" style={{ color: aveColor }}>
                  {Math.round(ave * 100)}%
                </span>{' '}
                of their usual output.{' '}
                <span style={{ color: 'var(--text-muted)' }}>
                  {ave <= 1
                    ? 'Absorbing less than this schedule normally lands — defence is holding up against the level faced.'
                    : 'Absorbing more than this schedule normally lands — getting hit above these opponents’ norm.'}
                </span>
              </p>
            ) : (
              <p className="text-sm leading-snug mb-3" style={{ color: 'var(--text-muted)' }}>
                Not enough charted opponent data to adjust absorption for schedule.
              </p>
            )}

            <div className="text-[10px] tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
              LAST {ctx.windowSize} · OPPONENT BY OPPONENT
            </div>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1 text-[11px]">
              <span style={{ color: 'var(--text-muted)' }}>OPPONENT</span>
              <span className="text-right" style={{ color: 'var(--text-muted)' }}>ELO</span>
              <span className="text-right" style={{ color: 'var(--text-muted)' }}>STYLE</span>
              <span className="text-right" style={{ color: 'var(--text-muted)' }}>ABS/EXP</span>
              {[...ctx.fights].reverse().map((f) => (
                <FightRow key={f.fightId} f={f} />
              ))}
            </div>

            <p className="text-[10px] leading-snug mt-3" style={{ color: 'var(--text-muted)' }}>
              ABS/EXP = strikes the fighter absorbed in that fight vs the opponent’s career output.
              Elo is the opponent’s rating at fight time; style is a heuristic read of the opponent’s
              own pace. The pace grid’s drift is raw — this panel is the opponent-adjusted view.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function FightRow({ f }: { f: import('@/lib/advancedStats').WindowFight }) {
  const absExp =
    f.oppLandsPer15 != null && f.oppLandsPer15 > 0
      ? f.absorbedPer15 / f.oppLandsPer15
      : null;
  const absExpColor =
    absExp == null ? 'var(--text-muted)' : absExp <= 1 ? 'var(--accent-green)' : 'var(--accent-red-light)';
  const resultColor =
    f.result === 'W' ? 'var(--accent-green)' : f.result === 'L' ? 'var(--accent-red-light)' : 'var(--text-muted)';
  return (
    <>
      <span className="truncate min-w-0" style={{ color: 'var(--text-secondary)' }}>
        <span className="font-mono mr-1" style={{ color: resultColor }}>{f.result}</span>
        {f.opponentName}
        <span className="ml-1" style={{ color: 'var(--text-muted)' }}>{fmtDate(f.date)}</span>
      </span>
      <span className="font-mono text-right" style={{ color: 'var(--text-secondary)' }}>
        {f.opponentElo ?? '—'}
      </span>
      <span className="text-right" style={{ color: STYLE_COLOR[f.style] }}>
        {STYLE_LABEL[f.style]}
      </span>
      <span className="font-mono text-right" style={{ color: absExpColor }}>
        {absExp != null ? `${Math.round(absExp * 100)}%` : '—'}
      </span>
    </>
  );
}
