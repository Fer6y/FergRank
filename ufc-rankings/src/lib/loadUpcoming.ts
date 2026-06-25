// ─────────────────────────────────────────────────────────────────────────
//  loadUpcoming.ts — scheduled (not-yet-fought) bouts per fighter.
//
//  Reads data/upcoming_fights.csv (produced by scripts/sherdog/buildUpcoming.ts)
//  and exposes each fighter's NEXT booked fight. This is STRICTLY presentation —
//  upcoming bouts have no result and never touch the Elo/scoring path. Attached
//  at the API boundary (like fighterMedia.ts), so the algorithm stays unaware.
//
//  Missing file → empty map (the feature simply doesn't render until the first
//  buildUpcoming run produces the CSV).
// ─────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const FILE = path.join(process.cwd(), 'data', 'upcoming_fights.csv');

export interface NextFight {
  opponentId: string | null;  // our canonical id, null if the opponent isn't in our data
  opponentName: string;
  weightClass: string;
  eventName: string;
  eventDate: string;          // ISO "YYYY-MM-DD"
  eventId: string | null;
  isMainEvent: boolean;
}

// Optional next-fight field mixed onto any object carrying a `fighterId`.
export interface WithNextFight {
  nextFight?: NextFight;
}

let cache: Map<string, NextFight> | null = null;

function load(): Map<string, NextFight> {
  if (cache) return cache;
  const map = new Map<string, NextFight>();
  if (!fs.existsSync(FILE)) { cache = map; return map; }

  const rows = Papa.parse<Record<string, string>>(fs.readFileSync(FILE, 'utf-8'), {
    header: true,
    skipEmptyLines: true,
  }).data;

  const today = new Date().toISOString().slice(0, 10);

  // Index a bout under each side that resolved to one of our fighters. A fighter
  // keeps only their EARLIEST still-upcoming bout (rows can arrive in any order).
  const consider = (fighterId: string, bout: NextFight): void => {
    if (!fighterId) return;
    if (bout.eventDate && bout.eventDate < today) return; // drop a card already passed
    const cur = map.get(fighterId);
    if (!cur || (bout.eventDate && bout.eventDate < cur.eventDate)) map.set(fighterId, bout);
  };

  for (const r of rows) {
    const eventName = r.event_name || '';
    const eventDate = r.event_date || '';
    const eventId = r.event_id || null;
    const weightClass = r.weight_class || '';
    const isMainEvent = r.is_main_event === '1';
    const id1 = (r.fighter1_ourId || '').trim();
    const id2 = (r.fighter2_ourId || '').trim();
    const name1 = r.fighter1_name || '';
    const name2 = r.fighter2_name || '';

    consider(id1, {
      opponentId: id2 || null, opponentName: name2,
      weightClass, eventName, eventDate, eventId, isMainEvent,
    });
    consider(id2, {
      opponentId: id1 || null, opponentName: name1,
      weightClass, eventName, eventDate, eventId, isMainEvent,
    });
  }

  cache = map;
  return map;
}

export function getNextFight(fighterId: string): NextFight | undefined {
  return load().get(fighterId);
}

// Attach the next-fight field to ranked-fighter payloads in place at the API
// boundary. No-op for fighters with no booked fight.
export function attachNextFight<T extends WithNextFight & { fighterId: string }>(fighters: T[]): T[] {
  const map = load();
  for (const f of fighters) {
    const n = map.get(f.fighterId);
    if (n) f.nextFight = n;
  }
  return fighters;
}
