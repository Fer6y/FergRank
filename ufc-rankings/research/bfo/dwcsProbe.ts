// ─────────────────────────────────────────────────────────────────────────
//  research/bfo/dwcsProbe.ts — Phase C.1 of docs/plans/DWCS_PLAN.md.
//
//  DECISION-POINT probe, run BEFORE scrapeDwcs.ts: does BestFightOdds carry
//  DWCS closing odds at all, and do our parsers handle those pages? The bulk
//  UFC crawl yielded no odds from pre-2021 page formats, so 2017–2020 DWCS
//  coverage is unknown until this runs. Fetches a handful of pages via the
//  same politeFetch (cached, 3s delay). Console-only.
//
//  Run: node_modules/.bin/jiti research/bfo/dwcsProbe.ts
// ─────────────────────────────────────────────────────────────────────────
import { politeFetch } from './scrapeBestFightOdds';
import { parseEventPage, parseEventDate, deriveOdds } from './bfoParse';

const BASE = 'https://www.bestfightodds.com';
const QUERIES = ['Contender Series', 'Dana White'];
const SLUG_RE = /\/events\/(dana-white[^"?]+)/g;

async function main(): Promise<void> {
  const slugs = new Set<string>();
  for (const q of QUERIES) {
    const html = await politeFetch(`${BASE}/search?query=${encodeURIComponent(q)}`);
    for (const m of html.matchAll(SLUG_RE)) slugs.add(m[1]);
    console.log(`[probe] search "${q}" → ${slugs.size} cumulative dana-white slugs`);
  }
  const all = [...slugs].sort();
  console.log(`\n[probe] ${all.length} distinct DWCS event slugs found`);
  if (!all.length) {
    console.log('[probe] BFO has no DWCS events — Phase C is a negative result; skip the crawl.');
    return;
  }
  console.log(all.slice(0, 10).join('\n'));

  // Sample first / middle / last (era spread: 2018 / 2021 / 2024-ish).
  const picks = [all[0], all[Math.floor(all.length / 2)], all[all.length - 1]];
  console.log(`\n[probe] sampling: ${picks.join(', ')}\n`);
  for (const slug of picks) {
    try {
      const html = await politeFetch(`${BASE}/events/${slug}`);
      const date = parseEventDate(html);
      const mus = parseEventPage(html);
      const withClose = mus.map(deriveOdds).filter((d) => d.closeF1 != null && d.closeF2 != null);
      console.log(`  ${slug}`);
      console.log(`     date=${date ?? '?'}  matchups=${mus.length}  with-close=${withClose.length}`);
      for (const d of withClose.slice(0, 3)) {
        console.log(`     ${d.fighter1} ${d.closeF1?.toFixed(2)} vs ${d.fighter2} ${d.closeF2?.toFixed(2)} (${d.nBooks} books)`);
      }
    } catch (e) {
      console.log(`  ${slug}  FAILED: ${(e as Error).message}`);
    }
  }
  console.log('\n[probe] if with-close counts look healthy, run scrapeDwcs.ts for the full crawl.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
