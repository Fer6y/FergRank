import Link from 'next/link';
import type { RankedFighter } from '@/lib/types';
import FighterAvatar from './FighterAvatar';
import { getHighlights } from '@/lib/fighterDisplay';

interface ChampionHeroProps {
  fighter: RankedFighter;
  division: string;
}

// Reigning champion, pinned above the contender list with a "C" badge — never
// shown as #1 (DESIGN_VISION §4, [[project_champion_display]]).
export default function ChampionHero({ fighter, division }: ChampionHeroProps) {
  const highlights = getHighlights(fighter);

  return (
    <Link
      href={`/fighter/${fighter.fighterId}?d=${encodeURIComponent(division)}`}
      className="fighter-row flex items-center gap-3 sm:gap-4 px-4 py-4 rounded-xl"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1.5px solid var(--accent-gold)',
      }}
    >
      <div
        className="font-display w-10 text-center text-3xl leading-none shrink-0"
        style={{ color: 'var(--accent-gold)' }}
      >
        C
      </div>

      <FighterAvatar
        src={fighter.avatarUrl}
        name={fighter.fullName}
        sizeClass="w-12 h-12"
        initialsClass="text-sm"
        bg="var(--bg-elevated)"
        initialsColor="var(--accent-gold)"
        border="1.5px solid var(--accent-gold)"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {fighter.flag && (
            <span className="text-base shrink-0 leading-none" title={fighter.nationality}>
              {fighter.flag}
            </span>
          )}
          <span className="font-medium text-base truncate" style={{ color: 'var(--text-primary)' }}>
            {fighter.fullName}
          </span>
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
            style={{ backgroundColor: 'rgba(212, 168, 67, 0.15)', color: 'var(--accent-gold)' }}
          >
            CHAMPION
          </span>
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

      <div className="hidden lg:block text-center min-w-[48px] shrink-0">
        <div className="text-xs font-medium font-mono" style={{ color: 'var(--accent-blue)' }}>
          {fighter.strengthOfSchedule.toFixed(1)}
        </div>
        <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          SoS
        </div>
      </div>

      <div className="w-20 sm:w-28 shrink-0 text-right">
        <div className="font-display text-2xl leading-none" style={{ color: 'var(--accent-gold)' }}>
          {fighter.rankScore.toFixed(1)}
        </div>
        <div className="text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>
          score
        </div>
      </div>
    </Link>
  );
}
