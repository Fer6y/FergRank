// Presentation helpers shared by FighterCard / ChampionHero / profile.
// Pure display logic — no algorithm here.
import type { RankedFighter } from './types';

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface Trend {
  label: string;
  title: string;
  color: string;
  bg: string;
}

// Compare our displayed rank to the fighter's official UFC rank. This delta IS
// the product thesis (DESIGN_VISION §0) — surfaced on every contender row.
export function getTrend(fighter: RankedFighter, displayRank: number): Trend | null {
  const official = fighter.officialRank;

  // Not ranked by the UFC at all, but we rank them — the "we go deeper" case.
  if (!official || official === 'NR') {
    return {
      label: 'NR',
      title: 'Unranked by the UFC — we rank them on the data',
      color: 'var(--accent-blue)',
      bg: 'rgba(74, 158, 255, 0.12)',
    };
  }

  // Champions are pinned to the hero card, not shown as a contender row.
  if (official === 'C') return null;

  const officialNum = parseInt(official, 10);
  if (Number.isNaN(officialNum)) return null;

  const delta = officialNum - displayRank; // >0 means we rank them higher than UFC
  if (delta === 0) {
    return {
      label: '=',
      title: 'Same as the UFC official rank',
      color: 'var(--text-muted)',
      bg: 'var(--bg-elevated)',
    };
  }
  if (delta > 0) {
    return {
      label: `▲${delta}`,
      title: `We rank them ${delta} spot${delta > 1 ? 's' : ''} higher than the UFC (UFC #${officialNum})`,
      color: 'var(--accent-green)',
      bg: 'rgba(45, 212, 126, 0.12)',
    };
  }
  return {
    label: `▼${Math.abs(delta)}`,
    title: `We rank them ${Math.abs(delta)} spot${Math.abs(delta) > 1 ? 's' : ''} lower than the UFC (UFC #${officialNum})`,
    color: 'var(--accent-red-light)',
    bg: 'rgba(255, 45, 45, 0.1)',
  };
}

export interface DecompPart {
  label: string;
  value: number;
  color: string;
}

// Plain-English "why this rank" + the score decomposition, the flagship
// transparency feature (DESIGN_VISION §5). finalRating = elo + metrics + sos +
// official + pedigree.
export function buildWhyThisRank(ranked: RankedFighter): { sentence: string; parts: DecompPart[]; final: number } {
  const bits: string[] = [];
  bits.push(`A ${Math.round(ranked.eloRating)} Elo anchors the rank — earned by who they beat, weighted to recent fights.`);

  if (ranked.metricsBonus >= 3) bits.push(`Strong recent fight metrics add +${ranked.metricsBonus.toFixed(0)}.`);
  else if (ranked.metricsBonus <= -3) bits.push(`Soft recent metrics cost ${ranked.metricsBonus.toFixed(0)}.`);

  if (ranked.sosNudge >= 2) bits.push(`A tougher-than-rated schedule nudges +${ranked.sosNudge.toFixed(0)}.`);
  else if (ranked.sosNudge <= -2) bits.push(`A soft schedule trims ${ranked.sosNudge.toFixed(0)}.`);

  if (ranked.officialRank === 'C') bits.push(`As reigning champion the belt holds the top slot.`);
  else if (ranked.officialBonus > 0) bits.push(`The UFC's official rank seeds +${ranked.officialBonus.toFixed(0)}.`);

  const parts: DecompPart[] = [
    { label: 'Base Elo', value: ranked.eloRating, color: 'var(--accent-red)' },
    { label: 'Metrics', value: ranked.metricsBonus, color: 'var(--accent-green)' },
    { label: 'SoS', value: ranked.sosNudge, color: 'var(--accent-blue)' },
    { label: 'Official', value: ranked.officialBonus, color: 'var(--accent-gold)' },
  ];
  if (ranked.pedigreeBonus) parts.push({ label: 'Pedigree', value: ranked.pedigreeBonus, color: 'var(--text-secondary)' });

  return { sentence: bits.join(' '), parts, final: ranked.finalRating };
}

export interface Highlight {
  label: string;
  value: string;
  color: string;
}

// Up to 3 most notable stats, semantic colours per DESIGN_VISION §2.1
// (red = striking/finishing, green = accuracy, blue = grappling).
export function getHighlights(fighter: RankedFighter): Highlight[] {
  const stats: Highlight[] = [];

  if (fighter.finishRate > 0) {
    stats.push({
      label: 'Finish',
      value: `${Math.round(fighter.finishRate * 100)}%`,
      color: fighter.finishRate > 0.6 ? 'var(--accent-red-light)' : 'var(--text-secondary)',
    });
  }
  if (fighter.koRate > 0) {
    stats.push({
      label: 'KO',
      value: `${Math.round(fighter.koRate * 100)}%`,
      color: fighter.koRate > 0.4 ? 'var(--accent-red-light)' : 'var(--text-secondary)',
    });
  }
  if (fighter.sigStrikeAccuracy > 0) {
    stats.push({
      label: 'Acc',
      value: `${Math.round(fighter.sigStrikeAccuracy * 100)}%`,
      color: fighter.sigStrikeAccuracy > 0.5 ? 'var(--accent-green)' : 'var(--text-secondary)',
    });
  }
  if (fighter.subRate > 0) {
    stats.push({
      label: 'Sub',
      value: `${Math.round(fighter.subRate * 100)}%`,
      color: fighter.subRate > 0.3 ? 'var(--accent-blue)' : 'var(--text-secondary)',
    });
  }

  return stats.slice(0, 3);
}
