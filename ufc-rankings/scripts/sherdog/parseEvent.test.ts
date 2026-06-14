// parseEvent unit tests against SYNTHETIC HTML.
//
// We have no saved org/event fixture yet (crawler is human-run, not Claude-run),
// so these assert the parsing LOGIC against hand-built markup modelled on
// Sherdog's structure. When a real org/event page is saved into fixtures/, add a
// fixture-backed case here too (see parseProfile.test.ts) to catch markup drift.
// Run: npx tsx scripts/sherdog/parseEvent.test.ts
import { parseOrgEvents, parseEventCard, toISODate } from './parseEvent';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); failures++; };
};

// ── toISODate: the three shapes these pages use ──────────────────────────────
console.log('\n=== toISODate ===');
ok(toISODate('2026-06-07T18:00:00-04:00') === '2026-06-07', 'ISO meta content');
ok(toISODate('Jun / 07 / 2026') === '2026-06-07', 'profile slash style');
ok(toISODate('Jun 7, 2026') === '2026-06-07', 'listing comma style');
ok(toISODate('') === null && toISODate(null) === null, 'empty → null');
ok(toISODate('not a date') === null, 'garbage → null');

// ── parseOrgEvents ───────────────────────────────────────────────────────────
console.log('\n=== parseOrgEvents ===');
const orgHtml = `
  <table class="new_table event">
    <tr class="table_head"><td>Date</td><td>Event</td><td>Location</td></tr>
    <tr>
      <td><meta itemprop="startDate" content="2026-06-07T18:00:00-04:00"><span class="date">Jun 7, 2026</span></td>
      <td><a href="/events/UFC-328-Chimaev-vs-Strickland-111957">UFC 328 - Chimaev vs. Strickland</a></td>
      <td>Las Vegas</td>
    </tr>
    <tr>
      <td><span class="date">May 31, 2026</span></td>
      <td><a href="/events/UFC-Fight-Night-Smith-vs-Jones-111900">UFC Fight Night - Smith vs. Jones</a></td>
      <td>Abu Dhabi</td>
    </tr>
    <!-- duplicate link (image anchor) should not double-count -->
    <tr><td></td><td><a href="/events/UFC-328-Chimaev-vs-Strickland-111957"><img></a></td><td></td></tr>
    <!-- non-event nav link should be ignored -->
    <tr><td><a href="/events/recent">Recent Events</a></td></tr>
  </table>`;
const events = parseOrgEvents(orgHtml);
ok(events.length === 2, `2 unique events parsed (got ${events.length})`);
ok(events[0]?.eventId === 'UFC-328-Chimaev-vs-Strickland-111957', 'first event id');
ok(events[0]?.date === '2026-06-07', `first event date from meta (got ${events[0]?.date})`);
ok(events[1]?.date === '2026-05-31', `second event date from text (got ${events[1]?.date})`);
ok(!events.some((e) => e.eventId === 'recent'), 'non-numeric nav link excluded');

// ── parseEventCard ───────────────────────────────────────────────────────────
console.log('\n=== parseEventCard ===');
const cardHtml = `
  <html><head>
    <meta property="og:url" content="https://www.sherdog.com/events/UFC-328-Chimaev-vs-Strickland-111957">
    <meta itemprop="startDate" content="2026-06-07T18:00:00-04:00">
  </head><body>
    <h1><span itemprop="name">UFC 328 - Chimaev vs. Strickland</span></h1>
    <!-- main event header -->
    <div class="fighter left_side"><a href="/fighter/Khamzat-Chimaev-185825">Khamzat Chimaev</a></div>
    <div class="fighter right_side"><a href="/fighter/Sean-Strickland-141783">Sean Strickland</a></div>
    <!-- undercard table -->
    <table class="new_table result">
      <tr><td><a href="/fighter/Khamzat-Chimaev-185825">Khamzat Chimaev</a></td>
          <td><a href="/fighter/Sean-Strickland-141783">Sean Strickland</a></td></tr>
      <tr><td><a href="/fighter/Some-Prospect-302999">Some Prospect</a></td>
          <td><a href="/fighter/Some-Veteran-100001">Some Veteran</a></td></tr>
      <!-- same fighter (id 185825), different slug spelling — must NOT double-count -->
      <tr><td><a href="/fighter/Khamzat-S-Chimaev-185825">Khamzat Chimaev</a></td></tr>
    </table>
    <!-- a non-fighter link to ignore -->
    <a href="/fighter/weightclass">Lightweight</a>
  </body></html>`;
const card = parseEventCard(cardHtml);
ok(card.eventId === 'UFC-328-Chimaev-vs-Strickland-111957', 'card event id from og:url');
ok(card.name === 'UFC 328 - Chimaev vs. Strickland', `card name (got "${card.name}")`);
ok(card.date === '2026-06-07', `card date from meta (got ${card.date})`);
ok(card.fighterIds.length === 4, `4 unique fighters, slug-variant dup collapsed by numeric id (got ${card.fighterIds.length})`);
ok(card.fighterIds.filter((id) => id.endsWith('-185825')).length === 1, 'slug-variant duplicate (id 185825) counted once');
ok(card.fighterIds[0] === 'Khamzat-Chimaev-185825', 'first fighter in document order');
ok(!card.fighterIds.includes('weightclass'), 'non-numeric /fighter/ link excluded');

console.log(failures === 0 ? '\n✅ ALL ASSERTIONS PASSED' : `\n❌ ${failures} assertion(s) failed`);
process.exit(failures === 0 ? 0 : 1);
