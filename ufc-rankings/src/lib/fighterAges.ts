// ─────────────────────────────────────────────────────────────────────────
//  fighterAges.ts — fighter date-of-birth / age lookup (display only).
//
//  Reads data/canonical/fighter_dob.csv (produced by scripts/registry/
//  buildAges.ts: Wikidata P569 via the precise Sherdog-ID join + Sherdog
//  profile fill, career-validated). Age matters for evaluation and
//  projection — age curves are real — but it is PRESENTATION + trend-read
//  context only: nothing here ever touches the Elo/scoring path.
//
//  Missing file → empty map (the app renders without ages until the first
//  buildAges run). `precision: 'year'` DOBs yield approximate ages.
// ─────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const FILE = path.join(process.cwd(), 'data', 'canonical', 'fighter_dob.csv');

export interface FighterAge {
  dob: string;                 // ISO YYYY-MM-DD
  age: number;                 // whole years as of today
  approximate: boolean;        // true when the DOB is year/month precision
}

let cache: Map<string, { dob: string; approximate: boolean }> | null = null;

function load(): Map<string, { dob: string; approximate: boolean }> {
  if (cache) return cache;
  const map = new Map<string, { dob: string; approximate: boolean }>();
  if (!fs.existsSync(FILE)) { cache = map; return map; }

  const rows = Papa.parse<Record<string, string>>(fs.readFileSync(FILE, 'utf-8'), {
    header: true,
    skipEmptyLines: true,
  }).data;

  for (const r of rows) {
    const id = (r.canonical_id || '').trim();
    const dob = (r.dob || '').trim();
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) continue;
    map.set(id, { dob, approximate: r.precision !== 'day' });
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

// Compact display label: "34" or "~34" for year-precision DOBs.
export function ageLabel(a: FighterAge | null): string | null {
  if (!a) return null;
  return a.approximate ? `~${a.age}` : `${a.age}`;
}
