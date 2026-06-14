// Proves the evidence-based scoring works against our real dataset using the
// 4 saved profile fixtures — no network. Each fixture's UFC opponents should
// overlap our recorded UFC opponents, producing a high-confidence match.
// Run: npx tsx scripts/sherdog/resolveCrosswalk.test.ts
import fs from 'fs';
import path from 'path';
import { loadAllData } from '../../src/lib/loadData';
import { parseProfile } from './parseProfile';
import { scoreCandidate, classifyMatch } from './resolveCrosswalk';

const FIX = path.join(__dirname, 'fixtures');
const data = loadAllData();

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}
function ourFighterByName(name: string) {
  return data.fighters.find((f) => norm(f.fullName) === norm(name));
}
function ourOpps(fid: string) {
  const s = new Set<string>();
  for (const f of data.fighterFights.get(fid) ?? [])
    s.add(norm(f.fighterId1 === fid ? f.fighter2Name : f.fighter1Name));
  return s;
}

const cases = [
  ['makhachev', 'Islam Makhachev'],
  ['amosov', 'Yaroslav Amosov'],
  ['malott', 'Mike Malott'],
  ['barbosa', 'Marcio Barbosa'],
];

let failures = 0;
for (const [file, name] of cases) {
  const our = ourFighterByName(name);
  if (!our) { console.log(`  ✗ ${name}: not found in our dataset`); failures++; continue; }
  const prof = parseProfile(fs.readFileSync(path.join(FIX, `${file}.html`), 'utf-8'));
  const ev = scoreCandidate(our, ourOpps(our.fighterId), prof);
  // Each fixture is the fighter's own profile → unique exact name.
  const verdict = classifyMatch(ev, { exactNameCount: 1 });
  const ok = verdict === 'verified';
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(18)} → ${prof.sherdogId.padEnd(26)} ` +
    `overlap ${ev.opponentOverlap}/${ev.ourOpponentCount} name=${ev.nameExact} wt=${ev.weightMatch} ` +
    `score=${ev.score} [${verdict}]`);
  if (!ok) failures++;
}

// Negative control: a real profile scored against the WRONG fighter must NOT verify.
const islam = ourFighterByName('Islam Makhachev')!;
const amosovProf = parseProfile(fs.readFileSync(path.join(FIX, 'amosov.html'), 'utf-8'));
const wrong = scoreCandidate(islam, ourOpps(islam.fighterId), amosovProf);
const wrongVerdict = classifyMatch(wrong, { exactNameCount: 0 });
const negOk = wrongVerdict !== 'verified';
console.log(`  ${negOk ? '✓' : '✗'} NEGATIVE: Amosov profile vs our Makhachev → [${wrongVerdict}] overlap=${wrong.opponentOverlap} (must not verify)`);
if (!negOk) failures++;

console.log(failures === 0 ? '\n✅ CROSSWALK SCORING PASSED' : `\n❌ ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
