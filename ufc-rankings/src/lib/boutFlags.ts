// ─────────────────────────────────────────────────────────────────────────
//  boutFlags.ts — per-BOUT context flags (short notice / missed weight).
//
//  These describe a specific booking, not a fighter's skill, so they live in a
//  maintainer-populated file (data/bout_flags.csv) rather than any career stat —
//  the same "one supplementary CSV" pattern as the recency patch and DOB feed.
//  Absent file → no flags (feature inert). Names are resolved to ids at load, so
//  the file can be edited by name. Display + prediction-context only; NEVER feeds
//  Elo or the rankings.
//
//  Schema:  date,fighter_name,flag,note
//    flag ∈ { short_notice, missed_weight }   (one row per flagged fighter/bout)
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from './loadData';
import { buildNameIndex, resolveNameToId } from './nameResolver';

export interface BoutFlagSet {
  shortNotice: boolean;
  missedWeight: boolean;
}
const NONE: BoutFlagSet = { shortNotice: false, missedWeight: false };

const FILE = path.join(process.cwd(), 'data', 'bout_flags.csv');
const DAY_TOL = [0, 1, -1, 2, -2];
let cache: Map<string, BoutFlagSet> | null = null;

function load(): Map<string, BoutFlagSet> {
  if (cache) return cache;
  cache = new Map();
  if (!fs.existsSync(FILE)) return cache;
  const rows = Papa.parse<Record<string, string>>(fs.readFileSync(FILE, 'utf-8'), {
    header: true, skipEmptyLines: true,
  }).data;
  const nameIndex = buildNameIndex(loadAllData().fighters);
  for (const r of rows) {
    const name = r['fighter_name']; const date = (r['date'] || '').slice(0, 10);
    if (!name || !date) continue;
    const id = resolveNameToId(name, nameIndex, { allowLastFirst: false, quiet: true });
    if (!id) continue;
    const flag = (r['flag'] || '').toLowerCase().trim();
    const key = `${id}|${date}`;
    const cur = cache.get(key) ?? { shortNotice: false, missedWeight: false };
    if (flag === 'short_notice') cur.shortNotice = true;
    if (flag === 'missed_weight') cur.missedWeight = true;
    cache.set(key, cur);
  }
  return cache;
}

function isoDay(d: Date | string): string {
  return typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}

// Flags for a fighter in a bout on `eventDate` (± a day or two for date drift).
export function getBoutFlags(fighterId: string, eventDate: Date | string): BoutFlagSet {
  const m = load();
  if (m.size === 0) return NONE;
  const base = new Date(`${isoDay(eventDate)}T00:00:00Z`).getTime();
  for (const off of DAY_TOL) {
    const dd = new Date(base + off * 86_400_000).toISOString().slice(0, 10);
    const hit = m.get(`${fighterId}|${dd}`);
    if (hit) return hit;
  }
  return NONE;
}

export function hasAnyFlags(f: BoutFlagSet): boolean {
  return f.shortNotice || f.missedWeight;
}
