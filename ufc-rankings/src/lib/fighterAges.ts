// ─────────────────────────────────────────────────────────────────────────
//  fighterAges.ts — fighter date-of-birth / age lookup (display only).
//
//  Layered by trust, canonical always first:
//    1. data/canonical/fighter_dob.csv (scripts/registry/buildAges.ts:
//       Wikidata P569 via the precise Sherdog-ID join + Sherdog profile
//       fill, career-validated) — an id↔id join, never fuzzy.
//    2. data/regional_dob_merged.csv (the verified ESPN harvest — every row
//       passed uniqueness, name-match and career-plausibility gates at merge
//       time, and the two ESPN passes agreed on all 7,544 overlapping names).
//       Name-keyed, so it fills ONLY roster ids the canonical file misses,
//       and ONLY when the token-sorted name is unambiguous on BOTH sides —
//       a namesake collision attaches nothing rather than guessing.
//       Wired 2026-08-18: 29% of odds-matched bouts ran with the age overlay
//       dark and 99% of the missing fighters were already in this file
//       (research/backtest/gapProbes.ts probe B).
//
//  Age matters for evaluation and projection — age curves are real — but it
//  is PRESENTATION + win-prob-overlay context only: nothing here ever touches
//  the Elo/scoring path.
//
//  Missing files → smaller map (the app renders without ages until the data
//  exists). `precision: 'year'` DOBs yield approximate ages.
// ─────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const FILE = path.join(process.cwd(), 'data', 'canonical', 'fighter_dob.csv');
const ESPN_FILE = path.join(process.cwd(), 'data', 'regional_dob_merged.csv');
const ROSTER_FILE = path.join(process.cwd(), 'data', 'Fighters_Stats.csv');

export interface FighterAge {
  dob: string;                 // ISO YYYY-MM-DD
  age: number;                 // whole years as of today
  approximate: boolean;        // true when the DOB is year/month precision
}

// TOKEN-SORTED name key — the exact keying regional_dob_merged.csv was built
// with (research/regional/mergeEspnDob.ts): order-insensitive, accents and
// punctuation stripped, suffixes kept as distinct tokens (jr/sr pairs are
// real father/son pairs in this data — collapsing them would invent namesakes).
function nameKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

let cache: Map<string, { dob: string; approximate: boolean }> | null = null;

function parseCsv(file: string): Record<string, string>[] {
  if (!fs.existsSync(file)) return [];
  return Papa.parse<Record<string, string>>(fs.readFileSync(file, 'utf-8'), {
    header: true,
    skipEmptyLines: true,
  }).data;
}

function load(): Map<string, { dob: string; approximate: boolean }> {
  if (cache) return cache;
  const map = new Map<string, { dob: string; approximate: boolean }>();

  // 1. canonical (id-keyed, career-validated) — always wins.
  for (const r of parseCsv(FILE)) {
    const id = (r.canonical_id || '').trim();
    const dob = (r.dob || '').trim();
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) continue;
    map.set(id, { dob, approximate: r.precision !== 'day' });
  }

  // 2. ESPN merged file (name-keyed) fills roster ids canonical misses.
  const espnRows = parseCsv(ESPN_FILE);
  if (espnRows.length) {
    const espnByKey = new Map<string, string>(); // nameKey → dob
    for (const r of espnRows) {
      const dob = (r.dob || '').trim();
      const key = (r.nameKey || '').trim();
      if (key && /^\d{4}-\d{2}-\d{2}$/.test(dob)) espnByKey.set(key, dob);
    }
    // roster name → ids; a key shared by 2+ roster ids is ambiguous → attach
    // nothing (the merge file already dropped its own ESPN-side namesakes).
    const rosterByKey = new Map<string, string[]>();
    for (const r of parseCsv(ROSTER_FILE)) {
      const id = (r['Fighter_Id'] || '').trim();
      const name = (r['Full Name'] || '').trim();
      if (!id || !name) continue;
      const key = nameKey(name);
      if (!key) continue;
      const ids = rosterByKey.get(key);
      if (ids) { if (!ids.includes(id)) ids.push(id); }
      else rosterByKey.set(key, [id]);
    }
    for (const [key, ids] of rosterByKey) {
      if (ids.length !== 1 || map.has(ids[0])) continue;
      const dob = espnByKey.get(key);
      if (dob) map.set(ids[0], { dob, approximate: false });
    }
  }

  cache = map;
  return map;
}

// Age in whole years as of a given date (default: now). Computed at call time
// so a long-lived process never serves a stale birthday.
export function getFighterAge(fighterId: string, asOf: Date = new Date()): FighterAge | null {
  const e = load().get(fighterId);
  if (!e) return null;
  const d = new Date(e.dob + 'T00:00:00Z');
  let age = asOf.getUTCFullYear() - d.getUTCFullYear();
  const beforeBirthday =
    asOf.getUTCMonth() < d.getUTCMonth() ||
    (asOf.getUTCMonth() === d.getUTCMonth() && asOf.getUTCDate() < d.getUTCDate());
  if (beforeBirthday) age--;
  return { dob: e.dob, age, approximate: e.approximate };
}
