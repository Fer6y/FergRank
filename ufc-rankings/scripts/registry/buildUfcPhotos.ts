// ─────────────────────────────────────────────────────────────────────────
//  scripts/registry/buildUfcPhotos.ts — UFC.com photo enrichment.
//
//  Pulls UFC.com's standardised athlete images for every ranking-eligible
//  fighter (3+ UFC fights). Per fighter it captures:
//    • full_body_url — transparent-bg full-body PNG (profile hero)
//    • headshot_url  — head crop (dense rows / cards)
//
//  SLUG SOURCE — independent of the Sherdog crosswalk, by design. The earlier
//  version keyed only off the Wikidata ufc_id, which is gated on a Sherdog match;
//  that silently dropped huge names with no crosswalk row (Jon Jones, Strickland,
//  Chimaev…). So we now resolve the UFC slug PER FIGHTER as:
//    1. the Wikidata-verified ufc_id from fighter_media.csv, if present, else
//    2. slugs DERIVED from the name ("Sean Strickland" → sean-strickland, and for
//       3+ word names also first+last → "ian-garry").
//
//  MINIMAL-ERRORS DESIGN (every URL written is one we've proven correct):
//    1. NAME GUARD — UFC filenames are LASTNAME_FIRSTNAME_…. A verified ufc_id is
//       trusted (last-name match, or the page's single full-body). A DERIVED slug
//       is held to a stricter bar: the filename must contain BOTH the fighter's
//       first AND last name — so a wrong guess would have to collide on both.
//    2. LIVE CHECK — each accepted image URL is GET-verified to return 200
//       image/* before it is written. No broken <img> can reach the app.
//    3. RESUMABLE — results are checkpointed; a re-run skips fighters already
//       resolved and only retries the failures. Safe to Ctrl-C and restart.
//
//  Build-time only (like the Sherdog scrape). Throttled + retried to stay polite.
//
//  Reads  : data/canonical/fighter_registry.csv (roster + fight count)
//           data/canonical/fighter_media.csv     (verified ufc_id when available)
//  Outputs: data/canonical/ufc_photos.csv        (canonical_id, slug, urls, status)
//           data/canonical/ufc_photos_report.txt
//
//  Run:  node_modules/.bin/jiti scripts/registry/buildUfcPhotos.ts
//        node_modules/.bin/jiti scripts/registry/buildUfcPhotos.ts --retry-failed
// ─────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { normalize } from '../../src/lib/nameResolver';

const DATA = path.join(process.cwd(), 'data');
const OUT = path.join(DATA, 'canonical');
const OUT_CSV = path.join(OUT, 'ufc_photos.csv');
const REPORT = path.join(OUT, 'ufc_photos_report.txt');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36';
const CONCURRENCY = 6;
const RETRIES = 2;
const RETRY_FAILED = process.argv.includes('--retry-failed');

type Row = Record<string, string>;
const readCsv = (p: string): Row[] =>
  fs.existsSync(p) ? Papa.parse<Row>(fs.readFileSync(p, 'utf-8'), { header: true, skipEmptyLines: true }).data : [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string): Promise<string | null> {
  for (let i = 0; i <= RETRIES; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (res.status === 404) return null;            // fighter has no page — not an error
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch {
      if (i < RETRIES) await sleep(500 * (i + 1));
    }
  }
  return null;
}

// LIVE CHECK — only call a URL good if it serves an image.
async function isLiveImage(url: string): Promise<boolean> {
  for (let i = 0; i <= 1; i++) {
    try {
      const res = await fetch(url, { method: 'GET', headers: { 'User-Agent': UA, Range: 'bytes=0-0' } });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.startsWith('image/')) return true;
      return false;
    } catch {
      if (i < 1) await sleep(400);
    }
  }
  return false;
}

// All images of a given UFC style on the page, in document order.
function imagesOfStyle(html: string, style: string): string[] {
  const re = new RegExp(`https?://[^" ]*?/styles/${style}/[^" ]*?\\.(?:png|jpg|jpeg)`, 'g');
  return [...new Set(html.match(re) ?? [])];
}

// Normalized name tokens in a UFC filename. e.g.
//   MACHADO_GARRY_IAN_L_04-26.png → {machado, garry, ian}  (drops L/date/belt noise)
const FILE_NOISE = new Set(['l', 'r', 'belt', 'cropped', 'jr', 'sr', 'ii', 'iii', 'iv']);
function fileNameTokens(url: string): Set<string> {
  const file = decodeURIComponent(url.split('/').pop() || '').replace(/\.[a-z]+$/i, '');
  const toks = file
    .split(/[_\-]/)
    .map((t) => normalize(t))
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t) && !FILE_NOISE.has(t));
  return new Set(toks);
}

// Fighter name → [firstToken, lastToken] (normalized).
function nameEnds(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).map((t) => normalize(t)).filter(Boolean);
  return { first: parts[0] || '', last: parts[parts.length - 1] || '' };
}

// Choose the page image belonging to this fighter.
//   strict=true  (DERIVED slug): filename must contain BOTH first and last name.
//   strict=false (verified id) : last-name match, else the page's single image.
function pickForFighter(urls: string[], fullName: string, strict: boolean): string | null {
  if (!urls.length) return null;
  const { first, last } = nameEnds(fullName);

  const both = urls.find((u) => {
    const s = fileNameTokens(u);
    return first && last && s.has(first) && s.has(last);
  });
  if (both) return both;
  if (strict) return null; // a guessed slug needs a confident (both-name) match

  const lastOnly = urls.find((u) => last && fileNameTokens(u).has(last));
  if (lastOnly) return lastOnly;
  return urls.length === 1 ? urls[0] : null;
}

// Candidate UFC slugs derived from a name (no Sherdog/Wikidata needed).
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}
function derivedSlugs(fullName: string): string[] {
  const out = [slugify(fullName)];
  const parts = fullName.trim().split(/\s+/);
  if (parts.length > 2) out.push(slugify(`${parts[0]} ${parts[parts.length - 1]}`)); // first+last
  return [...new Set(out)].filter(Boolean);
}

interface Target { canonical_id: string; fullName: string; ufc_id: string }
interface PhotoRow extends Row {
  canonical_id: string; fullName: string; slug: string; slug_source: string;
  headshot_url: string; full_body_url: string; status: string;
}

async function resolveOne(f: Target): Promise<PhotoRow> {
  const base: PhotoRow = {
    canonical_id: f.canonical_id, fullName: f.fullName, slug: '', slug_source: '',
    headshot_url: '', full_body_url: '', status: '',
  };

  // Verified Wikidata slug first (trusted, lenient match); then derived-from-name
  // candidates (strict both-name match) as a fallback — this rescues fighters
  // whose Wikidata ufc_id points at the wrong athlete (e.g. a mis-linked id).
  const candidates: { slug: string; strict: boolean }[] = [];
  if (f.ufc_id) candidates.push({ slug: f.ufc_id, strict: false });
  for (const slug of derivedSlugs(f.fullName)) {
    if (slug !== f.ufc_id) candidates.push({ slug, strict: true });
  }

  let any404 = false;
  for (const c of candidates) {
    const html = await fetchText(`https://www.ufc.com/athlete/${c.slug}`);
    if (html === null) { any404 = true; continue; }

    const headshot = pickForFighter(imagesOfStyle(html, 'event_results_athlete_headshot'), f.fullName, c.strict);
    const fullBody = pickForFighter(imagesOfStyle(html, 'athlete_bio_full_body'), f.fullName, c.strict);
    if (!headshot && !fullBody) continue; // wrong page / no confident match — try next candidate

    base.slug = c.slug;
    base.slug_source = c.strict ? 'derived' : 'wikidata';
    if (headshot && (await isLiveImage(headshot))) base.headshot_url = headshot;
    if (fullBody && (await isLiveImage(fullBody))) base.full_body_url = fullBody;
    base.status = base.headshot_url || base.full_body_url ? 'ok' : 'dead_url';
    return base;
  }

  base.status = any404 ? 'no_page' : 'no_match';
  return base;
}

async function runPool(items: Target[], worker: (r: Target) => Promise<PhotoRow>): Promise<PhotoRow[]> {
  const out: PhotoRow[] = [];
  let idx = 0, done = 0;
  const runners = Array.from({ length: CONCURRENCY }, async () => {
    while (idx < items.length) {
      const r = items[idx++];
      out.push(await worker(r));
      if (++done % 50 === 0) process.stdout.write(`  …${done}/${items.length}\n`);
      await sleep(120); // politeness
    }
  });
  await Promise.all(runners);
  return out;
}

const MIN_FIGHTS = 3; // ranking-eligibility floor — everyone who can appear in a division

async function main() {
  const registry = readCsv(path.join(OUT, 'fighter_registry.csv'));
  if (!registry.length) throw new Error('fighter_registry.csv not found — run buildRegistry.ts first.');

  // Verified ufc_id by canonical id (from the Wikidata join), when available.
  const ufcIdById = new Map<string, string>();
  for (const m of readCsv(path.join(OUT, 'fighter_media.csv'))) {
    if (m.ufc_id) ufcIdById.set(m.canonical_id, m.ufc_id);
  }

  // Target everyone ranking-eligible (3+ fights) — drives off the roster, NOT the
  // Sherdog crosswalk, so big names without a crosswalk row are included.
  const targets: Target[] = registry
    .filter((r) => (parseInt(r.fightCount || '0', 10) || 0) >= MIN_FIGHTS)
    .map((r) => ({
      canonical_id: r.canonical_id,
      fullName: r.fullName,
      ufc_id: ufcIdById.get(r.canonical_id) || '',
    }));

  // Resume: keep prior successes, only (re)fetch the rest.
  const prior = new Map<string, PhotoRow>();
  for (const r of readCsv(OUT_CSV) as PhotoRow[]) prior.set(r.canonical_id, r);
  const keep = (r: PhotoRow) => r.status === 'ok' || (!RETRY_FAILED && (r.status === 'no_page' || r.status === 'no_match'));

  const todo = targets.filter((t) => {
    const p = prior.get(t.canonical_id);
    return !p || !keep(p);
  });

  const verifiedCount = targets.filter((t) => t.ufc_id).length;
  console.log(`UFC photo pass: ${targets.length} ranking-eligible fighters (${verifiedCount} verified ufc_id, ${targets.length - verifiedCount} by derived slug)`);
  console.log(`  already resolved: ${targets.length - todo.length} | fetching: ${todo.length}` +
    (RETRY_FAILED ? ' (--retry-failed: re-trying no_page/no_match too)' : ''));

  const fresh = await runPool(todo, resolveOne);

  // Merge: prior kept rows + fresh results, in registry order.
  for (const r of fresh) prior.set(r.canonical_id, r);
  const merged = targets.map((t) => prior.get(t.canonical_id)!).filter(Boolean);
  const COLUMNS = ['canonical_id', 'fullName', 'slug', 'slug_source', 'headshot_url', 'full_body_url', 'status'];
  fs.writeFileSync(OUT_CSV, Papa.unparse(merged, { columns: COLUMNS }));

  // ── report ──
  const tally = (s: string) => merged.filter((r) => r.status === s).length;
  const withImg = merged.filter((r) => r.headshot_url || r.full_body_url).length;
  const head = merged.filter((r) => r.headshot_url).length;
  const body = merged.filter((r) => r.full_body_url).length;
  const viaDerived = merged.filter((r) => r.status === 'ok' && r.slug_source === 'derived').length;
  const reg = registry.length || 1;

  const lines = [
    `UFC.com photo coverage — ${new Date().toISOString().slice(0, 10)}`,
    `Targets (${MIN_FIGHTS}+ UFC fights): ${targets.length}`,
    `  resolved with an image : ${withImg} (${((100 * withImg) / reg).toFixed(0)}% of full ${reg}-fighter registry)`,
    `    • headshot_url        : ${head}`,
    `    • full_body_url       : ${body}`,
    `    • via derived slug    : ${viaDerived}  (no Sherdog/Wikidata link — name-resolved)`,
    `  status breakdown:`,
    `    ok       : ${tally('ok')}`,
    `    no_page  : ${tally('no_page')}   (no UFC.com page for any candidate slug)`,
    `    no_match : ${tally('no_match')}  (page found but no confident name match — skipped, not guessed)`,
    `    dead_url : ${tally('dead_url')}  (image URL didn't serve — skipped)`,
    ``,
    `Re-run to resume; add --retry-failed to retry no_page/no_match/dead_url.`,
  ].join('\n') + '\n';
  fs.writeFileSync(REPORT, lines);
  console.log('\n' + lines);
  console.log(`Wrote ${merged.length} rows → data/canonical/ufc_photos.csv`);
}

main().catch((e) => { console.error(e); process.exit(1); });
