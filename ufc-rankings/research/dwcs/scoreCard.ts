// research/dwcs/scoreCard.ts — score the committed upcoming DWCS snapshot with
// the production pre-UFC model and print the FULL decomposition. Diagnostic:
// the fastest way to answer "why did this fighter get that grade?" without
// reading the numbers off a page.
//
// Run: node_modules/.bin/jiti research/dwcs/scoreCard.ts
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { scoutDwcsEntrant, tierMultiplierForOrg } from '../../src/lib/dwcsScout';

const num = (s: string) => (s?.trim() ? Number(s) : null);

function main(): void {
  const rows = Papa.parse<Record<string, string>>(
    fs.readFileSync(path.join(process.cwd(), 'data', 'dwcs_upcoming.csv'), 'utf-8'),
    { header: true, skipEmptyLines: true }
  ).data;

  console.log('PRE-UFC MODEL — full decomposition for the committed card\n');
  const all: { name: string; score: number; grade: string }[] = [];

  for (const r of rows) {
    for (const side of ['f1', 'f2'] as const) {
      const name = r[`${side}_name`];
      if (!name) continue;
      const org = r[`${side}_org`] || null;
      const raw = {
        record: r[`${side}_record`] || null,
        finishes: num(r[`${side}_finishes`]),
        age: num(r[`${side}_age`]),
        org,
      };
      const read = scoutDwcsEntrant(raw);
      const t = tierMultiplierForOrg(org);
      if (!read.rating) {
        console.log(`${name.padEnd(20)} UNGRADED — ${read.line}`);
        continue;
      }
      const p = read.rating.parts;
      all.push({ name, score: read.rating.score, grade: read.rating.grade });
      console.log(
        `${name.padEnd(20)} ${String(read.rating.score).padStart(3)}/100  ${read.rating.grade}   ` +
          `rec ${(raw.record ?? '').padEnd(5)} wr ${read.rating.winRate.toFixed(3)}  ` +
          `age ${String(raw.age).padStart(2)}  org ${(org ?? '—').padEnd(18)} tier ${t.toFixed(2)}`
      );
      console.log(
        `${' '.repeat(20)} logit parts → winRate ${p.winRate >= 0 ? '+' : ''}${p.winRate.toFixed(3)}  ` +
          `age ${p.age >= 0 ? '+' : ''}${p.age.toFixed(3)}  promo ${p.promotion >= 0 ? '+' : ''}${p.promotion.toFixed(3)}` +
          `   finishRate ${read.rating.finishRate != null ? (100 * read.rating.finishRate).toFixed(0) + '%' : 'n/a'} (NOT SCORED)`
      );
    }
  }

  console.log('\nRanked:');
  all.sort((a, b) => b.score - a.score).forEach((f, i) =>
    console.log(`  ${String(i + 1).padStart(2)}. ${f.name.padEnd(20)} ${String(f.score).padStart(3)}  ${f.grade}`)
  );
}

main();
