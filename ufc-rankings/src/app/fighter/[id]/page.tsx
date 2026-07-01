import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFighterProfile } from '@/lib/fighterProfile';
import { buildWhyThisRank } from '@/lib/fighterDisplay';
import ProfileRadar from '@/components/ProfileRadar';
import FighterAvatar from '@/components/FighterAvatar';
import { FormOutputSection, DurabilitySection } from '@/components/AdvancedAnalytics';

export const revalidate = 86400;

export default async function FighterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ d?: string }>;
}) {
  const { id } = await params;
  const { d } = await searchParams;
  const p = await getFighterProfile(id, d);
  if (!p) notFound();

  // Where "back" goes: to the division the user came from (the `d` hint, or the
  // fighter's own division) rather than the all-divisions homepage. Keeps
  // navigation linear — you return to the list you left.
  const backDivision = d || p.division;
  const backHref = backDivision ? `/division/${encodeURIComponent(backDivision)}` : '/';

  const ranked = p.ranked;
  const why = ranked ? buildWhyThisRank(ranked, p.history) : null;
  const officialNum = ranked && ranked.officialRank && ranked.officialRank !== 'C'
    ? parseInt(ranked.officialRank, 10)
    : null;
  const delta = officialNum != null && p.displayRank != null ? officialNum - p.displayRank : null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Breadcrumb */}
      <Link href={backHref} className="text-xs" style={{ color: 'var(--text-muted)' }}>
        ← {backDivision ? `${backDivision} rankings` : 'Rankings'}
      </Link>

      {/* Hero band */}
      <div
        className="rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        <FighterAvatar
          src={p.avatarUrl ?? undefined}
          name={p.fullName}
          sizeClass="w-20 h-20"
          initialsClass="text-xl"
          bg="var(--bg-elevated)"
          initialsColor={p.isChampion ? 'var(--accent-gold)' : 'var(--text-secondary)'}
          border={p.isChampion ? '2px solid var(--accent-gold)' : '2px solid var(--border-light)'}
        />

        <div className="flex-1 min-w-0">
          <h1 className="font-display text-3xl sm:text-4xl leading-none flex items-center gap-2.5" style={{ color: 'var(--text-primary)' }}>
            {p.flag && (
              <span className="text-3xl shrink-0 leading-none" title={p.nationality ?? undefined}>
                {p.flag}
              </span>
            )}
            <span className="truncate">{p.fullName}</span>
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {p.nickname && <span style={{ color: 'var(--text-muted)' }}>&quot;{p.nickname}&quot; · </span>}
            {p.division || p.weightClass} · <span className="font-mono">{p.record}</span> · {p.fightCount} UFC
          </p>
        </div>

        {/* Rank cards */}
        <div className="flex gap-2.5 shrink-0">
          {p.isChampion ? (
            <RankCard label="STATUS" value="C" color="var(--accent-gold)" />
          ) : p.displayRank != null ? (
            <>
              <RankCard label="OUR RANK" value={`${p.displayRank}`} color="var(--accent-red-light)" />
              <RankCard label="UFC OFFICIAL" value={ranked?.officialRank ?? 'NR'} color="var(--text-secondary)" />
              {delta != null && delta !== 0 && (
                <RankCard
                  label="DELTA"
                  value={`${delta > 0 ? '▲' : '▼'}${Math.abs(delta)}`}
                  color={delta > 0 ? 'var(--accent-green)' : 'var(--accent-red-light)'}
                />
              )}
            </>
          ) : (
            <RankCard label="STATUS" value="Unranked" color="var(--text-muted)" small />
          )}
        </div>
      </div>

      {/* Next scheduled bout (display-only; never affects the rank) */}
      {p.nextFight && (
        <div
          className="rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--accent-red)' }}
        >
          <span
            className="text-[10px] tracking-widest font-medium px-2 py-1 rounded shrink-0"
            style={{ backgroundColor: 'rgba(210,10,10,0.14)', color: 'var(--accent-red-light)' }}
          >
            NEXT FIGHT
          </span>
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
            vs{' '}
            {p.nextFight.opponentId ? (
              <Link
                href={`/fighter/${p.nextFight.opponentId}`}
                className="font-medium underline"
                style={{ textDecorationColor: 'var(--border-light)', textUnderlineOffset: '3px' }}
              >
                {p.nextFight.opponentName}
              </Link>
            ) : (
              <span className="font-medium">{p.nextFight.opponentName}</span>
            )}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {p.nextFight.isMainEvent && (
              <span style={{ color: 'var(--accent-gold)' }}>Main event · </span>
            )}
            {p.nextFight.weightClass}
          </span>
          <span className="text-xs font-mono ml-auto shrink-0" style={{ color: 'var(--text-secondary)' }}>
            {p.nextFight.eventName}
            {p.nextFight.eventDate ? ` · ${formatEventDate(p.nextFight.eventDate)}` : ''}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Left: why this rank + fight history */}
        <div className="lg:col-span-3 space-y-5">
          {why ? (
            <Section title="WHY THIS RANK">
              <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-primary)' }}>
                {why.headline}
              </p>
              {why.insights.length > 0 && (
                <ul className="space-y-2 mb-4">
                  {why.insights.map((ins, i) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-snug">
                      <span
                        className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            ins.kind === 'positive'
                              ? 'var(--accent-green)'
                              : ins.kind === 'negative'
                                ? 'var(--accent-red-light)'
                                : 'var(--text-muted)',
                        }}
                      />
                      <span style={{ color: 'var(--text-secondary)' }}>{ins.text}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div
                className="text-[10px] tracking-widest mb-2 pt-1"
                style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}
              >
                SCORE BREAKDOWN
              </div>
              <div className="space-y-2">
                <DecompRow label="Base Elo" value={why.parts[0].value} color={why.parts[0].color} isBase />
                {why.parts.slice(1).filter((pt) => pt.value !== 0).map((pt) => (
                  <DecompRow key={pt.label} label={pt.label} value={pt.value} color={pt.color} />
                ))}
                <div
                  className="flex items-center justify-between pt-2 mt-1"
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    Final rating
                  </span>
                  <span className="font-display text-xl" style={{ color: 'var(--text-primary)' }}>
                    {why.final.toFixed(1)}
                  </span>
                </div>
              </div>
            </Section>
          ) : (
            <Section title="RATING">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Not currently ranked in a division (needs 3+ recent UFC fights in one weight class).
                Core Elo: <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{p.eloRating}</span>
                {' '}(peak {p.eloPeak}).
              </p>
            </Section>
          )}

          {p.advanced && <FormOutputSection advanced={p.advanced} />}

          <Section title="FIGHT HISTORY">
            {p.history.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No dated fights on record.</p>
            ) : (
              <div className="space-y-1.5">
                {p.history.slice(0, 20).map((f, i) => {
                  const linkable = !!f.opponentId && !f.opponentId.startsWith('sd:');
                  const row = (
                    <>
                      <span
                        className="w-6 h-6 rounded flex items-center justify-center text-xs font-medium shrink-0"
                        style={{
                          backgroundColor:
                            f.result === 'W' ? 'rgba(45,212,126,0.18)' : f.result === 'L' ? 'rgba(255,45,45,0.14)' : 'var(--bg-elevated)',
                          color: f.result === 'W' ? 'var(--accent-green)' : f.result === 'L' ? 'var(--accent-red-light)' : 'var(--text-secondary)',
                        }}
                      >
                        {f.result}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-sm truncate"
                          style={{ color: 'var(--text-primary)', textDecoration: linkable ? 'underline' : undefined, textDecorationColor: 'var(--border-light)', textUnderlineOffset: '3px' }}
                        >
                          {f.opponentName || 'Unknown opponent'}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {formatMethod(f.method)}
                          {f.round ? ` · R${f.round}` : ''} · {new Date(f.date).getFullYear()}
                        </div>
                      </div>
                      <span
                        className="font-mono text-sm shrink-0"
                        style={{ color: f.delta >= 0 ? 'var(--accent-green)' : 'var(--accent-red-light)' }}
                        title="Elo change from this fight"
                      >
                        {f.delta >= 0 ? '+' : ''}{f.delta.toFixed(0)}
                      </span>
                    </>
                  );
                  const cls = 'flex items-center gap-3 px-3 py-2 rounded-lg';
                  const style = { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' };
                  return linkable ? (
                    <Link
                      key={f.fightId + i}
                      href={`/fighter/${f.opponentId}`}
                      className={`${cls} transition-colors hover:brightness-125`}
                      style={style}
                      title={`View ${f.opponentName}`}
                    >
                      {row}
                    </Link>
                  ) : (
                    <div key={f.fightId + i} className={cls} style={style}>
                      {row}
                    </div>
                  );
                })}
                {p.history.length > 20 && (
                  <p className="text-xs text-center pt-1" style={{ color: 'var(--text-muted)' }}>
                    + {p.history.length - 20} earlier fights
                  </p>
                )}
              </div>
            )}
          </Section>
        </div>

        {/* Right: radar + snapshot + community stub */}
        <div className="lg:col-span-2 space-y-5">
          <Section title="ATTRIBUTES">
            <ProfileRadar radar={p.radar} />
          </Section>

          {p.advanced && <DurabilitySection advanced={p.advanced} />}

          <Section title="SNAPSHOT">
            <dl className="space-y-2 text-sm">
              <Stat label="Strength of schedule" value={p.sos != null ? p.sos.toFixed(1) : '—'} />
              <Stat label="Peak Elo" value={`${p.eloPeak}`} />
              <Stat label="Current Elo" value={`${p.eloRating}`} />
              <Stat label="Months since last fight" value={`${p.monthsSinceLastFight}`} />
              <Stat label="Stance" value={p.stance || '—'} />
              <Stat label="Height" value={p.height || '—'} />
            </dl>
          </Section>

          <div
            className="rounded-xl p-4 text-center"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px dashed var(--border-light)' }}
          >
            <div className="text-[10px] tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
              COMMUNITY · COMING SOON
            </div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Confidence vote &amp; comments — shown beside the rank, never replacing it.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RankCard({ label, value, color, small }: { label: string; value: string; color: string; small?: boolean }) {
  return (
    <div
      className="rounded-lg px-3 py-2 text-center min-w-[68px]"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="text-[9px] tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className={`font-display leading-none mt-0.5 ${small ? 'text-sm py-1' : 'text-2xl'}`} style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[10px] tracking-widest mb-2.5" style={{ color: 'var(--text-muted)' }}>
        {title}
      </h2>
      <div
        className="rounded-xl p-4"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        {children}
      </div>
    </section>
  );
}

function DecompRow({ label, value, color, isBase }: { label: string; value: number; color: string; isBase?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: color }} />
      <span className="text-sm flex-1" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <span className="font-mono text-sm" style={{ color: 'var(--text-primary)' }}>
        {isBase ? value.toFixed(0) : `${value >= 0 ? '+' : ''}${value.toFixed(1)}`}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt style={{ color: 'var(--text-muted)' }}>{label}</dt>
      <dd className="font-mono" style={{ color: 'var(--text-primary)' }}>
        {value}
      </dd>
    </div>
  );
}

function formatEventDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMethod(method: string): string {
  const m = method.trim();
  const map: Record<string, string> = {
    'U-DEC': 'Decision (unanimous)',
    'S-DEC': 'Decision (split)',
    'M-DEC': 'Decision (majority)',
    SUB: 'Submission',
    'KO/TKO': 'KO/TKO',
  };
  return map[m] || m || 'Result';
}
