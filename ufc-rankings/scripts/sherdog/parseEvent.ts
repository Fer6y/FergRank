// Sherdog event/org-listing HTML → structured event data.
//
// ISOLATION: this is the ONE file that knows the Sherdog ORG-LISTING and
// EVENT-CARD HTML shapes (parseProfile.ts is the equivalent for profiles). If
// Sherdog changes that markup, only this file (and its tests) change.
//
// ⚠️  FIXTURE CAVEAT: unlike parseProfile (verified against 4 saved profile
//     fixtures), we have no saved org/event fixtures yet — the crawler is run
//     by a human at build time, not by Claude. The selectors below are written
//     DEFENSIVELY (generic link extraction with fallbacks, the same approach as
//     parseSearchResults) so they survive minor markup drift, and are covered by
//     synthetic-HTML unit tests in parseEvent.test.ts. To finalize: save one real
//     org page + one real event page into fixtures/ and add them to the test.
import * as cheerio from 'cheerio';

type Cheerio = ReturnType<typeof cheerio.load>;

// One event as listed on the org index page.
export interface EventListItem {
  eventId: string;      // slug-id, e.g. "UFC-328-Chimaev-vs-Strickland-111957"
  name: string;         // e.g. "UFC 328 - Chimaev vs. Strickland"
  date: string | null;  // normalized ISO "YYYY-MM-DD" (null if unparseable)
}

// The roster of one event card.
export interface EventCard {
  eventId: string | null;
  name: string;
  date: string | null;     // ISO "YYYY-MM-DD"
  fighterIds: string[];    // Sherdog slug-ids on the card (deduped, card order)
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

// Accepts the three shapes Sherdog uses across these pages:
//   ISO meta content  "2026-06-07T18:00:00-04:00"  → "2026-06-07"
//   profile style     "Jun / 07 / 2026"            → "2026-06-07"
//   listing style     "Jun 7, 2026"                → "2026-06-07"
export function toISODate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // ISO fast-path (meta[content] / datetime attrs).
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const cleaned = trimmed.replace(/\//g, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const m = cleaned.match(/^([A-Za-z]{3,})\s+(\d{1,2})\s+(\d{4})$/);
  if (!m) return null;
  const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (!mon) return null;
  return `${m[3]}-${mon}-${m[2].padStart(2, '0')}`;
}

function idFromHref(href: string | undefined, segment: string): string | null {
  if (!href) return null;
  const m = href.match(new RegExp(`/${segment}/([^/?#"]+)`));
  // Sherdog ids always end in a numeric suffix; guard against nav/category links.
  return m && /-\d+$/.test(m[1]) ? m[1] : null;
}

// Pull the date attached to (or sitting near) one event row. Tries, in order:
// a meta/time ISO attribute, then any text that looks like a date.
function rowDate($: Cheerio, scope: ReturnType<Cheerio>): string | null {
  const metaContent =
    scope.find('meta[itemprop="startDate"]').attr('content') ??
    scope.find('[datetime]').attr('datetime');
  const fromMeta = toISODate(metaContent);
  if (fromMeta) return fromMeta;

  // Fall back to visible date text (e.g. a <span class="date"> or a plain cell).
  const candidates = [
    scope.find('.date').first().text(),
    scope.find('time').first().text(),
    scope.text(),
  ];
  for (const c of candidates) {
    const d = toISODate(c);
    if (d) return d;
  }
  return null;
}

// Parse the UFC org index → recent (and upcoming) events with dates.
// Strategy: find every /events/ anchor with a numeric id, dedup by id, and
// attach the date from its enclosing row. Robust to which <table>/<div> wraps it.
export function parseOrgEvents(html: string): EventListItem[] {
  const $ = cheerio.load(html);
  const out: EventListItem[] = [];
  const seen = new Set<string>();

  $('a[href*="/events/"]').each((_, a) => {
    const $a = $(a);
    const eventId = idFromHref($a.attr('href'), 'events');
    if (!eventId || seen.has(eventId)) return;

    const name = $a.text().trim();
    if (!name) return; // skip image-only / empty anchors (the text anchor is the canonical one)
    seen.add(eventId);

    // Date lives in the same row (table layout) or the nearest container.
    const row = $a.closest('tr');
    const scope = row.length ? row : $a.closest('div');
    out.push({ eventId, name, date: rowDate($, scope) });
  });

  return out;
}

// Parse one event card → the Sherdog ids of every fighter on it.
// Strategy: collect every /fighter/ anchor with a numeric id (the main-event
// header block AND the prelim/undercard table both use these), deduped in
// document order. Event name + date come from the page header.
export function parseEventCard(html: string): EventCard {
  const $ = cheerio.load(html);

  const fighterIds: string[] = [];
  const seen = new Set<string>();
  $('a[href*="/fighter/"]').each((_, a) => {
    const id = idFromHref($(a).attr('href'), 'fighter');
    if (!id) return;
    // Dedup on the NUMERIC suffix, not the full slug: Sherdog renders the same
    // fighter with varying slug text on one page (e.g. "Sean-OMalley-135099" and
    // "Sean-O'Malley-135099" both → id 135099). Keep the first slug seen — any
    // spelling resolves to the same profile when fetched.
    const numeric = id.match(/-(\d+)$/)?.[1] ?? id;
    if (seen.has(numeric)) return;
    seen.add(numeric);
    fighterIds.push(id);
  });

  // Canonical event id from the og:url / ld+json / first self-referential link.
  let eventId: string | null = null;
  const canon =
    $('meta[property="og:url"]').attr('content') ??
    $('link[rel="canonical"]').attr('href') ??
    '';
  eventId = idFromHref(canon, 'events');

  const name =
    $('[itemprop="name"]').first().text().trim() ||
    $('h1 .event_detail span[itemprop="name"]').first().text().trim() ||
    $('h1').first().text().trim();

  const date =
    toISODate($('meta[itemprop="startDate"]').attr('content')) ??
    toISODate($('[itemprop="startDate"]').first().text()) ??
    toISODate($('.authors_info .date').first().text());

  return { eventId, name, date, fighterIds };
}
