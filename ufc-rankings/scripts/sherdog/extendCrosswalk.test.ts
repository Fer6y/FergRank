// reverseMatchProfile unit tests — the Phase-2 identity logic, exercised with
// synthetic fighters/profiles (no I/O). Asserts that the SAME evidence rules as
// resolveCrosswalk (shared-opponents over names, namesake-guarded) hold when run
// in reverse (sherdog profile → our fighter).
// Run: npx tsx scripts/sherdog/extendCrosswalk.test.ts
import { reverseMatchProfile } from './extendCrosswalk';
import type { Fighter } from '../../src/lib/types';
import type { SherdogProfile, SherdogFight } from './types';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); failures++; };
};

const ourFighter = (id: string, name: string, wc: string): Fighter =>
  ({ fighterId: id, fullName: name, weightClass: wc } as unknown as Fighter);

const sdFight = (opp: string): SherdogFight =>
  ({ result: 'win', opponentName: opp, opponentId: null, eventName: 'UFC',
     eventId: null, date: null, method: '', referee: null, round: null, time: null });

const sdProfile = (name: string, wc: string, opps: string[]): SherdogProfile =>
  ({ sherdogId: `${name.replace(/\s/g, '-')}-9999`, numericId: '9999', url: '',
     name, nickname: null, nationality: null, birthDate: null, heightCm: null,
     weightLbs: null, weightClass: wc, association: null,
     fights: opps.map(sdFight) } as SherdogProfile);

const oppsMap = (m: Record<string, string[]>) =>
  (fid: string) => new Set((m[fid] ?? []).map((s) => s.toLowerCase()));

// 1. Strong identity: 3+ shared opponents → verified, name-spelling independent.
console.log('\n=== shared-opponents identity ===');
{
  const prof = sdProfile('Renato Moicano', 'Lightweight', ['Jalin Turner', 'Rafael Fiziev', 'Drew Dober']);
  const cands = [ourFighter('m1', 'Renato Moicaño', 'Lightweight')]; // accent differs
  const r = reverseMatchProfile(prof, cands, oppsMap({ m1: ['Jalin Turner', 'Rafael Fiziev', 'Drew Dober'] }));
  ok(r.verdict === 'verified', `accent-mismatch name verifies on 3 shared opponents (got ${r.verdict})`);
  ok(r.best?.fighter.fighterId === 'm1', 'picked the right fighter');
}

// 2. Namesake guard: two of OUR fighters share the name; opponent overlap breaks the tie.
console.log('\n=== namesake guard ===');
{
  const prof = sdProfile('Bruno Silva', 'Flyweight', ['Alex Perez', 'Victor Altamirano']);
  const cands = [
    ourFighter('fly', 'Bruno Silva', 'Flyweight'),       // the flyweight (shares opponents)
    ourFighter('mw', 'Bruno Silva', 'Middleweight'),     // the middleweight namesake
  ];
  const r = reverseMatchProfile(prof, cands, oppsMap({
    fly: ['Alex Perez', 'Victor Altamirano'], mw: ['Gerald Meerschaert'],
  }));
  ok(r.best?.fighter.fighterId === 'fly', 'opponent overlap selects the correct namesake');
  ok(r.exactNameCount === 2, `namesake count detected (got ${r.exactNameCount})`);
  ok(r.verdict === 'verified', `2 shared opps (majority of list) verifies (got ${r.verdict})`);
}

// 3. No candidates (true debutant absent from our data) → reject.
console.log('\n=== unmatched debutant ===');
{
  const prof = sdProfile('Brand New Prospect', 'Lightweight', []);
  const r = reverseMatchProfile(prof, [], oppsMap({}));
  ok(r.best === null && r.verdict === 'reject', 'no candidates → reject (reported as needs-data-refresh)');
}

// 4. Debutant in our data: unique exact name + weight, no opponents yet → verified.
console.log('\n=== known debutant, unique name+weight ===');
{
  const prof = sdProfile('Quillan Salkilld', 'Lightweight', []);
  const cands = [ourFighter('q1', 'Quillan Salkilld', 'Lightweight')];
  const r = reverseMatchProfile(prof, cands, oppsMap({ q1: [] }));
  ok(r.verdict === 'verified', `unique name+weight debutant verifies (got ${r.verdict})`);
}

// 5. Weak/ambiguous signal → review, not a silent accept.
console.log('\n=== ambiguous → review ===');
{
  const prof = sdProfile('Daniel Santos', 'Bantamweight', ['Some Guy']);
  const cands = [
    ourFighter('a', 'Daniel Santos', 'Bantamweight'),
    ourFighter('b', 'Daniel Santos', 'Featherweight'),
  ];
  const r = reverseMatchProfile(prof, cands, oppsMap({ a: ['Unrelated A'], b: ['Unrelated B'] }));
  ok(r.verdict === 'review', `common name, no overlap → review (got ${r.verdict})`);
}

console.log(failures === 0 ? '\n✅ ALL ASSERTIONS PASSED' : `\n❌ ${failures} assertion(s) failed`);
process.exit(failures === 0 ? 0 : 1);
