import Link from 'next/link';
import { buildProspectWatchlist, type ProspectEntry } from '@/lib/prospects';
import { RANKING_CONFIG } from '@/lib/rankingConfig';
import { shortDivision } from '@/lib/divisions';
import FighterAvatar from '@/components/FighterAvatar';
import DistinctionDecals from '@/components/DistinctionDecals';

export const revalidate = 86400;

const resultColor = (r: string) =>
  r === 'W' ? 'var(--accent-green)' : r === 'L' ? 'var(--accent-red-light)' : 'var(--text-muted)';

export default async function ProspectsPage() {
  const { prospects, newcomers } = await buildProspectWatchlist();

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl leading-none" style={{ color: 'var(--text-primary)' }}>
          PROSPECT WATCH
        </h1>
        <p className="text-xs mt-1.5 max-w-2xl" style={{ color: 'var(--text-muted)' }}>
          Fighters still inside the provisional-Elo window (≤{RANKING_CONFIG.prospects.maxUFCFights} UFC
          fights) with a winning record and a live schedule, ordered by rating. Climb rate = Elo gained
          per fight since debut — the engine treats these ratings as provisional, so read them as
          trajectory, not destination.
        </p>
      </div>

      <Section
        title="PROSPECTS"
        blurb="Young risers — still building a UFC record, ceiling unknown."
        entries={prospects}
        emptyLabel="No qualifying prospects right now."
      />

      <Section
        title="NEW TO THE UFC"
        blurb={`Established fighters inside their first UFC bouts — ${RANKING_CONFIG.prospects.veteranAgeYears}+ years old, or arriving on a long professional record. Strong fighters, but not prospects.`}
        entries={newcomers}
        emptyLabel="No established newcomers on the current roster."
      />
    </div>
  );
}

function Section({
  title, blurb, entries, emptyLabel,
}: { title: string; blurb: string; entries: ProspectEntry[]; emptyLabel: string }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="font-display text-xl sm:text-2xl leading-none" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h2>
        <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{entries.length}</span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{blurb}</span>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{emptyLabel}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {entries.map((p, i) => (
            <ProspectCard key={p.fighterId} p={p} index={i + 1} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProspectCard({ p, index }: { p: ProspectEntry; index: number }) {
  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-3">
        <span className="font-display text-xl w-7 text-right shrink-0" style={{ color: 'var(--text-muted)' }}>
          {index}
        </span>
        <FighterAvatar
          src={p.avatarUrl ?? undefined}
          name={p.fullName}
          sizeClass="w-11 h-11"
          initialsClass="text-xs"
          bg="var(--bg-elevated)"
          initialsColor="var(--text-secondary)"
        />
        <div className="flex-1 min-w-0">
          <Link
            href={`/fighter/${p.fighterId}`}
            className="text-sm font-medium hover:underline flex items-center gap-1.5"
            style={{ color: 'var(--text-primary)' }}
          >
            <span className="truncate">{p.fullName}</span>
            {p.flag && <span className="text-sm leading-none shrink-0">{p.flag}</span>}
            {p.distinctions.length > 0 && <DistinctionDecals distinctions={p.distinctions} max={2} size={13} />}
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            >
              {shortDivision(p.division)}
            </span>
            <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
              {p.ufcRecord} UFC
            </span>
            {p.age != null && (
              <span
                className="font-mono text-xs"
                style={{ color: p.age <= 27 ? 'var(--accent-green)' : p.age >= 33 ? 'var(--accent-gold)' : 'var(--text-secondary)' }}
                title={p.age <= 27 ? 'Young for the level — projection upside' : p.age >= 33 ? 'Old for a prospect — shorter runway' : undefined}
              >
                {p.age} yrs
              </span>
            )}
            {p.ourRank != null && p.ourRank <= 40 && (
              <span
                className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                style={{ color: 'var(--accent-red-light)', backgroundColor: 'rgba(210,10,10,0.16)' }}
              >
                our #{p.ourRank}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-sm" style={{ color: 'var(--text-primary)' }}>{p.elo}</div>
          <div className="font-mono text-[10px]" style={{ color: p.climbPerFight >= 0 ? 'var(--accent-green)' : 'var(--accent-red-light)' }}>
            {p.climbPerFight >= 0 ? '+' : ''}{p.climbPerFight}/fight
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 pl-10">
        {p.lastTwo.map((rf, i) => (
          <span key={i} className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            <span className="font-medium" style={{ color: resultColor(rf.result) }}>{rf.result}</span>
            {' '}· {rf.label}
          </span>
        ))}
        {p.preUFC && (
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Pre-UFC: <span className="font-mono">{p.preUFC.record}</span> over {p.preUFC.fights} fights outside the UFC
            {p.preUFC.ufcBoundBeaten > 0 && (
              <>
                {' · '}beat <span className="font-mono">{p.preUFC.ufcBoundBeaten}</span> future UFC fighter{p.preUFC.ufcBoundBeaten > 1 ? 's' : ''}
                {p.preUFC.bestScalp ? ` (incl. ${p.preUFC.bestScalp})` : ''}
              </>
            )}
          </span>
        )}
        {p.nextFight && (
          <span className="text-[11px]" style={{ color: 'var(--accent-red-light)' }}>
            Next: vs {p.nextFight.opponentName}
            {p.nextFight.eventDate ? ` · ${p.nextFight.eventDate}` : ''}
            {p.nextFight.isMainEvent && <span style={{ color: 'var(--accent-gold)' }}> · main event</span>}
          </span>
        )}
      </div>
    </div>
  );
}
