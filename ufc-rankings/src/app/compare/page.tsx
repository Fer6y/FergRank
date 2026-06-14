import Link from 'next/link';
import { winProbability } from '@/lib/eloEngine';
import OddsValue from '@/components/OddsValue';
import { getFighterProfile, type FighterProfile } from '@/lib/fighterProfile';
import { shortDivision } from '@/lib/divisions';
import ComparePicker from '@/components/ComparePicker';
import ProfileRadar from '@/components/ProfileRadar';
import FighterAvatar from '@/components/FighterAvatar';

export const revalidate = 86400;

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a, b } = await searchParams;
  const [pa, pb] = await Promise.all([
    a ? getFighterProfile(a) : Promise.resolve(null),
    b ? getFighterProfile(b) : Promise.resolve(null),
  ]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl leading-none" style={{ color: 'var(--text-primary)' }}>
          COMPARE
        </h1>
        <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
          Pick any two fighters for a side-by-side breakdown.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <ComparePicker slot="a" selectedName={pa?.fullName ?? null} a={a ?? null} b={b ?? null} />
        <span className="font-display text-lg shrink-0" style={{ color: 'var(--text-muted)' }}>
          VS
        </span>
        <ComparePicker slot="b" selectedName={pb?.fullName ?? null} a={a ?? null} b={b ?? null} />
      </div>

      {pa && pb ? (
        <Comparison pa={pa} pb={pb} />
      ) : (
        <div
          className="rounded-xl py-12 text-center text-sm"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px dashed var(--border-light)', color: 'var(--text-muted)' }}
        >
          Select two fighters above to compare them.
        </div>
      )}
    </div>
  );
}

function Comparison({ pa, pb }: { pa: FighterProfile; pb: FighterProfile }) {
  // Calibrated head-to-head win probability from each fighter's core Elo (the
  // predictor). winProbability uses the validated /400 scale; the two sum to 100%.
  const haveElo = pa.eloRating != null && pb.eloRating != null;

  // Prospect flag: a fighter with ≤3 UFC fights has a thin (but earned) sample,
  // so the model's read is ranked on merit yet less certain — especially at the
  // very top. Positive framing, display-only (no ranking-math change).
  const PROSPECT_MAX = 3;
  const provA = pa.fightCount <= PROSPECT_MAX;
  const provB = pb.fightCount <= PROSPECT_MAX;
  const prospectAny = provA || provB;
  const prospectNames = [provA ? pa.fullName : null, provB ? pb.fullName : null].filter(Boolean).join(' & ');
  const rows: { label: string; a: number | null; b: number | null; fmt: (v: number) => string }[] = [
    { label: 'Win probability', a: haveElo ? winProbability(pa.eloRating, pb.eloRating) : null, b: haveElo ? winProbability(pb.eloRating, pa.eloRating) : null, fmt: pctFmt },
    { label: 'Final rating', a: pa.ranked?.finalRating ?? null, b: pb.ranked?.finalRating ?? null, fmt: (v) => v.toFixed(1) },
    { label: 'Core Elo', a: pa.eloRating, b: pb.eloRating, fmt: (v) => v.toFixed(0) },
    { label: 'Peak Elo', a: pa.eloPeak, b: pb.eloPeak, fmt: (v) => v.toFixed(0) },
    { label: 'Strength of schedule', a: pa.sos, b: pb.sos, fmt: (v) => v.toFixed(1) },
    { label: 'Finish rate', a: pa.stats.finishRate, b: pb.stats.finishRate, fmt: pctFmt },
    { label: 'KO rate', a: pa.stats.koRate, b: pb.stats.koRate, fmt: pctFmt },
    { label: 'Submission rate', a: pa.stats.subRate, b: pb.stats.subRate, fmt: pctFmt },
    { label: 'Strike accuracy', a: pa.stats.sigStrikeAccuracy, b: pb.stats.sigStrikeAccuracy, fmt: pctFmt },
  ];

  return (
    <div className="space-y-5">
      {/* Header cards */}
      <div className="grid grid-cols-2 gap-3">
        <FighterHead p={pa} />
        <FighterHead p={pb} />
      </div>

      {/* Radars */}
      <div className="grid grid-cols-2 gap-3">
        {[pa, pb].map((p, i) => (
          <div key={i} className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <ProfileRadar radar={p.radar} />
          </div>
        ))}
      </div>

      {/* Stat table */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        {rows.map((r) => {
          const aWins = r.a != null && r.b != null && r.a > r.b;
          const bWins = r.a != null && r.b != null && r.b > r.a;
          return (
            <div key={r.label} className="grid grid-cols-[1fr_auto_1fr] items-center" style={{ borderBottom: '1px solid var(--border)' }}>
              <div
                className="text-right px-3 py-2.5 font-mono text-sm"
                style={{ color: aWins ? 'var(--accent-green)' : 'var(--text-primary)', fontWeight: aWins ? 500 : 400 }}
              >
                {r.a != null ? r.fmt(r.a) : '—'}
              </div>
              <div className="px-3 text-[10px] uppercase tracking-wide text-center" style={{ color: 'var(--text-muted)' }}>
                {r.label}
              </div>
              <div
                className="text-left px-3 py-2.5 font-mono text-sm"
                style={{ color: bWins ? 'var(--accent-green)' : 'var(--text-primary)', fontWeight: bWins ? 500 : 400 }}
              >
                {r.b != null ? r.fmt(r.b) : '—'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Prospect flag — the model still gives its read, framed as upside */}
      {prospectAny && (
        <div
          className="flex items-start gap-2 rounded-lg px-3 py-2"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--accent-gold)' }}
        >
          <span className="text-xs font-medium shrink-0" style={{ color: 'var(--accent-gold)' }}>★ Prospect</span>
          <span className="text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
            {prospectNames} {provA && provB ? 'have' : 'has'} ≤{PROSPECT_MAX} UFC fights — the read is on earned merit, but the sample is thin, so trust it less at the very top.
          </span>
        </div>
      )}

      {/* Odds value check — compare the model's win% to a market line you enter */}
      {haveElo && (
        <OddsValue
          modelProbA={winProbability(pa.eloRating, pb.eloRating)}
          nameA={pa.fullName}
          nameB={pb.fullName}
          lowConfidence={prospectAny}
        />
      )}
    </div>
  );
}

function FighterHead({ p }: { p: FighterProfile }) {
  return (
    <Link
      href={`/fighter/${p.fighterId}${p.division ? `?d=${encodeURIComponent(p.division)}` : ''}`}
      className="rounded-xl p-4 flex flex-col items-center text-center gap-2 fighter-row"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <FighterAvatar
        src={p.avatarUrl ?? undefined}
        name={p.fullName}
        sizeClass="w-14 h-14"
        initialsClass="text-base"
        bg="var(--bg-elevated)"
        initialsColor={p.isChampion ? 'var(--accent-gold)' : 'var(--text-secondary)'}
        border={p.isChampion ? '2px solid var(--accent-gold)' : undefined}
      />
      <div className="font-medium text-sm flex items-center justify-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
        {p.flag && (
          <span className="shrink-0 leading-none" title={p.nationality ?? undefined}>
            {p.flag}
          </span>
        )}
        <span>{p.fullName}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
          {p.division ? shortDivision(p.division) : shortDivision(p.weightClass)}
        </span>
        <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
          {p.record}
        </span>
      </div>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {p.isChampion ? 'Champion' : p.displayRank != null ? `Our #${p.displayRank}` : 'Unranked'}
      </div>
    </Link>
  );
}

const pctFmt = (v: number) => `${Math.round((v > 1 ? v / 100 : v) * 100)}%`;
