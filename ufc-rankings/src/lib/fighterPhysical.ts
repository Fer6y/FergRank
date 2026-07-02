// ─────────────────────────────────────────────────────────────────────────
//  fighterPhysical.ts — physical attributes (reach) lookup.
//
//  Reads data/Fighters.csv (Fighter_Id, Full Name, Ht., Wt., Reach, Stance),
//  keyed by Fighter_Id — which shares the canonical id space used across the
//  app (verified: all Fighters_Stats ids overlap). STRICTLY presentation:
//  attached at the API boundary (like fighterMedia.ts), never in the scoring
//  path. Reach is missing for ~26% of the roster → getReach returns null and
//  the caller hides the row.
// ─────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const FILE = path.join(process.cwd(), 'data', 'Fighters.csv');

let reachById: Map<string, number> | null = null;

function load(): Map<string, number> {
  if (reachById) return reachById;
  const map = new Map<string, number>();
  reachById = map;
  if (!fs.existsSync(FILE)) return map;

  const rows = Papa.parse<Record<string, string>>(fs.readFileSync(FILE, 'utf-8'), {
    header: true,
    skipEmptyLines: true,
  }).data;

  for (const r of rows) {
    const id = (r['Fighter_Id'] || '').trim();
    const reach = parseInt((r['Reach'] || '').trim(), 10);
    if (id && Number.isFinite(reach) && reach > 0) map.set(id, reach);
  }
  return map;
}

// Reach in inches, or null when unrecorded.
export function getReach(fighterId: string): number | null {
  return load().get(fighterId) ?? null;
}
