// ─────────────────────────────────────────────────────────────────────────
//  research/dwcs/joinDwcsOdds.ts — the DWCS odds ↔ bout join (Phase C.3).
//
//  DWCS bouts have NO point-in-time Elo (they are not in the Elo sweep), so
//  the UFC backtests' id-based PIT join cannot apply. This join is NAME-based:
//  normalized name pair + date with ±2-day tolerance (odds sites date by
//  local card date), with research/oddsNameOverrides.ts applied first — the
//  same alias map the UFC odds join uses.
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { ODDS_NAME_OVERRIDES } from '../oddsNameOverrides';

export interface DwcsBout {
  date: string;
  season: number;
  week: string;
  eventName: string;
  sherdogIdA: string;
  sherdogIdB: string;
  ourIdA: string;
  ourIdB: string;
  nameA: string;
  nameB: string;
  winnerSherdogId: string;
  method: string;
  round: string;
}

export interface DwcsOddsRow {
  date: string;
  event_slug: string;
  fighter1: string;
  fighter2: string;
  open1: string;
  open2: string;
  close1: string;
  close2: string;
  n_books: string;
}

export interface JoinedDwcsBout {
  bout: DwcsBout;
  odds: DwcsOddsRow;
  /** decimal closing odds aligned to the bout's A/B corners */
  closeA: number;
  closeB: number;
}

// Token-SORTED normalization: BFO and Sherdog disagree on name order for some
// fighters ("Long Xiao" vs "Xiao Long"), and generational suffixes come and go
// ("Reyes Cortez" vs "Reyes Cortez Jr."). Sorting tokens within a name is safe
// here because the join key is the full PAIR + a date window — two different
// fighters with the same token multiset meeting the same opponent the same
// week is not a real case.
export const normName = (s: string): string =>
  (ODDS_NAME_OVERRIDES[s] ?? s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');

const dayNum = (iso: string): number => Math.floor(Date.parse(iso) / 86_400_000);
// ±7 days, wider than the UFC join's ±2: BFO dated the DWCS 2021 week-8 page a
// full week after Sherdog's card date. Safe for the same reason token-sorting
// is — the key is the exact fighter pair, and DWCS pairs don't rematch.
const DAY_TOL = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7];

export function loadDwcsBouts(): DwcsBout[] {
  const csv = fs.readFileSync(path.join(process.cwd(), 'data', 'dwcs_bouts.csv'), 'utf8');
  return Papa.parse<DwcsBout>(csv, { header: true, skipEmptyLines: true, dynamicTyping: false }).data;
}

export interface DwcsJoinResult {
  joined: JoinedDwcsBout[];
  oddsRows: number;
  unmatchedOdds: DwcsOddsRow[];
}

export function joinDwcsOdds(bouts: DwcsBout[]): DwcsJoinResult {
  const oddsPath = path.join(process.cwd(), 'data', 'bfo_dwcs_odds.csv');
  if (!fs.existsSync(oddsPath)) return { joined: [], oddsRows: 0, unmatchedOdds: [] };
  const odds = Papa.parse<DwcsOddsRow>(fs.readFileSync(oddsPath, 'utf8'), {
    header: true,
    skipEmptyLines: true,
  }).data;

  const boutByKey = new Map<string, DwcsBout>();
  for (const b of bouts) {
    if (!b.date) continue;
    const key = [normName(b.nameA), normName(b.nameB)].sort().join('|');
    boutByKey.set(`${key}|${dayNum(b.date)}`, b);
  }

  const joined: JoinedDwcsBout[] = [];
  const unmatchedOdds: DwcsOddsRow[] = [];
  for (const o of odds) {
    const c1 = parseFloat(o.close1);
    const c2 = parseFloat(o.close2);
    if (!(c1 > 1) || !(c2 > 1)) continue;
    const pair = [normName(o.fighter1), normName(o.fighter2)].sort().join('|');
    const day = dayNum(o.date);
    let bout: DwcsBout | undefined;
    for (const tol of DAY_TOL) {
      bout = boutByKey.get(`${pair}|${day + tol}`);
      if (bout) break;
    }
    if (!bout) {
      unmatchedOdds.push(o);
      continue;
    }
    const f1IsA = normName(o.fighter1) === normName(bout.nameA);
    joined.push({
      bout,
      odds: o,
      closeA: f1IsA ? c1 : c2,
      closeB: f1IsA ? c2 : c1,
    });
  }
  return { joined, oddsRows: odds.length, unmatchedOdds };
}
