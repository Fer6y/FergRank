import type { AdvancedStats, TrendInsight, RatioBenchmark, ScheduleContext, Gauntlet as GauntletData } from '@/lib/advancedStats';
import type { FightTrace } from '@/lib/eloEngine';
import Gauntlet from './Gauntlet';
import ScheduleContextStrip from './ScheduleContextStrip';
import FightHistory, { type StrikeRate } from './FightHistory';
import ProfileRadar from './ProfileRadar';

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

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const pct = (n: number | null) => (n == null ? '—' : `${(n * 100).toFixed(0)}%`);

const INSIGHT_COLOR: Record<TrendInsight['kind'], string> = {
  positive: 'var(--accent-green)',
  negative: 'var(--accent-red-light)',
  caution: 'var(--accent-gold)',
  neutral: 'var(--text-muted)',
};

// ── Standout vs the division median ────────────────────────────────────────
// Flags a pace stat that deviates significantly from the peer baseline (DIV
// MED) — the fighter's signature strength or a notable gap. Ratio-based so it
// works across wildly different scales (knockdowns ~0.4 vs strikes ~60). A
// strength above the median in the "good" direction pops (green, gold when
// elite, with a row accent); a gap is marked more subtly. Display-only.
interface Standout {
  color: string;       // accent for the value + badge
  badge: string;       // e.g. "8.2×" (above median) or "67%↓" (below)
  emphasize: boolean;  // elite strength → row accent bar + faint tint
}

function standoutOf(val: number | null | undefined, med: number | null | undefined, higherIsBetter: boolean): Standout | null {
  if (val == null || med == null || med <= 0 || val < 0) return null;
  // Both negligible → "doesn't do this", not a signal worth colouring.
  if (val < 0.15 && med < 0.5) return null;
  const ratio = val / med;
  let dir: 'good' | 'bad';
  let elite: boolean;
  let badge: string;
  if (ratio >= 1.6) {
    dir = higherIsBetter ? 'good' : 'bad';
    elite = ratio >= 2.5;
    badge = ratio >= 9.95 ? `${Math.round(ratio)}×` : `${ratio.toFixed(1)}×`;
  } else if (ratio <= 0.62) {
    dir = higherIsBetter ? 'bad' : 'good';
    elite = ratio <= 0.4;
    badge = `${Math.round((1 - ratio) * 100)}%↓`;
  } else {
    return null;
  }
  const color =
    dir === 'good'
      ? elite ? 'var(--accent-gold)' : 'var(--accent-green)'
      : 'var(--accent-red-light)';
  return { color, badge, emphasize: dir === 'good' && elite };
}

export default function AdvancedAnalyticsSection({
  eloRating,
  eloPeak,
  whyHeadline,
  advanced,
  trendRead,
  benchmark,
  scheduleContext,
  gauntlet,
  history,
  radar,
}: {
  eloRating: number;
  eloPeak: number;
  whyHeadline: string | null;
  advanced: AdvancedStats;
  trendRead: TrendInsight[];
  benchmark: RatioBenchmark | null;
  scheduleContext: ScheduleContext | null;
  gauntlet: GauntletData | null;
  history: FightTrace[];
  radar: RadarAxes;
}) {
  const { career, recent, drift } = advanced;
  // Division ranked-pool medians → the DIV MED column (peer baseline). Only
  // shown when the division has a benchmark (≥10 chartable ranked fighters).
  // Columns are deliberately spare: CAREER vs DIV MED, plus a TREND arrow (no
  // number) for recent direction. LAST-5 lives in the fight-by-fight popup.
  const med = benchmark?.pace ?? null;
  const paceGrid = med
    ? 'grid-cols-[1fr_64px_64px_40px]'
    : 'grid-cols-[1fr_64px_40px]';

  // Per-fight strike rates (landed/absorbed per 15) keyed by fightId → the
  // dominance strips in the fight-history list beside the Gauntlet.
  const strikes: Record<string, StrikeRate> = {};
  for (const pt of advanced.timeline) {
    strikes[pt.fightId] = { landed: pt.landedPer15, absorbed: pt.absorbedPer15 };
  }

  const cardStyle = { backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' };

  return (
    <section className="space-y-4">
      {/* Top box — ELO anchors + a brief, personalised one-line "why this rank" */}
      <div
        className="rounded-xl px-5 py-4 flex items-start justify-between gap-6 flex-wrap"
        style={cardStyle}
      >
        <p className="text-base sm:text-lg leading-snug flex-1 min-w-[240px]" style={{ color: 'var(--text-primary)' }}>
          {whyHeadline ?? 'Core Elo rating, computed from every UFC fight and weighted toward recent results.'}
        </p>
        <div className="flex items-end gap-6 shrink-0">
          <div className="text-right">
            <div className="text-[11px] tracking-widest" style={{ color: 'var(--text-secondary)' }}>ELO</div>
            <div className="font-mono text-2xl leading-none mt-1" style={{ color: 'var(--text-primary)' }}>
              {Math.round(eloRating)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] tracking-widest" style={{ color: 'var(--text-secondary)' }}>PEAK ELO</div>
            <div className="font-mono text-2xl leading-none mt-1" style={{ color: 'var(--accent-gold)' }}>
              {Math.round(eloPeak)}
            </div>
          </div>
        </div>
      </div>

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-4">
          {/* Striking */}
          <div className="min-w-0">
            <div className={`grid ${paceGrid} gap-2 text-[11px] tracking-wider mb-2 font-medium`} style={{ color: 'var(--text-secondary)' }}>
              <span>STRIKING</span>
              <span className="text-right">CAREER</span>
              {med && <span className="text-right">DIV MED</span>}
              <span className="text-right">TREND</span>
            </div>
            <div className="space-y-1.5">
              <PaceRow gridCls={paceGrid} label="Strikes landed" career={fmt1(career.landedPer15)} median={med ? fmt1(med.landedPer15) : null} delta={drift?.landedPer15Delta ?? null} standout={standoutOf(career.landedPer15, med?.landedPer15, true)} />
              <PaceRow gridCls={paceGrid} label="Strikes absorbed" higherIsBetter={false} career={fmt1(career.absorbedPer15)} median={med ? fmt1(med.absorbedPer15) : null} delta={recent ? recent.absorbedPer15 - career.absorbedPer15 : null} standout={standoutOf(career.absorbedPer15, med?.absorbedPer15, false)} />
              <PaceRow gridCls={paceGrid} label="Strike differential" feedsRanking career={fmt1(career.diffPer15)} median={med ? fmt1(med.diffPer15) : null} delta={drift?.diffPer15Delta ?? null} standout={standoutOf(career.diffPer15, med?.diffPer15, true)} />
              <PaceRow gridCls={paceGrid} label="Sig. accuracy" feedsRanking career={pct(career.sigAccuracy)} median={med ? pct(med.sigAccuracy) : null} delta={drift?.sigAccuracyDelta != null ? drift.sigAccuracyDelta * 100 : null} deltaDecimals={0} standout={standoutOf(career.sigAccuracy, med?.sigAccuracy, true)} />
              <PaceRow gridCls={paceGrid} label="Knockdowns" feedsRanking career={career.kdPer15.toFixed(2)} median={med ? med.kdPer15.toFixed(2) : null} delta={recent ? Math.round((recent.kdPer15 - career.kdPer15) * 100) / 100 : null} deltaDecimals={2} standout={standoutOf(career.kdPer15, med?.kdPer15, true)} />
            </div>
          </div>

          {/* Grappling */}
          <div className="min-w-0">
            <div className={`grid ${paceGrid} gap-2 text-[11px] tracking-wider mb-2 font-medium`} style={{ color: 'var(--text-secondary)' }}>
              <span>GRAPPLING</span>
              <span className="text-right">CAREER</span>
              {med && <span className="text-right">DIV MED</span>}
              <span className="text-right">TREND</span>
            </div>
            <div className="space-y-1.5">
              <PaceRow gridCls={paceGrid} label="Takedowns" feedsRanking career={fmt1(career.tdPer15)} median={med ? fmt1(med.tdPer15) : null} delta={drift?.tdPer15Delta ?? null} standout={standoutOf(career.tdPer15, med?.tdPer15, true)} />
              <PaceRow gridCls={paceGrid} label="Takedowns conceded" higherIsBetter={false} career={fmt1(career.tdAbsorbedPer15)} median={med ? fmt1(med.tdAbsorbedPer15) : null} delta={recent ? recent.tdAbsorbedPer15 - career.tdAbsorbedPer15 : null} standout={standoutOf(career.tdAbsorbedPer15, med?.tdAbsorbedPer15, false)} />
              <PaceRow gridCls={paceGrid} label="Sub attempts" career={fmt1(career.subAttPer15)} median={med ? fmt1(med.subAttPer15) : null} delta={recent ? Math.round((recent.subAttPer15 - career.subAttPer15) * 10) / 10 : null} standout={standoutOf(career.subAttPer15, med?.subAttPer15, true)} />
              <PaceRow gridCls={paceGrid} label="Control share" career={`${fmt1(career.ctrlSharePct)}%`} median={med ? `${fmt1(med.ctrlSharePct)}%` : null} delta={recent ? Math.round((recent.ctrlSharePct - career.ctrlSharePct) * 10) / 10 : null} standout={standoutOf(career.ctrlSharePct, med?.ctrlSharePct, true)} />
            </div>
          </div>
        </div>
        <p className="text-[10px] leading-snug mt-4" style={{ color: 'var(--text-muted)' }}>
          <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ backgroundColor: 'var(--accent-red)' }} />
          = signal behind the bounded ±30 metrics bonus. CAREER is over {advanced.sampleFights} charted
          fights ({advanced.totalMinutes} min); the TREND arrow shows the recent-form direction vs career
          (▲ up / ▼ down), green = better / red = worse for the fighter.
          {med && <> DIV MED = median of this division’s {benchmark?.sample} ranked fighters — the peer baseline;
          a coloured value + badge (e.g. <span className="font-mono">8×</span>, <span className="font-mono">67%↓</span>)
          flags a stat that stands out sharply from it (gold = elite, green = strength, red = gap).</>}
          {' '}The last-5 numbers and opponent-adjusted read live in the fight-by-fight popup above.
        </p>
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

// Trend arrow only — direction the stat moved recently (▲ up / ▼ down / · flat);
// the colour shows whether that move is good or bad for the fighter. So for a
// "lower is better" stat like strikes absorbed, moving up is a red ▲. The
// magnitude deliberately isn't shown here — the fight-by-fight popup has it.
function DeltaChip({ delta, decimals = 1, higherIsBetter = true }: { delta: number | null; decimals?: number; higherIsBetter?: boolean }) {
  if (delta == null) return <span style={{ color: 'var(--text-muted)' }}>·</span>;
  const eps = decimals === 0 ? 0.5 : 0.05;
  const flat = Math.abs(delta) < eps;
  const up = delta > 0;
  const isGood = up ? higherIsBetter : !higherIsBetter;
  const color = flat ? 'var(--text-muted)' : isGood ? 'var(--accent-green)' : 'var(--accent-red-light)';
  const arrow = flat ? '·' : up ? '▲' : '▼';
  return (
    <span className="font-mono text-sm" style={{ color }} title={flat ? 'flat vs career' : up ? 'trending up vs career' : 'trending down vs career'}>
      {arrow}
    </span>
  );
}

function PaceRow({
  label, career, median, delta, deltaDecimals, feedsRanking, gridCls, standout, higherIsBetter = true,
}: {
  label: string;
  career: string;
  median?: string | null;
  delta: number | null;
  deltaDecimals?: number;
  feedsRanking?: boolean;
  gridCls: string;
  standout?: Standout | null;
  higherIsBetter?: boolean;
}) {
  // Elite strengths get the full row treatment (accent bar + faint tint);
  // other standouts just colour their CAREER value + badge. The inset box-shadow
  // draws the left bar without shifting the grid columns.
  const rowStyle = standout?.emphasize
    ? {
        backgroundColor: `color-mix(in srgb, ${standout.color} 9%, transparent)`,
        boxShadow: `inset 3px 0 0 ${standout.color}`,
      }
    : undefined;
  const labelColor = standout?.emphasize ? standout.color : 'var(--text-primary)';
  const careerColor = standout ? standout.color : 'var(--text-primary)';

  return (
    <div
      className={`grid ${gridCls} items-center gap-2 text-sm rounded ${standout?.emphasize ? '-mx-1.5 px-1.5 py-0.5' : ''}`}
      style={rowStyle}
    >
      <span className="flex items-center gap-1.5 min-w-0" style={{ color: labelColor }}>
        {feedsRanking && (
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--accent-red)' }} />
        )}
        <span className="truncate">{label}</span>
        {standout && (
          <span
            className="shrink-0 font-mono text-[9px] leading-none px-1 py-0.5 rounded"
            style={{ color: standout.color, backgroundColor: 'var(--bg-elevated)' }}
            title="vs the division ranked median"
          >
            {standout.badge}
          </span>
        )}
      </span>
      <span className="font-mono text-right" style={{ color: careerColor, fontWeight: standout ? 600 : 500 }}>{career}</span>
      {median != null && (
        <span className="font-mono text-right" style={{ color: 'var(--text-secondary)' }}>{median}</span>
      )}
      <span className="text-right"><DeltaChip delta={delta} decimals={deltaDecimals ?? 1} higherIsBetter={higherIsBetter} /></span>
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
