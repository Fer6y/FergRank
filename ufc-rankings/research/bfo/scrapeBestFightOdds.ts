// ─────────────────────────────────────────────────────────────────────────
//  research/bfo/scrapeBestFightOdds.ts — polite, cached BFO scraper.
//
//  Adds a SECOND odds source (true per-book opening + closing lines, and
//  2024–2026 coverage) alongside the consensus feed. Politeness is built in:
//    • disk cache — every page fetched once, re-runs hit the cache, not the site
//    • rate limit — a real delay between LIVE fetches only
//    • identifying User-Agent with a contact address
//
//  Running this file does the TINY TEST PULL only (a few UFC events) and prints
//  parsed opening/closing odds. The bulk historical crawl is gated behind
//  `--bulk` so it never runs by accident.
//
//  Test:  node_modules/.bin/jiti research/bfo/scrapeBestFightOdds.ts
//  Bulk:  node_modules/.bin/jiti research/bfo/scrapeBestFightOdds.ts --bulk
// ─────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { parseEventPage, parseArchiveEventLinks, parseEventDate, deriveOdds } from './bfoParse';

const BASE = 'https://www.bestfightodds.com';
const CACHE_DIR = path.join(process.cwd(), 'research', 'bfo', '.cache');
const UA = 'Mozilla/5.0 (UFC-rankings research; contact: scott.ferguson.14@hotmail.com)';
const MIN_DELAY_MS = 3000; // between LIVE fetches only

let lastLiveFetch = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cachePath(url: string): string {
  const safe = url.replace(BASE, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'root';
  return path.join(CACHE_DIR, safe + '.html');
}

// Fetch a URL once, then serve from disk forever. Live fetches are rate-limited.
export async function politeFetch(url: string): Promise<string> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cp = cachePath(url);
  if (fs.existsSync(cp)) return fs.readFileSync(cp, 'utf-8');

  const wait = MIN_DELAY_MS - (Date.now() - lastLiveFetch);
  if (wait > 0) await sleep(wait);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  lastLiveFetch = Date.now();
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  fs.writeFileSync(cp, html);
  return html;
}

// Enumerate UFC event page paths from the archive (front page only for the
// test; the bulk crawl paginates — see TODO in main()).
async function ufcEventLinks(): Promise<string[]> {
  const html = await politeFetch(`${BASE}/archive`);
  return parseArchiveEventLinks(html).filter((u) => /\/events\/ufc-/i.test(u));
}

async function testPull(limit = 3): Promise<void> {
  const links = await ufcEventLinks();
  const pick = links.slice(0, limit);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  BFO TEST PULL — opening vs closing (consensus) moneyline');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  UFC events on archive front page: ${links.length}; pulling ${pick.length}\n`);

  for (const link of pick) {
    const html = await politeFetch(`${BASE}${link}`);
    const date = parseEventDate(html);
    const matchups = parseEventPage(html);
    console.log(`  ${link}   date=${date ?? '?'}   matchups=${matchups.length}`);
    for (const mu of matchups.slice(0, 6)) {
      const d = deriveOdds(mu);
      const fmt = (x: number | null) => (x == null ? ' --- ' : x.toFixed(2).padStart(5));
      console.log(
        `     ${d.fighter1.padEnd(20)} open ${fmt(d.openF1)} → close ${fmt(d.closeF1)}   |   ` +
          `${d.fighter2.padEnd(20)} open ${fmt(d.openF2)} → close ${fmt(d.closeF2)}   (${d.nBooks} books)`
      );
    }
    console.log('');
  }
  console.log('  Cache dir:', CACHE_DIR);
  console.log('  → review the open/close values, then re-run with --bulk for the full crawl.');
}

// ── BULK CRAWL (full UFC history) ──────────────────────────────────────────
const DATA_DIR = path.join(process.cwd(), 'data');
const OUT_CSV = path.join(DATA_DIR, 'bfo_odds.csv');

// Build one search query per UFC event in our Events.csv: numbered → "UFC N";
// otherwise the two surnames from "… : X vs. Y" → "UFC X Y".
function buildQueries(): string[] {
  const rows = Papa.parse<Record<string, string>>(
    fs.readFileSync(path.join(DATA_DIR, 'Events.csv'), 'utf-8'),
    { header: true, skipEmptyLines: true }
  ).data;
  const queries = new Set<string>();
  for (const r of rows) {
    const name = r['Name'] ?? '';
    if (!/ufc/i.test(name)) continue;
    const num = name.match(/UFC\s+(\d+)/i);
    if (num) { queries.add(`UFC ${num[1]}`); continue; }
    const vs = name.split(':').pop()?.match(/([A-Za-z'’-]+)\s+vs\.?\s+([A-Za-z'’-]+)/i);
    if (vs) queries.add(`UFC ${vs[1]} ${vs[2]}`);
  }
  return [...queries];
}

async function enumerateSlugs(queries: string[]): Promise<string[]> {
  const slugs = new Set<string>();
  let i = 0;
  for (const q of queries) {
    i++;
    const url = `${BASE}/search?query=${encodeURIComponent(q)}`;
    try {
      const html = await politeFetch(url);
      for (const m of html.matchAll(/\/events\/(ufc-[^"?]+)/g)) slugs.add(m[1]);
    } catch (e) {
      console.error(`[bfo] search failed "${q}":`, (e as Error).message);
    }
    if (i % 25 === 0) console.log(`[bfo] enumerated ${i}/${queries.length} queries → ${slugs.size} unique slugs`);
  }
  return [...slugs];
}

async function bulkCrawl(): Promise<void> {
  console.log('[bfo] BULK CRAWL — full UFC history');
  const queries = buildQueries();
  console.log(`[bfo] ${queries.length} search queries built from Events.csv`);
  const slugs = await enumerateSlugs(queries);
  console.log(`[bfo] ${slugs.length} unique UFC event slugs to fetch`);

  const out = fs.createWriteStream(OUT_CSV);
  out.write('date,event_slug,fighter1,fighter2,open1,open2,close1,close2,n_books\n');
  let events = 0, rows = 0;
  for (const slug of slugs) {
    events++;
    let html: string;
    try { html = await politeFetch(`${BASE}/events/${slug}`); }
    catch (e) { console.error(`[bfo] fetch failed ${slug}:`, (e as Error).message); continue; }
    const date = parseEventDate(html) ?? '';
    for (const mu of parseEventPage(html)) {
      const d = deriveOdds(mu);
      if (d.closeF1 == null && d.closeF2 == null) continue; // no odds (BJJ etc.)
      const c = (x: number | null) => (x == null ? '' : x.toFixed(4));
      const esc = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
      out.write(
        [date, slug, esc(d.fighter1), esc(d.fighter2), c(d.openF1), c(d.openF2), c(d.closeF1), c(d.closeF2), d.nBooks].join(',') + '\n'
      );
      rows++;
    }
    if (events % 50 === 0) console.log(`[bfo] fetched ${events}/${slugs.length} events → ${rows} fight rows`);
  }
  out.end();
  console.log(`[bfo] DONE — ${events} events, ${rows} fight rows → ${OUT_CSV}`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--bulk')) {
    await bulkCrawl();
    return;
  }
  await testPull(3);
}

main().catch((e) => {
  console.error('[bfo] failed:', e);
  process.exit(1);
});
