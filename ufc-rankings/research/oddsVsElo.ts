// ─────────────────────────────────────────────────────────────────────────
//  research/oddsVsElo.ts — exploratory odds-vs-Elo summary.
//
//  The actual join now lives in backtest/pointInTime.ts (the one sanctioned
//  point-in-time predictor). This module is a thin exploratory view over it:
//  it maps the canonical JoinedSample to the original OddsEloRow shape and
//  reports the favourite/underdog win-rate summary used by runOddsVsElo.
//
//      src/lib (Elo, names, data)  ─┐
//      research/loadOdds (odds)    ─┴─► backtest/pointInTime ─► oddsVsElo ─► out
//
//  Still one-way: nothing here is imported by the engine, and odds never feed a
//  rating. Delete research/ and the rankings are byte-identical.
// ─────────────────────────────────────────────────────────────────────────

import { loadAllData, type LoadedData } from '../src/lib/loadData';
import { joinOddsToPredictions, type JoinedSample } from './backtest/pointInTime';
import type { OddsEloRow } from './oddsTypes';

// Market's de-vigged implied probability for the favourite (proportional /
// multiplicative method — Phase 1's devig.ts offers less-biased alternatives).
function multiplicativeMarketFavProb(favOdds: number, dogOdds: number): number {
  const invFav = 1 / favOdds;
  const invDog = 1 / dogOdds;
  return invFav / (invFav + invDog);
}

function toRow(s: JoinedSample): OddsEloRow {
  const marketFavProb = multiplicativeMarketFavProb(s.favOdds, s.dogOdds);
  const eloFavourite = s.eloProbFav >= 0.5 ? 'favourite' : 'underdog';
  return {
    date: s.date,
    event: s.event,
    favouriteName: s.favName,
    underdogName: s.dogName,
    favouriteId: s.favId,
    underdogId: s.dogId,
    favouriteOdds: s.favOdds,
    underdogOdds: s.dogOdds,
    marketFavProb,
    eloFavProb: s.eloProbFav,
    eloFavourite,
    agree: eloFavourite === 'favourite',
    outcome: s.favWon ? 'favourite' : 'underdog',
    edge: s.eloProbFav - marketFavProb,
  };
}

export interface OddsEloResult {
  rows: OddsEloRow[];
  totalOdds: number;       // odds rows considered
  unresolvedNames: number; // a fighter name didn't resolve to an id
  noEloFight: number;      // names resolved but no matching Elo fight found
  unknownOutcome: number;  // matched a bout, but the odds row has no settled winner
}

// Join every closing-odds row to the Elo ratings the fighters held entering
// that bout (default engine). Returns the matched rows plus miss counts.
export function joinOddsToElo(data?: LoadedData): OddsEloResult {
  const d = data ?? loadAllData();
  const { samples, totalOdds, unresolvedNames, noEloFight, unknownOutcome } =
    joinOddsToPredictions(d);
  return {
    rows: samples.map(toRow),
    totalOdds,
    unresolvedNames,
    noEloFight,
    unknownOutcome,
  };
}

// ── Summary statistics over the joined rows (the research payoff) ──
export interface OddsEloSummary {
  matched: number;
  decided: number;            // matched rows with a known winner (== matched here)
  marketFavWinRate: number;   // how often the market favourite won
  eloFavWinRate: number;      // how often Elo's pick won
  agreementRate: number;      // how often Elo and the market agreed on favourite
  // When Elo and the market DISAGREE, Elo backs the market underdog. How often
  // did that underdog actually win? This is the live-dog / value signal.
  disagreements: number;
  eloUnderdogWinRate: number; // win rate of Elo's pick within the disagreement set
  meanAbsProbGap: number;     // mean |eloFavProb − marketFavProb| (calibration)
}

export function summarise(rows: OddsEloRow[]): OddsEloSummary {
  const decided = rows.length; // rows are already decided (unknown outcomes dropped)

  const marketFavWins = rows.filter((r) => r.outcome === 'favourite').length;
  const eloFavWins = rows.filter(
    (r) => (r.eloFavourite === 'favourite' ? 'favourite' : 'underdog') === r.outcome
  ).length;
  const agree = rows.filter((r) => r.agree).length;

  const disagreeRows = rows.filter((r) => !r.agree);
  const eloUnderdogWins = disagreeRows.filter((r) => r.outcome === 'underdog').length;

  const probGap =
    rows.reduce((s, r) => s + Math.abs(r.eloFavProb - r.marketFavProb), 0) /
    (rows.length || 1);

  return {
    matched: rows.length,
    decided,
    marketFavWinRate: decided ? marketFavWins / decided : 0,
    eloFavWinRate: decided ? eloFavWins / decided : 0,
    agreementRate: rows.length ? agree / rows.length : 0,
    disagreements: disagreeRows.length,
    eloUnderdogWinRate: disagreeRows.length ? eloUnderdogWins / disagreeRows.length : 0,
    meanAbsProbGap: probGap,
  };
}
