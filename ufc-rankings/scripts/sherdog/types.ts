// Shared types for the Sherdog backfill pipeline (build-time only).
// See SHERDOG_BACKFILL_PLAN.md for the end-to-end design.

// One parsed pro fight from a fighter's Sherdog profile.
// NOTE: Sherdog profiles do NOT expose a promotion column — the org is encoded
// in the event name/slug ("UFC 328 - ...", "Bellator 250", "LFA 150"). Org→tier
// is resolved DOWNSTREAM (buildContext + sherdog_orgs.csv), not here.
export interface SherdogFight {
  result: 'win' | 'loss' | 'draw' | 'nc';
  opponentName: string;
  opponentId: string | null;   // e.g. "Gilbert-Burns-91727" from /fighter/ href
  eventName: string;           // e.g. "UFC 328 - Chimaev vs. Strickland"
  eventId: string | null;      // e.g. "UFC-328-...-111957" from /events/ href
  date: string | null;         // normalized ISO "YYYY-MM-DD" (null if unparseable)
  method: string;              // e.g. "Submission (Arm-Triangle Choke)"
  referee: string | null;
  round: number | null;
  time: string | null;         // mm:ss as shown
}

// One parsed Sherdog fighter profile.
export interface SherdogProfile {
  sherdogId: string;           // full slug-id, e.g. "Yaroslav-Amosov-104911"
  numericId: string;           // trailing numeric id, e.g. "104911"
  url: string;                 // canonical profile URL
  name: string;
  nickname: string | null;
  nationality: string | null;
  birthDate: string | null;    // ISO if parseable
  heightCm: number | null;
  weightLbs: number | null;
  weightClass: string | null;
  association: string | null;
  fights: SherdogFight[];      // PRO fights only (amateur tables skipped)
}

// Result of fetching one profile (cache-aware).
export interface FetchResult {
  sherdogId: string;
  url: string;
  html: string;
  fromCache: boolean;
}
