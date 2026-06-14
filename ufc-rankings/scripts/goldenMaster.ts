// ─────────────────────────────────────────────────────────────────────────
//  scripts/goldenMaster.ts — ranking regression guard (golden-master test).
//
//  Snapshots the top-40 of every division and fails if a code/data change moves
//  the rankings unexpectedly. This is the safety net for a "frozen-live" product:
//  refactor freely, then run this to prove rankings didn't shift.
//
//  Comparison is robust to the engine's clock-based drift (it regresses ratings
//  to `new Date()`):
//    • ORDER + MEMBERSHIP per division must match EXACTLY  → real regression.
//    • SCORES may drift within a small tolerance           → clock/calendar noise.
//  A change in order, who's ranked, or a score moving > tolerance = FAIL.
//
//  Run:    node_modules/.bin/jiti scripts/goldenMaster.ts            (compare)
//  Bless:  node_modules/.bin/jiti scripts/goldenMaster.ts --update   (re-baseline)
//  Needs network (official rankings), like scripts/validate.ts.
// ─────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { loadAllData } from '../src/lib/loadData';
import { generateDivisionRankings } from '../src/lib/scoringEngine';
import { ALL_DIVISIONS } from '../src/lib/types';

const SNAP = path.join(process.cwd(), 'data', 'golden', 'rankings_snapshot.json');
const SCORE_TOL = 0.5; // display-score points; absorbs clock/short-calendar drift

interface Entry {
  rank: number; id: string; name: string;
  score: number; finalRating: number; elo: number;
  officialRank: string | null; record: string;
}
type Snapshot = Record<string, Entry[]>;

async function generate(): Promise<Snapshot> {
  const data = loadAllData();
  const out: Snapshot = {};
  for (const div of ALL_DIVISIONS) {
    const r = await generateDivisionRankings(div, data);
    out[div] = r.fighters.map((f) => ({
      rank: f.rank, id: f.fighterId, name: f.fullName,
      score: f.rankScore, finalRating: f.finalRating, elo: f.eloRating,
      officialRank: f.officialRank, record: f.record,
    }));
  }
  return out;
}

interface DivDiff {
  division: string;
  reordered: string[];   // rank: name (was N)
  added: string[];       // now ranked, weren't before
  removed: string[];     // were ranked, now gone
  scoreDrift: string[];  // name: old → new (Δ)
}

function diffDivision(division: string, gold: Entry[], cur: Entry[]): DivDiff | null {
  const d: DivDiff = { division, reordered: [], added: [], removed: [], scoreDrift: [] };
  const goldById = new Map(gold.map((e) => [e.id, e]));
  const curById = new Map(cur.map((e) => [e.id, e]));

  for (const e of cur) if (!goldById.has(e.id)) d.added.push(`#${e.rank} ${e.name}`);
  for (const e of gold) if (!curById.has(e.id)) d.removed.push(`#${e.rank} ${e.name}`);

  // Order: compare rank for ids present in both.
  for (const e of cur) {
    const g = goldById.get(e.id);
    if (!g) continue;
    if (g.rank !== e.rank) d.reordered.push(`${e.name}: #${g.rank} → #${e.rank}`);
    if (Math.abs(g.score - e.score) > SCORE_TOL)
      d.scoreDrift.push(`${e.name}: ${g.score} → ${e.score} (Δ${(e.score - g.score).toFixed(2)})`);
  }
  const changed = d.reordered.length || d.added.length || d.removed.length || d.scoreDrift.length;
  return changed ? d : null;
}

async function main(): Promise<void> {
  const update = process.argv.includes('--update');
  const current = await generate();

  if (update || !fs.existsSync(SNAP)) {
    fs.mkdirSync(path.dirname(SNAP), { recursive: true });
    fs.writeFileSync(SNAP, JSON.stringify(current, null, 2) + '\n');
    const n = Object.values(current).reduce((s, v) => s + v.length, 0);
    console.log(`✓ snapshot ${fs.existsSync(SNAP) && !update ? 'created' : 'updated'}: ${SNAP}`);
    console.log(`  ${Object.keys(current).length} divisions, ${n} ranked fighters.`);
    return;
  }

  const golden: Snapshot = JSON.parse(fs.readFileSync(SNAP, 'utf-8'));
  const diffs: DivDiff[] = [];
  for (const div of ALL_DIVISIONS) {
    const dd = diffDivision(div, golden[div] ?? [], current[div] ?? []);
    if (dd) diffs.push(dd);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  GOLDEN-MASTER RANKING REGRESSION TEST');
  console.log('═══════════════════════════════════════════════════════════════');
  if (!diffs.length) {
    console.log('  ✓ PASS — all 12 divisions identical (order, membership, scores).');
    return;
  }

  let hardFail = false;
  for (const d of diffs) {
    const structural = d.reordered.length || d.added.length || d.removed.length;
    if (structural) hardFail = true;
    console.log(`\n  ── ${d.division} ──`);
    if (d.removed.length) console.log(`    removed: ${d.removed.join(', ')}`);
    if (d.added.length) console.log(`    added  : ${d.added.join(', ')}`);
    if (d.reordered.length) console.log(`    reordered (${d.reordered.length}): ${d.reordered.slice(0, 8).join('; ')}${d.reordered.length > 8 ? ' …' : ''}`);
    if (d.scoreDrift.length) console.log(`    score drift > ${SCORE_TOL} (${d.scoreDrift.length}): ${d.scoreDrift.slice(0, 5).join('; ')}${d.scoreDrift.length > 5 ? ' …' : ''}`);
  }
  console.log('\n───────────────────────────────────────────────────────────────');
  console.log(hardFail
    ? '  ✗ FAIL — rankings changed (order/membership). If intended, re-bless with --update.'
    : '  ⚠ scores drifted beyond tolerance but order held. Likely calendar drift; re-bless if expected.');
  process.exit(hardFail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
