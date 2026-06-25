// Core data types loaded from CSVs

export interface Fighter {
  fighterId: string;
  fullName: string;
  nickname: string;
  height: string;
  weight: number;
  stance: string;
  wins: number;
  losses: number;
  draws: number;
  belt: boolean;
  weightClass: string;
  gender: string;
  knockdowns: number;
  sigStrikeAccuracy: number;
  headPct: number;
  bodyPct: number;
  legPct: number;
  distancePct: number;
  clinchPct: number;
  groundPct: number;
  subAttempts: number;
  controlTime: number;
  takedowns: number;
  koRate: number;
  subRate: number;
  decRate: number;
  fightingStyle: string;
  strikerMembership: number;
  wrestlerMembership: number;
  hybridMembership: number;
}

export interface Fight {
  fightId: string;
  fighterId1: string;
  fighterId2: string;
  fighter1Name: string;
  fighter2Name: string;
  kd1: number;
  kd2: number;
  str1: number;
  str2: number;
  td1: number;
  td2: number;
  sub1: number;
  sub2: number;
  weightClass: string;
  method: string;
  methodDetails: string;
  round: number;
  fightTime: string;
  eventId: string;
  result1: string;
  result2: string;
  timeFormat: string;
  sigStrPct1: number;
  sigStrPct2: number;
  ctrl1: number;
  ctrl2: number;
  // Joined from Events.csv
  eventDate: Date | null;
  // Provenance. 'fights' = primary Fights.csv (full metrics). 'sherdog' = a
  // recency top-up pulled from a Sherdog profile (result/method/date only —
  // NO per-fight metrics), used to keep Elo current ahead of the data refresh.
  source?: 'fights' | 'sherdog';
  // False for Sherdog top-up fights: they must be EXCLUDED from the striking/
  // grappling metrics composite (they carry no strike/control/TD data).
  hasMetrics?: boolean;
}

export interface Event {
  eventId: string;
  name: string;
  date: string;
  location: string;
}

export interface OfficialRanking {
  rank: string; // "C", "1", "2", etc.
  name: string;
  record: string;
}

export interface OfficialRankingsMap {
  [division: string]: OfficialRanking[];
}

// ── Pre-UFC pedigree (cross-promotion historical reference) ──
// Sourced from pro_mma_fights.csv (Kaggle, Sherdog-derived, ends Aug 2021).
// STRICTLY a "before they arrived in the UFC" quality signal: every UFC fight
// in that file is dropped (it duplicates our UFC-only dataset), and only the
// non-UFC fights that occurred BEFORE a fighter's UFC debut are counted.
// Deliberately bounded so it never outweighs in-cage UFC performance.
export interface PreUFCPromotionRecord {
  organisation: string;   // raw org label, e.g. "Bellator MMA"
  tier: string;           // resolved promotion tier key, e.g. "tier2"
  tierMultiplier: number; // tier multiplier from RANKING_CONFIG.promotionTiers
  wins: number;
  losses: number;
  draws: number;
}

export interface PreUFCPedigree {
  fighterId: string;      // resolved id in our UFC dataset
  fighterName: string;    // name as stored in Fighters_Stats.csv
  fights: number;         // total pre-UFC non-UFC fights counted
  wins: number;
  losses: number;
  draws: number;
  byPromotion: PreUFCPromotionRecord[];
  bestTierMultiplier: number; // highest tier multiplier the fighter competed at
  // Bounded [0, bestTierMultiplier] (≤ maxStrength). NOT yet Elo points — a
  // descriptive signal to be consumed by a future seed step, intentionally
  // small so a strong regional/Tier-2 run nudges, never dominates.
  pedigreeStrength: number;
}

export type PreUFCPedigreeMap = Map<string, PreUFCPedigree>;

export interface RankedFighter {
  rank: number;
  fighterId: string;
  fullName: string;
  nickname: string;
  record: string; // "W-L-D"
  weightClass: string;
  belt: boolean;
  rankScore: number;          // 0–100 display score (linear map of finalRating)
  // ── Elo-based score components ──
  finalRating: number;        // Adjusted Elo: elo + metrics + SoS nudge + official seed
  eloRating: number;          // Raw core Elo (recency/inactivity-regressed to today)
  eloPeak: number;            // Highest Elo ever held
  metricsBonus: number;       // Striking/grappling adjustment (Elo points, can be ±)
  sosNudge: number;           // Strength-of-schedule adjustment (Elo points, bounded)
  officialBonus: number;      // UFC official-rank seed (Elo points)
  pedigreeBonus: number;      // Pre-UFC pedigree nudge (Elo points; 0 unless seedEnabled)
  pedigreeStrength: number;   // Raw bounded pedigree [0–~0.78], 0 if none/disabled
  officialRank: string | null; // "C"/"1".."15" or null if unranked by UFC
  strengthOfSchedule: number; // 0–100 display of avg opponent rating
  sosElo: number;             // Raw avg opponent Elo over the window
  monthsSinceLastFight: number;
  recentFightCount: number;   // Scored division fights in the recency window
  // ── Key stats for display ──
  sigStrikeAccuracy: number;
  koRate: number;
  subRate: number;
  finishRate: number;
  fightCount: number;         // Total UFC fights on record
  // ── Presentation media (attached at the API boundary by fighterMedia.ts;
  //    NOT produced by the scoring engine — purely for display) ──
  avatarUrl?: string;         // photo for the circular avatar; absent → initials
  flag?: string;              // emoji flag from nationality; absent → none
  nationality?: string;       // human label, e.g. "Brazil"
}

export interface DivisionRankings {
  division: string;
  gender: string;
  fighters: RankedFighter[];
  generatedAt: string;
}

// Weight class constants
export const MENS_DIVISIONS = [
  'Heavyweight',
  'Light Heavyweight',
  'Middleweight',
  'Welterweight',
  'Lightweight',
  'Featherweight',
  'Bantamweight',
  'Flyweight',
] as const;

export const WOMENS_DIVISIONS = [
  "Women's Strawweight",
  "Women's Flyweight",
  "Women's Bantamweight",
] as const;

export const ALL_DIVISIONS = [...MENS_DIVISIONS, ...WOMENS_DIVISIONS] as const;
