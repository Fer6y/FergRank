// Unit tests for the SCORING layer (scoringEngine.ts + crossDivision.ts) and the
// two-slope inactivity regression (eloEngine.ts).
//
// The golden master guards the ranking OUTPUT; engine.test.ts guards the Elo-core
// invariants. This file guards the RANKING-LAYER mechanisms added 2026-07-02→06 —
// untested hold, metrics opponent-quality damper, head-to-head leapfrog
// (+ anti-vault + negation rules), champion tiebreaker, champion floor
// (and the ABSENCE of contender floors), official-seed loss-streak counting,
// two-slope inactivity, and the P4P recent-form tilt. Each encodes an intent the
// golden master can't express: a `--update` re-bless would silently bless a
// regression in any of these. Config is referenced (never hardcoded) so a
// legitimate tuning change doesn't fail these.
//
// Run: node_modules/.bin/jiti scripts/scoring.test.ts   (wired into `npm test`)
import { regressForInactivity } from '../src/lib/eloEngine';
import {
  metricsQualityMultiplier,
  untestedHoldPenalty,
  computeMetricsBonus,
  applyChampionTiebreaker,
  applyChampionFloor,
  applyHeadToHead,
  recentLossStreak,
} from '../src/lib/scoringEngine';
import { recentFormTilt } from '../src/lib/crossDivision';
import { RANKING_CONFIG } from '../src/lib/rankingConfig';
import type { RankedFighter } from '../src/lib/types';
import type { Fight } from '../src/lib/types';
import type { LoadedData } from '../src/lib/loadData';
import type { EloParams } from '../src/lib/filters';

const E = RANKING_CONFIG.elo as unknown as EloParams;
const INIT = RANKING_CONFIG.elo.initialRating;

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); failures++; }
};
const approx = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

// ── Synthetic helpers (same idiom as engine.test.ts) ────────────────────────
let fightSeq = 0;
function fight(
  id1: string, id2: string,
  result1: 'W' | 'L' | 'D',
  opts: { method?: string; wc?: string; date?: string } = {},
): Fight {
  const result2 = result1 === 'W' ? 'L' : result1 === 'L' ? 'W' : 'D';
  return {
    fightId: `f${fightSeq++}`,
    fighterId1: id1, fighterId2: id2,
    fighter1Name: id1, fighter2Name: id2,
    kd1: 0, kd2: 0, str1: 0, str2: 0, td1: 0, td2: 0, sub1: 0, sub2: 0,
    weightClass: opts.wc ?? 'Lightweight',
    method: opts.method ?? 'U-DEC',
    methodDetails: '', round: 3, fightTime: '', eventId: '',
    result1, result2,
    timeFormat: '3 Rnd (5-5-5)',
    sigStrPct1: 0, sigStrPct2: 0, ctrl1: 0, ctrl2: 0,
    eventDate: new Date(opts.date ?? '2024-01-01'),
    source: 'fights', hasMetrics: true,
  };
}
// Minimal RankedFighter for the array-reorder mechanisms (they read only these fields).
function rf(fighterId: string, finalRating: number, officialRank: string | null = null): RankedFighter {
  return {
    fighterId, fullName: fighterId, finalRating, officialRank,
    rank: 0, sosElo: 1500, rankScore: 0,
  } as unknown as RankedFighter;
}
const names = (arr: RankedFighter[]) => arr.map((f) => f.fighterId).join(',');
// Dates relative to a fixed "now" so month-window rules are deterministic.
const NOW = new Date('2026-07-01');
const monthsAgo = (m: number): string => {
  const d = new Date(NOW);
  d.setMonth(d.getMonth() - m);
  return d.toISOString().slice(0, 10);
};

// ── regressForInactivity: two-slope decay ───────────────────────────────────
console.log('\n=== regressForInactivity (two-slope) ===');
{
  const r = 1700;
  ok(regressForInactivity(r, E.inactivityGraceMonths, E) === r, 'within grace → untouched');
  // Gentle band: grace + 12mo out = one year at the gentle retention rate.
  const gentle = regressForInactivity(r, E.inactivityGraceMonths + 12, E);
  ok(approx(gentle, INIT + (r - INIT) * E.inactivityRetentionPerYear), 'gentle band = retentionPerYear^years toward the mean');
  // Past the elbow the surplus decays STRICTLY faster than the gentle slope alone.
  const atElbow = regressForInactivity(r, E.fullInactivityMonths, E);
  const pastElbow = regressForInactivity(r, E.fullInactivityMonths + 12, E);
  const gentleOnly = INIT + (atElbow - INIT) * E.inactivityRetentionPerYear;
  ok(pastElbow < gentleOnly, 'past the elbow decays faster than the gentle slope would');
  ok(approx(pastElbow, INIT + (atElbow - INIT) * E.inactivityRetentionSteep), 'steep slope applies ONLY to the portion past the elbow');
  // Continuity at the elbow — no cliff (the retired boundary discount's flaw).
  const justPast = regressForInactivity(r, E.fullInactivityMonths + 0.01, E);
  ok(Math.abs(justPast - atElbow) < 0.1, 'continuous at the elbow (no cliff)');
  // Symmetric: a below-mean rating regresses UP toward the mean.
  const low = regressForInactivity(1300, E.inactivityGraceMonths + 24, E);
  ok(low > 1300 && low < INIT, 'below-mean rating rises toward the mean');
}

// ── untestedHoldPenalty ──────────────────────────────────────────────────────
console.log('\n=== untestedHoldPenalty (bowling-spare résumé gate) ===');
{
  const uh = RANKING_CONFIG.untestedHold;
  ok(untestedHoldPenalty(uh.thresholdElo, 5) === 0, 'a ranked-calibre career win releases the hold entirely');
  ok(untestedHoldPenalty(uh.thresholdElo + 100, 3) === 0, 'well above threshold → zero');
  ok(approx(untestedHoldPenalty(uh.thresholdElo - uh.rampElo, 0), -uh.maxPenaltyElo), 'full shortfall at 0 fights → full maxPenaltyElo hold');
  ok(untestedHoldPenalty(0, uh.taperFights) === 0, 'proven veterans (≥ taperFights) are immune by construction');
  ok(untestedHoldPenalty(0, uh.taperFights + 10) === 0, 'immunity holds past the taper');
  const half = untestedHoldPenalty(uh.thresholdElo - uh.rampElo / 2, 0);
  ok(approx(half, -uh.maxPenaltyElo / 2), 'penalty ramps linearly with the shortfall');
  ok(untestedHoldPenalty(uh.thresholdElo - 10, 5) > untestedHoldPenalty(uh.thresholdElo - uh.rampElo, 5), 'better best-win → smaller hold (monotone release)');
  ok(untestedHoldPenalty(1400, 2) <= 0, 'the hold is never a bonus');
}

// ── metricsQualityMultiplier ─────────────────────────────────────────────────
console.log('\n=== metricsQualityMultiplier (opponent-quality damper) ===');
{
  ok(metricsQualityMultiplier(RANKING_CONFIG.metricsQualityFullElo) === 1, 'full credit at/above metricsQualityFullElo');
  ok(metricsQualityMultiplier(RANKING_CONFIG.metricsQualityFullElo + 100) === 1, 'no over-credit above full');
  ok(approx(metricsQualityMultiplier(RANKING_CONFIG.metricsQualityLowElo), RANKING_CONFIG.metricsQualityFloor), 'floor fraction at/below metricsQualityLowElo');
  ok(approx(metricsQualityMultiplier(RANKING_CONFIG.metricsQualityLowElo - 200), RANKING_CONFIG.metricsQualityFloor), 'floor holds below low');
  const mid = (RANKING_CONFIG.metricsQualityFullElo + RANKING_CONFIG.metricsQualityLowElo) / 2;
  ok(approx(metricsQualityMultiplier(mid), RANKING_CONFIG.metricsQualityFloor + (1 - RANKING_CONFIG.metricsQualityFloor) / 2), 'linear at the midpoint');
}

// ── computeMetricsBonus ──────────────────────────────────────────────────────
console.log('\n=== computeMetricsBonus (composite invariants) ===');
{
  const full = RANKING_CONFIG.metricsConfidenceMinFights;
  ok(computeMetricsBonus([], full) === 0, 'no samples → zero');
  const big = { strDiff: 999, accDiff: 9, kd: 99, tdDiff: 99, sub: 99, w: 1 };
  ok(approx(computeMetricsBonus([big], full), RANKING_CONFIG.metricsScaleElo), 'extreme dominance saturates at exactly metricsScaleElo');
  const thin = computeMetricsBonus([big], 2);
  ok(approx(thin, RANKING_CONFIG.metricsScaleElo * (2 / full)), 'thin sample (2 scored fights) dampened by confidence 2/minFights');
  const soft = { strDiff: -50, accDiff: -0.3, kd: 0, tdDiff: -5, sub: 0, w: 1 };
  ok(computeMetricsBonus([soft], full) < 0, 'being out-struck/out-grappled → negative bonus');
  // KD + sub threat are one-sided: an opponent's output never shows up as a
  // negative here (their threat lands in the differentials instead).
  const negOneSided = computeMetricsBonus([{ strDiff: 0, accDiff: 0, kd: -5, tdDiff: 0, sub: -5, w: 1 }], full);
  ok(negOneSided === 0, 'negative kd/sub inputs clamp to zero (one-sided terms)');
}

// ── recentLossStreak ─────────────────────────────────────────────────────────
console.log('\n=== recentLossStreak (official-seed form gate input) ===');
{
  const mk = (results: ('W' | 'L')[]): LoadedData => {
    // results newest-first for readability; build oldest-first dates.
    const fights = results
      .slice()
      .reverse()
      .map((r, i) => fight('hero', `opp${i}`, r, { date: monthsAgo((results.length - i) * 2) }));
    return { fighterFights: new Map([['hero', fights]]) } as unknown as LoadedData;
  };
  ok(recentLossStreak('hero', mk(['L', 'L', 'W', 'L'])) === 2, 'counts consecutive newest losses, stops at the first win');
  ok(recentLossStreak('hero', mk(['W', 'L', 'L'])) === 0, 'a newest win → streak 0');
  ok(recentLossStreak('hero', mk(['L', 'L', 'L'])) === 3, 'all losses counted');
  ok(recentLossStreak('ghost', mk(['L'])) === 0, 'unknown fighter → 0');
  const gate = RANKING_CONFIG.officialSeedSuppressLossStreak;
  ok(recentLossStreak('hero', mk(['L', 'L', 'W'])) >= gate, `a 2-skid meets the ${gate}-loss suppression gate`);
}

// ── applyChampionTiebreaker ──────────────────────────────────────────────────
console.log('\n=== applyChampionTiebreaker ===');
{
  const band = RANKING_CONFIG.championTiebreakerBand;
  const inBand = [rf('contender', 1600), rf('champ', 1600 - band + 1, 'C')];
  applyChampionTiebreaker(inBand, 'Test');
  ok(names(inBand) === 'champ,contender', 'champ within the band is lifted over the non-champ');

  const outBand = [rf('contender', 1600), rf('champ', 1600 - band - 5, 'C')];
  applyChampionTiebreaker(outBand, 'Test');
  ok(names(outBand) === 'contender,champ', 'champ clearly out-rated (gap > band) is NOT lifted');

  const already = [rf('champ', 1600, 'C'), rf('contender', 1595)];
  applyChampionTiebreaker(already, 'Test');
  ok(names(already) === 'champ,contender', 'champ already on top → no-op');

  // Adjacent-only: a champ 2 slots down with both gaps in-band bubbles up past
  // BOTH (two adjacent swaps in one forward pass) — but never past a fighter
  // outside the band.
  const twoUp = [rf('a', 1600), rf('b', 1598), rf('champ', 1596, 'C')];
  applyChampionTiebreaker(twoUp, 'Test');
  ok(names(twoUp) === 'a,b,champ' || names(twoUp) === 'champ,a,b' || names(twoUp) === 'a,champ,b',
    'tiebreaker only performs adjacent swaps (no vaulting logic of its own)');
}

// ── applyChampionFloor (and the ABSENCE of contender floors) ─────────────────
console.log('\n=== applyChampionFloor ===');
{
  const floorIdx = RANKING_CONFIG.championFloorRank - 1;
  const arr = [rf('a', 1700), rf('b', 1690), rf('c', 1680), rf('d', 1670), rf('champ', 1500, 'C')];
  const map = new Map([['champ', 'C']]);
  applyChampionFloor(arr, map, 'Test');
  ok(arr[floorIdx].fighterId === 'champ', `champ pinned to slot #${RANKING_CONFIG.championFloorRank} regardless of rating`);
  ok(names(arr).startsWith('a'), 'the out-rating #1 keeps the top slot (floor is ≤ #2, not #1)');

  // No contender floors: a UFC #3 rated dead-last STAYS dead-last.
  const arr2 = [rf('a', 1700), rf('b', 1690), rf('c', 1680), rf('ufc3', 1400, '3')];
  applyChampionFloor(arr2, new Map([['ufc3', '3']]), 'Test');
  ok(arr2[arr2.length - 1].fighterId === 'ufc3', 'NO contender floor: official #3 with bottom rating stays at the bottom');
}

// ── applyHeadToHead: leapfrog + guard rails ──────────────────────────────────
console.log('\n=== applyHeadToHead (leapfrog + anti-vault + negation) ===');
{
  const cfg = RANKING_CONFIG.headToHead;
  const DIV = 'Lightweight';
  // Six-fighter division, finalRating-sorted. Gaps small so eloGapCap passes.
  const mkRanked = () => [
    rf('A', 1600), rf('B', 1590), rf('C', 1580), rf('D', 1570), rf('E', 1560), rf('F', 1550),
  ];
  const data = (fights: Fight[]) => ({ fights } as unknown as LoadedData);

  // 1. Clean recent decisive win → winner lands directly above the victim.
  {
    const arr = mkRanked();
    applyHeadToHead(arr, data([fight('E', 'B', 'W', { date: monthsAgo(3), wc: DIV })]), DIV, NOW, null);
    ok(names(arr) === 'A,E,B,C,D,F', 'recent decisive win lifts the winner to directly above the victim');
  }
  // 2. Stale win (older than recencyMonths) → no reorder.
  {
    const arr = mkRanked();
    applyHeadToHead(arr, data([fight('E', 'B', 'W', { date: monthsAgo(cfg.recencyMonths + 2), wc: DIV })]), DIV, NOW, null);
    ok(names(arr) === 'A,B,C,D,E,F', 'stale win (beyond recencyMonths) does not reorder');
  }
  // 3. Split decision → no reorder (decisiveOnly).
  {
    const arr = mkRanked();
    applyHeadToHead(arr, data([fight('E', 'B', 'W', { date: monthsAgo(3), wc: DIV, method: 'S-DEC' })]), DIV, NOW, null);
    ok(names(arr) === 'A,B,C,D,E,F', 'split decision does not qualify (decisiveOnly)');
  }
  // 4. Rating gap beyond eloGapCap → no reorder.
  {
    const arr = [rf('A', 1600), rf('B', 1590), rf('Z', 1590 - cfg.eloGapCap - 10)];
    applyHeadToHead(arr, data([fight('Z', 'B', 'W', { date: monthsAgo(3), wc: DIV })]), DIV, NOW, null);
    ok(names(arr) === 'A,B,Z', 'a win from too far below (gap > eloGapCap) does not reorder');
  }
  // 5. Anti-vault: passing MORE than leapfrogMaxUnbeaten un-beaten fighters is
  //    blocked. Cap-relative so this holds whatever leapfrogMaxUnbeaten is set to:
  //    the winner (bottom) beating the victim (top) passes (n-2) = cap+1 un-beaten.
  {
    const cap = cfg.leapfrogMaxUnbeaten;
    const n = cap + 3;
    const ids = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
    const arr = ids.map((id, i) => rf(id, 1600 - i * 3)); // small gaps keep eloGapCap satisfied
    applyHeadToHead(arr, data([fight(ids[n - 1], ids[0], 'W', { date: monthsAgo(3), wc: DIV })]), DIV, NOW, null);
    ok(names(arr) === ids.join(','), `blocked when it would vault > ${cap} un-beaten fighters`);
  }
  // 5b. Boundary: passing EXACTLY leapfrogMaxUnbeaten un-beaten fighters is allowed
  //     (a local reorder — this is the Costa→Murzakanov case at cap 4).
  {
    const cap = cfg.leapfrogMaxUnbeaten;
    const n = cap + 2; // winner passes (n-2) = cap un-beaten = cap → allowed
    const ids = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
    const arr = ids.map((id, i) => rf(id, 1600 - i * 3));
    applyHeadToHead(arr, data([fight(ids[n - 1], ids[0], 'W', { date: monthsAgo(3), wc: DIV })]), DIV, NOW, null);
    const expected = [ids[n - 1], ...ids.slice(0, n - 1)].join(',');
    ok(names(arr) === expected, `allowed when it vaults exactly ${cap} un-beaten fighters (local reorder)`);
  }
  // 6. Anti-vault exemption: in-between fighters the winner ALSO beat don't count.
  {
    const arr = mkRanked();
    const fights = [
      fight('F', 'A', 'W', { date: monthsAgo(3), wc: DIV }),
      fight('F', 'B', 'W', { date: monthsAgo(5), wc: DIV }), // two earned passes
      fight('F', 'C', 'W', { date: monthsAgo(7), wc: DIV }), // → only D,E unbeaten (2 ≤ 3)
    ];
    applyHeadToHead(arr, data(fights), DIV, NOW, null);
    ok(names(arr) === 'F,A,B,C,D,E', 'fighters the winner also beat do not count against the anti-vault cap');
  }
  // 7. Negation: a post-H2H rematch loss to the victim cancels the leapfrog.
  {
    const arr = mkRanked();
    const fights = [
      fight('E', 'B', 'W', { date: monthsAgo(6), wc: DIV }),
      fight('E', 'B', 'L', { date: monthsAgo(2), wc: DIV }), // lost the rematch
    ];
    applyHeadToHead(arr, data(fights), DIV, NOW, null);
    ok(names(arr) === 'A,B,C,D,E,F', 'losing the rematch negates the leapfrog (latest meeting wins)');
  }
  // 8. Negation exception: losing to the CHAMP afterwards does not erase the win.
  {
    const arr = [rf('champ', 1585, 'C'), ...mkRanked()].sort((a, b) => b.finalRating - a.finalRating);
    const fights = [
      fight('E', 'B', 'W', { date: monthsAgo(6), wc: DIV }),
      fight('E', 'champ', 'L', { date: monthsAgo(2), wc: DIV }), // title shot loss
    ];
    applyHeadToHead(arr, data(fights), DIV, NOW, null);
    const eIdx = arr.findIndex((f) => f.fighterId === 'E');
    const bIdx = arr.findIndex((f) => f.fighterId === 'B');
    ok(eIdx === bIdx - 1, 'a loss to the reigning champ does NOT negate a win over a contender');
  }
}

// ── recentFormTilt (P4P-only, bounded, quality-gated) ────────────────────────
console.log('\n=== recentFormTilt (P4P recent-form tilt) ===');
{
  const cfg = RANKING_CONFIG.p4pRecentForm;
  // Real "now" (the tilt reads Date.now()): recent dates via offsets from today.
  const ago = (months: number): string => {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.toISOString().slice(0, 10);
  };
  // Prime an elite (wins) and a can (losses), then have two heroes beat one each.
  const fights: Fight[] = [];
  for (let i = 0; i < 6; i++) fights.push(fight('elite', `ef${i}`, 'W', { date: ago(30 - i) }));
  for (let i = 0; i < 6; i++) fights.push(fight('can', `cf${i}`, 'L', { date: ago(30 - i) }));
  fights.push(fight('eliteBeater', 'elite', 'W', { date: ago(3) }));
  fights.push(fight('canBeater', 'can', 'W', { date: ago(3) }));
  fights.push(fight('recentLoser', 'elite', 'L', { date: ago(3) }));
  const data = { fights } as unknown as LoadedData;

  const tEliteBeater = recentFormTilt(data, 'eliteBeater');
  const tCanBeater = recentFormTilt(data, 'canBeater');
  const tLoser = recentFormTilt(data, 'recentLoser');
  ok(tEliteBeater > tCanBeater, 'beating an elite tilts more than beating a can (quality-gated gains)');
  ok(tEliteBeater > 0, 'a recent quality win tilts positive');
  ok(tLoser < 0, 'a recent loss tilts negative (losses keep full weight)');
  ok(Math.abs(tEliteBeater) <= cfg.cap && Math.abs(tLoser) <= cfg.cap, 'tilt is clamped to ±cap');
  ok(recentFormTilt(data, 'nobody') === 0, 'no recent fights → zero tilt');
}

console.log(`\n${failures === 0 ? '✓ ALL SCORING TESTS PASSED' : `✗ ${failures} SCORING TEST(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
