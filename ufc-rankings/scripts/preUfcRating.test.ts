// Unit tests for the PRE-UFC RATING system (src/lib/preUfcRating.ts +
// src/lib/dwcsScout.ts). Guards the INVARIANTS a config tune must not break —
// monotonicity in each input, the missing-data contract, and the org
// resolution traps that actually bit during the build.
//
// Run: node_modules/.bin/jiti scripts/preUfcRating.test.ts  (wired into npm test)
import { ratePreUfc, explainPreUfc } from '../src/lib/preUfcRating';
import { tierMultiplierForOrg, scoutDwcsEntrant } from '../src/lib/dwcsScout';
import { RANKING_CONFIG } from '../src/lib/rankingConfig';

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${cond ? '' : `  — ${detail}`}`);
  if (!cond) failures++;
}

const base = { wins: 8, losses: 1, finishes: 5, age: 26, tierMultiplier: 0.35, org: 'Test FC' };

console.log('\n=== monotonicity: each scored input moves the score the right way ===');
const mid = ratePreUfc(base)!;
const better = ratePreUfc({ ...base, wins: 9, losses: 0 })!;
const older = ratePreUfc({ ...base, age: 34 })!;
const younger = ratePreUfc({ ...base, age: 21 })!;
const bigOrg = ratePreUfc({ ...base, tierMultiplier: 0.68 })!;
check('better record scores higher', better.score > mid.score, `${better.score} vs ${mid.score}`);
check('older scores lower', older.score < mid.score, `${older.score} vs ${mid.score}`);
check('younger scores higher', younger.score > mid.score, `${younger.score} vs ${mid.score}`);
check('stronger promotion scores higher', bigOrg.score > mid.score, `${bigOrg.score} vs ${mid.score}`);

console.log('\n=== finish rate is DISPLAYED but never scored (calibration result) ===');
const noFin = ratePreUfc({ ...base, finishes: 0 })!;
const allFin = ratePreUfc({ ...base, finishes: 8 })!;
check('finishes do not change the score', noFin.score === allFin.score, `${noFin.score} vs ${allFin.score}`);
check('finish rate is still reported', allFin.finishRate === 1 && noFin.finishRate === 0);

console.log('\n=== missing data is refused, never guessed ===');
check('no age → null', ratePreUfc({ ...base, age: null }) === null);
check('no record → null', ratePreUfc({ ...base, wins: null }) === null);
check('zero fights → null', ratePreUfc({ ...base, wins: 0, losses: 0 }) === null);
const ungraded = scoutDwcsEntrant({ record: '5-0', finishes: null, age: null, org: 'LFA' });
check('scout names the missing field', ungraded.rating === null && /no verified age/.test(ungraded.line), ungraded.line);

console.log('\n=== score bounds + grade bands ===');
const monster = ratePreUfc({ wins: 20, losses: 0, finishes: 20, age: 18, tierMultiplier: 1, org: 'X' })!;
const dire = ratePreUfc({ wins: 1, losses: 9, finishes: 0, age: 40, tierMultiplier: 0, org: null })!;
check('score clamped to 0..100', monster.score <= 100 && dire.score >= 0, `${monster.score} / ${dire.score}`);
check('elite profile grades A', monster.grade === 'A');
check('poor profile grades C', dire.grade === 'C');

console.log('\n=== org resolution: the traps that actually bit ===');
check('"Road to UFC" is NOT tier-1', tierMultiplierForOrg('Road to UFC') < 1, String(tierMultiplierForOrg('Road to UFC')));
check('"Cage Fury FC" resolves to CFFC tier3 (0.55)', tierMultiplierForOrg('Cage Fury FC') === 0.55, String(tierMultiplierForOrg('Cage Fury FC')));
check('"LFA" resolves to tier3 (0.55)', tierMultiplierForOrg('LFA') === 0.55, String(tierMultiplierForOrg('LFA')));
check('unknown named org → default tier', tierMultiplierForOrg('Some Regional Promotion 99') === RANKING_CONFIG.promotionTiers.tier4.multiplier);
check('null org → 0 (no provenance ≠ default)', tierMultiplierForOrg(null) === 0);

console.log('\n=== explanation text ===');
const ex = explainPreUfc(ratePreUfc({ ...base, wins: 6, losses: 0, age: 22, finishes: 6 })!);
check('undefeated phrasing', /undefeated at 6-0/.test(ex), ex);
check('mentions runway for a young fighter', /runway/.test(ex), ex);
check('flags the finisher style read as unscored', /style read/.test(ex), ex);

if (failures) {
  console.error(`\n❌ ${failures} ASSERTION(S) FAILED`);
  process.exit(1);
}
console.log('\n✅ ALL ASSERTIONS PASSED');
