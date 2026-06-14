import Link from 'next/link';
import type { RankedFighter } from '@/lib/types';
import FighterAvatar from './FighterAvatar';
import { getTrend } from '@/lib/fighterDisplay';

interface FighterPillProps {
  fighter: RankedFighter;
  displayRank: number; // rank among contenders (1..N); 0 = champion
  division: string;
  champion?: boolean;
}

// Condensed single-line fighter row for the dashboard division cards. Shows
// rank, name, record and the trend-vs-UFC chip — the product thesis — without
// the full stat spread of FighterCard.
export default function FighterPill({ fighter, displayRank, division, champion }: FighterPillProps) {
  const trend = champion ? null : getTrend(fighter, displayRank);

  return (
    <Link
      href={`/fighter/${fighter.fighterId}?d=${encodeURIComponent(division)}`}
      className="fighter-row flex items-center gap-2.5 px-2.5 py-1.5 rounded-md"
      style={{ backgroundColor: 'transparent' }}
    >
      {/* Rank numeral / champion mark */}
      <div
        className="font-display w-5 text-center text-base leading-none shrink-0"
        style={{ color: champion ? 'var(--accent-gold)' : displayRank <= 3 ? 'var(--accent-red-light)' : 'var(--text-secondary)' }}
      >
        {champion ? 'C' : displayRank}
      </div>

      {/* Avatar */}
      <FighterAvatar
        src={fighter.avatarUrl}
        name={fighter.fullName}
        sizeClass="w-6 h-6"
        initialsClass="text-[9px]"
        bg="var(--bg-elevated)"
        initialsColor={champion ? 'var(--accent-gold)' : 'var(--text-muted)'}
        border={champion ? '1px solid var(--accent-gold)' : undefined}
      />

      {/* Name + record */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {fighter.flag && (
            <span className="mr-1 leading-none" title={fighter.nationality}>
              {fighter.flag}
            </span>
          )}
          {fighter.fullName}
        </div>
        <div className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>
          {fighter.record}
        </div>
      </div>

      {/* Trend chip */}
      {trend && (
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
          style={{ backgroundColor: trend.bg, color: trend.color }}
          title={trend.title}
        >
          {trend.label}
        </span>
      )}

      {/* Score */}
      <span
        className="text-xs font-mono shrink-0 w-9 text-right"
        style={{ color: champion ? 'var(--accent-gold)' : 'var(--text-secondary)' }}
      >
        {fighter.rankScore.toFixed(1)}
      </span>
    </Link>
  );
}
