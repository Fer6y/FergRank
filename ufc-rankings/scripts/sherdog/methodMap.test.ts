// Audits mapMethod against EVERY distinct method string in the Sherdog cache.
// Prints the full mapping and flags anything that falls through to "Other".
// Run: npx tsx scripts/sherdog/methodMap.test.ts
import fs from 'fs';
import path from 'path';
import { parseProfile } from './parseProfile';
import { mapMethod } from './methodMap';

const CACHE = path.join(process.cwd(), 'data', '.sherdog_cache');
const files = fs.existsSync(CACHE)
  ? fs.readdirSync(CACHE).filter((f) => f.endsWith('.html') && !f.startsWith('search__'))
  : [];

if (files.length === 0) {
  console.log('No cached profiles found — run the crawl first.');
  process.exit(0);
}

// Collect distinct Sherdog method strings + counts.
const counts = new Map<string, number>();
for (const f of files) {
  const prof = parseProfile(fs.readFileSync(path.join(CACHE, f), 'utf-8'));
  for (const ft of prof.fights) {
    const m = (ft.method || '').trim();
    if (m) counts.set(m, (counts.get(m) || 0) + 1);
  }
}

// Group by target code; collect unmatched.
const byTarget = new Map<string, number>();
const unmatched: Array<[string, number]> = [];
let total = 0, unmatchedTotal = 0;
for (const [str, n] of counts) {
  total += n;
  const r = mapMethod(str);
  byTarget.set(r.method, (byTarget.get(r.method) || 0) + n);
  if (!r.matched) { unmatched.push([str, n]); unmatchedTotal += n; }
}

console.log(`Distinct Sherdog method strings: ${counts.size} over ${total} fights\n`);
console.log('=== mapped totals by OUR DB target ===');
for (const [t, n] of [...byTarget].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${t}`);
}

// Show a few representative source strings per target for a spot-check.
console.log('\n=== sample source → target (top strings) ===');
for (const [str, n] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 18)) {
  console.log(`  ${String(n).padStart(5)}  "${str}"  →  ${mapMethod(str).method}`);
}

console.log(`\n=== UNMATCHED → "Other" (${unmatchedTotal} fights, ${(100 * unmatchedTotal / total).toFixed(2)}%) ===`);
if (unmatched.length === 0) {
  console.log('  none 🎉');
} else {
  for (const [str, n] of unmatched.sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  "${str}"`);
  }
}

// Guardrail: unmatched should be a tiny tail. Fail loudly if it creeps up.
const pct = unmatchedTotal / total;
console.log(pct <= 0.01 ? '\n✅ unmatched within 1% tolerance' : `\n❌ unmatched ${(pct * 100).toFixed(2)}% exceeds 1% — extend methodMap.ts`);
process.exit(pct <= 0.01 ? 0 : 1);
