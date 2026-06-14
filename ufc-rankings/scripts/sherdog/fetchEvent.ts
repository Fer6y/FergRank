// fetchEvent: the "what fought this week" discovery step (Phase 1 of the weekly
// auto-ingest pipeline — see CLAUDE.md / the weekly-update plan).
//
// WHY THIS EXISTS: buildRecencyPatch reads cached profile HTML, but the cache is
// profile-oriented (30-day freshness), so a fighter who competed days ago would
// be SKIPPED on a plain re-crawl and their new bout never reach the patch. This
// script discovers the past week's UFC card(s) and FORCE-refreshes exactly those
// fighters' profiles — one card's roster (~24 profiles), not a 2,600-profile
// re-crawl. After this runs, buildRecencyPatch picks the new fights up normally.
//
// ⚠️  Run by YOU (or CI) at build time, never by the app. Network-polite via the
//     throttling in fetchProfile.ts.
//
// Usage:
//   npx tsx scripts/sherdog/fetchEvent.ts                # past 8 days of UFC cards
//   npx tsx scripts/sherdog/fetchEvent.ts --days 14      # widen the window
//   npx tsx scripts/sherdog/fetchEvent.ts --event UFC-328-..-111957   # one known card
//   npx tsx scripts/sherdog/fetchEvent.ts --dry          # discover only, refresh nothing
import { fetchOrgEvents, fetchEventPage, fetchProfile } from './fetchProfile';
import { parseOrgEvents, parseEventCard, type EventListItem } from './parseEvent';

interface Args { days: number; event: string | null; dry: boolean; }

function parseArgs(argv: string[]): Args {
  const args: Args = { days: 8, event: null, dry: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--days') args.days = Math.max(1, parseInt(argv[++i] ?? '8', 10) || 8);
    else if (a === '--event') args.event = argv[++i] ?? null;
    else if (a === '--dry') args.dry = true;
  }
  return args;
}

function isUFCEvent(name: string): boolean {
  return /^UFC\b/i.test(name.trim());
}

// Events whose date is within [now - days, now]. Undated events are kept (a
// freshly-listed card sometimes lacks a parsed date) so we don't silently miss
// the very card we're after — the per-fighter strictly-newer filter in
// buildRecencyPatch is the real backstop against pulling anything stale.
function withinWindow(ev: EventListItem, days: number, now: Date): boolean {
  if (!ev.date) return true;
  const t = new Date(ev.date + 'T00:00:00Z').getTime();
  const ageDays = (now.getTime() - t) / 86400_000;
  return ageDays >= -1 && ageDays <= days; // allow ~1 day future skew for TZs
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();

  // 1. Determine which event cards to pull.
  let events: EventListItem[];
  if (args.event) {
    events = [{ eventId: args.event, name: args.event, date: null }];
    console.log(`[fetchEvent] single-event mode: ${args.event}`);
  } else {
    console.log(`[fetchEvent] fetching UFC org index (fresh)…`);
    const orgHtml = await fetchOrgEvents({ force: true });
    const all = parseOrgEvents(orgHtml);
    console.log(`[fetchEvent] org index lists ${all.length} event link(s)`);
    events = all.filter((e) => isUFCEvent(e.name) && withinWindow(e, args.days, now));
    console.log(`[fetchEvent] ${events.length} UFC event(s) within the last ${args.days} day(s):`);
    for (const e of events) console.log(`   • ${e.date ?? '(undated)'}  ${e.name}  [${e.eventId}]`);
    if (events.length === 0) {
      console.log('[fetchEvent] nothing in window — no UFC card this week. Done.');
      return;
    }
  }

  // 2. Pull each card → collect the fighters who competed.
  const fighterIds = new Set<string>();
  for (const ev of events) {
    if (!ev.eventId) continue;
    const { html, fromCache } = await fetchEventPage(ev.eventId, { force: !args.event });
    const card = parseEventCard(html);
    console.log(
      `[fetchEvent] card "${card.name || ev.name}" (${card.date ?? ev.date ?? '?'}) ` +
      `→ ${card.fighterIds.length} fighter(s)${fromCache ? ' [cached]' : ''}`
    );
    for (const id of card.fighterIds) fighterIds.add(id);
  }
  console.log(`[fetchEvent] ${fighterIds.size} unique fighter(s) across ${events.length} card(s)`);

  if (args.dry) {
    console.log('[fetchEvent] --dry: skipping profile refresh.');
    for (const id of fighterIds) console.log(`   would refresh: ${id}`);
    return;
  }

  // 3. Force-refresh each fighter's profile so buildRecencyPatch sees the new
  //    bout. This is the whole point — bypass the 30-day cache for the roster.
  let refreshed = 0, failed = 0;
  for (const id of fighterIds) {
    try {
      await fetchProfile(id, { force: true });
      refreshed++;
    } catch (err) {
      failed++;
      console.warn(`[fetchEvent] failed to refresh ${id}: ${String(err)}`);
    }
  }
  console.log(`[fetchEvent] refreshed ${refreshed} profile(s)${failed ? `, ${failed} failed` : ''}.`);
  console.log('[fetchEvent] done — run resolveCrosswalk (for any debutants) then buildRecencyPatch.');
}

// Only run when invoked directly — NEVER on import (this crawls Sherdog).
if (process.argv[1] && /fetchEvent\.ts$/.test(process.argv[1])) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
