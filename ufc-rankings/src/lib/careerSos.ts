// ─────────────────────────────────────────────────────────────────────────
//  careerSos.ts — all-time (career) strength of schedule (DISPLAY ONLY)
//
//  "How hard was this career?" — the mean rating of every opponent a fighter
//  has faced, each taken AT THE TIME OF THAT FIGHT. The Elo trace already
//  records exactly that (`FightTrace.opponentRating` = the opponent's pre-fight
//  rating), so this module is a pure read over the existing sweep: it adds no
//  rating math, no second pass, and no new engine state.
//
//  Why it isn't the SoS we already have — the three axes are all different:
//
//    sosElo (scoringEngine)          careerSos (here)
//    ─────────────────────           ────────────────
//    last sosWindowYears only        entire career
//    recency half-life weighted      un-weighted (every fight counts once)
//    max(fight-time, current) Elo    fight-time Elo ONLY
//    feeds sosNudge → finalRating    feeds nothing — read-only
//
//  The fight-time choice is the whole point of the stat. The ranking-side SoS
//  deliberately credits an opponent who LATER proved elite at their proven
//  level (a fair way to rate you today); a career résumé stat must not, because
//  it reports what the fighter actually walked into on the night. Beating a
//  1490-rated prospect who became a champion four years later was, at the time,
//  beating a 1490-rated prospect.
//
//  Reported as a PERCENTILE against the all-era pool, not an absolute 0–100
//  curve: a career mean compresses toward 1500 (p05 1484 → p95 1539 over 1,863
//  fighters), so an absolute curve would squash everyone into a narrow band.
//  Same reasoning — and the same shape — as the grappling ramp.
//
//  NEVER imported by eloEngine.ts / scoringEngine.ts. See rankingConfig.careerSos
//  for the removal condition.
// ─────────────────────────────────────────────────────────────────────────

import { getFighterHistory, type FightTrace } from './eloEngine';
import { RANKING_CONFIG } from './rankingConfig';
import type { LoadedData } from './loadData';

export interface CareerSosOpponent {
  fighterId: string;
  name: string;
  elo: number;        // their rating entering that fight
  date: string;       // ISO
  result: 'W' | 'L' | 'D'; // the SUBJECT's result
}

export interface CareerSos {
  /** Mean fight-time opponent Elo across the whole career — the number of record. */
  meanOpponentElo: number;
  /** 0–100 against the all-era pool of fighters with `minFights`+ traced fights. */
  percentile: number;
  poolSize: number;
  /** Traced fights the mean is built on (excludes NCs and undated bouts). */
  fights: number;
  /** Mean of the `topOpponents` toughest faced — exposure to the very top. */
  topOpponentElo: number;
  /** Toughest single opponent faced, at their fight-time rating. */
  toughest: CareerSosOpponent | null;
  /** Opponents at/above `eliteOpponentElo`, and how many the fighter BEAT. */
  eliteFaced: number;
  eliteBeaten: number;
  /** Career span, from the traced fights. */
  firstYear: number;
  lastYear: number;
  /**
   * True when the career is median-dated before `eraCaveatBeforeYear`: ratings
   * cold-start at 1500, so early-UFC careers compress toward the mean and their
   * percentile understates them. A disclosure flag, never a correction.
   */
  eraCaveat: boolean;
  summary: string;
}

// All-era pool of career-mean opponent Elos, sorted ascending. One pass over
// every fighter's trace, memoized WeakMap-style on LoadedData so a data reload
// drops it naturally (mirrors grappleGradient.ts / crossDivision.ts).
const poolCache = new WeakMap<LoadedData, number[]>();

/** Mean fight-time opponent Elo over a trace, or null below the sample floor. */
function meanOpponentElo(history: FightTrace[]): number | null {
  if (history.length < RANKING_CONFIG.careerSos.minFights) return null;
  let sum = 0;
  for (const h of history) sum += h.opponentRating;
  return sum / history.length;
}

function careerPool(data: LoadedData): number[] {
  const hit = poolCache.get(data);
  if (hit) return hit;

  const vals: number[] = [];
  for (const fighterId of data.fighterMap.keys()) {
    const m = meanOpponentElo(getFighterHistory(data, fighterId));
    if (m != null) vals.push(m);
  }
  vals.sort((a, b) => a - b);
  poolCache.set(data, vals);
  return vals;
}

function summarize(c: Omit<CareerSos, 'summary'>, name: string): string {
  const tier =
    c.percentile >= 95 ? 'one of the toughest careers in UFC history'
      : c.percentile >= 80 ? 'a markedly tough career'
        : c.percentile >= 55 ? 'a slightly above-average career'
          : c.percentile >= 25 ? 'a slightly soft career'
            : 'a soft career';

  const parts = [
    `${name} faced an average opponent rating of ${Math.round(c.meanOpponentElo)} across ` +
    `${c.fights} UFC fights — ${tier} by opposition faced (${c.percentile}th percentile all-time).`,
  ];

  if (c.eliteFaced > 0) {
    const one = c.eliteFaced === 1;
    parts.push(
      `${c.eliteFaced} of those opponents ${one ? 'was' : 'were'} elite-rated ` +
      `(${RANKING_CONFIG.careerSos.eliteOpponentElo}+) at the time` +
      (c.eliteBeaten > 0
        ? `, and ${c.eliteBeaten === c.eliteFaced ? (one ? 'that one' : 'all of them') : c.eliteBeaten} lost.`
        : `, and ${one ? 'that one won' : 'none of them lost'}.`)
    );
  } else {
    parts.push('None of those opponents were elite-rated at the time they met.');
  }

  if (c.toughest) {
    parts.push(
      `The toughest was ${c.toughest.name} at ${Math.round(c.toughest.elo)} ` +
      `(${c.toughest.date.slice(0, 4)}, ${c.toughest.result === 'W' ? 'won' : c.toughest.result === 'L' ? 'lost' : 'drew'}).`
    );
  }

  if (c.eraCaveat) {
    parts.push(
      'Career is mostly pre-' + RANKING_CONFIG.careerSos.eraCaveatBeforeYear +
      ', when every rating still sat near the 1500 cold start — the figure understates the era.'
    );
  }

  return parts.join(' ');
}

/**
 * All-time strength of schedule for one fighter. Returns null when the fighter
 * is unknown or has fewer than `careerSos.minFights` traced fights (too thin a
 * sample for a career claim). Display-only — never feeds Elo or the rankings.
 */
export function careerSos(data: LoadedData, fighterId: string): CareerSos | null {
  const fighter = data.fighterMap.get(fighterId);
  if (!fighter) return null;

  const history = getFighterHistory(data, fighterId);
  const mean = meanOpponentElo(history);
  if (mean == null) return null;

  const cfg = RANKING_CONFIG.careerSos;

  const byElo = [...history].sort((a, b) => b.opponentRating - a.opponentRating);
  const topN = byElo.slice(0, cfg.topOpponents);
  const topOpponentElo = topN.reduce((s, h) => s + h.opponentRating, 0) / topN.length;

  const elite = history.filter((h) => h.opponentRating >= cfg.eliteOpponentElo);

  // getFighterHistory returns newest-first.
  const years = history.map((h) => Number(h.date.slice(0, 4)));
  const sortedYears = [...years].sort((a, b) => a - b);
  const medianYear = sortedYears[Math.floor(sortedYears.length / 2)];

  const pool = careerPool(data);
  // Percentile keys off the ROUNDED mean — the same value the UI shows — so two
  // fighters displaying an identical career SoS can never show different
  // percentiles (they otherwise split on invisible sub-0.01 Elo differences).
  const shownMean = Math.round(mean * 100) / 100;
  const below = pool.filter((v) => Math.round(v * 100) / 100 <= shownMean).length;

  const base: Omit<CareerSos, 'summary'> = {
    meanOpponentElo: shownMean,
    percentile: pool.length ? Math.round((below / pool.length) * 100) : 50,
    poolSize: pool.length,
    fights: history.length,
    topOpponentElo: Math.round(topOpponentElo * 100) / 100,
    toughest: byElo[0]
      ? {
          fighterId: byElo[0].opponentId,
          name: byElo[0].opponentName,
          elo: Math.round(byElo[0].opponentRating * 100) / 100,
          date: byElo[0].date,
          result: byElo[0].result,
        }
      : null,
    eliteFaced: elite.length,
    eliteBeaten: elite.filter((h) => h.result === 'W').length,
    firstYear: sortedYears[0],
    lastYear: sortedYears[sortedYears.length - 1],
    eraCaveat: medianYear < cfg.eraCaveatBeforeYear,
  };

  return { ...base, summary: summarize(base, fighter.fullName) };
}
