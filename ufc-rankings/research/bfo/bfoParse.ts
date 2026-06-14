// ─────────────────────────────────────────────────────────────────────────
//  research/bfo/bfoParse.ts — pure parser for BestFightOdds HTML (no network).
//
//  BFO encodes each book's moneyline as:
//    <td data-li="[bookId, position, matchupId]"><span>±americanOdds</span>
//  with the fighter names in a parallel label table keyed by `id="mu-<id>"`.
//  Column order (header `data-b`) puts the OPENER first (book id 28); the rest
//  are sportsbooks whose median is the closing consensus. One book posts junk
//  (huge ±odds placeholders) — the median is robust to it.
//
//  Pure functions only, so the parsing is unit-testable from a saved fixture
//  without hitting the site.
// ─────────────────────────────────────────────────────────────────────────

export interface BookOdd {
  bookId: number;
  decimal: number; // converted from American
}

export interface BfoMatchup {
  matchupId: string;
  fighter1: string;   // position 1
  fighter2: string;   // position 2
  fighter1Slug: string;
  fighter2Slug: string;
  books1: BookOdd[];  // every book's price on fighter1
  books2: BookOdd[];
}

// BFO's opener pseudo-book (leftmost column). Verify per the header `data-b`
// order; 28 has been the opener column in archived event pages.
export const BFO_OPENER_BOOK_ID = 28;

export function americanToDecimal(a: number): number {
  if (a === 0) return 1;
  return a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a);
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Pull fighter names per matchup from the label table (id="mu-<id>" rows).
function parseMatchupFighters(html: string): Map<string, { f1: string; f2: string; s1: string; s2: string }> {
  const out = new Map<string, { f1: string; f2: string; s1: string; s2: string }>();
  const parts = html.split(/id="mu-(\d+)"/);
  // parts = [pre, id1, body1, id2, body2, ...]
  for (let i = 1; i < parts.length; i += 2) {
    const id = parts[i];
    const body = parts[i + 1] ?? '';
    const links = [...body.matchAll(/href="\/fighters\/([^"]+)">\s*<span[^>]*>([^<]+)<\/span>/g)];
    if (links.length >= 2) {
      out.set(id, {
        s1: links[0][1], f1: links[0][2].trim(),
        s2: links[1][1], f2: links[1][2].trim(),
      });
    }
  }
  return out;
}

export function parseEventPage(html: string): BfoMatchup[] {
  const fighters = parseMatchupFighters(html);
  // Collect odds cells: data-li="[book,pos,matchup]"><span ...>odds</span>
  const cells = [...html.matchAll(
    /data-li="\[(\d+),(\d+),(\d+)\]"[^>]*>\s*<span[^>]*>([+-]?\d+)<\/span>/g
  )];
  const byMatchup = new Map<string, BfoMatchup>();
  for (const m of cells) {
    const bookId = parseInt(m[1], 10);
    const pos = m[2];
    const matchupId = m[3];
    const american = parseInt(m[4], 10);
    const info = fighters.get(matchupId);
    if (!info) continue; // prop/sub-row, not a fighter moneyline
    let mu = byMatchup.get(matchupId);
    if (!mu) {
      mu = {
        matchupId,
        fighter1: info.f1, fighter2: info.f2,
        fighter1Slug: info.s1, fighter2Slug: info.s2,
        books1: [], books2: [],
      };
      byMatchup.set(matchupId, mu);
    }
    const odd: BookOdd = { bookId, decimal: americanToDecimal(american) };
    if (pos === '1') mu.books1.push(odd);
    else if (pos === '2') mu.books2.push(odd);
  }
  return [...byMatchup.values()];
}

// Event date. The authoritative source is the schema.org `startDate` (JSON-LD).
// NB: do NOT use the first date on the page — that hits `<meta name="bfo-version"
// content="YYYY-MM-DD">`, a site build stamp, not the event date.
export function parseEventDate(html: string): string | null {
  const sd = html.match(/"?startDate"?\s*[:=]\s*"?(\d{4}-\d{2}-\d{2})/);
  if (sd) return sd[1];
  const long = html.match(/([A-Z][a-z]+ \d{1,2},? 20\d\d)/);
  if (long) {
    const d = new Date(long[1]);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

export function parseArchiveEventLinks(html: string): string[] {
  return [...new Set([...html.matchAll(/href="(\/events\/[^"]+)"/g)].map((m) => m[1]))];
}

// ── derive opening + closing from a matchup's book prices ──
export interface DerivedOdds {
  fighter1: string;
  fighter2: string;
  openF1: number | null; // decimal opener (book 28)
  openF2: number | null;
  closeF1: number | null; // median of the non-opener books (consensus close)
  closeF2: number | null;
  nBooks: number;
}

export function deriveOdds(mu: BfoMatchup): DerivedOdds {
  const opener = (books: BookOdd[]) => books.find((b) => b.bookId === BFO_OPENER_BOOK_ID)?.decimal ?? null;
  const closeBooks = (books: BookOdd[]) => books.filter((b) => b.bookId !== BFO_OPENER_BOOK_ID).map((b) => b.decimal);
  const c1 = closeBooks(mu.books1);
  const c2 = closeBooks(mu.books2);
  return {
    fighter1: mu.fighter1,
    fighter2: mu.fighter2,
    openF1: opener(mu.books1),
    openF2: opener(mu.books2),
    closeF1: c1.length ? median(c1) : null,
    closeF2: c2.length ? median(c2) : null,
    nBooks: Math.max(mu.books1.length, mu.books2.length),
  };
}
