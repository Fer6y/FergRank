// Verification / report for the pre-UFC pedigree loader.
// Run: npx tsx scripts/verifyPreUFCPedigree.ts
import { loadAllData } from '../src/lib/loadData';
import { loadPreUFCPedigree } from '../src/lib/loadMultiPromotion';

const data = loadAllData();
const ped = loadPreUFCPedigree(data);

let leaks = 0;
for (const p of ped.values())
  for (const pr of p.byPromotion)
    if (pr.organisation.includes('Ultimate Fighting')) leaks++;

let maxStr = 0, overCap = 0;
for (const p of ped.values()) {
  if (p.pedigreeStrength > maxStr) maxStr = p.pedigreeStrength;
  if (p.pedigreeStrength > 0.75 + 1e-9) overCap++;
}

console.log('fighters with pedigree:', ped.size);
console.log('GUARANTEE 1 — UFC-org leaks in output:', leaks, leaks === 0 ? 'PASS' : 'FAIL');
console.log('GUARANTEE 2 — max pedigreeStrength:', maxStr.toFixed(4), '| over-cap:', overCap, overCap === 0 ? 'PASS' : 'FAIL');

const top = [...ped.values()].sort((a, b) => b.pedigreeStrength - a.pedigreeStrength).slice(0, 10);
console.log('\nTop 10 by pedigreeStrength:');
for (const p of top)
  console.log(`  ${p.fighterName.padEnd(24)} ${p.wins}-${p.losses}-${p.draws}  str=${p.pedigreeStrength.toFixed(3)}  [${p.byPromotion.map(x => x.tier).join(',')}]`);

const vol = [...ped.values()].sort((a, b) => b.fights - a.fights).slice(0, 5);
console.log('\nMost pre-UFC fights:');
for (const p of vol)
  console.log(`  ${p.fighterName.padEnd(24)} ${p.wins}-${p.losses}-${p.draws}  (${p.fights} fights)  str=${p.pedigreeStrength.toFixed(3)}`);
