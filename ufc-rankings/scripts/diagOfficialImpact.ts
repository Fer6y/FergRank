// ─────────────────────────────────────────────────────────────────────────
//  diagOfficialImpact.ts — how much is the OFFICIAL UFC RANK propping up
//  fighters in our rankings?
//
//  For every division:
//    1. Runs the real engine (official seed + floors live, via Octagon).
//    2. Rebuilds the order with the officialBonus stripped from finalRating
//       (same pool, same tiebreak) — isolating the SEED's effect on order.
//    3. Captures post-sort corrections (floors / champ tiebreak) from the
//       engine's own logs — the FLOORS' effect.
//    4. Flags seeded fighters who look STALE: long layoff or loss streak —
//       the cases where an out-of-date official rank is doing the propping.
//
//  Run: node_modules/.bin/jiti scripts/diagOfficialImpact.ts   (needs network)
// ─────────────────────────────────────────────────────────────────────────

import { loadAllData } from '../src/lib/loadData';
import { generateDivisionRankings } from '../src/lib/scoringEngine';
import { RANKING_CONFIG } from '../src/lib/rankingConfig';
import type { RankedFighter } from '../src/lib/types';
import type { LoadedData } from '../src/lib/loadData';

const DIVISIONS = [
  'Heavyweight', 'Light Heavyweight', 'Middleweight', 'Welterweight',
  'Lightweight', 'Featherweight', 'Bantamweight', 'Flyweight',
  "Women's Strawweight", "Women's Flyweight", "Women's Bantamweight",
];

function lossStreak(fighterId: string, data: LoadedData): number {
  const fights = (data.fighterFights.get(fighterId) || [])
    .filter((f) => f.eventDate)
    .sort((a, b) => b.eventDate!.getTime() - a.eventDate!.getTime());
  let streak = 0;
  for (const f of fights) {
    const result = f.fighterId1 === fighterId ? f.result1 : f.result2;
    if (result === 'L') streak++;
    else break;
  }
  return streak;
}

async function main() {
  // Capture the engine's own post-sort correction logs.
  const corrections: string[] = [];
  const realLog = console.log;
  console.log = (...args: unknown[]) => {
    const line = args.join(' ');
    if (/FLOOR APPLIED|FLOOR SUPPRESSED|CHAMP TIEBREAK|H2H LEAPFROG/.test(line)) {
      corrections.push(line.replace('[scoringEngine] ', ''));
    }
  };

  const data = loadAllData();
  const results = new Map<string, RankedFighter[]>();
  for (const div of DIVISIONS) {
    const r = await generateDivisionRankings(div, data);
    results.set(div, r.fighters);
  }
  console.log = realLog;

  let totalSeeded = 0;
  let totalMoved = 0;
  let totalSpotsGained = 0;
  const propped: string[] = [];
  const stale: string[] = [];
  const gapStats: number[] = [];

  console.log('════════════════════════════════════════════════════════════════════');
  console.log(' OFFICIAL-RANK IMPACT DIAGNOSTIC');
  console.log('════════════════════════════════════════════════════════════════════');

  for (const div of DIVISIONS) {
    const fighters = results.get(div)!;

    // Pre-correction rating order (what the sort in step 4 produced) vs the
    // same pool with the seed stripped. Both sorted identically so the diff
    // isolates officialBonus.
    const withSeed = [...fighters].sort(
      (a, b) => (b.finalRating - a.finalRating) || (b.sosElo - a.sosElo));
    const noSeed = [...fighters].sort(
      (a, b) => ((b.finalRating - b.officialBonus) - (a.finalRating - a.officialBonus)) || (b.sosElo - a.sosElo));
    const noSeedIdx = new Map(noSeed.map((f, i) => [f.fighterId, i]));

    // Adjacent finalRating gaps in the top 25 — context for seed magnitude.
    for (let i = 1; i < Math.min(withSeed.length, 25); i++) {
      gapStats.push(withSeed[i - 1].finalRating - withSeed[i].finalRating);
    }

    const rows: string[] = [];
    for (let i = 0; i < withSeed.length; i++) {
      const f = withSeed[i];
      if (f.officialBonus <= 0) continue;
      totalSeeded++;
      const pure = noSeedIdx.get(f.fighterId)!;
      const delta = pure - i; // spots the seed lifted them (within this pool)
      if (delta !== 0) totalMoved++;
      if (delta > 0) totalSpotsGained += delta;

      const streak = lossStreak(f.fighterId, data);
      const months = f.monthsSinceLastFight;
      const staleFlag = months > 18 || streak >= 2;
      if (staleFlag) {
        stale.push(
          `${div.padEnd(20)} ${f.fullName.padEnd(26)} UFC#${(f.officialRank ?? '?').padEnd(3)} ` +
          `+${f.officialBonus.toFixed(0).padStart(3)} Elo  layoff ${months.toFixed(0).padStart(3)}mo  ` +
          `Lstreak ${streak}  seed lifts ${delta > 0 ? '+' + delta : delta} spots`);
      }
      if (delta >= 3) {
        propped.push(
          `${div.padEnd(20)} ${f.fullName.padEnd(26)} UFC#${(f.officialRank ?? '?').padEnd(3)} ` +
          `+${f.officialBonus.toFixed(0).padStart(3)} Elo  #${pure + 1} → #${i + 1} (+${delta})`);
      }
      if (delta !== 0 || staleFlag) {
        rows.push(
          `  ${String(i + 1).padStart(2)}. ${f.fullName.padEnd(26)} UFC#${(f.officialRank ?? '?').padEnd(3)} ` +
          `elo ${f.eloRating.toFixed(0)}  seed +${f.officialBonus.toFixed(1).padStart(5)}  ` +
          `pure-rank #${String(pure + 1).padStart(2)}  Δ${delta > 0 ? '+' + delta : delta}` +
          (staleFlag ? `  ⚠ layoff ${months.toFixed(0)}mo / Lstreak ${streak}` : ''));
      }
    }
    if (rows.length) {
      console.log(`\n── ${div} ${'─'.repeat(Math.max(1, 46 - div.length))}`);
      console.log(rows.join('\n'));
    }
  }

  gapStats.sort((a, b) => a - b);
  const median = gapStats[Math.floor(gapStats.length / 2)];
  const p75 = gapStats[Math.floor(gapStats.length * 0.75)];

  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log(' SUMMARY');
  console.log('════════════════════════════════════════════════════════════════════');
  console.log(`Seeded fighters in top-40 pools:       ${totalSeeded}`);
  console.log(`  order changed by the seed:           ${totalMoved}`);
  console.log(`  total spots gained via seed:         ${totalSpotsGained}`);
  console.log(`Adjacent top-25 finalRating gap:       median ${median.toFixed(1)} Elo, p75 ${p75.toFixed(1)} Elo`);
  const scale = RANKING_CONFIG.officialBonusScaleElo;
  const seedAt = (r: string) => (RANKING_CONFIG.officialRankScores[r] * scale).toFixed(1);
  console.log(
    `  → seed magnitudes for context:       champ +${seedAt('C')}, #1 +${seedAt('1')}, ` +
    `#2-3 +${seedAt('2')}, #4-6 +${seedAt('4')}, #7-10 +${seedAt('7')}, #11-15 +${seedAt('11')}`);

  console.log(`\nPROPPED ≥3 spots by the seed (${propped.length}):`);
  console.log(propped.length ? propped.join('\n') : '  none');

  console.log(`\nSTALE seeds — layoff >18mo or 2+ loss streak (${stale.length}):`);
  console.log(stale.length ? stale.join('\n') : '  none');

  console.log(`\nPOST-SORT CORRECTIONS fired (${corrections.length}):`);
  console.log(corrections.length ? corrections.map((c) => '  ' + c).join('\n') : '  none');
}

main().catch(console.error);
