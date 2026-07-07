// ─────────────────────────────────────────────────────────────────────────
//  research/bfo/refreshRecent.ts — INCREMENTAL BFO refresh for recent events.
//
//  The bulk crawler's disk cache is fetch-once-forever, which is right for
//  settled history but wrong for the recency edge: an event page cached while
//  its card was still live froze PRE-closing lines, and newly announced events
//  aren't in the cache at all. This script:
//    1. evicts + re-fetches the archive front page (lists recent + upcoming
//       UFC events) to discover new slugs;
//    2. evicts + re-fetches every event page whose row date in bfo_odds.csv is
//       within --days (default 60) of today — i.e. anything whose lines may
//       have still been moving when it was cached;
//    3. re-parses those pages and MERGES the rows into data/bfo_odds.csv
//       (replaces the refreshed slugs' rows, keeps all settled history).
//
//  Politeness is inherited from politeFetch (3s between live fetches, real UA).
//  Typical run touches ~10–25 pages ≈ under a minute — safe as a weekly step.
//  Research zone: odds NEVER feed the engine; this only feeds the /odds export.
//
//  Run:  node_modules/.bin/jiti research/bfo/refreshRecent.ts [--days 60]
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { politeFetch } from './scrapeBestFightOdds';
import { parseArchiveEventLinks, parseEventDate, parseEventPage, deriveOdds } from './bfoParse';

const BASE = 'https://www.bestfightodds.com';
const CACHE_DIR = path.join(process.cwd(), 'research', 'bfo', '.cache');
const CSV = path.join(process.cwd(), 'data', 'bfo_odds.csv');
const HEADER = 'date,event_slug,fighter1,fighter2,open1,open2,close1,close2,n_books';

function cachePathFor(url: string): string {
  const safe = url.replace(BASE, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'root';
  return path.join(CACHE_DIR, safe + '.html');
}
const evict = (url: string) => {
  const p = cachePathFor(url);
  if (fs.existsSync(p)) fs.unlinkSync(p);
};

interface Row {
  date: string; event_slug: string; fighter1: string; fighter2: string;
  open1: string; open2: string; close1: string; close2: string; n_books: string;
}

async function main(): Promise<void> {
  const daysArg = process.argv.indexOf('--days');
  const days = daysArg >= 0 ? Number(process.argv[daysArg + 1]) || 60 : 60;
  const cutoff = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);

  if (!fs.existsSync(CSV)) {
    console.error(`[bfo:refresh] ${CSV} missing — run the bulk crawl first (scrapeBestFightOdds.ts --bulk)`);
    process.exit(1);
  }
  const existing = Papa.parse<Row>(fs.readFileSync(CSV, 'utf-8'), { header: true, skipEmptyLines: true }).data;

  // Slugs to refresh: anything recent/undated in the CSV + whatever the archive
  // front page lists now (catches newly announced cards).
  const slugs = new Set<string>();
  for (const r of existing) if (!r.date || r.date >= cutoff) slugs.add(r.event_slug);

  const archiveUrl = `${BASE}/archive`;
  evict(archiveUrl);
  try {
    const archiveHtml = await politeFetch(archiveUrl);
    for (const link of parseArchiveEventLinks(archiveHtml)) {
      const m = link.match(/\/events\/(ufc-[^"?]+)/i);
      if (m) slugs.add(m[1]);
    }
  } catch (e) {
    console.warn('[bfo:refresh] archive fetch failed (continuing with CSV-derived slugs):', (e as Error).message);
  }

  console.log(`[bfo:refresh] refreshing ${slugs.size} event pages (rows on/after ${cutoff} + archive front page)`);

  const freshRows: Row[] = [];
  const refreshed = new Set<string>();
  for (const slug of slugs) {
    const url = `${BASE}/events/${slug}`;
    evict(url);
    let html: string;
    try { html = await politeFetch(url); }
    catch (e) { console.error(`[bfo:refresh] fetch failed ${slug}:`, (e as Error).message); continue; }
    refreshed.add(slug);
    const date = parseEventDate(html) ?? '';
    for (const mu of parseEventPage(html)) {
      const d = deriveOdds(mu);
      if (d.closeF1 == null && d.closeF2 == null) continue;
      const c = (x: number | null) => (x == null ? '' : x.toFixed(4));
      freshRows.push({
        date, event_slug: slug, fighter1: d.fighter1, fighter2: d.fighter2,
        open1: c(d.openF1), open2: c(d.openF2), close1: c(d.closeF1), close2: c(d.closeF2),
        n_books: String(d.nBooks),
      });
    }
  }

  // Merge: keep every settled row whose slug we did NOT refresh; replace the rest.
  const kept = existing.filter((r) => !refreshed.has(r.event_slug));
  const merged = [...kept, ...freshRows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const esc = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = merged.map((r) =>
    [r.date, r.event_slug, esc(r.fighter1), esc(r.fighter2), r.open1, r.open2, r.close1, r.close2, r.n_books].join(',')
  );
  fs.writeFileSync(CSV, HEADER + '\n' + lines.join('\n') + '\n');
  console.log(
    `[bfo:refresh] DONE — ${refreshed.size} events re-fetched, ${freshRows.length} fresh rows, ` +
    `${kept.length} settled rows kept → ${merged.length} total in ${path.basename(CSV)}`
  );
}

main().catch((e) => {
  console.error('[bfo:refresh] failed:', e);
  process.exit(1);
});
