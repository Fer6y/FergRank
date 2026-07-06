// fetchUfcRankings: pull the CURRENT official UFC rankings straight from
// ufc.com/rankings (server-rendered HTML) instead of the Octagon API.
//
// Why direct: Octagon (api.octagon-api.com) lags ufc.com by days/weeks — it kept
// returning old champions, which forced hand-maintenance via
// data/official_rankings_overrides.csv. ufc.com/rankings returns the live board
// as server-rendered HTML (HTTP 200, no JS hydration needed, no proof-of-work
// gate), so we parse it directly.
//
// BUILD-TIME ONLY. This is called by scripts/buildOfficialRankings.ts, which
// writes the committed data/official_rankings.csv snapshot the running app reads.
// It never runs at request time — same firewall as the ufcstats recency pipeline.
//
// Brittleness note: HTML scraping breaks if UFC restructures the page. The build
// script guards against that (it refuses to overwrite a good snapshot with an
// empty/short parse), and Octagon remains the automatic fallback.
//
// Run standalone (prints a summary, writes nothing):
//   node_modules/.bin/jiti scripts/ufcstats/fetchUfcRankings.ts
// Self-test the parser against a saved fixture:
//   node_modules/.bin/jiti scripts/ufcstats/fetchUfcRankings.ts --selftest <path-to-html>
import fs from 'fs';
import type { OfficialRankingsMap } from '../../src/lib/types';

const UFC_RANKINGS_URL = 'https://www.ufc.com/rankings';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// The 11 divisions we rank. ufc.com header text (after entity-decoding) already
// matches these names, so this doubles as the allow-list that drops the two
// Pound-for-Pound lists and anything unexpected.
const KNOWN_DIVISIONS = new Set<string>([
  'Heavyweight',
  'Light Heavyweight',
  'Middleweight',
  'Welterweight',
  'Lightweight',
  'Featherweight',
  'Bantamweight',
  'Flyweight',
  "Women's Strawweight",
  "Women's Flyweight",
  "Women's Bantamweight",
]);

// Minimal HTML entity decode for the fields we read (names + division headers).
function decode(s: string): string {
  return s
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?34;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// Parse the ufc.com/rankings HTML into our OfficialRankingsMap shape.
// Exported so it can be unit-tested against a saved fixture without a network hit.
//
// Page shape (per division):
//   <div class="view-grouping-header">Flyweight</div>
//   <div class="view-grouping-content"><table><caption>
//     <div class="rankings--athlete--champion ...">
//       <div class="info"><h4>Flyweight</h4><h5><a href="/athlete/..">Joshua Van</a></h5>
//   ...<tbody>
//     <tr><td class="..weight-class-rank">1 </td>
//         <td class="..views-field-title"><a href="/athlete/..">Alexandre Pantoja</a></td>...</tr>
export function parseUfcRankingsHtml(htmlDoc: string): OfficialRankingsMap {
  const result: OfficialRankingsMap = {};

  // Each division is the content between one grouping header and the next.
  const blocks = htmlDoc.split(/<div class="view-grouping-header">/).slice(1);

  for (const block of blocks) {
    const nameMatch = block.match(/^\s*([^<]+?)\s*<\/div>/);
    if (!nameMatch) continue;
    const division = decode(nameMatch[1]);
    if (!KNOWN_DIVISIONS.has(division)) continue;      // drops P4P + unknowns
    if (result[division]) continue;                     // page renders each division twice; keep first

    const rankings: { rank: string; name: string; record: string }[] = [];

    // Champion: the <h5> anchor inside the rankings--athlete--champion caption.
    const champMatch = block.match(
      /rankings--athlete--champion[\s\S]*?<h5>\s*<a href="\/athlete\/[a-z0-9-]+"[^>]*>\s*([^<]+?)\s*<\/a>/
    );
    if (champMatch) rankings.push({ rank: 'C', name: decode(champMatch[1]), record: '' });

    // Contenders: each is a table row with a rank <td> immediately followed by
    // the title <td><a>. We deliberately IGNORE the printed rank digit and number
    // by ROW ORDER — when a fighter has a "Rank increased by N" annotation ufc.com
    // renders a duplicated/shifted digit (e.g. two "7"s), but the row order is
    // always authoritative. Cap at 15 to match the downstream convention (UFC
    // occasionally lists a 16th on a tie; the Octagon path fed 15 too).
    const rowRe =
      /views-field-weight-class-rank">\s*\d+\s*<\/td>\s*<td class="views-field views-field-title">\s*<a href="\/athlete\/[a-z0-9-]+"[^>]*>\s*([^<]+?)\s*<\/a>/g;
    let m: RegExpExecArray | null;
    let contender = 0;
    while ((m = rowRe.exec(block)) !== null && contender < 15) {
      contender++;
      rankings.push({ rank: String(contender), name: decode(m[1]), record: '' });
    }

    if (rankings.length > 0) result[division] = rankings;
  }

  return result;
}

export async function fetchUfcComRankings(): Promise<OfficialRankingsMap> {
  try {
    const res = await fetch(UFC_RANKINGS_URL, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
    });
    if (!res.ok) {
      console.warn(`[fetchUfcRankings] ufc.com returned ${res.status} — returning empty.`);
      return {};
    }
    const htmlDoc = await res.text();
    const parsed = parseUfcRankingsHtml(htmlDoc);
    console.log(`[fetchUfcRankings] parsed ${Object.keys(parsed).length} divisions from ufc.com`);
    return parsed;
  } catch (err) {
    console.warn('[fetchUfcRankings] fetch/parse failed — returning empty:', err);
    return {};
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (process.argv.includes('--selftest')) {
  const p = process.argv[process.argv.indexOf('--selftest') + 1];
  if (!p || !fs.existsSync(p)) {
    console.error('Usage: --selftest <path-to-saved-rankings.html>');
    process.exit(1);
  }
  const parsed = parseUfcRankingsHtml(fs.readFileSync(p, 'utf-8'));
  for (const [div, list] of Object.entries(parsed)) {
    console.log(`\n${div} (${list.length})`);
    console.log('  ' + list.map((r) => `${r.rank}:${r.name}`).join('  '));
  }
  console.log(`\n${Object.keys(parsed).length} divisions parsed.`);
} else if (process.argv[1] && process.argv[1].includes('fetchUfcRankings')) {
  fetchUfcComRankings().then((r) => {
    for (const [div, list] of Object.entries(r)) {
      console.log(`\n${div} (${list.length})`);
      console.log('  ' + list.map((x) => `${x.rank}:${x.name}`).join('  '));
    }
    console.log(`\n${Object.keys(r).length} divisions.`);
  });
}
