// Unit tests for the DISPLAY / DERIVATION layer.
//
// The golden master guards ranking OUTPUT and engine.test.ts guards the Elo
// invariants; neither exercises the presentation helpers that turn a rating
// into what the user reads. Those are pure functions with real contracts (trend
// chips, inactivity badges, style prose, pace/form derivations, the gauntlet
// chart, compare edges) that can silently break on a data/refactor change while
// the rankings stay put. This file asserts those contracts directly.
//
// Run: npx tsx scripts/display.test.ts   (or node_modules/.bin/jiti scripts/display.test.ts)
import {
  initials,
  getInactivity,
  getTrend,
  describeStyle,
  INACTIVE_MONTHS,
} from '../src/lib/fighterDisplay';
import {
  classifyStyle,
  formEloNudge,
  buildGauntlet,
  type PaceWindow,
  type FormDrift,
} from '../src/lib/advancedStats';
import { computeCompareEdges } from '../src/lib/compareEdges';
import type { FightTrace } from '../src/lib/eloEngine';
import type { RankedFighter } from '../src/lib/types';
import type { FighterProfile } from '../src/lib/fighterProfile';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); failures++; }
};
const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

// ── initials ────────────────────────────────────────────────────────────────
console.log('\n=== initials ===');
ok(initials('Islam Makhachev') === 'IM', 'first+last initials');
ok(initials('Jon Bones Jones') === 'JJ', 'ignores middle names (first + last)');
ok(initials('Shevchenko') === 'SH', 'single name → first two letters, upper');
ok(initials('  Max   Holloway  ') === 'MH', 'collapses surrounding/inner whitespace');

// ── getInactivity ─────────────────────────────────────────────────────────────
console.log('\n=== getInactivity ===');
ok(getInactivity({ monthsSinceLastFight: INACTIVE_MONTHS - 1 }) === null, 'below threshold → no badge');
{
  const at = getInactivity({ monthsSinceLastFight: INACTIVE_MONTHS });
  ok(at != null && at.label === '⏸ INACTIVE', 'at threshold (<24mo) → plain INACTIVE badge');
  const twoYr = getInactivity({ monthsSinceLastFight: 30 });
  ok(twoYr != null && twoYr.label === '⏸ INACTIVE 2Y', '30mo → floor(30/12)=2Y suffix');
  const rounds = getInactivity({ monthsSinceLastFight: 17.6 });
  ok(rounds != null, 'rounds up to the threshold (17.6 → 18)');
}

// ── getTrend (the rank-vs-UFC delta, the product thesis) ────────────────────
console.log('\n=== getTrend ===');
const rf = (officialRank: string | null): RankedFighter =>
  ({ officialRank } as unknown as RankedFighter);
ok(getTrend(rf(null), 10)?.label === 'NR', 'unranked by UFC → NR chip');
ok(getTrend(rf('NR'), 10)?.label === 'NR', 'explicit "NR" → NR chip');
ok(getTrend(rf('C'), 1) === null, 'champion → no contender chip (pinned to hero)');
ok(getTrend(rf('5'), 5)?.label === '=', 'same as UFC → "=" chip');
{
  const up = getTrend(rf('12'), 5); // UFC #12, we rank #5 → we rank higher
  ok(up?.label === '▲7', 'we rank higher than UFC → ▲ with the gap');
  const down = getTrend(rf('3'), 8); // UFC #3, we rank #8 → we rank lower
  ok(down?.label === '▼5', 'we rank lower than UFC → ▼ with the gap');
}

// ── describeStyle (finish-tendency prose) ────────────────────────────────────
console.log('\n=== describeStyle ===');
ok(
  describeStyle({ koRate: 0.7, subRate: 0.1, sigStrikeAccuracy: 0.5, finishRate: 0.8 }) === 'a knockout artist',
  'KO-dominant → knockout artist',
);
ok(
  describeStyle({ koRate: 0.1, subRate: 0.5, sigStrikeAccuracy: 0.4, finishRate: 0.6 }) === 'a submission specialist',
  'sub-dominant → submission specialist',
);
ok(
  describeStyle({ koRate: 0.1, subRate: 0.1, sigStrikeAccuracy: 0.45, finishRate: 0.2 }) === 'a tactical decision-grinder who wins on the cards',
  'low finish rate → decision-grinder',
);

// ── classifyStyle (opponent striker/grappler heuristic) ──────────────────────
console.log('\n=== classifyStyle ===');
const pw = (o: Partial<PaceWindow>): PaceWindow => ({
  fights: 3, minutes: 45, landedPer15: 40, absorbedPer15: 40, diffPer15: 0,
  tdPer15: 0.5, tdAbsorbedPer15: 0.5, kdPer15: 0, kdAbsorbedPer15: 0, kdDiffPer15: 0,
  subAttPer15: 0, ctrlSharePct: 5, oppCtrlSharePct: 5, netCtrlPct: 0, sigAccuracy: 0.45,
  ...o,
});
ok(classifyStyle(null) === 'unknown', 'no window → unknown');
ok(classifyStyle(pw({ fights: 1 })) === 'unknown', 'thin sample (<2) → unknown');
ok(classifyStyle(pw({ tdPer15: 2.5, ctrlSharePct: 25, landedPer15: 20 })) === 'grappler', 'high TD/control → grappler');
ok(classifyStyle(pw({ landedPer15: 70, tdPer15: 0.3, ctrlSharePct: 4 })) === 'striker', 'high volume, low TD → striker');
ok(classifyStyle(pw({ landedPer15: 40, tdPer15: 0.5, ctrlSharePct: 6 })) === 'balanced', 'neither lean → balanced');

// ── formEloNudge (bounded ±45 form shading) ──────────────────────────────────
console.log('\n=== formEloNudge ===');
const drift = (o: Partial<FormDrift>): FormDrift =>
  ({ landedPer15Delta: 0, landedPctChange: null, diffPer15Delta: 0, tdPer15Delta: 0, sigAccuracyDelta: null, ...o });
ok(formEloNudge(null) === 0, 'no drift → 0');
ok(formEloNudge(undefined) === 0, 'undefined drift → 0');
ok(formEloNudge(drift({ diffPer15Delta: 5 })) > 0, 'improving strike differential → positive nudge');
ok(formEloNudge(drift({ diffPer15Delta: -5 })) < 0, 'declining strike differential → negative nudge');
ok(approx(formEloNudge(drift({ diffPer15Delta: 5 })), -formEloNudge(drift({ diffPer15Delta: -5 }))), 'nudge is sign-symmetric');
ok(formEloNudge(drift({ diffPer15Delta: 1000 })) === 45, 'clamped at +45');
ok(formEloNudge(drift({ diffPer15Delta: -1000 })) === -45, 'clamped at −45');

// ── buildGauntlet (career-trajectory chart) ──────────────────────────────────
console.log('\n=== buildGauntlet ===');
const trace = (o: Partial<FightTrace>): FightTrace => ({
  fightId: 'f', date: '2024-01-01', opponentId: 'x', opponentName: 'Opponent',
  result: 'W', method: 'U-DEC', round: 3, weightClass: 'Lightweight', fiveRound: false,
  ratingBefore: 1500, ratingAfter: 1510, delta: 10, opponentRating: 1500, ...o,
});
ok(buildGauntlet([trace({})], 'Hero') === null, 'fewer than 2 rated fights → null');
ok(
  buildGauntlet([trace({ opponentRating: 0 }), trace({ opponentRating: 0 })], 'Hero') === null,
  'unrated opponents (rating 0) are not placeable → null',
);
{
  // Trace is newest-first: a big upset (beat 1700) after a routine win (beat 1500).
  const history: FightTrace[] = [
    trace({ date: '2024-06-01', opponentName: 'Strong', opponentRating: 1700, ratingBefore: 1500, result: 'W' }),
    trace({ date: '2024-01-01', opponentName: 'Even', opponentRating: 1500, ratingBefore: 1500, result: 'W' }),
  ];
  const g = buildGauntlet(history, 'Hero');
  ok(g != null && g.points.length === 2, 'two rated fights → two points');
  ok(g!.points[0].date < g!.points[1].date, 'points are ascending by date (chart reads left→right)');
  ok(g!.totalOverperf > 0, 'two wins → positive cumulative over-expectancy');
  ok(g!.biggestUpset?.opponentElo === 1700, 'biggest upset is the win over the stronger opponent');
  ok(g!.points[1].overUnder > g!.points[0].overUnder, 'beating the stronger opponent is the larger over-performance');
}

// ── computeCompareEdges (side-by-side tiering) ───────────────────────────────
console.log('\n=== computeCompareEdges ===');
const profile = (fullName: string, sos: number): FighterProfile =>
  ({ fullName, sos, advanced: null, divisionBenchmark: null, grapple: null, fightCount: 10 } as unknown as FighterProfile);
{
  const edges = computeCompareEdges(profile('Alex Pereira', 140), profile('Jiri Prochazka', 100));
  const resume = edges.find((e) => e.key === 'resume')!;
  ok(resume.available && resume.leader === 'a', 'higher SoS wins the resume edge');
  ok(resume.leaderName === 'Pereira', 'leader labelled by last name');
  ok(resume.edgePct === 40 && resume.stars === 5, '40% gap → significant edge (5 stars)');
  const even = computeCompareEdges(profile('A B', 100), profile('C D', 100)).find((e) => e.key === 'resume')!;
  ok(even.leader === 'even' && even.stars === 0, 'equal SoS → even, no leader');
  const striking = edges.find((e) => e.key === 'striking')!;
  ok(!striking.available, 'no career/benchmark data → striking edge unavailable, not fabricated');
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${failures === 0 ? '✓ ALL DISPLAY TESTS PASSED' : `✗ ${failures} DISPLAY TEST(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
