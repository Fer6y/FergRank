import Link from 'next/link';
import { buildLeaderboards, type LeaderEntry } from '@/lib/crossDivision';
import { shortDivision } from '@/lib/divisions';

export const revalidate = 86400;

const BOARDS: { key: keyof Awaited<ReturnType<typeof buildLeaderboards>>; title: string; blurb: string; accent: string }[] = [
  { key: 'finishers', title: 'Finishers', blurb: 'Highest finish rate (KO + submission)', accent: 'var(--accent-red-light)' },
  { key: 'knockouts', title: 'Knockout artists', blurb: 'KO rate + knockdowns per fight', accent: 'var(--accent-red)' },
  { key: 'submissions', title: 'Submission aces', blurb: 'Submission rate + attempts per fight', accent: 'var(--accent-blue)' },
  { key: 'strikers', title: 'Strikers', blurb: 'Accuracy + distance volume + knockdowns', accent: 'var(--accent-green)' },
  { key: 'grapplers', title: 'Grapplers', blurb: 'Takedowns + control + ground time', accent: 'var(--accent-blue)' },
];

export default async function LeaderboardsPage() {
  const boards = await buildLeaderboards(12);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl leading-none" style={{ color: 'var(--text-primary)' }}>
          LEADERBOARDS
        </h1>
        <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
          Specialty rankings across all divisions, over the ranked pool. Career stats normalized per fight.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {BOARDS.map((b) => (
          <Board key={b.key} title={b.title} blurb={b.blurb} accent={b.accent} entries={boards[b.key]} />
        ))}
      </div>
    </div>
  );
}

function Board({ title, blurb, accent, entries }: { title: string; blurb: string; accent: string; entries: LeaderEntry[] }) {
  return (
    <section className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      <div className="mb-3">
        <h2 className="font-display text-lg leading-none" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h2>
        <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
          {blurb}
        </p>
      </div>
      <div className="space-y-0.5">
        {entries.map((e, i) => (
          <Link
            key={e.fighterId}
            href={`/fighter/${e.fighterId}?d=${encodeURIComponent(e.division)}`}
            className="flex items-center gap-3 px-2 py-1.5 rounded-md transition-colors hover:bg-[var(--bg-card-hover)]"
          >
            <span className="font-mono text-xs w-5 text-right shrink-0" style={{ color: 'var(--text-muted)' }}>
              {i + 1}
            </span>
            <span className="flex-1 min-w-0 text-sm truncate" style={{ color: 'var(--text-primary)' }}>
              {e.fullName}
            </span>
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            >
              {shortDivision(e.division)}
            </span>
            <span className="font-mono text-xs w-16 text-right shrink-0" style={{ color: accent }}>
              {e.value}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
