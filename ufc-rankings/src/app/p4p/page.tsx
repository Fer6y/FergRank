import Link from 'next/link';
import { buildP4P } from '@/lib/crossDivision';
import { initials } from '@/lib/fighterDisplay';
import { shortDivision } from '@/lib/divisions';

export const revalidate = 86400;

export default async function P4PPage() {
  const entries = await buildP4P(30);
  const maxScore = entries[0]?.rankScore || 100;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl leading-none" style={{ color: 'var(--text-primary)' }}>
          POUND FOR POUND
        </h1>
        <p className="text-xs mt-1.5 max-w-2xl" style={{ color: 'var(--text-muted)' }}>
          One global Elo pool spans every division, so these ratings compare directly across weight classes.
          Beating elite opposition in a deep division is what carries a fighter up this list.
        </p>
      </div>

      <div className="space-y-1.5">
        {entries.map((e) => (
          <Link
            key={e.fighterId}
            href={`/fighter/${e.fighterId}?d=${encodeURIComponent(e.division)}`}
            className="fighter-row flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: e.rank <= 5 ? 'var(--border-light)' : 'var(--border)',
            }}
          >
            <div
              className={`font-display w-9 text-center text-2xl leading-none shrink-0 ${e.rank <= 5 ? 'rank-glow' : ''}`}
              style={{ color: e.rank <= 5 ? 'var(--accent-red-light)' : e.rank <= 15 ? 'var(--text-primary)' : 'var(--text-secondary)' }}
            >
              {e.rank}
            </div>

            <div
              className="hidden sm:flex w-10 h-10 rounded-full shrink-0 items-center justify-center text-xs font-medium"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                color: e.isChampion ? 'var(--accent-gold)' : 'var(--text-muted)',
                border: e.isChampion ? '1.5px solid var(--accent-gold)' : 'none',
              }}
              aria-hidden
            >
              {initials(e.fullName)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                  {e.fullName}
                </span>
                {e.isChampion && (
                  <span className="text-[10px] shrink-0" style={{ color: 'var(--accent-gold)' }} title="Division champion">
                    ★
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
                  style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                >
                  {shortDivision(e.division)}
                </span>
                <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                  {e.record}
                </span>
              </div>
            </div>

            <div className="hidden lg:block text-center min-w-[48px] shrink-0">
              <div className="text-xs font-medium font-mono" style={{ color: 'var(--accent-blue)' }}>
                {e.strengthOfSchedule.toFixed(1)}
              </div>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                SoS
              </div>
            </div>

            <div className="w-20 sm:w-28 shrink-0 text-right">
              <div className="font-display text-xl leading-none" style={{ color: e.rank <= 5 ? 'var(--accent-red-light)' : 'var(--text-primary)' }}>
                {e.rankScore.toFixed(1)}
              </div>
              <div className="h-1 mt-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--score-bar-bg)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(e.rankScore / maxScore) * 100}%`, backgroundColor: e.rank <= 5 ? 'var(--accent-red)' : 'var(--accent-red-light)' }}
                />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
