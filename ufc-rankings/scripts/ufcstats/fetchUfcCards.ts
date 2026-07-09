// fetchUfcCards: pull UPCOMING fight cards straight from ufc.com/event pages —
// with the authoritative card ORDER and the main-card / prelims / early-prelims
// SECTION split that ufcstats.com does not expose.
//
// Why ufc.com (2026-07-09): the previous source (ufcstats.com, via
// buildUpcomingFromUfcStats.ts) lists announced bouts in announcement order and
// carries NO section labels, so the /upcoming page order drifted from the real
// card (the UFC reshuffles bouts the week of an event) and could not show a
// main-card / undercard divider. ufc.com serves the live card as server-rendered
// HTML (HTTP 200, no JS hydration, no proof-of-work gate) — the same surface the
// rankings scraper reads (fetchUfcRankings.ts) — with explicit `main-card`,
// `prelims-card`, and `early-prelims` section anchors in the correct fight order.
//
// BUILD-TIME ONLY. Called by scripts/ufcstats/buildUpcomingFromUfcCom.ts, which
// writes the committed data/upcoming_fights.csv the running app reads. Never runs
// at request time — same firewall as the ufcstats recency pipeline. Display-only:
// upcoming bouts never touch the Elo/scoring path.
//
// Brittleness note: HTML scraping breaks if UFC restructures the page. The parser
// is defensive (missing sections are simply absent) and the builder is non-fatal
// in the weekly ingest, so a scrape hiccup leaves the last-known-good snapshot.
//
// Run standalone (prints the next cards, writes nothing):
//   node_modules/.bin/jiti scripts/ufcstats/fetchUfcCards.ts
// Self-test the card parser against a saved event page:
//   node_modules/.bin/jiti scripts/ufcstats/fetchUfcCards.ts --selftest <event.html>
import fs from 'fs';

const UFC_EVENTS_URL = 'https://www.ufc.com/events';
const UFC_EVENT_BASE = 'https://www.ufc.com/event/';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// A bout's place on the card. `main` = main card, `prelim` = preliminary card,
// `early` = early prelims. Ordered top-to-bottom within each section.
export type CardSection = 'main' | 'prelim' | 'early';

export interface UfcComBout {
  section: CardSection;
  weightClass: string;   // "Welterweight", "Women's Flyweight", … (no " Bout" suffix)
  fighter1Name: string;  // red corner
  fighter2Name: string;  // blue corner
}

export interface UfcComCard {
  title: string;          // page <h1>, e.g. "UFC 329" / "UFC Fight Night"
  dateSuffix: string;     // hero suffix, e.g. "Sat, Jul 11 / 8:00 PM CDT" (no year)
  bouts: UfcComBout[];    // whole card, main → prelim → early, in fight order
}

export interface UpcomingListItem {
  slug: string;           // "ufc-329"
  timestampSec: number;   // main-card start (UTC epoch seconds) — year source
}

// Minimal HTML entity + smart-quote decode for the fields we read (names,
// weight-class labels, titles). Curly apostrophe → straight so display and
// roster name-matching agree ("Lone'er Kavanagh").
function decode(s: string): string {
  return s
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/[‘’]/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?34;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// The /events index pairs each card's main-card timestamp with its /event/<slug>
// link. Returns UPCOMING cards (timestamp ≥ now) in soonest-first order. The
// timestamp is UTC epoch seconds (used only to source the calendar YEAR; the
// day/month come from the event page's local hero suffix, dodging the UTC slip).
export function parseUpcomingList(html: string, nowSec = Math.floor(Date.now() / 1000)): UpcomingListItem[] {
  const out: UpcomingListItem[] = [];
  const seen = new Set<string>();
  // Each card block: a main-card timestamp shortly followed by its event link.
  const re = /data-main-card-timestamp="(\d+)"[\s\S]{0,4000}?href="\/event\/([a-z0-9-]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const ts = parseInt(m[1], 10);
    const slug = m[2];
    if (!ts || seen.has(slug)) continue;
    seen.add(slug);
    if (ts >= nowSec) out.push({ slug, timestampSec: ts });
  }
  return out.sort((a, b) => a.timestampSec - b.timestampSec);
}

// Pull the two corner names out of one section's HTML block, in document order.
// Captures the whole corner-name div and strips tags, so it tolerates fighters
// with a middle name, a suffix, or no athlete-profile link.
function sectionNames(block: string): string[] {
  return [...block.matchAll(/c-listing-fight__corner-name--(?:red|blue)">([\s\S]*?)<\/div>/g)]
    .map((m) => decode(m[1].replace(/<[^>]+>/g, ' ')))
    .filter(Boolean);
}
function sectionWeightClasses(block: string): string[] {
  return [...block.matchAll(/c-listing-fight__class-text[^>]*>\s*([^<]+?)\s*Bout\s*</g)]
    .map((m) => decode(m[1]));
}

// Parse one ufc.com/event page into { title, dateSuffix, ordered bouts+sections }.
// Exported pure so it can be unit-tested against a saved fixture with no network.
export function parseEventCard(html: string): UfcComCard {
  const title = decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '');
  const dateSuffix = decode(html.match(/c-hero__headline-suffix[^>]*>([\s\S]*?)</)?.[1] ?? '');

  // Section containers appear once each, in card order. Slice each section from
  // its anchor to the next section's anchor (or end of document).
  const sections: [CardSection, string][] = [
    ['main', 'main-card'],
    ['prelim', 'prelims-card'],
    ['early', 'early-prelims'],
  ];
  const marks = sections
    .map(([label, id]) => ({ label, pos: html.indexOf(`id="${id}"`) }))
    .filter((s) => s.pos >= 0)
    .sort((a, b) => a.pos - b.pos);

  const bouts: UfcComBout[] = [];
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].pos : html.length;
    const block = html.slice(marks[i].pos, end);
    const names = sectionNames(block);
    const wcs = sectionWeightClasses(block);
    for (let j = 0; j + 1 < names.length; j += 2) {
      bouts.push({
        section: marks[i].label,
        weightClass: wcs[j] ?? '',
        fighter1Name: names[j],
        fighter2Name: names[j + 1],
      });
    }
  }
  return { title, dateSuffix, bouts };
}

// "Sat, Jul 11 / 8:00 PM CDT" + a UTC year → "2026-07-11". The suffix carries the
// LOCAL month/day (so no UTC day-slip); the year comes from the list timestamp,
// with a Dec/Jan guard for the rare turn-of-year card where UTC has rolled over.
export function resolveEventDate(dateSuffix: string, timestampSec: number): string | null {
  const m = dateSuffix.match(/([A-Za-z]{3})[a-z]*\s+(\d{1,2})/);
  if (!m) return null;
  const mo = MONTHS[m[1].toLowerCase()];
  if (!mo) return null;
  const day = parseInt(m[2], 10);
  const utc = new Date(timestampSec * 1000);
  let year = utc.getUTCFullYear();
  // UTC rolled into January but the local card is still in December → prior year.
  if (mo === 12 && utc.getUTCMonth() === 0) year -= 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(mo)}-${pad(day)}`;
}

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

export interface FetchedCard extends UfcComCard {
  slug: string;
  eventDate: string | null;   // ISO YYYY-MM-DD
}

// Fetch the next `count` upcoming cards from ufc.com (list → each event page).
export async function fetchUpcomingCards(count: number): Promise<FetchedCard[]> {
  const list = parseUpcomingList(await get(UFC_EVENTS_URL)).slice(0, count);
  const cards: FetchedCard[] = [];
  for (const item of list) {
    const parsed = parseEventCard(await get(`${UFC_EVENT_BASE}${item.slug}`));
    cards.push({
      ...parsed,
      slug: item.slug,
      eventDate: resolveEventDate(parsed.dateSuffix, item.timestampSec),
    });
  }
  return cards;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (process.argv.includes('--selftest')) {
  const p = process.argv[process.argv.indexOf('--selftest') + 1];
  if (!p || !fs.existsSync(p)) {
    console.error('Usage: --selftest <path-to-saved-event.html>');
    process.exit(1);
  }
  const card = parseEventCard(fs.readFileSync(p, 'utf-8'));
  console.log(`${card.title} — ${card.dateSuffix} — ${card.bouts.length} bouts:`);
  card.bouts.forEach((b, i) =>
    console.log(`  ${String(i + 1).padStart(2)} [${b.section.padEnd(6)}] ${b.weightClass.padEnd(18)} ${b.fighter1Name} vs ${b.fighter2Name}`),
  );
} else if (process.argv[1] && process.argv[1].includes('fetchUfcCards')) {
  const n = Math.max(1, parseInt(process.argv[process.argv.indexOf('--cards') + 1] ?? '3', 10) || 3);
  fetchUpcomingCards(n).then((cards) => {
    for (const c of cards) {
      console.log(`\n${c.title}  (${c.eventDate ?? '?'})  [${c.slug}] — ${c.bouts.length} bouts`);
      c.bouts.forEach((b, i) =>
        console.log(`  ${String(i + 1).padStart(2)} [${b.section.padEnd(6)}] ${b.weightClass.padEnd(18)} ${b.fighter1Name} vs ${b.fighter2Name}`),
      );
    }
  }).catch((e) => { console.error(e); process.exit(1); });
}
