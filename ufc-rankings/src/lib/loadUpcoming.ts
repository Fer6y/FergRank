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

// Both caches are keyed by the calendar day: the "has this card passed?"
// filter bakes today's date into the result, so a long-lived process must
// rebuild after midnight or it keeps serving fights that already happened.
let cache: Map<string, NextFight> | null = null;
let cacheDay = '';

function load(): Map<string, NextFight> {
  const today = new Date().toISOString().slice(0, 10);
  if (cache && cacheDay === today) return cache;
  cacheDay = today;
  const map = new Map<string, NextFight>();
  if (!fs.existsSync(FILE)) { cache = map; return map; }

  const rows = Papa.parse<Record<string, string>>(fs.readFileSync(FILE, 'utf-8'), {
    header: true,
    skipEmptyLines: true,
  }).data;

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

// ── Full card listing (for the /upcoming tab) ────────────────────────────────
// Unlike the per-fighter NextFight map above, this preserves every bout and its
// card position so the page can render events in date order, bouts in bout_order.
// Display-only, like everything else here.

export interface UpcomingBout {
  boutOrder: number;          // 1 = main event, ascending down the card
  isMainEvent: boolean;
  weightClass: string;
  fighter1Id: string | null;  // our canonical id, null if not in our data
  fighter1Name: string;
  fighter2Id: string | null;
  fighter2Name: string;
}

export interface UpcomingCard {
  eventId: string | null;
  eventName: string;
  eventDate: string;          // ISO "YYYY-MM-DD"
  bouts: UpcomingBout[];      // sorted by boutOrder ascending
}

let cardsCache: UpcomingCard[] | null = null;
let cardsCacheDay = '';

export function getUpcomingCards(): UpcomingCard[] {
  const today = new Date().toISOString().slice(0, 10);
  if (cardsCache && cardsCacheDay === today) return cardsCache;
  cardsCacheDay = today;
  const cards: UpcomingCard[] = [];
  if (!fs.existsSync(FILE)) { cardsCache = cards; return cards; }

  const rows = Papa.parse<Record<string, string>>(fs.readFileSync(FILE, 'utf-8'), {
    header: true,
    skipEmptyLines: true,
  }).data;
  const byEvent = new Map<string, UpcomingCard>();

  for (const r of rows) {
    const eventDate = r.event_date || '';
    if (eventDate && eventDate < today) continue; // drop cards already passed
    const eventName = r.event_name || '';
    const key = (r.event_id || eventName) || 'unknown';

    let card = byEvent.get(key);
    if (!card) {
      card = { eventId: r.event_id || null, eventName, eventDate, bouts: [] };
      byEvent.set(key, card);
    }
    card.bouts.push({
      boutOrder: Number(r.bout_order) || 999,
      isMainEvent: r.is_main_event === '1',
      weightClass: r.weight_class || '',
      fighter1Id: (r.fighter1_ourId || '').trim() || null,
      fighter1Name: r.fighter1_name || '',
      fighter2Id: (r.fighter2_ourId || '').trim() || null,
      fighter2Name: r.fighter2_name || '',
    });
  }

  cardsCache = Array.from(byEvent.values())
    .map((c) => ({ ...c, bouts: c.bouts.sort((a, b) => a.boutOrder - b.boutOrder) }))
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  return cardsCache;
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
