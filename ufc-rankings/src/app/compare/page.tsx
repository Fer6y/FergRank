import Link from 'next/link';
import { winProbability } from '@/lib/eloEngine';
import { classifyStyle, formEloNudge, type PaceWindow, type ScheduleContext } from '@/lib/advancedStats';
import { getFighterProfile, type FighterProfile } from '@/lib/fighterProfile';
import { shortDivision } from '@/lib/divisions';
import ComparePicker from '@/components/ComparePicker';
import ProfileRadar from '@/components/ProfileRadar';
import GrappleRamp from '@/components/GrappleRamp';
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
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
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

// ── Plain-English style descriptor ──────────────────────────────────────────
// A one-line read of how a fighter fights, derived from their career pace
// profile (the same signals classifyStyle uses for opponent archetypes) plus a
// power/finishing tag. Display-only colour, never a scoring input.
function describeStyle(p: FighterProfile): string {
  const career = p.advanced?.career ?? null;
  const base = classifyStyle(career);

  const powerful = p.stats.koRate >= 0.45;
  const subThreat = p.stats.subRate >= 0.3;

  if (base === 'grappler') {
    const lead = subThreat ? 'Submission-hunting grappler' : 'Grappling-led — takedowns & control';
    return powerful ? `${lead}, with knockout power` : lead;
  }
  if (base === 'striker') {
    const highVol = career != null && career.landedPer15 >= 75;
    const lead = highVol ? 'High-volume distance striker' : 'Distance striker';
    return powerful ? `${lead} with knockout power` : `${lead}, points-and-pace`;
  }
  if (powerful && subThreat) return 'Well-rounded finisher — power and submissions';
  if (powerful) return 'Well-rounded with knockout power';
  if (subThreat) return 'Well-rounded with a submission game';
  return 'Well-rounded hybrid';
}

// The "current form" window: last 3 metric fights (the macro-trend window), with
// career as the fallback for fighters too thin to carry a 3-fight read.
function formWindow(p: FighterProfile): { w: PaceWindow | null; isForm: boolean } {
  const a = p.advanced;
  if (!a) return { w: null, isForm: false };
  if (a.last3) return { w: a.last3, isForm: true };
  return { w: a.career, isForm: false };
}

function Comparison({ pa, pb }: { pa: FighterProfile; pb: FighterProfile }) {
  const haveElo = pa.eloRating != null && pb.eloRating != null;

  const PROSPECT_MAX = 3;
  const provA = pa.fightCount <= PROSPECT_MAX;
  const provB = pb.fightCount <= PROSPECT_MAX;
  const prospectAny = provA || provB;
  const prospectNames = [provA ? pa.fullName : null, provB ? pb.fullName : null].filter(Boolean).join(' & ');

  const nudgeA = formEloNudge(pa.advanced?.drift);
  const nudgeB = formEloNudge(pb.advanced?.drift);
  const haveForm = haveElo && (nudgeA !== 0 || nudgeB !== 0);

  const winA = haveElo ? winProbability(pa.eloRating, pb.eloRating) : null;
  const winB = haveElo ? winProbability(pb.eloRating, pa.eloRating) : null;

  const fa = formWindow(pa);
  const fb = formWindow(pb);
  const formLabel = fa.isForm || fb.isForm ? 'CURRENT FORM · LAST 3' : 'CAREER';

  const sca = pa.scheduleContext;
  const scb = pb.scheduleContext;

  // Short (last-name) labels so every comparison box can name its two columns —
  // makes clear each box holds BOTH fighters, not the one above it.
  const lnA = pa.fullName.split(' ').slice(-1)[0];
  const lnB = pb.fullName.split(' ').slice(-1)[0];

  return (
    <div className="space-y-3">
      {/* Fighter identity — stacked horizontal rows, kept visually distinct from
          the side-by-side comparison boxes below */}
      <div className="space-y-2">
        <FighterHead p={pa} style={describeStyle(pa)} />
        <FighterHead p={pb} style={describeStyle(pb)} />
      </div>

      {/* ── Rating + Strength of schedule — side by side ── */}
      <div className="grid grid-cols-2 gap-3 items-stretch">
        <StatBlock
          title="RATING"
          className="h-full"
          nameA={lnA}
          nameB={lnB}
          rows={[
            { label: 'Core Elo', a: pa.eloRating, b: pb.eloRating, fmt: fmt0 },
            { label: 'Peak Elo', a: pa.eloPeak, b: pb.eloPeak, fmt: fmt0 },
            { label: 'Final rating', a: pa.ranked?.finalRating ?? null, b: pb.ranked?.finalRating ?? null, fmt: fmt1 },
          ]}
        />
        {/* Strength of schedule */}
        <div className="rounded-xl px-3 py-3 flex flex-col justify-center" style={cardStyle}>
          <div className="text-[10px] tracking-widest text-center mb-1.5" style={{ color: 'var(--accent-blue)' }}>
            STRENGTH OF SCHEDULE
          </div>
          <CompactSos a={sca} b={scb} sosA={pa.sos} sosB={pb.sos} nameA={lnA} nameB={lnB} />
        </div>
      </div>

      {/* ── Striking + Grappling — side by side ── */}
      <div className="grid grid-cols-2 gap-3 items-start">
      <StatBlock
        title="STRIKING"
        subtitle={formLabel}
        accent="var(--accent-red-light)"
        nameA={lnA}
        nameB={lnB}
        rows={[
          { label: 'Strikes landed /15', a: fa.w?.landedPer15 ?? null, b: fb.w?.landedPer15 ?? null, fmt: fmt1 },
          { label: 'Strikes absorbed /15', a: fa.w?.absorbedPer15 ?? null, b: fb.w?.absorbedPer15 ?? null, fmt: fmt1, lowerIsBetter: true },
          { label: 'Strike differential /15', a: fa.w?.diffPer15 ?? null, b: fb.w?.diffPer15 ?? null, fmt: fmt1 },
          { label: 'Sig. accuracy', a: fa.w?.sigAccuracy ?? null, b: fb.w?.sigAccuracy ?? null, fmt: pctFmt },
          { label: 'Knockdowns /15', a: fa.w?.kdPer15 ?? null, b: fb.w?.kdPer15 ?? null, fmt: fmt2 },
          { label: 'Output vs schedule', a: sca?.landedVsExpected ?? null, b: scb?.landedVsExpected ?? null, fmt: ratioPct, hint: 'landed vs what this slate normally concedes — >100% out-lands the schedule' },
          { label: 'KO rate (career)', a: pa.stats.koRate, b: pb.stats.koRate, fmt: pctFmt },
        ]}
      />

      <StatBlock
        title="GRAPPLING"
        subtitle={formLabel}
        accent="var(--accent-blue)"
        nameA={lnA}
        nameB={lnB}
        rows={[
          { label: 'Takedowns /15', a: fa.w?.tdPer15 ?? null, b: fb.w?.tdPer15 ?? null, fmt: fmt1 },
          { label: 'Takedowns conceded /15', a: fa.w?.tdAbsorbedPer15 ?? null, b: fb.w?.tdAbsorbedPer15 ?? null, fmt: fmt1, lowerIsBetter: true },
          { label: 'Sub attempts /15', a: fa.w?.subAttPer15 ?? null, b: fb.w?.subAttPer15 ?? null, fmt: fmt1 },
          { label: 'Control share', a: fa.w?.ctrlSharePct ?? null, b: fb.w?.ctrlSharePct ?? null, fmt: (v) => `${fmt1(v)}%` },
          { label: 'Defence vs schedule', a: sca?.absorbedVsExpected ?? null, b: scb?.absorbedVsExpected ?? null, fmt: ratioPct, lowerIsBetter: true, hint: 'absorbed vs what these opponents normally land — <100% is stingier than the schedule' },
          { label: 'Sub rate (career)', a: pa.stats.subRate, b: pb.stats.subRate, fmt: pctFmt },
        ]}
      />
      </div>

      {/* ── Win probability — smaller box beneath ── */}
      {haveElo && (
        <div className="rounded-xl px-4 py-3 max-w-md mx-auto w-full" style={cardStyle}>
          <div className="text-[10px] tracking-widest text-center mb-1.5" style={{ color: 'var(--text-muted)' }}>
            WIN PROBABILITY
          </div>
          <div className="grid grid-cols-[1fr_1fr] gap-2 mb-1">
            <span className="text-left text-[9px] uppercase tracking-wider font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>{lnA}</span>
            <span className="text-right text-[9px] uppercase tracking-wider font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>{lnB}</span>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="text-right font-mono text-2xl leading-none"
              style={{ color: (winA ?? 0) >= (winB ?? 0) ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
              {pctFmt(winA)}
            </div>
            <div className="font-display text-xs" style={{ color: 'var(--text-muted)' }}>VS</div>
            <div className="text-left font-mono text-2xl leading-none"
              style={{ color: (winB ?? 0) > (winA ?? 0) ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
              {pctFmt(winB)}
            </div>
          </div>
          {haveForm && (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mt-1.5 text-[10px]">
              <div className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                {pctFmt(winProbability(pa.eloRating + nudgeA, pb.eloRating + nudgeB))}
              </div>
              <div className="uppercase tracking-wide text-center" style={{ color: 'var(--text-muted)' }}>form-adj</div>
              <div className="text-left font-mono" style={{ color: 'var(--text-secondary)' }}>
                {pctFmt(winProbability(pb.eloRating + nudgeB, pa.eloRating + nudgeA))}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] leading-snug px-1" style={{ color: 'var(--text-muted)' }}>
        {formLabel === 'CAREER'
          ? 'Striking & grappling shown over each fighter’s career (too few charted fights for a 3-fight form window).'
          : 'Striking & grappling shown over each fighter’s last 3 charted fights (current form). Output/Defence vs schedule adjust that form for who they faced — the strength-of-schedule modifier.'}
        {' '}Green = the better side of a stat; absorbed strikes and conceded takedowns count lower-is-better. Display-only — the win probability is the validated pure-Elo number.
      </p>

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

      {/* Grappling proficiency — one shared grey→blue ramp, a needle per corner
          (each ranked vs their own division's 3+-fight pool). Deep-blue vs
          near-grey reads "grappler vs striker" at a glance. Display-only. */}
      {pa.grapple && pb.grapple && (
        <div className="rounded-xl px-4 py-4" style={cardStyle}>
          <div className="text-[11px] tracking-widest mb-4" style={{ color: 'var(--text-secondary)' }}>
            GRAPPLING PROFICIENCY
          </div>
          <GrappleRamp
            height={16}
            showScaleLabels
            markers={[
              { percentile: pa.grapple.percentile, color: pa.grapple.color, label: lnA, sub: `p${pa.grapple.percentile}`, side: 'top' },
              { percentile: pb.grapple.percentile, color: pb.grapple.color, label: lnB, sub: `p${pb.grapple.percentile}`, side: 'bottom' },
            ]}
          />
          <p className="text-[10px] leading-snug mt-3" style={{ color: 'var(--text-muted)' }}>
            Takedowns, control &amp; ground share, each ranked against the fighter&apos;s own-division 3+-fight
            pool — a magnitude scale (how much grappler), not good/bad. Display-only.
          </p>
        </div>
      )}

      {/* Radars — the style portrait, kept at the bottom */}
      <div className="grid grid-cols-2 gap-3">
        {[pa, pb].map((p, i) => (
          <div key={i} className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-primary)', border: '1px dashed var(--border)' }}>
            <ProfileRadar radar={p.radar} />
          </div>
        ))}
      </div>
    </div>
  );
}

const cardStyle = { backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' } as const;

interface Row {
  label: string;
  a: number | null;
  b: number | null;
  fmt: (v: number) => string;
  lowerIsBetter?: boolean;
  hint?: string;
}

// A categorized head-to-head stat table: each row is A-value | label | B-value,
// with the better side tinted green. `lowerIsBetter` flips which side wins.
function StatBlock({ title, subtitle, accent, rows, className, nameA, nameB }: { title: string; subtitle?: string; accent?: string; rows: Row[]; className?: string; nameA?: string; nameB?: string }) {
  return (
    <div className={`rounded-xl overflow-hidden ${className ?? ''}`} style={cardStyle}>
      <div className="px-3 pt-2.5 pb-1.5">
        <div className="text-center">
          <div className="text-[10px] tracking-widest" style={{ color: accent ?? 'var(--text-secondary)' }}>{title}</div>
          {subtitle && <div className="text-[9px] tracking-widest mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</div>}
        </div>
        {(nameA || nameB) && (
          <div className="grid grid-cols-[1fr_1fr] gap-2 mt-1.5">
            <span className="text-left text-[9px] uppercase tracking-wider font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>{nameA}</span>
            <span className="text-right text-[9px] uppercase tracking-wider font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>{nameB}</span>
          </div>
        )}
      </div>
      {rows.map((r) => {
        const hasBoth = r.a != null && r.b != null;
        const aWins = hasBoth && (r.lowerIsBetter ? r.a! < r.b! : r.a! > r.b!);
        const bWins = hasBoth && (r.lowerIsBetter ? r.b! < r.a! : r.b! > r.a!);
        return (
          <div key={r.label} className="grid grid-cols-[auto_1fr_auto] items-center gap-2" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="text-left pl-3 py-2.5 font-mono text-base"
              style={{ color: aWins ? 'var(--accent-green)' : 'var(--text-primary)', fontWeight: aWins ? 600 : 400 }}>
              {r.a != null ? r.fmt(r.a) : '—'}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: 'var(--text-muted)' }} title={r.hint}>
              {r.label}
            </div>
            <div className="text-right pr-3 py-2.5 font-mono text-base"
              style={{ color: bWins ? 'var(--accent-green)' : 'var(--text-primary)', fontWeight: bWins ? 600 : 400 }}>
              {r.b != null ? r.fmt(r.b) : '—'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Compact strength-of-schedule head-to-head for the small box: mean recent
// opponent Elo (with step vs career) over the top, the 0–100 SoS score beneath.
function CompactSos({ a, b, sosA, sosB, nameA, nameB }: { a: ScheduleContext | null; b: ScheduleContext | null; sosA: number | null; sosB: number | null; nameA?: string; nameB?: string }) {
  const eloA = a?.oppEloRecent ?? null;
  const eloB = b?.oppEloRecent ?? null;
  return (
    <div>
      {(nameA || nameB) && (
        <div className="grid grid-cols-[1fr_1fr] gap-2 mb-1">
          <span className="text-left text-[9px] uppercase tracking-wider font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>{nameA}</span>
          <span className="text-right text-[9px] uppercase tracking-wider font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>{nameB}</span>
        </div>
      )}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <SosSide elo={eloA} step={a?.oppEloStep ?? null} win={eloA != null && eloB != null && eloA > eloB} align="right" />
        <div className="text-[9px] uppercase tracking-wide text-center leading-tight" style={{ color: 'var(--text-muted)' }}>
          mean<br />opp elo
        </div>
        <SosSide elo={eloB} step={b?.oppEloStep ?? null} win={eloA != null && eloB != null && eloB > eloA} align="left" />
      </div>
      {(sosA != null || sosB != null) && (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mt-1.5 text-[11px]" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.375rem' }}>
          <div className="text-right font-mono"
            style={{ color: sosA != null && sosB != null && sosA > sosB ? 'var(--accent-green)' : 'var(--text-primary)' }}>
            {sosA != null ? sosA.toFixed(1) : '—'}
          </div>
          <div className="text-[9px] uppercase tracking-wide text-center" style={{ color: 'var(--text-muted)' }}>SoS score</div>
          <div className="text-left font-mono"
            style={{ color: sosA != null && sosB != null && sosB > sosA ? 'var(--accent-green)' : 'var(--text-primary)' }}>
            {sosB != null ? sosB.toFixed(1) : '—'}
          </div>
        </div>
      )}
    </div>
  );
}

function SosSide({ elo, step, win, align }: { elo: number | null; step: number | null; win: boolean; align: 'left' | 'right' }) {
  const stepColor = step == null || Math.abs(step) < 15 ? 'var(--text-muted)' : step > 0 ? 'var(--accent-green)' : 'var(--text-secondary)';
  return (
    <div className={align === 'right' ? 'text-right' : 'text-left'}>
      <div className="font-mono text-lg leading-none" style={{ color: win ? 'var(--accent-green)' : 'var(--accent-blue)' }}>
        {elo != null ? Math.round(elo) : '—'}
      </div>
      {step != null && (
        <div className="font-mono text-[9px] mt-0.5" style={{ color: stepColor }}>
          {step > 0 ? '+' : ''}{step} vs career
        </div>
      )}
    </div>
  );
}

function FighterHead({ p, style }: { p: FighterProfile; style: string }) {
  return (
    <Link
      href={`/fighter/${p.fighterId}${p.division ? `?d=${encodeURIComponent(p.division)}` : ''}`}
      className="rounded-xl p-3 flex items-center gap-3 fighter-row"
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
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {p.flag && (
            <span className="shrink-0 leading-none" title={p.nationality ?? undefined}>{p.flag}</span>
          )}
          <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{p.fullName}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
            {p.division ? shortDivision(p.division) : shortDivision(p.weightClass)}
          </span>
          <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{p.record}</span>
          {p.age != null && (
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{p.ageApproximate ? '~' : ''}{p.age} yrs</span>
          )}
        </div>
        <div className="text-[11px] leading-snug mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>{style}</div>
      </div>
      <div className="shrink-0 text-right pl-2">
        <div className="text-[9px] tracking-widest" style={{ color: 'var(--text-muted)' }}>
          {p.isChampion ? 'CHAMP' : 'OUR RANK'}
        </div>
        <div className="font-display text-xl leading-none mt-0.5" style={{ color: p.isChampion ? 'var(--accent-gold)' : 'var(--text-primary)' }}>
          {p.isChampion ? 'C' : p.displayRank != null ? `#${p.displayRank}` : '—'}
        </div>
      </div>
    </Link>
  );
}

const fmt0 = (v: number) => v.toFixed(0);
const fmt1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const fmt2 = (v: number) => v.toFixed(2);
const pctFmt = (v: number | null) => (v == null ? '—' : `${Math.round((v > 1 ? v / 100 : v) * 100)}%`);
// Schedule-adjusted ratios are already on a 1.0 = 100% scale (not 0–1), so format
// them directly rather than through pctFmt's 0–1/0–100 heuristic.
const ratioPct = (v: number) => `${Math.round(v * 100)}%`;
