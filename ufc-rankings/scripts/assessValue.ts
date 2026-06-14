import { loadAllData } from '../src/lib/loadData';
import { loadPreUFCPedigree } from '../src/lib/loadMultiPromotion';

const data = loadAllData();
const ped = loadPreUFCPedigree(data);

// UFC debut + last fight + UFC fight count per fighter
const debut = new Map<string, Date>(), last = new Map<string, Date>(), n = new Map<string, number>();
for (const [fid, fights] of data.fighterFights) {
  let e: Date | null = null, l: Date | null = null, c = 0;
  for (const f of fights) { if (f.eventDate) { c++; if(!e||f.eventDate<e)e=f.eventDate; if(!l||f.eventDate>l)l=f.eventDate; } }
  if (e) debut.set(fid, e); if (l) last.set(fid, l); n.set(fid, c);
}
const NOW = new Date('2026-06-13');
const monthsAgo = (d?: Date) => d ? (NOW.getTime()-d.getTime())/2.63e9 : 999;

// Malott check
const malott = data.fighters.find(f => /malott/i.test(f.fullName));
console.log('Mike Malott in dataset:', !!malott, malott ? `(UFC debut ${debut.get(malott.fighterId)?.toISOString().slice(0,10)}, ${n.get(malott.fighterId)} UFC fights)` : '');
console.log('  → has pre-UFC pedigree:', malott ? ped.has(malott.fighterId) : 'n/a');

// Of pedigree fighters: how many active (fought < 18mo ago)?
let active = 0, debutPost2021 = 0, lowUFC = 0, lowUFCandActive = 0;
for (const fid of ped.keys()) {
  const a = monthsAgo(last.get(fid)) <= 18;
  if (a) active++;
  if ((debut.get(fid)?.getFullYear() ?? 0) >= 2022) debutPost2021++;
  if ((n.get(fid) ?? 99) < 5) { lowUFC++; if (a) lowUFCandActive++; }
}
console.log('\n--- 215 pedigree fighters ---');
console.log('still active (fought ≤18mo):', active);
console.log('UFC debut in 2022+:', debutPost2021);
console.log('have <5 UFC fights (small sample = where pedigree matters most):', lowUFC, '| of those still active:', lowUFCandActive);

// The real value pocket: active + <5 UFC fights + has pedigree. List them.
console.log('\n--- HIGH-VALUE: active, <5 UFC fights, has pedigree ---');
const rows: string[] = [];
for (const [fid, p] of ped) {
  if (monthsAgo(last.get(fid)) <= 18 && (n.get(fid) ?? 99) < 5)
    rows.push(`  ${p.fighterName.padEnd(24)} ${n.get(fid)} UFC fights | pre-UFC ${p.wins}-${p.losses} str=${p.pedigreeStrength.toFixed(2)}`);
}
console.log(rows.length ? rows.join('\n') : '  (none)');

// How many CURRENT fighters (active, any UFC count) are NOT in pedigree?
let activeTotal = 0, activeWithPed = 0;
for (const fid of n.keys()) { if (monthsAgo(last.get(fid)) <= 18 && (n.get(fid)??0) >= 3) { activeTotal++; if (ped.has(fid)) activeWithPed++; } }
console.log(`\nActive ranked-eligible fighters (≥3 UFC fights, fought ≤18mo): ${activeTotal} | with any pedigree: ${activeWithPed} (${(100*activeWithPed/activeTotal).toFixed(1)}%)`);
