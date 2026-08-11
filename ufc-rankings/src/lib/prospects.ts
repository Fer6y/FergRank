// ─────────────────────────────────────────────────────────────────────────
//  prospects.ts — the prospect watchlist (display-only).
//
//  Surfaces fighters still inside the provisional-Elo window who are winning
//  and active: their climb rate, last results, booked next fight, and pre-UFC
//  pedigree context where the Sherdog data has it.
//  Reads engine OUTPUT (Elo, rankings) — never feeds anything back.
//
//  Split into two TIERS because "≤N UFC fights" covers two different
//  populations — genuine prospects, and established fighters importing a career
//  (see RANKING_CONFIG.prospects for the definition and why it carries no
//  scoring term). Both tiers are ordered by raw Elo: a held-out backtest
//  (2026-08-05) refuted replacing that with climb rate. All knobs live in
//  RANKING_CONFIG.prospects — nothing hardcoded here.
// ─────────────────────────────────────────────────────────────────────────

import { getData } from './dataCache';
import { generateDivisionRankings } from './scoringEngine';
import { buildEloRatings, getElo, getFighterHistory } from './eloEngine';
import { loadPedigreeStrength } from './pedigreeSeed';
import { getFighterMedia } from './fighterMedia';
import { getFighterAge } from './fighterAges';
import { getNextFight, type NextFight } from './loadUpcoming';
import { loadDwcsAnalysis, type DwcsChip } from './loadDwcsAnalysis';
import { buildDistinctions, type Distinction } from './distinctions';
import { RANKING_CONFIG } from './rankingConfig';
import { ALL_DIVISIONS } from './types';
import type { RankedFighter } from './types';

const P = RANKING_CONFIG.prospects;

// The page's premise is "still inside the provisional-Elo window", so the two
// must agree. Fail loudly at load rather than silently rendering a false claim.
if (P.maxUFCFights !== RANKING_CONFIG.elo.provisionalFights) {
  throw new Error(
    `[prospects] config desync: prospects.maxUFCFights (${P.maxUFCFights}) must equal ` +
    `elo.provisionalFights (${RANKING_CONFIG.elo.provisionalFights}) — the watchlist claims ` +
    `to track the provisional window.`,
  );
}

/** Which list a fighter belongs on. See RANKING_CONFIG.prospects for the rule. */
export type ProspectTier = 'prospect' | 'newcomer';

export interface ProspectEntry {
  fighterId: string;
  fullName: string;
  division: string;
  flag: string | null;
  avatarUrl: string | null;
  tier: ProspectTier;
  ufcRecord: string;            // UFC record, e.g. "4-0" (draws appended: "4-0-1")
  ufcFights: number;
  age: number | null;           // real age — central to prospect projection
  elo: number;                  // rounded core Elo
  climbPerFight: number;        // (Elo − 1500) / fights — speed of the rise (displayed)
  shrunkClimb: number;          // (Elo − 1500) / (fights + k) — sort key for the climb VIEW only
  ourRank: number | null;       // display rank if already cracking a division
  lastTwo: { result: string; label: string }[];
  distinctions: Distinction[];  // decal badges (streaks/undefeated); display only
  nextFight: NextFight | null;
  preUFC: {
    record: string;
    fights: number;
    ufcBoundBeaten: number;       // # future-UFC fighters beaten pre-UFC (schedule quality)
    bestScalp: string | null;     // name of the best future-UFC fighter they beat pre-UFC
  } | null;
  // Came through the Contender Series tryout (display-only, read from the
  // static dwcs_analysis.json — same firewall class as fighterMedia).
  dwcs: DwcsChip | null;
}

// Compact method label for one-line results ("KO R2", "SUB R1", "UD").
function shortMethod(method: string, round: number): string {
  const m = method.trim().toUpperCase();
  if (m === 'KO/TKO' || m.startsWith('TKO')) return `KO R${round}`;
  if (m === 'SUB') return `SUB R${round}`;
  if (m === 'U-DEC') return 'UD';
  if (m === 'S-DEC') return 'SD';
  if (m === 'M-DEC') return 'MD';
  return method.trim();
}

/**
 * Prospect vs newcomer — a DEFINITIONAL split, not a quality judgement. Age is
 * the scouting variable (runway); pre-UFC volume only stands in when age is
 * unknown, and a short-record unknown-age fighter defaults to `prospect` so
 * missing data never silently demotes anyone. See RANKING_CONFIG.prospects.
 */
function classifyTier(age: number | null, preUFCFights: number): ProspectTier {
  if (age != null) return age >= P.veteranAgeYears ? 'newcomer' : 'prospect';
  return preUFCFights >= P.veteranPreUFCFightsIfAgeUnknown ? 'newcomer' : 'prospect';
}

export interface ProspectWatchlist {
  prospects: ProspectEntry[];   // young risers — the scouting board
  newcomers: ProspectEntry[];   // established fighters inside their first UFC bouts
}

/**
 * Returns the FULL qualifying pool per tier, ordered by raw Elo (the default and
 * evidence-backed ordering). Deliberately unsliced: the client re-sorts for the
 * opt-in climb view, and slicing to `listLimit` here would pre-filter by Elo —
 * hiding exactly the low-fight-count risers that view exists to surface.
 */
export async function buildProspectWatchlist(): Promise<ProspectWatchlist> {
  const data = getData();
  const ratings = buildEloRatings(data);
  const pedigree = loadPedigreeStrength(data);
  const dwcsChips = loadDwcsAnalysis()?.chips ?? {};

  // Contender numbering shared with the rest of the app (champions excluded —
  // a reigning champion is nobody's prospect).
  const rankMap = new Map<string, number>();
  const champIds = new Set<string>();
  const isChamp = (f: RankedFighter) => f.officialRank === 'C' || f.belt;
  for (const division of ALL_DIVISIONS) {
    const r = await generateDivisionRankings(division, data);
    r.fighters.filter((f) => !isChamp(f)).forEach((f, i) => rankMap.set(f.fighterId, i + 1));
    for (const f of r.fighters) if (isChamp(f)) champIds.add(f.fighterId);
  }

  const now = Date.now();
  const out: ProspectEntry[] = [];
  for (const fighter of data.fighters) {
    const history = getFighterHistory(data, fighter.fighterId); // newest first, dated
    const n = history.length;
    if (n === 0 || n > P.maxUFCFights) continue;
    const w = history.filter((h) => h.result === 'W').length;
    const l = history.filter((h) => h.result === 'L').length;
    const drawn = n - w - l;                       // the engine traces draws too
    if (w <= l) continue;                          // winning record only (a draw is not a win)
    if (champIds.has(fighter.fighterId)) continue;

    const next = getNextFight(fighter.fighterId) ?? null;
    const monthsSince = (now - new Date(history[0].date).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    if (monthsSince > P.activeWithinMonths && !next) continue;

    const elo = getElo(ratings, fighter.fighterId).rating;
    const media = getFighterMedia(fighter.fighterId);
    const ped = pedigree.get(fighter.fighterId);
    const age = getFighterAge(fighter.fighterId)?.age ?? null;

    out.push({
      fighterId: fighter.fighterId,
      fullName: fighter.fullName,
      division: fighter.weightClass,
      flag: media?.flag || null,
      avatarUrl: media?.avatarUrl || null,
      tier: classifyTier(age, ped?.fights ?? 0),
      // Draws are real results and were being dropped: a 4-0-1 fighter rendered
      // as "4-0" while their own card listed the draw as a recent result.
      ufcRecord: drawn > 0 ? `${w}-${l}-${drawn}` : `${w}-${l}`,
      ufcFights: n,
      age,
      elo: Math.round(elo),
      climbPerFight: Math.round(((elo - 1500) / n) * 10) / 10,
      shrunkClimb: (elo - 1500) / (n + P.climbShrinkK),
      ourRank: rankMap.get(fighter.fighterId) ?? null,
      lastTwo: history.slice(0, 2).map((h) => ({
        result: h.result,
        label: `${shortMethod(h.method, h.round)} vs. ${h.opponentName}`,
      })),
      distinctions: buildDistinctions({ fighterName: fighter.fullName, isChampion: false, history }),
      nextFight: next,
      preUFC: ped && ped.fights >= P.minPedigreeFights
        ? {
            record: `${ped.wins}-${ped.losses}`,
            fights: ped.fights,
            ufcBoundBeaten: ped.ufcBoundBeaten,
            bestScalp: ped.bestScalpId
              ? data.fighterMap.get(ped.bestScalpId)?.fullName ?? null
              : null,
          }
        : null,
      dwcs: dwcsChips[fighter.fighterId] ?? null,
    });
  }

  // Raw Elo, both tiers. Held-out-backtest-defended — see RANKING_CONFIG.prospects.
  out.sort((a, b) => b.elo - a.elo);
  return {
    prospects: out.filter((p) => p.tier === 'prospect'),
    newcomers: out.filter((p) => p.tier === 'newcomer'),
  };
}
