// research/regional/fightMatrix.ts — polite, cached fetch + parse for the
// MODERN REGIONAL fight graph.
//
// WHY A NEW SOURCE. Our frozen Sherdog data only holds the pre-UFC careers of
// fighters who REACHED the UFC, plus whoever they happened to face. Measured:
// eight of the ten fighters on this week's Contender Series card appear ZERO
// times in it. That makes strength-of-schedule uncomputable for exactly the
// population we want to grade — prospects who have not made the UFC. Sherdog is
// Cloudflare-dead and Tapology 403s; Fight Matrix serves plain HTML and carries
// the two things this needs: full fight histories with dates and promotions,
// and the OPPONENT'S RANK AT THE TIME of the fight.
//
// Politeness is not optional here — this is a small independent site. One
// request per URL ever (disk cache), a real delay between live fetches, and an
// identifying User-Agent with a contact address.
//
// FIREWALL: research zone. Writes CSVs under data/, feeds no rating and no page.
//
// Parse contract (verified against a live profile 2026-08-12): a fight is TWO
// table rows — the first carries result / opponent (+ profile link + rank at
// time) / method+round, the second the event name and full date.

import fs from 'fs';
import path from 'path';

const BASE = 'https://www.fightmatrix.com';
const CACHE_DIR = path.join(process.cwd(), 'research', 'regional', '.cache');
const UA =
  'UFergCRankings-research/1.0 (regional MMA rating study; contact: scott.ferguson.14@hotmail.com)';
const MIN_DELAY_MS = 2500;

let lastFetch = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cachePath(url: string): string {
  const safe = url.replace(BASE, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'root';
  return path.join(CACHE_DIR, `${safe.slice(0, 180)}.html`);
}

export async function politeFetch(url: string): Promise<string> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cp = cachePath(url);
  if (fs.existsSync(cp)) return fs.readFileSync(cp, 'utf-8');
  const wait = MIN_DELAY_MS - (Date.now() - lastFetch);
  if (wait > 0) await sleep(wait);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  lastFetch = Date.now();
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  fs.writeFileSync(cp, html);
  return html;
}

const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export interface FmFight {
  date: string;          // ISO
  event: string;         // raw event name
  promotion: string;     // canonicalised prefix, e.g. "LFA", "CFFC", "UFC"
  opponentName: string;
  opponentId: string;    // Fight Matrix numeric id ('' when unlinked)
  opponentRank: string;  // rank at the time, e.g. "#1 Welterweight" ('' when unranked)
  result: 'W' | 'L' | 'D' | 'NC';
  method: string;
}

export interface FmProfile {
  name: string;
  fmId: string;
  fights: FmFight[];
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// "Saturday, November 15th 2025" → "2025-11-15"
function parseDate(text: string): string | null {
  const m = text.match(/([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})/);
  if (!m) return null;
  const mo = MONTHS[m[1].toLowerCase()];
  if (!mo) return null;
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(parseInt(m[2], 10)).padStart(2, '0')}`;
}

// "LFA 100: Smith vs. Jones" → "LFA"; "UFC Fight Night ..." → "UFC".
// Deliberately conservative: take the leading alphabetic token run, stop at the
// first number or colon. Canonicalisation to our tier dictionary happens later —
// this only needs to be a stable grouping key.
export function promotionOf(event: string): string {
  const head = event.split(/[:\-–]/)[0].trim();
  const m = head.match(/^([A-Za-z][A-Za-z'&.\s]*?)(?=\s*\d|$)/);
  const raw = (m ? m[1] : head).trim();
  return raw.replace(/\s+/g, ' ').slice(0, 40) || 'Unknown';
}

export function parseFmProfile(html: string): FmProfile {
  const name = strip(html.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1] ?? '');
  const fmId = html.match(/\/fighter-profile\/[^/]+\/(\d+)\//)?.[1] ?? '';
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  // A profile renders the same bout in two tables (recent + full history), so
  // every fight matches twice. Key on date+opponent and keep the first.
  const seen = new Set<string>();
  const fights: FmFight[] = [];

  for (let i = 0; i < rows.length - 1; i++) {
    const row = rows[i];
    // A fight row: a result cell (W/L/D/NC) + an opponent profile link.
    const res = row.match(/<b style='color: black'>\s*(W|L|D|NC)\s*<\/b>/)?.[1] as FmFight['result'] | undefined;
    const opp = row.match(/href='\/fighter-profile\/([^']+?)\/(\d+)\/'/);
    if (!res || !opp) continue;

    const cells = row.match(/<td[^>]*>[\s\S]*?<\/td>/g) ?? [];
    const method = strip(cells[cells.length - 1] ?? '');
    const opponentRank = strip(row.match(/<em>(.*?)<\/em>/s)?.[1] ?? '');

    // The paired row carries the event name and the long-form date.
    const pair = rows[i + 1];
    const event = strip(pair.match(/href='\/event\/[^']*'[^>]*>([^<]+)<\/a>/)?.[1] ?? '');
    const date = parseDate(strip(pair.match(/<em>([^<]*)<\/em>/)?.[1] ?? ''));
    if (!date || !event) continue;
    const key = `${date}|${opp[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);

    fights.push({
      date,
      event,
      promotion: promotionOf(event),
      opponentName: decodeURIComponent(opp[1]).replace(/\+/g, ' '),
      opponentId: opp[2],
      opponentRank,
      result: res,
      method,
    });
  }
  return { name, fmId, fights };
}

/** Ranking pages list deep into the regional pool — the crawl seed. */
export function parseFmRanking(html: string): { name: string; fmId: string }[] {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/\/fighter-profile\/([^/'"]+)\/(\d+)\//g)) {
    out.set(m[2], decodeURIComponent(m[1]).replace(/\+/g, ' '));
  }
  return [...out.entries()].map(([fmId, name]) => ({ fmId, name }));
}
