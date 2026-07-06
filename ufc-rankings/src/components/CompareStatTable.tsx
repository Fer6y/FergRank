import type { FighterProfile } from '@/lib/fighterProfile';
import type { PaceWindow, PaceMedians } from '@/lib/advancedStats';
import { standoutOf, type Standout } from './PaceTables';

// A fighter's own pace window and the division medians share the fields we read
// here, so a structural union lets one `pick` fetch from either.
type PaceLike = PaceWindow | PaceMedians;

// ── Shared head-to-head striking & grappling card ───────────────────────────
// One card, both fighters labelled on each side, their per-15 career pace
// mirrored across a centre label. Each side's value is coloured/badged by how
// it stands out against THAT fighter's own division median (gold = elite,
// green = strength, red = gap) — the same standout read the profile uses.
// Display-only; never touches the rank.

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const fmt2 = (n: number) => n.toFixed(2);
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
const signed = (n: number, decimals: number, suffix = '') => `${n > 0 ? '+' : ''}${n.toFixed(decimals)}${suffix}`;
const signedColor = (v: number, deadzone: number) =>
  v > deadzone ? 'var(--accent-green)' : v < -deadzone ? 'var(--accent-red-light)' : 'var(--text-primary)';

interface StatDef {
  label: string;
  short: string;              // compact key for the division-median subtitle
  pick: (w: PaceLike) => number | null;
  fmt: (n: number) => string;
  higherIsBetter?: boolean;   // for the standout direction
  signedDeadzone?: number;    // if set, colour by sign instead of standout (diff rows)
}

const STRIKING: StatDef[] = [
  { label: 'Strikes landed', short: 'landed', pick: (w) => w.landedPer15, fmt: fmt1 },
  { label: 'Strikes absorbed', short: 'absorbed', pick: (w) => w.absorbedPer15, fmt: fmt1, higherIsBetter: false },
  { label: 'Strike differential', short: 'diff', pick: (w) => w.diffPer15, fmt: fmt1 },
  { label: 'Sig. accuracy', short: 'acc', pick: (w) => w.sigAccuracy, fmt: pct },
  { label: 'Knockdowns', short: 'kd', pick: (w) => w.kdPer15, fmt: fmt2 },
  { label: 'Knockdown diff.', short: 'kd diff', pick: (w) => w.kdDiffPer15, fmt: (n) => signed(n, 2), signedDeadzone: 0.1 },
];

const GRAPPLING: StatDef[] = [
  { label: 'Takedowns', short: 'td', pick: (w) => w.tdPer15, fmt: fmt1 },
  { label: 'Takedowns conceded', short: 'td conc.', pick: (w) => w.tdAbsorbedPer15, fmt: fmt1, higherIsBetter: false },
  { label: 'Sub attempts', short: 'sub att.', pick: (w) => w.subAttPer15, fmt: fmt1 },
  { label: 'Net control', short: 'net ctrl', pick: (w) => w.netCtrlPct, fmt: (n) => signed(n, 1, '%'), signedDeadzone: 1.5 },
];

const cardStyle = { backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' } as const;

export default function CompareStatTable({ pa, pb }: { pa: FighterProfile; pb: FighterProfile }) {
  const careerA = pa.advanced?.career ?? null;
  const careerB = pb.advanced?.career ?? null;
  if (!careerA || !careerB) return null;
  const medA = pa.divisionBenchmark?.pace ?? null;
  const medB = pb.divisionBenchmark?.pace ?? null;
  // A single faded divisional baseline down the centre only makes sense when
  // both fighters share a division — otherwise the two medians differ and one
  // number wouldn't apply to both. (Per-side standouts still use each own median.)
  const sameDivision = pa.division != null && pa.division === pb.division;
  const sharedMed = sameDivision ? (medA ?? medB) : null;

  // Identity colours mirror the shared gauntlet: higher-Elo fighter = red, lower = blue.
  const aIsHi = pa.eloRating >= pb.eloRating;
  const colorA = aIsHi ? 'var(--accent-red)' : 'var(--accent-blue)';
  const colorB = aIsHi ? 'var(--accent-blue)' : 'var(--accent-red)';
  const lnA = pa.fullName.split(' ').slice(-1)[0];
  const lnB = pb.fullName.split(' ').slice(-1)[0];

  return (
    <div className="rounded-xl p-4" style={cardStyle}>
      {/* Fighter labels — clearly name each side */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 pb-3 mb-1" style={{ borderBottom: '1px solid var(--border)' }}>
        <NameSide name={pa.fullName} color={colorA} align="right" />
        <span className="font-display text-sm px-2" style={{ color: 'var(--text-muted)' }}>VS</span>
        <NameSide name={pb.fullName} color={colorB} align="left" />
      </div>

      <Section title="STRIKING" accent="var(--accent-red-light)" defs={STRIKING} careerA={careerA} careerB={careerB} medA={medA} medB={medB} sharedMed={sharedMed} lnA={lnA} lnB={lnB} />
      <div className="mt-4">
        <Section title="GRAPPLING" accent="var(--accent-blue)" defs={GRAPPLING} careerA={careerA} careerB={careerB} medA={medA} medB={medB} sharedMed={sharedMed} lnA={lnA} lnB={lnB} />
      </div>

      <p className="text-[10px] leading-snug mt-4" style={{ color: 'var(--text-muted)' }}>
        Per-15 career pace, each fighter&apos;s stats mirrored across the label.
        {sharedMed && <> The faded line under each category header is the division median.</>} A coloured value + badge
        (e.g. <span className="font-mono">8×</span>, <span className="font-mono">67%↓</span>) flags a stat that stands
        out sharply from that fighter&apos;s own division median — gold = elite, green = strength, red = gap.
        Display-only — never touches the rank.
      </p>
    </div>
  );
}

function NameSide({ name, color, align }: { name: string; color: string; align: 'left' | 'right' }) {
  return (
    <div className={`flex items-center gap-1.5 min-w-0 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
      {align === 'left' && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />}
      <span className="font-display text-base leading-none truncate" style={{ color: 'var(--text-primary)' }}>{name}</span>
      {align === 'right' && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />}
    </div>
  );
}

function Section({
  title, accent, defs, careerA, careerB, medA, medB, sharedMed, lnA, lnB,
}: {
  title: string;
  accent: string;
  defs: StatDef[];
  careerA: PaceWindow;
  careerB: PaceWindow;
  medA: PaceMedians | null;
  medB: PaceMedians | null;
  sharedMed: PaceMedians | null;
  lnA: string;
  lnB: string;
}) {
  return (
    <div>
      {/* Section header: centred title with the division-median line as a faded
          subtitle right beneath it; fighter last-names over their columns. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 mb-2">
        <span className="text-left truncate text-[10px] tracking-wider font-medium pt-0.5" style={{ color: 'var(--text-secondary)' }}>{lnA}</span>
        <span className="flex flex-col items-center px-2" style={{ minWidth: '9rem' }}>
          <span className="text-[10px] tracking-wider font-medium whitespace-nowrap" style={{ color: accent }}>{title}</span>
          {sharedMed && (
            <span className="font-mono text-[9px] leading-snug text-center mt-0.5" style={{ color: 'var(--text-muted)', opacity: 0.6 }} title="division median">
              div median · {defs.map((d) => {
                const m = d.pick(sharedMed);
                return m != null ? `${d.short} ${d.fmt(m)}` : null;
              }).filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
        <span className="text-right truncate text-[10px] tracking-wider font-medium pt-0.5" style={{ color: 'var(--text-secondary)' }}>{lnB}</span>
      </div>
      <div>
        {defs.map((d, i) => {
          const va = d.pick(careerA);
          const vb = d.pick(careerB);
          const stdA = va != null && d.signedDeadzone == null ? standoutOf(va, medA ? d.pick(medA) : null, d.higherIsBetter ?? true) : null;
          const stdB = vb != null && d.signedDeadzone == null ? standoutOf(vb, medB ? d.pick(medB) : null, d.higherIsBetter ?? true) : null;
          const colA = va != null && d.signedDeadzone != null ? signedColor(va, d.signedDeadzone) : undefined;
          const colB = vb != null && d.signedDeadzone != null ? signedColor(vb, d.signedDeadzone) : undefined;
          return (
            <div
              key={d.label}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-1.5"
              style={i > 0 ? { borderTop: '1px solid var(--border)' } : undefined}
            >
              {/* Fighter A hugs the left edge, badge faces inward */}
              <ValueCell value={va != null ? d.fmt(va) : '—'} standout={stdA} valueColor={colA} align="left" />
              <span className="text-[10px] uppercase tracking-wide text-center leading-tight whitespace-nowrap px-2" style={{ color: 'var(--text-muted)', minWidth: '9rem' }}>
                {d.label}
              </span>
              {/* Fighter B hugs the right edge, badge faces inward */}
              <ValueCell value={vb != null ? d.fmt(vb) : '—'} standout={stdB} valueColor={colB} align="right" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ValueCell({ value, standout, valueColor, align }: { value: string; standout: Standout | null; valueColor?: string; align: 'left' | 'right' }) {
  const color = standout ? standout.color : (valueColor ?? 'var(--text-primary)');
  const badge = standout && (
    <span
      className="shrink-0 font-mono text-[9px] leading-none px-1 py-0.5 rounded"
      style={{ color: standout.color, backgroundColor: 'var(--bg-elevated)' }}
      title="vs the division ranked median"
    >
      {standout.badge}
    </span>
  );
  return (
    <div className={`flex items-center gap-2 min-w-0 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
      {align === 'right' && badge}
      <span className="font-mono text-xl" style={{ color, fontWeight: standout ? 600 : 500 }}>{value}</span>
      {align === 'left' && badge}
    </div>
  );
}
