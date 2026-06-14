import { getData } from './dataCache';
import { generateDivisionRankings } from './scoringEngine';
import { buildEloRatings, getElo, getFighterHistory, eloToDisplayScore, type FightTrace } from './eloEngine';
import { computeRadarAxes } from './fighterRadar';
import { getFighterMedia } from './fighterMedia';
import { ALL_DIVISIONS } from './types';
import type { RankedFighter } from './types';
import type { Fighter } from './types';

export interface FighterProfile {
  // Base identity (always present if the fighter exists in the dataset).
  fighterId: string;
  fullName: string;
  nickname: string;
  record: string;
  weightClass: string;
  gender: string;
  height: string;
  stance: string;
  fightCount: number;

  // Presentation media (fighterMedia.ts; display only — never feeds the algorithm).
  avatarUrl: string | null;    // head-framed photo for the hero avatar
  fullBodyUrl: string | null;  // UFC transparent full-body (if available)
  nationality: string | null;
  flag: string | null;         // emoji flag

  // Ranking context. `ranked` is the full RankedFighter (score decomposition,
  // SoS, official rank…) when the fighter is ranked in a division; null if not.
  division: string | null;
  displayRank: number | null;   // rank among contenders (champions excluded)
  isChampion: boolean;
  ranked: RankedFighter | null;

  // Current core Elo even when unranked (for a minimal profile).
  eloRating: number;
  eloPeak: number;
  eloDisplay: number;

  // Headline stats + normalized radar axes (0–1) for the profile visuals.
  sos: number | null;             // 0–100 strength of schedule, null if unranked
  monthsSinceLastFight: number;
  stats: {
    finishRate: number;
    koRate: number;
    subRate: number;
    sigStrikeAccuracy: number;
  };
  radar: {
    strike: number;
    grappling: number;
    finishing: number;
    activity: number;
    oppQuality: number;
  };

  history: FightTrace[];
}

function isChampion(f: RankedFighter): boolean {
  return f.officialRank === 'C' || f.belt;
}

// Which division to rank this fighter in. Prefer the caller-supplied hint (the
// division page they were clicked from); fall back to their CSV weight class.
function resolveDivision(fighter: Fighter, hint?: string | null): string | null {
  if (hint && ALL_DIVISIONS.includes(hint as (typeof ALL_DIVISIONS)[number])) return hint;
  if (ALL_DIVISIONS.includes(fighter.weightClass as (typeof ALL_DIVISIONS)[number])) {
    return fighter.weightClass;
  }
  return null;
}

export async function getFighterProfile(
  fighterId: string,
  divisionHint?: string | null
): Promise<FighterProfile | null> {
  const data = getData();
  const fighter = data.fighterMap.get(fighterId);
  if (!fighter) return null;

  const elo = getElo(buildEloRatings(data), fighterId);
  const history = getFighterHistory(data, fighterId);

  const division = resolveDivision(fighter, divisionHint);

  let ranked: RankedFighter | null = null;
  let displayRank: number | null = null;
  let champion = false;

  if (division) {
    const rankings = await generateDivisionRankings(division, data);
    const contenders = rankings.fighters.filter((f) => !isChampion(f));
    const found = rankings.fighters.find((f) => f.fighterId === fighterId);
    if (found) {
      ranked = found;
      champion = isChampion(found);
      if (!champion) {
        displayRank = contenders.findIndex((f) => f.fighterId === fighterId) + 1 || null;
      }
    }
  }

  const monthsSince = ranked?.monthsSinceLastFight
    ?? (history[0] ? (Date.now() - new Date(history[0].date).getTime()) / (1000 * 60 * 60 * 24 * 30.44) : 999);
  const finishRate = fighter.koRate + fighter.subRate;
  const sos = ranked?.strengthOfSchedule ?? null;
  const eloDisplay = eloToDisplayScore(elo.rating);
  const media = getFighterMedia(fighterId);

  // Radar axes are rebuilt from the same recency-weighted per-fight signals the
  // ranking metrics use (see fighterRadar.ts) — display only, never feeds Elo.
  // Sampled across ALL weight classes (division = null): the radar is a STYLE
  // portrait, so a recent division-mover (e.g. Topuria) keeps the striking
  // signature of their fights at the old weight instead of being judged on a
  // thin 1–2 fight sample in the new division.
  const radar = computeRadarAxes(data, fighterId, null, {
    sos,
    eloDisplay,
    monthsSinceLastFight: monthsSince,
    careerFinishRate: finishRate,
    careerSigAccuracy: fighter.sigStrikeAccuracy,
    careerGroundPct: fighter.groundPct,
  });

  return {
    fighterId,
    fullName: fighter.fullName,
    nickname: fighter.nickname,
    record: `${fighter.wins}-${fighter.losses}-${fighter.draws}`,
    weightClass: fighter.weightClass,
    gender: fighter.gender,
    height: fighter.height,
    stance: fighter.stance,
    fightCount: (data.fighterFights.get(fighterId) || []).length,
    avatarUrl: media?.avatarUrl || null,
    fullBodyUrl: media?.fullBodyUrl || null,
    nationality: media?.nationality || null,
    flag: media?.flag || null,
    division: ranked ? division : null,
    displayRank,
    isChampion: champion,
    ranked,
    eloRating: Math.round(elo.rating * 100) / 100,
    eloPeak: Math.round(elo.peakRating * 100) / 100,
    eloDisplay: Math.round(eloDisplay * 100) / 100,
    sos,
    monthsSinceLastFight: Math.round(monthsSince * 10) / 10,
    stats: {
      finishRate: Math.round(finishRate * 1000) / 1000,
      koRate: fighter.koRate,
      subRate: fighter.subRate,
      sigStrikeAccuracy: fighter.sigStrikeAccuracy,
    },
    radar,
    history,
  };
}
