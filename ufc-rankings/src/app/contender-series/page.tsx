import Link from 'next/link';
import { loadDwcsAnalysis, type DwcsBucketRow } from '@/lib/loadDwcsAnalysis';

export const revalidate = 86400;

const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const elo = (x: number | null) => (x == null ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(1)}`);

export default function ContenderSeriesPage() {
  const data = loadDwcsAnalysis();

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="font-display text-3xl" style={{ color: 'var(--text-primary)' }}>CONTENDER SERIES</h1>
        <p className="text-sm mt-3" style={{ color: 'var(--text-muted)' }}>
          No analysis yet. Run <code>node_modules/.bin/jiti research/dwcs/exportDwcsAnalysis.ts</code> to generate it.
        </p>
      </div>
    );
  }

  const { summary, seasonTable, byResult, recordShape, tiers, topOrgs, odds, rankedGrads } = data;
  const maxRate = Math.max(...seasonTable.map((s) => s.contractRate ?? 0), 0.01);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl leading-none" style={{ color: 'var(--text-primary)' }}>
          CONTENDER SERIES
        </h1>
        <p className="text-xs mt-1.5 max-w-2xl" style={{ color: 'var(--text-muted)' }}>
          A tryout, not a promotion — what {summary.seasons} says about who makes it. Every DWCS bout we hold
          ({summary.bouts}), every participant ({summary.participants}) — including the ones who never reached
          the UFC — scored against what actually happened next.
        </p>
      </div>

      {/* headline tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Bouts" value={String(summary.bouts)} sub={summary.seasons} />
        <Stat label="Participants" value={String(summary.participants)} sub={`${summary.graduates} fought in the UFC`} />
        <Stat label="Fought-in-UFC rate" value={pct(summary.contractRate)} sub="of all participants" />
        <Stat label="Graduates now top-15" value={pct(summary.gradTop15Rate)} sub={`${rankedGrads.length} fighters`} accent />
      </div>

      {/* caveats */}
      <div
        className="rounded-lg px-3 py-2 text-[11px] leading-snug"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
      >
        Honest limits: &ldquo;fought in the UFC&rdquo; is a proxy (a contract winner who never fought doesn&rsquo;t
        count); top-15 is the <em>current</em> official board, so a graduate who was ranked and fell off scores as
        unranked; the bout list is frozen at Oct 2025 with its source; and pre-DWCS records exist only for fighters
        we can trace (~{Math.round((362 / summary.participants) * 100)}%) — the rest count in the denominator and
        nowhere else. Method + pre-registered hypotheses: <code>docs/plans/DWCS_PLAN.md</code>.
      </div>

      {/* H4 — the doorway */}
      <section>
        <SectionLabel>Winning isn&rsquo;t enough — HOW you win is the doorway</SectionLabel>
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          {byResult.map((r, i) => (
            <div key={r.label} className="flex items-center gap-3 px-3 py-2.5" style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <div className="w-32 text-sm" style={{ color: 'var(--text-primary)' }}>{r.label}</div>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(r.contractRate ?? 0) * 100}%`,
                    backgroundColor: i === 0 ? 'var(--accent-red)' : i === 1 ? 'var(--accent-gold)' : 'var(--text-muted)',
                  }}
                />
              </div>
              <div className="w-20 text-right font-mono text-sm" style={{ color: 'var(--text-primary)' }}>{pct(r.contractRate)}</div>
              <div className="w-14 text-right text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>n={r.n}</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
          Rate of participants who went on to fight in the UFC. A finish all but guarantees the call; lose on DWCS
          and the door mostly closes.
        </p>
      </section>

      {/* record shape */}
      <section>
        <SectionLabel>What the entrance résumé predicts (graduates only)</SectionLabel>
        <div className="grid sm:grid-cols-3 gap-3">
          <BucketTable title="Pre-DWCS losses" rows={recordShape.losses} />
          <BucketTable title="Age at DWCS" rows={recordShape.age} />
          <BucketTable title="Pre-DWCS experience" rows={recordShape.experience} />
        </div>
        <p className="text-[11px] mt-1.5 max-w-2xl" style={{ color: 'var(--text-muted)' }}>
          The 4-0 kid beats the 13-4 veteran on average: undefeated entrants reach the top 15 more and gain more Elo,
          and age is the strongest single signal — a 29+ entrant almost never becomes a contender. Sheer fight-count
          experience adds nothing once win rate is known.
        </p>
      </section>

      {/* seasons */}
      <section>
        <SectionLabel>Season by season — share of entrants who reached the UFC</SectionLabel>
        <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div className="flex items-end gap-1.5 h-24">
            {seasonTable.map((s) => (
              <div key={s.season} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>{pct(s.contractRate)}</div>
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${((s.contractRate ?? 0) / maxRate) * 64}px`,
                    backgroundColor: 'var(--accent-gold)',
                    opacity: 0.35 + 0.65 * ((s.contractRate ?? 0) / maxRate),
                  }}
                  title={`${s.season}: ${s.entrants} entrants, ${pct(s.contractRate)} fought in the UFC, ${s.top15} now top-15`}
                />
                <div className="text-[9px] font-mono" style={{ color: 'var(--text-secondary)' }}>&rsquo;{String(s.season).slice(2)}</div>
              </div>
            ))}
          </div>
          <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
            The 2024–25 bars run low because those cohorts are still arriving — a recent contract winner may simply
            not have debuted yet. They&rsquo;ll keep moving on each refresh.
          </p>
        </div>
      </section>

      {/* feeders */}
      <section>
        <SectionLabel>Where DWCS fighters come from</SectionLabel>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            {tiers.map((t, i) => (
              <Row3 key={t.label} border={i > 0}
                a={t.label === 'tier2_5' ? 'Major orgs (Bellator/ONE/PFL…)' : t.label === 'tier3' ? 'Strong regionals (LFA/CW/CFFC…)' : 'Other regionals'}
                b={`n=${t.n}`} c={`top-15 ${pct(t.top15Rate)}`} />
            ))}
          </div>
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            {topOrgs.slice(0, 6).map((o, i) => (
              <Row3 key={o.org} border={i > 0} a={o.org} b={`${o.n} graduates`} c={o.top15 ? `${o.top15} top-15` : '—'} />
            ))}
          </div>
        </div>
      </section>

      {/* odds (conditional) */}
      {odds && (
        <section>
          <SectionLabel>The betting market on DWCS</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Priced bouts" value={String(odds.n)} sub={odds.span} />
            <Stat label="Favourite win rate" value={pct(odds.favWinRate)} sub={`mean P(fav) ${pct(odds.meanPFav)}`} />
            <Stat label="Market accuracy" value={pct(odds.accuracy)} sub={`logloss ${odds.logLoss}`} />
            <Stat label="Coverage" value={`${Math.round((odds.coveredBouts / odds.totalBouts) * 100)}%`} sub="of all DWCS bouts" />
          </div>
          <p className="text-[11px] mt-1.5 max-w-2xl" style={{ color: 'var(--text-muted)' }}>
            Closing lines from BestFightOdds (2021 onward — earlier pages predate its current format). No model
            side exists here by design: DWCS bouts never enter our Elo. This is the market grading matchmaking —
            tryout cards are built <em>for</em> someone.
          </p>
        </section>
      )}

      {/* ranked graduates */}
      <section>
        <SectionLabel>Graduates on the official top 15 right now</SectionLabel>
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div className="flex flex-wrap gap-2 p-3">
            {rankedGrads.map((g) => (
              <Link
                key={g.ourId}
                href={`/fighter/${g.ourId}`}
                className="px-2.5 py-1 rounded-full text-xs hover:opacity-80"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              >
                {g.name} <span className="font-mono text-[10px]" style={{ color: 'var(--accent-gold)' }}>&rsquo;{String(g.dwcsYear).slice(2)}</span>
              </Link>
            ))}
          </div>
        </div>
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
          The pipeline&rsquo;s proof. Fresh DWCS graduates inside their provisional window appear on the{' '}
          <Link href="/prospects" className="underline" style={{ color: 'var(--text-secondary)' }}>prospect watchlist</Link>{' '}
          with a DWCS chip.
        </p>
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
      {children}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="font-display text-2xl leading-none mt-1" style={{ color: accent ? 'var(--accent-gold)' : 'var(--text-primary)' }}>
        {value}
      </div>
      {sub && <div className="text-[10px] mt-1 font-mono" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
}

function Row3({ a, b, c, border }: { a: string; b: string; c: string; border: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2" style={{ borderTop: border ? '1px solid var(--border)' : 'none' }}>
      <div className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{a}</div>
      <div className="flex gap-3 font-mono text-[11px] shrink-0">
        <span style={{ color: 'var(--text-muted)' }}>{b}</span>
        <span style={{ color: 'var(--text-secondary)' }}>{c}</span>
      </div>
    </div>
  );
}

function BucketTable({ title, rows }: { title: string; rows: DwcsBucketRow[] }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      <div className="px-3 pt-2.5 pb-1 text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{title}</div>
      {rows.map((r, i) => (
        <div key={r.label} className="flex items-center justify-between px-3 py-1.5" style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
          <div className="text-xs" style={{ color: 'var(--text-primary)' }}>{r.label}</div>
          <div className="flex gap-2.5 font-mono text-[11px]">
            <span title="reached the current official top 15" style={{ color: r.top15Rate != null && r.top15Rate >= 0.12 ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
              {pct(r.top15Rate)}
            </span>
            <span title="mean settled Elo gain" style={{ color: 'var(--text-muted)' }}>{r.meanEloGain == null ? '—' : elo(r.meanEloGain)}</span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>n={r.n}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
