'use client';

import type { DivisionRankings } from '@/lib/types';
import FighterCard from './FighterCard';
import ChampionHero from './ChampionHero';

interface RankingTableProps {
  rankings: DivisionRankings | null;
  loading: boolean;
  error: string | null;
}

export default function RankingTable({ rankings, loading, error }: RankingTableProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 15 }).map((_, i) => (
          <div
            key={i}
            className="h-16 rounded-lg animate-pulse"
            style={{ backgroundColor: 'var(--bg-card)', opacity: 1 - i * 0.05 }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="text-center py-12 rounded-lg border"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--accent-red)' }}
      >
        <p className="text-sm font-medium">Failed to load rankings</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          {error}
        </p>
      </div>
    );
  }

  if (!rankings || rankings.fighters.length === 0) {
    return (
      <div
        className="text-center py-12 rounded-lg border"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
      >
        No ranked fighters in this division
      </div>
    );
  }

  // Pin reigning champions above; contenders get a clean 1..N display rank.
  // The authoritative champion signal is the Octagon API rank "C" — the CSV
  // `belt` flag is stale ([[project_stale_champions]]).
  const isChampion = (f: (typeof rankings.fighters)[number]) => f.officialRank === 'C' || f.belt;
  const champions = rankings.fighters.filter(isChampion);
  const contenders = rankings.fighters.filter((f) => !isChampion(f));
  const maxScore = rankings.fighters[0]?.rankScore || 100;

  return (
    <div>
      {/* Division banner */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="font-display text-3xl sm:text-4xl leading-none" style={{ color: 'var(--text-primary)' }}>
            {rankings.division}
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {rankings.fighters.length} ranked &middot; updated{' '}
            {new Date(rankings.generatedAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Champions */}
      {champions.length > 0 && (
        <div className="space-y-2 mb-4">
          {champions.map((champ) => (
            <ChampionHero key={champ.fighterId} fighter={champ} division={rankings.division} />
          ))}
        </div>
      )}

      {/* Column labels (desktop) */}
      <div
        className="hidden md:flex items-center gap-4 px-4 py-2 text-[10px] uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        <div className="w-9 text-center">#</div>
        <div className="w-10" />
        <div className="flex-1">Fighter &middot; trend vs UFC</div>
        <div className="flex items-center gap-4">
          <div className="min-w-[56px] text-center">Stat</div>
          <div className="min-w-[56px] text-center">Stat</div>
          <div className="min-w-[56px] text-center">Stat</div>
        </div>
        <div className="hidden lg:block min-w-[48px] text-center">SoS</div>
        <div className="w-28 text-right">Score</div>
      </div>

      {/* Contenders */}
      <div className="space-y-1.5">
        {contenders.map((fighter, i) => (
          <FighterCard
            key={fighter.fighterId}
            fighter={fighter}
            displayRank={i + 1}
            maxScore={maxScore}
            division={rankings.division}
          />
        ))}
      </div>
    </div>
  );
}
