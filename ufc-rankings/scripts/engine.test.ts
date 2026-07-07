// Unit tests for the Elo core + display helpers (eloEngine.ts).
//
// The golden master guards the ranking OUTPUT (order/membership/scores); this
// guards the ENGINE INVARIANTS underneath it — the properties docs/ALGORITHM.md promises
// (winner gains, opponent-quality gate, finish weighting, provisional K, move
// charged once, symmetric win-prob). Those can regress while the top-40 order
// happens to stay put, so they need their own assertions. Config is referenced
// (never hardcoded) so a legitimate tuning change doesn't fail these.
//
// Run: npx tsx scripts/engine.test.ts   (or node_modules/.bin/jiti scripts/engine.test.ts)
import {
  buildEloWithTraces,
  normalizeWeightClassForMove,
  winProbability,
  winProbabilityShaded,
  winProbConfidence,
  eloToDisplayScore,
  type FightTrace,
} from '../src/lib/eloEngine';
import { RANKING_CONFIG } from '../src/lib/rankingConfig';
import type { Fight } from '../src/lib/types';
import type { LoadedData } from '../src/lib/loadData';

const E = RANKING_CONFIG.elo;
const INIT = E.initialRating;

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); failures++; }
};
const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

// ── Synthetic-fight helpers ─────────────────────────────────────────────────
// The Elo sweep only reads data.fights, so a minimal LoadedData is enough.
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

function sweep(fights: Fight[]) {
  const data = { fights } as unknown as LoadedData;
  return buildEloWithTraces(data);
}
// The trace for a fighter's Nth fight (0-indexed), chronological.
function nth(history: Map<string, FightTrace[]>, id: string, n: number): FightTrace {
  const arr = (history.get(id) ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return arr[n];
}
// Give an opponent a track record so their rating diverges from the mean before
// the fight under test: `wins` clean wins (rating up) or losses (rating down)
// against disposable filler fighters, spaced within the inactivity grace window.
function priming(id: string, kind: 'up' | 'down', count: number, startMonth: number): Fight[] {
  const out: Fight[] = [];
  for (let i = 0; i < count; i++) {
    const m = String(startMonth + i).padStart(2, '0');
    out.push(fight(id, `filler_${id}_${i}`, kind === 'up' ? 'W' : 'L', { date: `2020-${m}-01` }));
  }
  return out;
}

// ── normalizeWeightClassForMove (pure) ──────────────────────────────────────
console.log('\n=== normalizeWeightClassForMove ===');
ok(normalizeWeightClassForMove('Interim Lightweight') === 'Lightweight', 'interim qualifier stripped');
ok(normalizeWeightClassForMove('Lightweight') === 'Lightweight', 'plain division passes through');
ok(normalizeWeightClassForMove('Catchweight') === null, 'catchweight → null (no bogus move)');
ok(normalizeWeightClassForMove('Open Weight') === null, 'open weight → null');
ok(normalizeWeightClassForMove('') === null, 'blank → null');

// ── winProbability: symmetric, centred, monotonic ───────────────────────────
console.log('\n=== winProbability ===');
ok(approx(winProbability(1600, 1600), 0.5), 'equal ratings → 0.5');
ok(approx(winProbability(1600, 1500) + winProbability(1500, 1600), 1), 'symmetric: p(a,b)+p(b,a)=1');
ok(winProbability(1600, 1500) > 0.5, 'higher rating favoured');
ok(winProbability(1700, 1500) > winProbability(1600, 1500), 'monotonic in rating gap');

// ── winProbConfidence + shading ─────────────────────────────────────────────
console.log('\n=== winProbConfidence / winProbabilityShaded ===');
ok(approx(winProbConfidence(20, 20), 1), 'two established fighters → full confidence');
ok(winProbConfidence(1, 1) >= E.winProbShadeFloor - 1e-9, 'thin sample floored, not zero');
ok(winProbConfidence(1, 20) < 1, 'confidence driven by the THINNER corner');
{
  const raw = winProbability(1650, 1500);
  const shaded = winProbabilityShaded(1650, 1500, 1, 1);
  ok(Math.abs(shaded - 0.5) < Math.abs(raw - 0.5), 'thin samples pull the edge toward 0.5');
  ok(approx(winProbabilityShaded(1650, 1500, 3, 5) + winProbabilityShaded(1500, 1650, 5, 3), 1), 'shaded prob stays symmetric');
}

// ── eloToDisplayScore: monotonic + clamped ──────────────────────────────────
console.log('\n=== eloToDisplayScore ===');
{
  const lo = eloToDisplayScore(1000);
  const mid = eloToDisplayScore(1550);
  const hi = eloToDisplayScore(1900);
  ok(lo <= mid && mid <= hi, 'monotonic non-decreasing across the range');
  ok(eloToDisplayScore(500) === eloToDisplayScore(400), 'clamps below the curve floor');
  ok(eloToDisplayScore(3000) === eloToDisplayScore(2500), 'clamps above the curve ceiling');
}

// ── Sweep invariant: winner gains, loser loses ──────────────────────────────
console.log('\n=== sweep: winner gains / loser loses ===');
{
  const { history } = sweep([fight('A', 'B', 'W')]);
  const ta = nth(history, 'A', 0);
  const tb = nth(history, 'B', 0);
  ok(ta.delta > 0 && ta.ratingAfter > INIT, 'winner A gains (delta>0, rating above mean)');
  ok(tb.delta < 0 && tb.ratingAfter < INIT, 'loser B loses (delta<0, rating below mean)');
}

// ── Sweep invariant: a draw between equals barely moves ratings ──────────────
console.log('\n=== sweep: draw between equals ≈ no change ===');
{
  const { history } = sweep([fight('A', 'B', 'D')]);
  ok(approx(nth(history, 'A', 0).delta, 0, 1e-9), 'equal-rating draw → ~0 delta for A');
  ok(approx(nth(history, 'B', 0).delta, 0, 1e-9), 'equal-rating draw → ~0 delta for B');
}

// ── Sweep invariant: beating a STRONG opponent gains more than a weak one ────
// (win-quality gate + expected-score both reward beating higher-rated opponents)
console.log('\n=== sweep: opponent quality gates the gain ===');
{
  // Establish the hero first (non-provisional) so the gate — not the provisional
  // boost — is what's under test. Then, in two separate sweeps, have the hero beat
  // a primed-strong vs a primed-weak opponent on the same date.
  const base = [
    fight('H', 'hx1', 'W', { date: '2021-01-01' }),
    fight('H', 'hx2', 'W', { date: '2021-02-01' }),
    fight('H', 'hx3', 'W', { date: '2021-03-01' }),
    fight('H', 'hx4', 'W', { date: '2021-04-01' }),
    fight('H', 'hx5', 'W', { date: '2021-05-01' }),
  ];
  const vsStrong = sweep([
    ...priming('S', 'up', 6, 1),   // S climbs well above the mean
    ...base,
    fight('H', 'S', 'W', { date: '2022-01-01' }),
  ]);
  const vsWeak = sweep([
    ...priming('Wk', 'down', 6, 1), // Wk sinks well below the mean
    ...base,
    fight('H', 'Wk', 'W', { date: '2022-01-01' }),
  ]);
  const gainStrong = nth(vsStrong.history, 'H', 5).delta;
  const gainWeak = nth(vsWeak.history, 'H', 5).delta;
  ok(gainStrong > gainWeak, `beating strong (+${gainStrong.toFixed(1)}) > beating weak (+${gainWeak.toFixed(1)})`);
  ok(gainWeak >= 0, 'beating a weak opponent still never loses points');
}

// ── Sweep invariant: a finish moves ratings more than a decision ─────────────
console.log('\n=== sweep: finish weighting (KO > S-DEC) ===');
{
  // Both fighters established (5 prior fights) so the provisional-finish damp
  // isn't in play — pure finish multiplier.
  const prior = (id: string) => [
    fight(id, `${id}p1`, 'W', { date: '2021-01-01' }),
    fight(id, `${id}p2`, 'L', { date: '2021-02-01' }),
    fight(id, `${id}p3`, 'W', { date: '2021-03-01' }),
    fight(id, `${id}p4`, 'L', { date: '2021-04-01' }),
    fight(id, `${id}p5`, 'W', { date: '2021-05-01' }),
  ];
  const ko = sweep([...prior('A'), ...prior('B'), fight('A', 'B', 'W', { method: 'KO/TKO', date: '2022-01-01' })]);
  const dec = sweep([...prior('A'), ...prior('B'), fight('A', 'B', 'W', { method: 'S-DEC', date: '2022-01-01' })]);
  const koGain = nth(ko.history, 'A', 5).delta;
  const decGain = nth(dec.history, 'A', 5).delta;
  ok(koGain > decGain, `KO gain (+${koGain.toFixed(1)}) > split-decision gain (+${decGain.toFixed(1)})`);
}

// ── Sweep invariant: provisional newcomers move faster than established ──────
console.log('\n=== sweep: provisional K accelerates newcomers ===');
{
  // New fighter's FIRST fight vs an established fighter's equivalent win over the
  // same-rated opponent. Provisional K (×provisionalKMultiplier) → bigger swing.
  const newcomer = sweep([fight('N', 'Opp', 'W', { date: '2022-01-01' })]);
  const establishedGain = (() => {
    const s = sweep([
      fight('Est', 'e1', 'W', { date: '2021-01-01' }),
      fight('Est', 'e2', 'L', { date: '2021-02-01' }),
      fight('Est', 'e3', 'W', { date: '2021-03-01' }),
      fight('Est', 'e4', 'L', { date: '2021-04-01' }),
      fight('Est', 'e5', 'W', { date: '2021-05-01' }),
      fight('Est', 'Opp2', 'W', { date: '2022-01-01' }),
    ]);
    return nth(s.history, 'Est', 5).delta;
  })();
  const newGain = nth(newcomer.history, 'N', 0).delta;
  ok(newGain > establishedGain, `provisional win (+${newGain.toFixed(1)}) > established win (+${establishedGain.toFixed(1)}) vs a mean opponent`);
}

// ── Sweep invariant: the weight-move tax is charged ONCE per division ────────
console.log('\n=== sweep: weight-class move charged once ===');
{
  // Spaced within the inactivity grace window so NO inactivity regression muddies
  // the move-penalty check. Fighter: Lightweight → Welterweight (first entry, pays
  // tax) → Lightweight (return to a proven weight, free).
  const { history } = sweep([
    fight('M', 'm1', 'W', { wc: 'Lightweight', date: '2024-01-01' }),
    fight('M', 'm2', 'W', { wc: 'Welterweight', date: '2024-02-01' }),
    fight('M', 'm3', 'W', { wc: 'Lightweight', date: '2024-03-01' }),
  ]);
  const f1 = nth(history, 'M', 0);
  const f2 = nth(history, 'M', 1);
  const f3 = nth(history, 'M', 2);
  // First entry into Welterweight: carried-in rating regressed toward the mean.
  const expectedMoved = INIT + (f1.ratingAfter - INIT) * (1 - E.moveDecayPenalty);
  ok(approx(f2.ratingBefore, expectedMoved, 1e-6), 'first entry to a new division pays the move-decay tax');
  ok(f2.ratingBefore < f1.ratingAfter, 'the tax pulled the rating toward the mean');
  // Return to Lightweight (already seen) within grace: no tax, no inactivity → exact carry.
  ok(approx(f3.ratingBefore, f2.ratingAfter, 1e-6), 'returning to a proven division is free (exact carry-in)');
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${failures === 0 ? '✓ ALL ENGINE TESTS PASSED' : `✗ ${failures} ENGINE TEST(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
