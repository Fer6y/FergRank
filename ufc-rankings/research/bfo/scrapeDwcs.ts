// ─────────────────────────────────────────────────────────────────────────
//  research/bfo/scrapeDwcs.ts — Phase C.2 of docs/plans/DWCS_PLAN.md.
//
//  Crawls BestFightOdds DWCS event pages → data/bfo_dwcs_odds.csv, a SIBLING
//  of bfo_odds.csv with the identical 9-column schema. NEVER merged into
//  bfo_odds.csv — the UFC backtests' matched pool must not silently change
//  (their EXCLUDE regexes assume no DWCS rows).
//
//  Enumeration (BFO search caps at ~25 results/query; the archive page has no
//  pagination and no DWCS entries):
//    1. base queries ("Contender Series", "Dana White", "DWCS", Brazil,
//       Tuesday Night) + numbered "Contender Series N" for N=1..80 — the
//       2017–2021 weekly events are slugged ...-contender-series-N-ID;
//    2. GAP PASS (--gap): for dwcs_bouts.csv bouts still unmatched by any
//       crawled row, search a corner's name, follow the first /fighters/ link,
//       and harvest dana-white event slugs off the fighter page.
//
//  All fetches go through politeFetch (3s delay, disk cache) — re-runs are
//  free. Run: node_modules/.bin/jiti research/bfo/scrapeDwcs.ts [--gap]
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { politeFetch } from './scrapeBestFightOdds';
import { parseEventPage, parseEventDate, deriveOdds } from './bfoParse';

const BASE = 'https://www.bestfightodds.com';
const OUT_CSV = path.join(process.cwd(), 'data', 'bfo_dwcs_odds.csv');
const SLUG_RE = /\/events\/(dana-white[^"?]+)/g;

const BASE_QUERIES = [
  'Contender Series',
  'Dana White',
  'DWCS',
  'Contender Series Brazil',
  'Tuesday Night Contender Series',
];

const norm = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').trim();

async function searchSlugs(query: string, into: Set<string>): Promise<void> {
  try {
    const html = await politeFetch(`${BASE}/search?query=${encodeURIComponent(query)}`);
    for (const m of html.matchAll(SLUG_RE)) into.add(m[1]);
  } catch (e) {
    console.error(`[dwcs-odds] search failed "${query}": ${(e as Error).message}`);
  }
}

interface OutRow {
  date: string;
  slug: string;
  fighter1: string;
  fighter2: string;
  open1: number | null;
  open2: number | null;
  close1: number | null;
  close2: number | null;
  nBooks: number;
}

async function crawlSlugs(slugs: Iterable<string>, rows: Map<string, OutRow>): Promise<void> {
  for (const slug of slugs) {
    let html: string;
    try {
      html = await politeFetch(`${BASE}/events/${slug}`);
    } catch (e) {
      console.error(`[dwcs-odds] fetch failed ${slug}: ${(e as Error).message}`);
      continue;
    }
    const date = parseEventDate(html) ?? '';
    for (const mu of parseEventPage(html)) {
      const d = deriveOdds(mu);
      if (d.closeF1 == null && d.closeF2 == null) continue;
      const key = [norm(d.fighter1), norm(d.fighter2)].sort().join('|') + '|' + date;
      if (!rows.has(key)) {
        rows.set(key, {
          date, slug,
          fighter1: d.fighter1, fighter2: d.fighter2,
          open1: d.openF1, open2: d.openF2,
          close1: d.closeF1, close2: d.closeF2,
          nBooks: d.nBooks,
        });
      }
    }
  }
}

async function gapPass(rows: Map<string, OutRow>): Promise<Set<string>> {
  const boutsCsv = fs.readFileSync(path.join(process.cwd(), 'data', 'dwcs_bouts.csv'), 'utf8');
  const bouts = Papa.parse<Record<string, string>>(boutsCsv, { header: true, skipEmptyLines: true }).data;

  // A bout is "covered" if either corner name appears in any crawled row.
  const crawledNames = new Set<string>();
  for (const r of rows.values()) {
    crawledNames.add(norm(r.fighter1));
    crawledNames.add(norm(r.fighter2));
  }
  const missing = bouts.filter((b) => !crawledNames.has(norm(b.nameA)) && !crawledNames.has(norm(b.nameB)));
  console.log(`[dwcs-odds] gap pass: ${missing.length} bouts with neither corner in crawled rows`);

  const newSlugs = new Set<string>();
  let i = 0;
  for (const b of missing) {
    i++;
    for (const name of [b.nameA, b.nameB]) {
      try {
        const html = await politeFetch(`${BASE}/search?query=${encodeURIComponent(name)}`);
        // Direct event links first; else follow the first fighter page.
        let found = 0;
        for (const m of html.matchAll(SLUG_RE)) { newSlugs.add(m[1]); found++; }
        if (!found) {
          const fm = html.match(/\/fighters\/([^"?]+)/);
          if (fm) {
            const fhtml = await politeFetch(`${BASE}/fighters/${fm[1]}`);
            for (const m of fhtml.matchAll(SLUG_RE)) newSlugs.add(m[1]);
          }
        }
        if (found || newSlugs.size) break; // one corner is enough when it yields slugs
      } catch {
        /* polite skip */
      }
    }
    if (i % 25 === 0) console.log(`[dwcs-odds] gap pass ${i}/${missing.length} → ${newSlugs.size} new slugs`);
  }
  return newSlugs;
}

async function main(): Promise<void> {
  const slugs = new Set<string>();
  const queries = [...BASE_QUERIES];
  for (let n = 1; n <= 80; n++) queries.push(`Contender Series ${n}`);
  console.log(`[dwcs-odds] enumerating via ${queries.length} search queries (cached after first run)`);
  let qi = 0;
  for (const q of queries) {
    await searchSlugs(q, slugs);
    if (++qi % 20 === 0) console.log(`[dwcs-odds] ${qi}/${queries.length} queries → ${slugs.size} slugs`);
  }
  console.log(`[dwcs-odds] ${slugs.size} distinct DWCS event slugs`);

  const rows = new Map<string, OutRow>();
  await crawlSlugs(slugs, rows);
  console.log(`[dwcs-odds] ${rows.size} priced bouts from the query enumeration`);

  if (process.argv.includes('--gap')) {
    const extra = await gapPass(rows);
    const unseen = [...extra].filter((s) => !slugs.has(s));
    console.log(`[dwcs-odds] gap pass surfaced ${unseen.length} additional event slugs`);
    await crawlSlugs(unseen, rows);
    console.log(`[dwcs-odds] ${rows.size} priced bouts after gap pass`);
  }

  const sorted = [...rows.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const c = (x: number | null) => (x == null ? '' : x.toFixed(4));
  const esc = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const out = fs.createWriteStream(OUT_CSV);
  out.write('date,event_slug,fighter1,fighter2,open1,open2,close1,close2,n_books\n');
  for (const r of sorted) {
    out.write([r.date, r.slug, esc(r.fighter1), esc(r.fighter2), c(r.open1), c(r.open2), c(r.close1), c(r.close2), r.nBooks].join(',') + '\n');
  }
  out.end();

  const years = new Map<string, number>();
  for (const r of sorted) {
    const y = r.date.slice(0, 4) || '????';
    years.set(y, (years.get(y) ?? 0) + 1);
  }
  console.log(`[dwcs-odds] wrote ${sorted.length} rows → ${OUT_CSV}`);
  console.log('[dwcs-odds] rows/year:', [...years.entries()].sort().map(([y, n]) => `${y}:${n}`).join(' '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
