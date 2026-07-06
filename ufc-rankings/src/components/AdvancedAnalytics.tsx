import type { AdvancedStats, TrendInsight, RatioBenchmark, ScheduleContext, Gauntlet as GauntletData } from '@/lib/advancedStats';
import type { FightTrace } from '@/lib/eloEngine';
import type { GrappleGradient } from '@/lib/grappleGradient';
import Gauntlet from './Gauntlet';
import ScheduleContextStrip from './ScheduleContextStrip';
import FightHistory, { type StrikeRate } from './FightHistory';
import GrappleRamp from './GrappleRamp';
import ProfileRadar from './ProfileRadar';
import PaceTables from './PaceTables';

interface RadarAxes {
  strike: number;
  grappling: number;
  finishing: number;
  activity: number;
  oppQuality: number;
}

// Unified advanced-analytics section for the fighter profile: the cautious
// macro TREND READ leads, then the form timeline, the landed:absorbed ratio
// benchmarked against the division's ranked pool, pace rates, durability and
// finish anatomy — all in one place. A red dot marks the signals that feed the
// bounded ±30 metrics bonus; nothing here touches the Elo core.

const INSIGHT_COLOR: Record<TrendInsight['kind'], string> = {
  positive: 'var(--accent-green)',
  negative: 'var(--accent-red-light)',
  caution: 'var(--accent-gold)',
  neutral: 'var(--text-muted)',
};

export default function AdvancedAnalyticsSection({
  advanced,
  trendRead,
  benchmark,
  scheduleContext,
  gauntlet,
  history,
  radar,
  grapple,
}: {
  advanced: AdvancedStats;
  trendRead: TrendInsight[];
  benchmark: RatioBenchmark | null;
  scheduleContext: ScheduleContext | null;
  gauntlet: GauntletData | null;
  history: FightTrace[];
  radar: RadarAxes;
  grapple: GrappleGradient | null;
}) {
  // Per-fight strike rates (landed/absorbed per 15) keyed by fightId → the
  // dominance strips in the fight-history list beside the Gauntlet.
  const strikes: Record<string, StrikeRate> = {};
  for (const pt of advanced.timeline) {
    strikes[pt.fightId] = { landed: pt.landedPer15, absorbed: pt.absorbedPer15 };
  }

  const cardStyle = { backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' };

  return (
    <section className="space-y-4">
      {/* ── Block A — the story: Gauntlet + trend read | fight history ── */}
      <div className="rounded-xl p-4" style={cardStyle}>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3 min-w-0 space-y-4">
            {trendRead.length > 0 && (
              <div>
                <div className="text-[10px] tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
                  TREND READ
                </div>
                <ul className="space-y-2">
                  {trendRead.map((ins, i) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-snug">
                      <span
                        className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: INSIGHT_COLOR[ins.kind] }}
                      />
                      <span style={{ color: 'var(--text-secondary)' }}>{ins.text}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] leading-snug mt-2" style={{ color: 'var(--text-muted)' }}>
                  Fights are rare events and stat lines are matchup-dependent — the read weighs mileage,
                  opposition level and damage history before calling anything a trend, and it never touches the rank.
                </p>
              </div>
            )}
            {gauntlet ? (
              <Gauntlet gauntlet={gauntlet} />
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Not enough fights against rated opponents to draw the Gauntlet.
              </p>
            )}
            {/* Grappling proficiency — grey→blue ramp, ranked vs own-division pool.
                Sits directly under the Gauntlet. Display-only, never touches the rank. */}
            {grapple && (
              <div className="pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="flex items-baseline flex-wrap gap-x-2 mb-3">
                  <span className="text-[11px] tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                    GRAPPLING PROFICIENCY
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    — takedowns, control &amp; ground share vs this division&apos;s 3+-fight pool
                  </span>
                  <span className="ml-auto font-mono text-lg leading-none" style={{ color: grapple.color }}>
                    p{grapple.percentile}
                  </span>
                </div>
                <GrappleRamp markers={[{ percentile: grapple.percentile, color: grapple.color }]} showScaleLabels />
                {grapple.breakdown && (
                  <p className="text-[11px] leading-snug mt-2.5" style={{ color: 'var(--text-secondary)' }}>
                    {grapple.breakdown.summary}
                  </p>
                )}
              </div>
            )}
            <div className="pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              <RatioPanel advanced={advanced} benchmark={benchmark} />
            </div>
          </div>

          <div className="lg:col-span-2 min-w-0">
            <div className="text-[10px] tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
              FIGHT HISTORY
            </div>
            <div className="lg:max-h-[600px] lg:overflow-y-auto lg:pr-1">
              <FightHistory history={history} strikes={strikes} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Block B — full-width: strength of schedule + pace, striking | grappling ── */}
      <div className="rounded-xl p-4" style={cardStyle}>
        {scheduleContext && <ScheduleContextStrip ctx={scheduleContext} />}
        <PaceTables advanced={advanced} benchmark={benchmark} />
      </div>

      {/* ── Block C — supporting, de-emphasized: radar + durability + finishes ── */}
      <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-primary)', border: '1px dashed var(--border)' }}>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[10px] tracking-widest" style={{ color: 'var(--text-muted)' }}>
            SUPPORTING · ATTRIBUTES & DURABILITY
          </span>
          <span
            className="text-[8px] tracking-widest px-1.5 py-0.5 rounded"
            style={{ color: 'var(--accent-gold)', border: '1px solid var(--border)' }}
          >
            RADAR REWORK PENDING
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start" style={{ opacity: 0.82 }}>
          <div>
            <div className="text-[10px] tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>ATTRIBUTES</div>
            <ProfileRadar radar={radar} />
          </div>
          <DurabilityPanel advanced={advanced} />
          <div>
            <div className="text-[10px] tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>FINISH ANATOMY</div>
            {(advanced.finishWins.length > 0 || advanced.finishedBy.length > 0) ? (
              <div className="grid grid-cols-2 gap-4">
                <FinishList title="FINISHES BY" entries={advanced.finishWins} accent="var(--accent-red-light)" />
                <FinishList title="FINISHED BY" entries={advanced.finishedBy} accent="var(--text-muted)" />
              </div>
            ) : (
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>No finishes on record either way.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// Landed:absorbed ratio, fighter vs their last 3 vs the division's ranked pool.
function RatioPanel({ advanced, benchmark }: { advanced: AdvancedStats; benchmark: RatioBenchmark | null }) {
  const recentN = advanced.recent?.fights ?? 5;
  const rows: { label: string; value: number | null; color: string }[] = [
    { label: 'Career', value: advanced.ratioCareer, color: 'var(--accent-red-light)' },
    { label: `Last ${recentN}`, value: advanced.ratioRecent, color: 'var(--accent-red)' },
    { label: 'Div. ranked median', value: benchmark?.ratio ?? null, color: 'var(--text-muted)' },
  ];
  const present = rows.filter((r) => r.value != null) as { label: string; value: number; color: string }[];
  if (!present.length) return null;
  const scaleMax = Math.max(1.5, ...present.map((r) => Math.min(r.value, 3)));

  return (
    <div>
      <div className="text-[10px] tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
        STRIKE RATIO · LANDED PER ABSORBED
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            <span className="text-xs w-32 shrink-0 truncate" style={{ color: 'var(--text-secondary)' }}>{r.label}</span>
            <span className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
              {r.value != null && (
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.min(100, (Math.min(r.value, 3) / scaleMax) * 100)}%`, backgroundColor: r.color }}
                />
              )}
            </span>
            <span className="font-mono text-xs w-10 text-right shrink-0" style={{ color: 'var(--text-primary)' }}>
              {r.value != null ? (r.value >= 9.99 ? '9.9+' : r.value.toFixed(2)) : '—'}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[10px] leading-snug mt-2" style={{ color: 'var(--text-muted)' }}>
        Above 1.00 = out-landing opponents.
        {benchmark ? ` Division median is across ${benchmark.sample} ranked fighters.` : ' No division benchmark (unranked weight class).'}
      </p>
    </div>
  );
}

function DurabilityPanel({ advanced }: { advanced: AdvancedStats }) {
  const d = advanced.durability;
  const neverFinished = d.timesFinished === 0;
  return (
    <div>
      <div className="text-[10px] tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
        DURABILITY
      </div>
      <dl className="space-y-1.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt style={{ color: 'var(--text-muted)' }}>Times finished</dt>
          <dd className="font-mono" style={{ color: neverFinished ? 'var(--accent-green)' : 'var(--text-primary)' }}>
            {neverFinished ? 'Never' : `${d.timesFinished}${d.lastFinishedYear ? ` (last ${d.lastFinishedYear})` : ''}`}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt style={{ color: 'var(--text-muted)' }}>KO/TKO · Sub · Dec losses</dt>
          <dd className="font-mono" style={{ color: 'var(--text-primary)' }}>
            {d.koTkoLosses} · {d.subLosses} · {d.decisionLosses}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt style={{ color: 'var(--text-muted)' }}>Knockdowns absorbed /15</dt>
          <dd className="font-mono" style={{ color: 'var(--text-primary)' }}>{d.kdAbsorbedPer15.toFixed(2)}</dd>
        </div>
      </dl>
    </div>
  );
}

function FinishList({ title, entries, accent }: { title: string; entries: { label: string; count: number }[]; accent: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>{title}</div>
      {entries.length === 0 ? (
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>—</div>
      ) : (
        <ul className="space-y-1">
          {entries.map((e) => (
            <li key={e.label} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{e.label}</span>
              <span className="font-mono shrink-0" style={{ color: accent }}>×{e.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
