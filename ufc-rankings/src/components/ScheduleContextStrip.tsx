'use client';

import { useState } from 'react';
import type { ScheduleContext, OpponentStyle } from '@/lib/advancedStats';

// The schedule-context panel that sits above the PACE grid. It answers, always
// on-screen, "how did this fighter do adjusted for WHO they faced?":
//   • pure strength of schedule (mean opponent Elo + step vs career)
//   • OUTPUT vs schedule  — landed vs what this slate normally concedes
//   • ABSORBED vs schedule — absorbed vs what this slate normally lands
// Both adjusted numbers carry a clickable ⓘ that explains them in plain English.
// A "details" popover breaks it down opponent by opponent. Display-only.

const STYLE_LABEL: Record<OpponentStyle, string> = {
  striker: 'striker',
  grappler: 'grappler',
  balanced: 'balanced',
  unknown: '—',
};

// Plain-English explanations for the two schedule-adjusted metrics.
const INFO: Record<'out' | 'abs', string> = {
  out:
    'OUT/EXP — output vs schedule. Strikes landed compared with what these exact opponents normally give up. ' +
    'Over 100% means out-landing what an average fighter manages against them — beating their defence. ' +
    'It corrects for a tougher schedule: raw volume can fall simply because better opponents concede less, not because the fighter got worse.',
  abs:
    'ABS/EXP — absorbed vs schedule. Strikes absorbed compared with what these opponents normally land on everyone else. ' +
    'Under 100% means taking less than they usually dish out — the fighter’s defence beat their standard output. ' +
    'Also schedule-adjusted, so facing high-volume strikers doesn’t unfairly read as slipping.',
};

// Per-fight ratios can spike when an opponent's career baseline is tiny (e.g. a
// fighter who's usually finished fast has a low absorbed/15). Cap the DISPLAY at
// 300%+ so one small-denominator cell doesn't dominate the table; the aggregate
// reads use pooled means and aren't affected.
function fmtRatio(x: number | null): string {
  if (x == null) return '—';
  if (x >= 3) return '300%+';
  return `${Math.round(x * 100)}%`;
}

function fmtDate(iso: string): string {
  const [y, m] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[(Number(m) || 1) - 1]} '${y.slice(2)}`;
}

// Small clickable "i" that toggles an explanation.
function InfoDot({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={active}
      className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] font-bold align-middle transition-colors"
      style={{
        border: '1px solid currentColor',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
      }}
    >
      i
    </button>
  );
}

export default function ScheduleContextStrip({ ctx, name }: { ctx: ScheduleContext; name?: string }) {
  const [open, setOpen] = useState(false);       // per-fight details popover
  const [info, setInfo] = useState<'out' | 'abs' | null>(null); // which explainer is shown
  const toggleInfo = (k: 'out' | 'abs') => setInfo((v) => (v === k ? null : k));

  const step = ctx.oppEloStep;
  const stepColor =
    step == null || Math.abs(step) < 15
      ? 'var(--text-muted)'
      : step > 0
        ? 'var(--accent-green)'
        : 'var(--text-secondary)';
  const stepLabel = step == null ? '' : `${step > 0 ? '+' : ''}${step} vs career`;

  // Style summary: name the archetypes faced in the window.
  const mixParts: string[] = [];
  (['striker', 'grappler', 'balanced'] as OpponentStyle[]).forEach((s) => {
    const n = ctx.styleMix[s];
    if (n > 0) mixParts.push(`${n} ${STYLE_LABEL[s]}${n > 1 ? 's' : ''}`);
  });

  // Defence vs schedule: <1 good (absorbing less than the slate usually lands).
  const abs = ctx.absorbedVsExpected;
  const absColor =
    abs == null ? 'var(--text-muted)' : abs <= 1 ? 'var(--accent-green)' : 'var(--accent-red-light)';
  // Offence vs schedule: >1 good (out-landing what the slate usually concedes).
  const off = ctx.landedVsExpected;
  const offColor =
    off == null ? 'var(--text-muted)' : off >= 1 ? 'var(--accent-green)' : 'var(--accent-red-light)';

  return (
    <div className="relative mb-2">
      <div className="rounded-md" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
        {/* Context row: window label + style mix + popover trigger */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] px-2.5 py-1.5">
          <span className="tracking-widest truncate font-medium" style={{ color: 'var(--text-secondary)' }}>
            {name ? `${name.toUpperCase()} · LAST ${ctx.windowSize}` : `SCHEDULE · LAST ${ctx.windowSize}`}
          </span>

          {mixParts.length > 0 && (
            <span className="hidden sm:inline" style={{ color: 'var(--text-muted)' }}>
              faced {mixParts.join(' · ')}
            </span>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors"
            style={{ color: open ? 'var(--text-primary)' : 'var(--text-muted)', border: '1px solid var(--border)' }}
            aria-expanded={open}
            aria-label="Schedule context details — opponent by opponent"
          >
            fight-by-fight
          </button>
        </div>

        {/* Strength of schedule — the prominent headline stat */}
        {ctx.oppEloRecent != null && (
          <div className="px-2.5 py-2.5 flex items-end justify-between gap-3" style={{ borderTop: '1px solid var(--border)' }}>
            <div>
              <div className="text-[11px] tracking-widest mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
                STRENGTH OF SCHEDULE · MEAN OPPONENT ELO
              </div>
              <div className="flex items-baseline gap-2.5">
                <span className="font-mono text-2xl leading-none font-semibold" style={{ color: 'var(--accent-blue)' }}>
                  {ctx.oppEloRecent}
                </span>
                {stepLabel && (
                  <span className="font-mono text-xs" style={{ color: stepColor }}>{stepLabel}</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {open && (
        <>
          {/* click-away backdrop */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 z-40 mt-1 w-[min(380px,92vw)] rounded-lg p-3.5 shadow-xl"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            {/* Schedule-adjusted output/absorption — the opponent-adjusted read */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <AdjStat
                label="OUTPUT vs schedule"
                ratio={off}
                color={offColor}
                actual={ctx.landedRecentPer15}
                actualLabel="landed"
                expected={ctx.oppExpectedAbsorbedPer15}
                expectedLabel="allowed"
                infoActive={info === 'out'}
                onInfo={() => toggleInfo('out')}
              />
              <AdjStat
                label="ABSORBED vs schedule"
                ratio={abs}
                color={absColor}
                actual={ctx.absorbedRecentPer15}
                actualLabel="absorbed"
                expected={ctx.oppExpectedLandedPer15}
                expectedLabel="opp output"
                infoActive={info === 'abs'}
                onInfo={() => toggleInfo('abs')}
              />
            </div>
            {info && (
              <p
                className="text-[11px] leading-snug mb-3 pb-3"
                style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}
              >
                {INFO[info]}
              </p>
            )}

            <div className="text-[10px] tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
              LAST {ctx.windowSize} · OPPONENT BY OPPONENT
            </div>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1 text-[11px]">
              <span style={{ color: 'var(--text-muted)' }}>OPPONENT</span>
              <span className="text-right" style={{ color: 'var(--text-muted)' }}>ELO</span>
              <span className="text-right" style={{ color: 'var(--text-muted)' }}>OUT/EXP</span>
              <span className="text-right" style={{ color: 'var(--text-muted)' }}>ABS/EXP</span>
              {[...ctx.fights].reverse().map((f) => (
                <FightRow key={f.fightId} f={f} />
              ))}
            </div>
            <p className="text-[10px] leading-snug mt-2" style={{ color: 'var(--text-muted)' }}>
              Elo is the opponent’s rating at fight time. These columns adjust each fight for who was across the cage.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// One always-visible schedule-adjusted stat: big % + the raw pair it came from,
// with a clickable ⓘ explainer beside the label.
function AdjStat({
  label, ratio, color, actual, actualLabel, expected, expectedLabel, infoActive, onInfo,
}: {
  label: string;
  ratio: number | null;
  color: string;
  actual: number;
  actualLabel: string;
  expected: number | null;
  expectedLabel: string;
  infoActive: boolean;
  onInfo: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>
        <span className="truncate">{label}</span>
        <InfoDot active={infoActive} onClick={onInfo} label={`What ${label} means`} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-lg leading-none font-semibold" style={{ color }}>
          {ratio != null ? `${Math.round(ratio * 100)}%` : '—'}
        </span>
        {expected != null && (
          <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {actual.toFixed(1)} {actualLabel} · {expected.toFixed(1)} {expectedLabel}
          </span>
        )}
      </div>
    </div>
  );
}

function FightRow({ f }: { f: import('@/lib/advancedStats').WindowFight }) {
  const outExp =
    f.oppAbsorbsPer15 != null && f.oppAbsorbsPer15 > 0
      ? f.landedPer15 / f.oppAbsorbsPer15
      : null;
  const outExpColor =
    outExp == null ? 'var(--text-muted)' : outExp >= 1 ? 'var(--accent-green)' : 'var(--accent-red-light)';
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
      <span className="font-mono text-right" style={{ color: outExpColor }}>
        {fmtRatio(outExp)}
      </span>
      <span className="font-mono text-right" style={{ color: absExpColor }}>
        {fmtRatio(absExp)}
      </span>
    </>
  );
}
