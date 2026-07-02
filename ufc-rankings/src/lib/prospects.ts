// ─────────────────────────────────────────────────────────────────────────
//  prospects.ts — the prospect watchlist (display-only).
//
//  Surfaces fighters still inside the provisional-Elo window (≤5 UFC fights)
//  who are winning and active: their climb rate, last results, booked next
//  fight, and pre-UFC pedigree context where the Sherdog data has it.
//  Reads engine OUTPUT (Elo, rankings) — never feeds anything back.
// ─────────────────────────────────────────────────────────────────────────

import { getData } from './dataCache';
import { generateDivisionRankings } from './scoringEngine';
import { buildEloRatings, getElo, getFighterHistory } from './eloEngine';
import { loadPedigreeStrength } from './pedigreeSeed';
import { getFighterMedia } from './fighterMedia';
import { getFighterAge } from './fighterAges';
import { getNextFight, type NextFight } from './loadUpcoming';
import { ALL_DIVISIONS } from './types';
import type { RankedFighter } from './types';

const MAX_UFC_FIGHTS = 5;        // the engine's provisional-K window
const ACTIVE_WITHIN_MONTHS = 15; // inactive prospects drop off unless booked
const MIN_PED_FIGHTS = 3;        // don't show a 1-fight pre-UFC "record"

export interface ProspectEntry {
  fighterId: string;
  fullName: string;
  division: string;
  flag: string | null;
  avatarUrl: string | null;
  ufcRecord: string;            // decisive UFC record, e.g. "4-0"
  ufcFights: number;
  age: number | null;           // real age — central to prospect projection
  elo: number;                  // rounded core Elo
  climbPerFight: number;        // (Elo − 1500) / fights — speed of the rise
  ourRank: number | null;       // display rank if already cracking a division
  lastTwo: { result: string; label: string }[];
  nextFight: NextFight | null;
  preUFC: { record: string; fights: number } | null;
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

export async function buildProspectWatchlist(limit = 20): Promise<ProspectEntry[]> {
  const data = getData();
  const ratings = buildEloRatings(data);
  const pedigree = loadPedigreeStrength(data);

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
    if (n === 0 || n > MAX_UFC_FIGHTS) continue;
    const w = history.filter((h) => h.result === 'W').length;
    const l = history.filter((h) => h.result === 'L').length;
    if (w <= l) continue;                          // winning record only
    if (champIds.has(fighter.fighterId)) continue;

    const next = getNextFight(fighter.fighterId) ?? null;
    const monthsSince = (now - new Date(history[0].date).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    if (monthsSince > ACTIVE_WITHIN_MONTHS && !next) continue;

    const elo = getElo(ratings, fighter.fighterId).rating;
    const media = getFighterMedia(fighter.fighterId);
    const ped = pedigree.get(fighter.fighterId);

    out.push({
      fighterId: fighter.fighterId,
      fullName: fighter.fullName,
      division: fighter.weightClass,
      flag: media?.flag || null,
      avatarUrl: media?.avatarUrl || null,
      ufcRecord: `${w}-${l}`,
      ufcFights: n,
      age: getFighterAge(fighter.fighterId)?.age ?? null,
      elo: Math.round(elo),
      climbPerFight: Math.round(((elo - 1500) / n) * 10) / 10,
      ourRank: rankMap.get(fighter.fighterId) ?? null,
      lastTwo: history.slice(0, 2).map((h) => ({
        result: h.result,
        label: `${shortMethod(h.method, h.round)} vs. ${h.opponentName}`,
      })),
      nextFight: next,
      preUFC: ped && ped.fights >= MIN_PED_FIGHTS
        ? { record: `${ped.wins}-${ped.losses}`, fights: ped.fights }
        : null,
    });
  }

  return out.sort((a, b) => b.elo - a.elo).slice(0, limit);
}
