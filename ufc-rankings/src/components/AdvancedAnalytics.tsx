import type { AdvancedStats, TrendInsight, RatioBenchmark } from '@/lib/advancedStats';
import FormTimeline from './FormTimeline';

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

export default function AdvancedAnalyticsSection({
  advanced,
  trendRead,
  benchmark,
}: {
  advanced: AdvancedStats;
  trendRead: TrendInsight[];
  benchmark: RatioBenchmark | null;
}) {
  const { career, recent, drift, timeline, rollingLanded } = advanced;

  return (
    <section>
      <h2 className="text-[10px] tracking-widest mb-2.5" style={{ color: 'var(--text-muted)' }}>
        ADVANCED ANALYTICS · PER 15 MIN OF CAGE TIME
      </h2>
      <div
        className="rounded-xl p-4 space-y-5"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        {/* Trend read — the interpretation layer */}
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

        {/* Timeline + ratio/durability */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3">
            {timeline.length >= 2 ? (
              <FormTimeline timeline={timeline} rolling={rollingLanded} careerAvg={career.landedPer15} />
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Not enough charted fights to draw a form timeline.
              </p>
            )}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <RatioPanel advanced={advanced} benchmark={benchmark} />
            <DurabilityPanel advanced={advanced} />
          </div>
        </div>

        {/* Pace table + finish anatomy */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="lg:col-span-3">
            <div className="grid grid-cols-[1fr_56px_56px_64px] gap-2 text-[10px] tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
              <span>PACE</span>
              <span className="text-right">CAREER</span>
              <span className="text-right">LAST {recent?.fights ?? '—'}</span>
              <span className="text-right">DRIFT</span>
            </div>
            <div className="space-y-1.5">
              <PaceRow label="Strikes landed" career={fmt1(career.landedPer15)} recent={recent ? fmt1(recent.landedPer15) : '—'} delta={drift?.landedPer15Delta ?? null} />
              <PaceRow label="Strikes absorbed" career={fmt1(career.absorbedPer15)} recent={recent ? fmt1(recent.absorbedPer15) : '—'} delta={recent ? -(recent.absorbedPer15 - career.absorbedPer15) : null} />
              <PaceRow label="Strike differential" feedsRanking career={fmt1(career.diffPer15)} recent={recent ? fmt1(recent.diffPer15) : '—'} delta={drift?.diffPer15Delta ?? null} />
              <PaceRow label="Sig. accuracy" feedsRanking career={pct(career.sigAccuracy)} recent={recent ? pct(recent.sigAccuracy) : '—'} delta={drift?.sigAccuracyDelta != null ? drift.sigAccuracyDelta * 100 : null} deltaDecimals={0} />
              <PaceRow label="Knockdowns" feedsRanking career={career.kdPer15.toFixed(2)} recent={recent ? recent.kdPer15.toFixed(2) : '—'} delta={recent ? Math.round((recent.kdPer15 - career.kdPer15) * 100) / 100 : null} deltaDecimals={2} />
              <PaceRow label="Takedowns" feedsRanking career={fmt1(career.tdPer15)} recent={recent ? fmt1(recent.tdPer15) : '—'} delta={drift?.tdPer15Delta ?? null} />
              <PaceRow label="Takedowns conceded" career={fmt1(career.tdAbsorbedPer15)} recent={recent ? fmt1(recent.tdAbsorbedPer15) : '—'} delta={recent ? -(recent.tdAbsorbedPer15 - career.tdAbsorbedPer15) : null} />
              <PaceRow label="Sub attempts" career={fmt1(career.subAttPer15)} recent={recent ? fmt1(recent.subAttPer15) : '—'} delta={recent ? Math.round((recent.subAttPer15 - career.subAttPer15) * 10) / 10 : null} />
              <PaceRow label="Control share" career={`${fmt1(career.ctrlSharePct)}%`} recent={recent ? `${fmt1(recent.ctrlSharePct)}%` : '—'} delta={recent ? Math.round((recent.ctrlSharePct - career.ctrlSharePct) * 10) / 10 : null} />
            </div>
            <p className="text-[10px] leading-snug mt-3" style={{ color: 'var(--text-muted)' }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ backgroundColor: 'var(--accent-red)' }} />
              = signal behind the bounded ±30 metrics bonus. Computed from {advanced.sampleFights} charted
              fights ({advanced.totalMinutes} min). Drift arrows point toward better (green) or worse (red) for the fighter.
            </p>
          </div>

          <div className="lg:col-span-2">
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
  const rows: { label: string; value: number | null; color: string }[] = [
    { label: 'Career', value: advanced.ratioCareer, color: 'var(--accent-red-light)' },
    { label: 'Last 3', value: advanced.ratioLast3, color: 'var(--accent-red)' },
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

function DeltaChip({ delta, decimals = 1 }: { delta: number | null; decimals?: number }) {
  if (delta == null) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const eps = decimals === 0 ? 0.5 : 0.05;
  const color = Math.abs(delta) < eps ? 'var(--text-muted)' : delta > 0 ? 'var(--accent-green)' : 'var(--accent-red-light)';
  const arrow = Math.abs(delta) < eps ? '·' : delta > 0 ? '▲' : '▼';
  return (
    <span className="font-mono text-xs" style={{ color }}>
      {arrow} {Math.abs(delta).toFixed(decimals)}
    </span>
  );
}

function PaceRow({
  label, career, recent, delta, deltaDecimals, feedsRanking,
}: {
  label: string;
  career: string;
  recent: string;
  delta: number | null;
  deltaDecimals?: number;
  feedsRanking?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_56px_56px_64px] items-center gap-2 text-sm">
      <span className="flex items-center gap-1.5 min-w-0" style={{ color: 'var(--text-secondary)' }}>
        {feedsRanking && (
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--accent-red)' }} />
        )}
        <span className="truncate">{label}</span>
      </span>
      <span className="font-mono text-right" style={{ color: 'var(--text-muted)' }}>{career}</span>
      <span className="font-mono text-right" style={{ color: 'var(--text-primary)' }}>{recent}</span>
      <span className="text-right"><DeltaChip delta={delta} decimals={deltaDecimals ?? 1} /></span>
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
