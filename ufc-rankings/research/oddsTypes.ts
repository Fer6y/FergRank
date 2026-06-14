// ─────────────────────────────────────────────────────────────────────────
//  research/oddsTypes.ts — types for the closing-odds RESEARCH zone.
//
//  Deliberately SEPARATE from src/lib/types.ts. Nothing in the core data or
//  Elo layer references these types. Betting odds are reference data for
//  retrospective research only — they must never flow back into a rating.
//  See research/README.md for the firewall rules.
// ─────────────────────────────────────────────────────────────────────────

// One row of closing market odds for a single fight (decimal odds).
export interface ClosingOdds {
  date: string;            // YYYY-MM-DD — event date as reported by the source
  event: string;
  favourite: string;       // fighter name (market favourite — lower decimal odds)
  underdog: string;        // fighter name (market underdog)
  favouriteOdds: number;   // decimal odds, e.g. 1.65
  underdogOdds: number;    // decimal odds, e.g. 2.40
  outcome: 'favourite' | 'underdog' | 'unknown'; // who actually won, per source
}

// A closing-odds row joined to the Elo ratings the two fighters carried INTO
// that fight — read from the engine's per-fight trace, never written back.
// This is the unit the research layer analyses.
export interface OddsEloRow {
  date: string;
  event: string;
  favouriteName: string;
  underdogName: string;
  favouriteId: string;
  underdogId: string;
  favouriteOdds: number;
  underdogOdds: number;
  // Market's de-vigged implied win probability for the favourite (0–1).
  marketFavProb: number;
  // Elo's pre-fight win probability for the SAME fighter (the favourite), from
  // the rating that fighter held entering the bout. 0–1.
  eloFavProb: number;
  // Who Elo would have favoured. The market favourite is the favourite by
  // construction; this says whether Elo agreed.
  eloFavourite: 'favourite' | 'underdog';
  agree: boolean;          // did Elo and the closing line pick the same fighter?
  outcome: 'favourite' | 'underdog' | 'unknown';
  // edge = eloFavProb − marketFavProb. Positive ⇒ Elo rated the favourite
  // higher than the closing line implied (a potential value spot to research).
  edge: number;
}

// Why a join attempt did not produce a row — for the audit script.
export type JoinMiss = 'unresolved-name' | 'no-elo-fight';
