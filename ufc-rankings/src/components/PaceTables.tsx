import type { AdvancedStats, RatioBenchmark } from '@/lib/advancedStats';

// ── Shared STRIKING | GRAPPLING pace grid ───────────────────────────────────
// The per-15 pace tables (CAREER vs DIV MED + a TREND arrow) used on both the
// fighter profile (AdvancedAnalytics Block B) and the compare page, one block
// per fighter. A red dot marks the signals that feed the bounded ±30 metrics
// bonus; nothing here touches the Elo core. Display-only.

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const pct = (n: number | null) => (n == null ? '—' : `${(n * 100).toFixed(0)}%`);
// Signed formatter for differential rows (net control, KD differential) — the
// leading + makes "who's ahead" legible at a glance.
const signed = (n: number, decimals: number, suffix = '') =>
  `${n > 0 ? '+' : ''}${n.toFixed(decimals)}${suffix}`;
// Colour a signed differential by sign, with a small dead-zone so a near-even
// stat stays neutral rather than flashing green/red on noise.
const signedColor = (v: number, deadzone: number) =>
  v > deadzone ? 'var(--accent-green)' : v < -deadzone ? 'var(--accent-red-light)' : 'var(--text-primary)';

// ── Standout vs the division median ────────────────────────────────────────
// Flags a pace stat that deviates significantly from the peer baseline (DIV
// MED) — the fighter's signature strength or a notable gap. Ratio-based so it
// works across wildly different scales (knockdowns ~0.4 vs strikes ~60). A
// strength above the median in the "good" direction pops (green, gold when
// elite, with a row accent); a gap is marked more subtly. Display-only.
export interface Standout {
  color: string;       // accent for the value + badge
  badge: string;       // e.g. "8.2×" (above median) or "67%↓" (below)
  emphasize: boolean;  // elite strength → row accent bar + faint tint
}

export function standoutOf(val: number | null | undefined, med: number | null | undefined, higherIsBetter: boolean): Standout | null {
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

export default function PaceTables({
  advanced,
  benchmark,
  footnote = true,
}: {
  advanced: AdvancedStats;
  benchmark: RatioBenchmark | null;
  footnote?: boolean;
}) {
  const { career, recent, drift } = advanced;
  // Division ranked-pool medians → the DIV MED column (peer baseline). Only
  // shown when the division has a benchmark (≥10 chartable ranked fighters).
  const med = benchmark?.pace ?? null;
  const paceGrid = med
    ? 'grid-cols-[1fr_64px_64px_40px]'
    : 'grid-cols-[1fr_64px_40px]';

  return (
    <>
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
            <PaceRow gridCls={paceGrid} label="Knockdown diff." career={signed(career.kdDiffPer15, 2)} median={med ? signed(med.kdDiffPer15, 2) : null} delta={recent ? Math.round((recent.kdDiffPer15 - career.kdDiffPer15) * 100) / 100 : null} deltaDecimals={2} valueColor={signedColor(career.kdDiffPer15, 0.1)} />
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
            <PaceRow gridCls={paceGrid} label="Sub attempts" feedsRanking career={fmt1(career.subAttPer15)} median={med ? fmt1(med.subAttPer15) : null} delta={recent ? Math.round((recent.subAttPer15 - career.subAttPer15) * 10) / 10 : null} standout={standoutOf(career.subAttPer15, med?.subAttPer15, true)} />
            <PaceRow gridCls={paceGrid} label="Net control" career={signed(career.netCtrlPct, 1, '%')} median={med ? signed(med.netCtrlPct, 1, '%') : null} delta={recent ? Math.round((recent.netCtrlPct - career.netCtrlPct) * 10) / 10 : null} valueColor={signedColor(career.netCtrlPct, 1.5)} />
          </div>
        </div>
      </div>
      {footnote && (
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
      )}
    </>
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
  label, career, median, delta, deltaDecimals, feedsRanking, gridCls, standout, valueColor, higherIsBetter = true,
}: {
  label: string;
  career: string;
  median?: string | null;
  delta: number | null;
  deltaDecimals?: number;
  feedsRanking?: boolean;
  gridCls: string;
  standout?: Standout | null;
  valueColor?: string;   // overrides the CAREER value colour when there's no standout (signed diff rows)
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
  const careerColor = standout ? standout.color : (valueColor ?? 'var(--text-primary)');

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
