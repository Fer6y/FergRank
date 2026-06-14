import Link from 'next/link';
import type { RankedFighter } from '@/lib/types';
import ScoreBar from './ScoreBar';
import FighterAvatar from './FighterAvatar';
import { getTrend, getHighlights } from '@/lib/fighterDisplay';

interface FighterCardProps {
  fighter: RankedFighter;
  displayRank: number; // rank among contenders (champions are pinned above)
  maxScore: number;
  division: string;
}

export default function FighterCard({ fighter, displayRank, maxScore, division }: FighterCardProps) {
  const isTop5 = displayRank <= 5;
  const isTop15 = displayRank <= 15;
  const highlights = getHighlights(fighter);
  const trend = getTrend(fighter, displayRank);

  return (
    <Link
      href={`/fighter/${fighter.fighterId}?d=${encodeURIComponent(division)}`}
      className="fighter-row flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 rounded-lg border"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: isTop5 ? 'var(--border-light)' : 'var(--border)',
      }}
    >
      {/* Rank numeral (Oswald) */}
      <div
        className={`font-display w-9 text-center text-2xl leading-none shrink-0 ${isTop5 ? 'rank-glow' : ''}`}
        style={{
          color: isTop5 ? 'var(--accent-red-light)' : isTop15 ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}
      >
        {displayRank}
      </div>

      {/* Avatar */}
      <div className="hidden sm:block">
        <FighterAvatar
          src={fighter.avatarUrl}
          name={fighter.fullName}
          sizeClass="w-10 h-10"
          initialsClass="text-xs"
          bg="var(--bg-elevated)"
          initialsColor="var(--text-muted)"
        />
      </div>

      {/* Fighter info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {fighter.flag && (
            <span className="text-sm shrink-0 leading-none" title={fighter.nationality}>
              {fighter.flag}
            </span>
          )}
          <span className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
            {fighter.fullName}
          </span>
          {fighter.nickname && (
            <span className="hidden sm:inline text-xs truncate" style={{ color: 'var(--text-muted)' }}>
              &quot;{fighter.nickname}&quot;
            </span>
          )}
          {trend && (
            <span
              className="text-[11px] font-medium px-1.5 py-0.5 rounded shrink-0"
              style={{ backgroundColor: trend.bg, color: trend.color }}
              title={trend.title}
            >
              {trend.label}
            </span>
          )}
          {fighter.fightCount <= 3 && (
            <span
              className="text-[11px] font-medium px-1.5 py-0.5 rounded shrink-0"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--accent-gold)' }}
              title={`Prospect — only ${fighter.fightCount} UFC fight${fighter.fightCount === 1 ? '' : 's'}. Ranked on merit, but the sample is thin, so trust the placement less at the very top.`}
            >
              ★ Prospect
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
            {fighter.record}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {fighter.fightCount} UFC
          </span>
        </div>
      </div>

      {/* Stat highlights */}
      <div className="hidden md:flex items-center gap-4 shrink-0">
        {highlights.map((h, i) => (
          <div key={i} className="text-center min-w-[56px]">
            <div className="text-xs font-medium font-mono" style={{ color: h.color }}>
              {h.value}
            </div>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              {h.label}
            </div>
          </div>
        ))}
      </div>

      {/* SoS */}
      <div className="hidden lg:block text-center min-w-[48px] shrink-0">
        <div className="text-xs font-medium font-mono" style={{ color: 'var(--accent-blue)' }}>
          {fighter.strengthOfSchedule.toFixed(1)}
        </div>
        <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          SoS
        </div>
      </div>

      {/* Score + bar */}
      <div className="w-20 sm:w-28 shrink-0">
        <div className="flex items-baseline justify-between mb-1">
          <span
            className="text-sm font-medium font-mono"
            style={{ color: isTop5 ? 'var(--accent-red-light)' : 'var(--text-primary)' }}
          >
            {fighter.rankScore.toFixed(1)}
          </span>
          <span className="hidden sm:inline text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>
            score
          </span>
        </div>
        <ScoreBar
          value={fighter.rankScore}
          maxValue={maxScore}
          color={isTop5 ? 'var(--accent-red)' : isTop15 ? 'var(--accent-red-light)' : 'var(--text-muted)'}
        />
      </div>
    </Link>
  );
}
