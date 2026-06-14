// ─────────────────────────────────────────────────────────────────────────
//  scripts/registry/regressionTest.ts — prove the registry resolver reproduces
//  the legacy name resolution EXACTLY, so wiring it into loadData stays
//  byte-identical (no fighter loses or steals a fight).
//
//  Run after any registry rebuild or loader change:
//    node_modules/.bin/jiti scripts/registry/regressionTest.ts
//  PASS = 0 different-canonical AND 0 registry-misses.
// ─────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadFighters, loadEvents, loadFights } from '../../src/lib/loadData';
import { getRegistry } from '../../src/lib/registry';

const reg = getRegistry();
const fighters = loadFighters(); // full roster incl. merged secondaries
const nameToId = new Map(fighters.map((f) => [f.fullName, f.fighterId]));

const merges = new Map<string, string>();
const mp = path.join('data', 'canonical', 'fighter_merges.csv');
if (fs.existsSync(mp))
  for (const r of Papa.parse<Record<string, string>>(fs.readFileSync(mp, 'utf-8'), { header: true, skipEmptyLines: true }).data)
    if (r['secondary_id'] && r['primary_id']) merges.set(r['secondary_id'], r['primary_id']);

// The legacy resolution: exact Full-Name → id, then apply the confirmed merge.
const legacy = (n: string): string | null => {
  const id = nameToId.get(n);
  if (!id) return null;
  return merges.get(id) ?? id;
};

const events = loadEvents();
const fights = loadFights(events);
const names = new Set<string>();
for (const f of fights) { if (f.fighter1Name) names.add(f.fighter1Name); if (f.fighter2Name) names.add(f.fighter2Name); }
for (const f of fighters) names.add(f.fullName);

let same = 0, diffId = 0, regOnly = 0, curOnly = 0;
const problems: string[] = [];
for (const n of names) {
  const c = legacy(n), r = reg.resolve(n);
  if (c === r) same++;
  else if (c && r) { diffId++; if (problems.length < 12) problems.push(`  DIFFERENT id: "${n}" legacy=${c.slice(0, 8)} registry=${r.slice(0, 8)}`); }
  else if (!c && r) regOnly++;
  else { curOnly++; if (problems.length < 12) problems.push(`  registry MISSES: "${n}" (legacy=${c!.slice(0, 8)})`); }
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  REGISTRY RESOLVER REGRESSION TEST');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  registry: ${reg.size} resolvable names, ${reg.ambiguous} ambiguous-dropped`);
console.log(`  names tested: ${names.size}`);
console.log(`    identical resolution            : ${same}`);
console.log(`    DIFFERENT canonical id (FAIL)    : ${diffId}`);
console.log(`    registry misses legacy (FAIL)    : ${curOnly}`);
console.log(`    registry resolves extra variants : ${regOnly}`);
for (const p of problems) console.log(p);
const pass = diffId === 0 && curOnly === 0;
console.log(pass ? '\n  ✓ PASS — registry is a safe drop-in (byte-identical).' : '\n  ✗ FAIL — investigate before relying on the registry.');
process.exit(pass ? 0 : 1);
