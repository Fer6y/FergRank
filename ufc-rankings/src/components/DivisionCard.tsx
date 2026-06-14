import Link from 'next/link';
import type { DashboardDivision } from '@/app/api/dashboard/route';
import { shortDivision } from '@/lib/divisions';
import FighterPill from './FighterPill';

interface DivisionCardProps {
  data: DashboardDivision;
}

// One division at a glance: header (links to the full ranking), the reigning
// champion, then the top contenders as condensed pills.
export default function DivisionCard({ data }: DivisionCardProps) {
  const { division, champion, fighters } = data;
  const href = `/division/${encodeURIComponent(division)}`;

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
    >
      {/* Header */}
      <Link
        href={href}
        className="flex items-center justify-between gap-2 px-3.5 py-3 group"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className="font-display text-lg leading-none tracking-wide truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {division}
          </span>
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0"
            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
          >
            {shortDivision(division)}
          </span>
        </div>
        <span
          className="text-[11px] shrink-0 transition-colors group-hover:text-[var(--accent-red-light)]"
          style={{ color: 'var(--text-muted)' }}
        >
          View all →
        </span>
      </Link>

      {/* Champion */}
      <div className="px-1.5 pt-1.5">
        {champion ? (
          <FighterPill fighter={champion} displayRank={0} division={division} champion />
        ) : (
          <div className="px-2.5 py-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            No reigning champion
          </div>
        )}
      </div>

      {/* Top contenders */}
      <div className="px-1.5 pb-1.5 pt-0.5 space-y-0.5 flex-1">
        {fighters.length === 0 ? (
          <div className="px-2.5 py-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            No ranked contenders
          </div>
        ) : (
          fighters.map((f, i) => (
            <FighterPill key={f.fighterId} fighter={f} displayRank={i + 1} division={division} />
          ))
        )}
      </div>
    </div>
  );
}
