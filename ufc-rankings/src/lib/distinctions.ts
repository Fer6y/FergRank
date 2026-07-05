// ─────────────────────────────────────────────────────────────────────────
//  distinctions.ts — small "decal" badges shown next to a fighter's name.
//
//  Pure, display-only reads over data already assembled in fighterProfile.ts
//  (the Elo trace + the title-fight ledger). NEVER touches the Elo/scoring
//  path. Each decal is either a STATUS badge (champion, undefeated) or a
//  COUNTER badge (title fights ×N, win streak ×N, …). The list is returned
//  sorted by `priority` (ascending) so callers can render left→right and the
//  compact views (rows/compare/p4p) can just take the first 1–2.
//
//  Visuals live in components/DistinctionDecals.tsx; this file only decides
//  WHICH decals a fighter earns and their counts/labels.
// ─────────────────────────────────────────────────────────────────────────

import { getFighterHistory, type FightTrace } from './eloEngine';
import { getTitleRecord, isTitleFight } from './titleFights';
import type { LoadedData } from './loadData';

export type DistinctionKind =
  | 'champion'
  | 'formerChampion'
  | 'titleWins'
  | 'titleFights'
  | 'undefeated'
  | 'winStreak'
  | 'finishStreak'
  | 'mainEvents';

export interface Distinction {
  kind: DistinctionKind;
  count?: number;   // present on COUNTER decals; absent on STATUS decals
  label: string;    // full tooltip / accessible label
  color: string;    // CSS var driving the decal colour
  priority: number; // lower = more important (render first, survive compact cap)
}

// Thresholds — a decal only appears once it's genuinely a distinction.
const MIN_WIN_STREAK = 3;
const MIN_FINISH_STREAK = 2;
const MIN_UNDEFEATED_FIGHTS = 5;

function isFinish(method: string): boolean {
  const m = method.trim().toUpperCase();
  return m.startsWith('KO') || m.startsWith('TKO') || m === 'SUB' || m === 'SUBMISSION';
}

export interface DistinctionInput {
  fighterName: string;
  isChampion: boolean;
  history: FightTrace[]; // newest-first (the Elo trace order)
}

export function buildDistinctions({
  fighterName,
  isChampion,
  history,
}: DistinctionInput): Distinction[] {
  const out: Distinction[] = [];

  // ── Championship (from the title-fight ledger) ──────────────────────────
  if (isChampion) {
    out.push({
      kind: 'champion',
      label: 'Reigning champion',
      color: 'var(--accent-gold)',
      priority: 0,
    });
  }
  const title = getTitleRecord(fighterName);
  // Held a belt at some point (won a title bout) but isn't the reigning champ —
  // an ex-champion. Sits just under the reigning-champion slot.
  if (!isChampion && title.wins > 0) {
    out.push({
      kind: 'formerChampion',
      label: 'Former champion',
      color: 'var(--accent-gold)',
      priority: 0.5,
    });
  }
  if (title.wins > 0) {
    out.push({
      kind: 'titleWins',
      count: title.wins,
      label: `${title.wins} championship ${title.wins === 1 ? 'win' : 'wins'}`,
      color: 'var(--accent-gold)',
      priority: 1,
    });
  }
  if (title.appearances > 0) {
    out.push({
      kind: 'titleFights',
      count: title.appearances,
      label: `${title.appearances} title ${title.appearances === 1 ? 'fight' : 'fights'}`,
      color: 'var(--accent-gold)',
      priority: 2,
    });
  }

  // ── Form / streaks (from the Elo trace, newest-first) ───────────────────
  const losses = history.filter((h) => h.result === 'L').length;
  if (losses === 0 && history.length >= MIN_UNDEFEATED_FIGHTS) {
    out.push({
      kind: 'undefeated',
      label: `Undefeated in the UFC (${history.length}-0)`,
      color: 'var(--accent-blue)',
      priority: 3,
    });
  }

  let winStreak = 0;
  for (const h of history) {
    if (h.result === 'W') winStreak++;
    else break;
  }
  if (winStreak >= MIN_WIN_STREAK) {
    out.push({
      kind: 'winStreak',
      count: winStreak,
      label: `${winStreak}-fight win streak`,
      color: 'var(--accent-green)',
      priority: 4,
    });
  }

  let finishStreak = 0;
  for (const h of history) {
    if (h.result === 'W' && isFinish(h.method)) finishStreak++;
    else break;
  }
  if (finishStreak >= MIN_FINISH_STREAK) {
    out.push({
      kind: 'finishStreak',
      count: finishStreak,
      label: `${finishStreak}-fight finish streak`,
      color: 'var(--accent-red-light)',
      priority: 5,
    });
  }

  // ── Main events: 5-round headliners that were NOT title fights (title
  //    fights already show as gold; purple mirrors the Gauntlet's halo). ──
  const mainEvents = history.filter(
    (h) => h.fiveRound && !isTitleFight(fighterName, h.opponentName, h.date, h.weightClass),
  ).length;
  if (mainEvents > 0) {
    out.push({
      kind: 'mainEvents',
      count: mainEvents,
      label: `${mainEvents} non-title main ${mainEvents === 1 ? 'event' : 'events'}`,
      color: 'var(--accent-purple)',
      priority: 6,
    });
  }

  return out.sort((a, b) => a.priority - b.priority);
}

// Attach `distinctions` to ranked-fighter-shaped rows at the API boundary — the
// same pattern as fighterMedia.attachMedia. Mutates + returns the array. The
// caller supplies loaded data so we can pull each fighter's Elo trace.
export function attachDistinctions<
  T extends {
    fighterId: string;
    fullName: string;
    officialRank?: string | null;
    belt?: boolean;
    distinctions?: Distinction[];
  },
>(data: LoadedData, fighters: T[]): T[] {
  for (const f of fighters) {
    f.distinctions = buildDistinctions({
      fighterName: f.fullName,
      isChampion: f.officialRank === 'C' || f.belt === true,
      history: getFighterHistory(data, f.fighterId),
    });
  }
  return fighters;
}
