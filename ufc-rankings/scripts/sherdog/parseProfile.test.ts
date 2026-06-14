// Parser smoke-test against saved fixtures.
// Run: npx tsx scripts/sherdog/parseProfile.test.ts
import fs from 'fs';
import path from 'path';
import { parseProfile } from './parseProfile';

const FIX = path.join(__dirname, 'fixtures');
const files = ['makhachev', 'amosov', 'malott', 'barbosa'];

let failures = 0;
const fail = (msg: string) => { console.log('  ✗ ' + msg); failures++; };

for (const f of files) {
  const html = fs.readFileSync(path.join(FIX, `${f}.html`), 'utf-8');
  const p = parseProfile(html);
  console.log(`\n=== ${f} → ${p.name} (${p.sherdogId}) ===`);
  console.log(`  nick=${p.nickname} nat=${p.nationality} dob=${p.birthDate} ` +
    `ht=${p.heightCm}cm wt=${p.weightLbs}lb class=${p.weightClass} assoc=${p.association}`);

  // Structural assertions
  if (!p.sherdogId || !p.numericId) fail('missing sherdog id');
  if (!p.name) fail('missing name');
  if (p.fights.length === 0) fail('no fights parsed');

  // Every fight must have a result and at least an opponent name
  const bad = p.fights.filter((x) => !x.opponentName || !['win', 'loss', 'draw', 'nc'].includes(x.result));
  if (bad.length) fail(`${bad.length} fights missing result/opponent`);

  // Dates should parse for the vast majority
  const undated = p.fights.filter((x) => !x.date).length;
  if (undated > p.fights.length * 0.2) fail(`${undated}/${p.fights.length} fights undated`);

  // Record summary + org spread (org derived from event-name prefix, preview only)
  const w = p.fights.filter(x => x.result === 'win').length;
  const l = p.fights.filter(x => x.result === 'loss').length;
  const d = p.fights.filter(x => x.result === 'draw').length;
  const orgs = new Set(p.fights.map(x => x.eventName.split(/[-–]/)[0].trim()).filter(Boolean));
  console.log(`  pro record: ${w}-${l}-${d} over ${p.fights.length} fights`);
  console.log(`  event-name prefixes (org hint): ${[...orgs].slice(0, 12).join(' | ')}`);

  // Show the 3 most recent fights
  for (const x of p.fights.slice(0, 3))
    console.log(`    ${x.date} ${x.result.toUpperCase().padEnd(4)} vs ${x.opponentName.padEnd(22)} ${x.method} [R${x.round} ${x.time}] @ ${x.eventName}`);
}

console.log(failures === 0 ? '\n✅ ALL FIXTURES PASSED' : `\n❌ ${failures} assertion(s) failed`);
process.exit(failures === 0 ? 0 : 1);
