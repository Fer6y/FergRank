import type { AdvancedStats } from '@/lib/advancedStats';
import FormTimeline from './FormTimeline';

// Advanced, display-only fighter analytics for the profile page. Two sections:
// FORM & OUTPUT (timeline chart + pace-normalized rates) for the left column,
// DURABILITY & FINISHES for the right. A red dot marks the signals that feed
// the bounded ±30 metrics bonus — everything else is context only. None of
// this touches the Elo core.

function SectionShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[10px] tracking-widest mb-2.5" style={{ color: 'var(--text-muted)' }}>
        {title}
      </h2>
      <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        {children}
      </div>
    </section>
  );
}

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const pct = (n: number | null) => (n == null ? '—' : `${(n * 100).toFixed(0)}%`);

function DeltaChip({ delta, decimals = 1, suffix = '' }: { delta: number | null; decimals?: number; suffix?: string }) {
  if (delta == null) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const eps = decimals === 0 ? 0.5 : 0.05;
  const color = Math.abs(delta) < eps ? 'var(--text-muted)' : delta > 0 ? 'var(--accent-green)' : 'var(--accent-red-light)';
  const arrow = Math.abs(delta) < eps ? '·' : delta > 0 ? '▲' : '▼';
  return (
    <span className="font-mono text-xs" style={{ color }}>
      {arrow} {Math.abs(delta).toFixed(decimals)}{suffix}
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
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: 'var(--accent-red)' }}
          />
        )}
        <span className="truncate">{label}</span>
      </span>
      <span className="font-mono text-right" style={{ color: 'var(--text-muted)' }}>{career}</span>
      <span className="font-mono text-right" style={{ color: 'var(--text-primary)' }}>{recent}</span>
      <span className="text-right"><DeltaChip delta={delta} decimals={deltaDecimals ?? 1} /></span>
    </div>
  );
}

export function FormOutputSection({ advanced }: { advanced: AdvancedStats }) {
  const { career, recent, drift, timeline, rollingLanded } = advanced;

  // Headline: recent output vs career, as a percentage, when we have enough data.
  let headline: { text: string; color: string } | null = null;
  if (drift?.landedPctChange != null && Math.abs(drift.landedPctChange) >= 0.05) {
    const up = drift.landedPctChange > 0;
    headline = {
      text: `OUTPUT ${up ? '▲ UP' : '▼ DOWN'} ${Math.abs(drift.landedPctChange * 100).toFixed(0)}% VS CAREER`,
      color: up ? 'var(--accent-green)' : 'var(--accent-red-light)',
    };
  } else if (drift) {
    headline = { text: 'OUTPUT STEADY VS CAREER', color: 'var(--text-secondary)' };
  }

  return (
    <SectionShell title="FORM & OUTPUT · PER 15 MINUTES">
      {headline && (
        <div className="text-[11px] tracking-widest font-medium mb-2" style={{ color: headline.color }}>
          {headline.text}
        </div>
      )}

      {timeline.length >= 2 ? (
        <FormTimeline timeline={timeline} rolling={rollingLanded} careerAvg={career.landedPer15} />
      ) : (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Not enough charted fights to draw a form timeline.
        </p>
      )}

      <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
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
          = signal behind the bounded ±30 metrics bonus. Everything here is context —
          computed from {advanced.sampleFights} charted fights ({advanced.totalMinutes} min of cage time),
          entirely outside the Elo engine. Drift arrows point toward better (green) or worse (red) for the fighter.
        </p>
      </div>
    </SectionShell>
  );
}

export function DurabilitySection({ advanced }: { advanced: AdvancedStats }) {
  const d = advanced.durability;
  const neverFinished = d.timesFinished === 0;
  return (
    <SectionShell title="DURABILITY & FINISHES">
      <dl className="space-y-2 text-sm">
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
        <div className="flex items-center justify-between gap-3">
          <dt style={{ color: 'var(--text-muted)' }}>Strikes absorbed /15</dt>
          <dd className="font-mono" style={{ color: 'var(--text-primary)' }}>{fmt1(d.strikesAbsorbedPer15)}</dd>
        </div>
      </dl>

      {(advanced.finishWins.length > 0 || advanced.finishedBy.length > 0) && (
        <div className="grid grid-cols-2 gap-4 mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          <FinishList title="FINISHES BY" entries={advanced.finishWins} accent="var(--accent-red-light)" />
          <FinishList title="FINISHED BY" entries={advanced.finishedBy} accent="var(--text-muted)" />
        </div>
      )}
    </SectionShell>
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
