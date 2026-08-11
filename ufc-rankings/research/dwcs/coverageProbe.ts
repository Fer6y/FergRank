// ─────────────────────────────────────────────────────────────────────────
//  research/dwcs/coverageProbe.ts — Phase A.0 of docs/plans/DWCS_PLAN.md.
//
//  Decides whether non-crosswalked DWCS opponents can get real pre-DWCS
//  records (from cached Sherdog profile HTML) or only denominator membership
//  in dwcs_fighters.csv. Console-only; writes nothing. Zero network — the
//  Sherdog crawl is dead (Cloudflare), so the cache is all there will ever be.
//
//  Run: node_modules/.bin/jiti research/dwcs/coverageProbe.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { parseProfile } from '../../scripts/sherdog/parseProfile';

const DWCS_ORG = "Dana White's Contender Series";
const CACHE_DIR = path.join(process.cwd(), 'data', '.sherdog_cache');

// Same sanitisation as scripts/sherdog/fetchProfile.ts cachePath().
const cacheFile = (sherdogId: string): string =>
  path.join(CACHE_DIR, `${sherdogId.replace(/[^A-Za-z0-9_-]/g, '_')}.html`);

function main(): void {
  const csv = fs.readFileSync(path.join(process.cwd(), 'data', 'sherdog_fights.csv'), 'utf8');
  const rows = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data;

  const dwcs = rows.filter((r) => r.canonicalOrg === DWCS_ORG);
  const subjects = new Set(dwcs.map((r) => r.sherdogId).filter(Boolean));
  const opponents = new Set(dwcs.map((r) => r.opponentSherdogId).filter(Boolean));

  // Crosswalked side: every sherdogId that appears as a SUBJECT anywhere in the
  // file is on our roster (the file is built from the crosswalk).
  const rosterSherdogIds = new Set(rows.map((r) => r.sherdogId).filter(Boolean));
  const nonCrosswalked = [...opponents].filter((id) => !rosterSherdogIds.has(id));

  console.log(`DWCS rows: ${dwcs.length}`);
  console.log(`Distinct DWCS subjects (crosswalked by construction): ${subjects.size}`);
  console.log(`Distinct DWCS opponents: ${opponents.size}`);
  console.log(`Opponents NOT on our roster: ${nonCrosswalked.length}`);

  let cached = 0;
  let parsed = 0;
  let withPreDwcsFights = 0;
  let withDob = 0;
  const parseFailures: string[] = [];

  // Earliest DWCS date per opponent — pre-DWCS record must be cut before it.
  const firstDwcsByOpp = new Map<string, string>();
  for (const r of dwcs) {
    const id = r.opponentSherdogId;
    if (!id || !r.date) continue;
    const cur = firstDwcsByOpp.get(id);
    if (!cur || r.date < cur) firstDwcsByOpp.set(id, r.date);
  }

  for (const id of nonCrosswalked) {
    const file = cacheFile(id);
    if (!fs.existsSync(file)) continue;
    cached++;
    try {
      const prof = parseProfile(fs.readFileSync(file, 'utf8'));
      parsed++;
      if (prof.birthDate) withDob++;
      const cut = firstDwcsByOpp.get(id) ?? '9999';
      if (prof.fights.some((f) => f.date && f.date < cut)) withPreDwcsFights++;
    } catch (e) {
      parseFailures.push(`${id}: ${(e as Error).message}`);
    }
  }

  const pct = (n: number, d: number) => (d ? ((100 * n) / d).toFixed(1) : '—');
  console.log(`\nCache coverage of non-roster opponents:`);
  console.log(`  cached HTML present : ${cached} / ${nonCrosswalked.length} (${pct(cached, nonCrosswalked.length)}%)`);
  console.log(`  parseable           : ${parsed} (${parseFailures.length} failures)`);
  console.log(`  with pre-DWCS fights: ${withPreDwcsFights} (${pct(withPreDwcsFights, nonCrosswalked.length)}% of non-roster)`);
  console.log(`  with birthDate      : ${withDob}`);
  if (parseFailures.length) console.log(`  failures:\n    ${parseFailures.slice(0, 10).join('\n    ')}`);

  console.log(
    `\nDecision guidance (DWCS_PLAN.md Phase A): if pre-DWCS-fight coverage is high,` +
      ` the builder reads opponent records from cache; if low, non-roster opponents` +
      ` carry preDwcsSource=none and appear denominator-only.`
  );
}

main();
