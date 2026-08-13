// research/regional/extractProfileMeta.ts — harvest per-fighter metadata from
// the ALREADY-CACHED Fight Matrix profile pages. Zero network: this re-reads
// the 11k+ HTML files the crawl left on disk.
//
// WHAT AGE DATA ACTUALLY EXISTS, verified before building (2026-08-12):
//   • Fight Matrix carries NO birthdate. The tempting "Combat Age" field is
//     their experimental wear metric — "dog years" from opposition quality
//     (Joshua Van: Combat Age 28, chronological age 24). Treating it as age
//     would be fabrication; it is captured here under its own honest name and
//     kept out of any UI age slot.
//   • What IS real: "Pro Debut Date" (explicit) and "Pro Record" per profile.
//     Debut date turns career length from an inference (first bout we happened
//     to observe) into a fact, and career-stage is the honest runway signal we
//     can compute for the whole pool.
//
// Output: data/regional_profile_meta.csv — joined by rateRegional.ts.
//
// Run: node_modules/.bin/jiti research/regional/extractProfileMeta.ts
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const CACHE = path.join(process.cwd(), 'research', 'regional', '.cache');
const OUT = path.join(process.cwd(), 'data', 'regional_profile_meta.csv');

function main(): void {
  const rows: Record<string, string | number>[] = [];
  let files = 0, withDebut = 0, withCombatAge = 0;

  for (const f of fs.readdirSync(CACHE)) {
    if (!f.startsWith('fighter_profile_') || !f.endsWith('.html')) continue;
    files++;
    const h = fs.readFileSync(path.join(CACHE, f), 'utf-8');
    const fmId = h.match(/\/fighter-profile\/[^/]+\/(\d+)\//)?.[1] ?? '';
    if (!fmId) continue;
    const name = (h.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1] ?? '')
      .replace(/<[^>]+>/g, ' ').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    const debut = h.match(/Pro Debut Date:\s*<\/?[^>]*>?\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/)?.[1]
      ?? h.match(/Pro Debut Date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/)?.[1] ?? '';
    const proRecord = h.match(/Pro Record:\s*<\/?[^>]*>?\s*([0-9]+-[0-9]+-[0-9]+)/)?.[1]
      ?? h.match(/Pro Record:\s*([0-9]+-[0-9]+-[0-9]+)/)?.[1] ?? '';
    const combatAge = h.match(/Combat Age:\s*(?:<[^>]+>\s*)*(\d+)/)?.[1] ?? '';
    if (debut) withDebut++;
    if (combatAge) withCombatAge++;
    rows.push({ fmId, name, proDebutDate: debut, proRecord, fmCombatAge: combatAge });
  }

  fs.writeFileSync(OUT, Papa.unparse(rows) + '\n');
  const pc = (n: number) => `${((100 * n) / files).toFixed(1)}%`;
  console.log(`[meta] ${files} cached profiles → ${rows.length} rows → ${OUT}`);
  console.log(`[meta] proDebutDate filled: ${withDebut} (${pc(withDebut)})   fmCombatAge: ${withCombatAge} (${pc(withCombatAge)})`);
}

main();
