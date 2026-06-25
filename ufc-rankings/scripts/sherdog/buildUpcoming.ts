// buildUpcoming: pull the NEXT few scheduled UFC cards into a display-only
// dataset (data/upcoming_fights.csv) so the app can show "next fight" context.
//
// SAFE-BY-CONSTRUCTION: these bouts have NO result. They never enter the Elo
// sweep — the app side (src/lib/loadUpcoming.ts) reads this file purely for
// display, the same way fighterMedia.ts attaches photos. The scoring engine
// never imports it.
//
// WHAT IT DOES:
//   1. Fetch the UFC org index → list upcoming events (parseOrgEvents).
//   2. Keep UFC events dated today-or-later, take the soonest N (default 3).
//   3. Fetch each event card → parseUpcomingCard → scheduled bouts (pairings).
//   4. Resolve each Sherdog fighter id → our canonical id via the crosswalk
//      (unresolved fighters keep a de-slugged name so the bout still displays).
//   5. Overwrite data/upcoming_fights.csv (the file is a fresh snapshot each run,
//      so cancellations/reshuffles self-heal — no accumulate-merge needed).
//
// ⚠️  Run by YOU or CI at build time, NEVER by Claude — step 1/3 crawl Sherdog,
//     whose robots.txt disallows ClaudeBot. See fetchProfile.ts.
//
// Run from ufc-rankings/:
//   node_modules/.bin/jiti scripts/sherdog/buildUpcoming.ts             # next 3 cards
//   node_modules/.bin/jiti scripts/sherdog/buildUpcoming.ts --cards 4   # widen
//   node_modules/.bin/jiti scripts/sherdog/buildUpcoming.ts --event UFC-329-..-111889  # one known card (offline if cached)
//   node_modules/.bin/jiti scripts/sherdog/buildUpcoming.ts --dry       # discover only, write nothing
import fs from 'fs';
import path from 'path';
import { fetchOrgEvents, fetchEventPage } from './fetchProfile';
import { parseOrgEvents, parseUpcomingCard } from './parseEvent';
import { loadAllData } from '../../src/lib/loadData';
import type { UpcomingEvent } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const CROSSWALK = path.join(DATA_DIR, 'sherdog_crosswalk.csv');
const OUT = path.join(DATA_DIR, 'upcoming_fights.csv');

interface Args { cards: number; event: string | null; dry: boolean; }
function parseArgs(argv: string[]): Args {
  const args: Args = { cards: 3, event: null, dry: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cards') args.cards = Math.max(1, parseInt(argv[++i] ?? '3', 10) || 3);
    else if (a === '--event') args.event = argv[++i] ?? null;
    else if (a === '--dry') args.dry = true;
  }
  return args;
}

function isUFCEvent(name: string): boolean {
  return /^UFC\b/i.test(name.trim());
}

// sherdog slug-id → { ourId, fullName }, from the verified crosswalk joined to
// our registry. First 3 columns (ourId, fullName, sherdogId) never contain
// commas, so a plain split is safe for them (the quoted notes column is last).
function readCrosswalk(): Map<string, { ourId: string; name: string }> {
  const map = new Map<string, { ourId: string; name: string }>();
  if (!fs.existsSync(CROSSWALK)) return map;
  const data = loadAllData();
  const lines = fs.readFileSync(CROSSWALK, 'utf-8').split('\n').slice(1).filter(Boolean);
  for (const ln of lines) {
    const c = ln.split(',');
    const ourId = (c[0] ?? '').trim();
    const sherdogId = (c[2] ?? '').trim();
    if (!ourId || !sherdogId) continue;
    const f = data.fighterMap.get(ourId);
    map.set(sherdogId, { ourId, name: f?.fullName ?? (c[1] ?? '').trim() });
  }
  return map;
}

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const HEAD =
  'event_id,event_name,event_date,bout_order,is_main_event,weight_class,' +
  'fighter1_ourId,fighter1_name,fighter1_sherdogId,' +
  'fighter2_ourId,fighter2_name,fighter2_sherdogId,fetched_at';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const today = new Date().toISOString().slice(0, 10);

  // 1–2. Decide which cards to pull.
  let targets: { eventId: string; name: string; date: string | null }[];
  if (args.event) {
    targets = [{ eventId: args.event, name: args.event, date: null }];
    console.log(`[buildUpcoming] single-event mode: ${args.event}`);
  } else {
    console.log('[buildUpcoming] fetching UFC org index (fresh)…');
    const all = parseOrgEvents(await fetchOrgEvents({ force: true }));
    const upcoming = all
      .filter((e) => e.eventId && isUFCEvent(e.name) && e.date && e.date >= today)
      .sort((a, b) => (a.date! < b.date! ? -1 : 1));
    targets = upcoming.slice(0, args.cards).map((e) => ({ eventId: e.eventId!, name: e.name, date: e.date }));
    console.log(`[buildUpcoming] ${upcoming.length} upcoming UFC card(s); taking the next ${targets.length}:`);
    for (const t of targets) console.log(`   • ${t.date ?? '?'}  ${t.name}`);
    if (targets.length === 0) {
      console.log('[buildUpcoming] no upcoming cards found — nothing to write. Done.');
      return;
    }
  }

  if (args.dry) {
    console.log('[buildUpcoming] --dry: discovery only, writing nothing.');
    return;
  }

  // 3. Pull + parse each card.
  const crosswalk = readCrosswalk();
  if (crosswalk.size === 0) console.warn('[buildUpcoming] ⚠ empty crosswalk — every fighter will be unresolved.');

  const events: UpcomingEvent[] = [];
  for (const t of targets) {
    const { html, fromCache } = await fetchEventPage(t.eventId, { force: !args.event });
    const ev = parseUpcomingCard(html);
    // Prefer the org-index date/name when the card page omits them.
    ev.date ??= t.date;
    if (!ev.name) ev.name = t.name;
    ev.eventId ??= t.eventId;
    console.log(`[buildUpcoming] "${ev.name}" (${ev.date ?? '?'}) → ${ev.bouts.length} bout(s)${fromCache ? ' [cached]' : ''}`);
    events.push(ev);
  }

  // 4–5. Resolve ids and write.
  const lines = [HEAD];
  let resolved = 0, unresolved = 0;
  const resolve = (sherdogId: string, fallbackName: string) => {
    const hit = crosswalk.get(sherdogId);
    if (hit) { resolved++; return { ourId: hit.ourId, name: hit.name }; }
    unresolved++;
    return { ourId: '', name: fallbackName };
  };

  for (const ev of events) {
    for (const b of ev.bouts) {
      const f1 = resolve(b.fighter1Id, b.fighter1Name);
      const f2 = resolve(b.fighter2Id, b.fighter2Name);
      lines.push([
        ev.eventId ?? '', ev.name, ev.date ?? '',
        String(b.order), b.isMainEvent ? '1' : '0', b.weightClass,
        f1.ourId, f1.name, b.fighter1Id,
        f2.ourId, f2.name, b.fighter2Id,
        today,
      ].map(esc).join(','));
    }
  }

  fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf-8');
  const bouts = lines.length - 1;
  console.log(`[buildUpcoming] wrote ${path.relative(process.cwd(), OUT)} — ${events.length} event(s), ${bouts} bout(s)`);
  console.log(`[buildUpcoming] fighter ids: ${resolved} resolved, ${unresolved} unresolved (kept by name)`);
}

// Only run when invoked directly — NEVER on import (this can crawl Sherdog).
if (process.argv[1] && /buildUpcoming\.ts$/.test(process.argv[1])) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
