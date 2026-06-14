// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/errorAnalysis.ts — where was the model MOST WRONG, and why?
//
//  Surfaces the fights the model was most confident about and got wrong (high
//  model prob on the fighter who LOST), with context: each fighter's UFC fight
//  count, layoff, recent form, weight-move. Splits out MODEL-SPECIFIC failures
//  (market got it right, model didn't) from shared upsets, and tallies the
//  recurring patterns so blind spots are visible.
//
//  Run:  node_modules/.bin/jiti research/backtest/errorAnalysis.ts
// ─────────────────────────────────────────────────────────────────────────

import { loadAllData, type LoadedData } from '../../src/lib/loadData';
import { joinOddsToPredictions } from './pointInTime';
import { devig } from './devig';

const d: LoadedData = loadAllData();
const { samples } = joinOddsToPredictions(d);
const pct = (x: number) => `${Math.round(x * 100)}%`;

// Last n results for a fighter strictly before a date (newest→oldest).
function recentForm(fid: string, before: number, n = 5): string {
  const fs = (d.fighterFights.get(fid) ?? [])
    .filter((f) => f.eventDate && f.eventDate.getTime() < before)
    .sort((a, b) => b.eventDate!.getTime() - a.eventDate!.getTime())
    .slice(0, n);
  return fs.map((f) => (f.fighterId1 === fid ? f.result1 : f.result2)).join('') || '—';
}

const rows = samples.map((s) => {
  const mFav = devig(s.favOdds, s.dogOdds, 'power').pFav;
  const wf = s.favWon; // did the favourite (winner of lower odds) win?
  const before = new Date(s.date).getTime();
  return {
    date: s.date,
    division: s.division,
    winner: wf ? s.favName : s.dogName,
    loser: wf ? s.dogName : s.favName,
    winnerId: wf ? s.favId : s.dogId,
    loserId: wf ? s.dogId : s.favId,
    modelForWinner: wf ? s.eloProbFav : 1 - s.eloProbFav,
    marketForWinner: wf ? mFav : 1 - mFav,
    winnerFightNo: (wf ? s.favFightNo : s.dogFightNo) + 1,
    loserFightNo: (wf ? s.dogFightNo : s.favFightNo) + 1,
    winnerProv: wf ? s.favProvisional : s.dogProvisional,
    loserLayoff: wf ? s.dogLayoffMonths : s.favLayoffMonths,
    weightMove: s.favWeightMove || s.dogWeightMove,
    winnerForm: recentForm(wf ? s.favId : s.dogId, before),
    loserForm: recentForm(wf ? s.dogId : s.favId, before),
    bothEst: s.bothEstablished,
  };
});

const sorted = [...rows].sort((a, b) => a.modelForWinner - b.modelForWinner);

// ── MODEL-SPECIFIC failures: market was right (≥55% on winner), model very wrong ──
const modelSpecific = sorted.filter((r) => r.marketForWinner >= 0.55 && r.modelForWinner < 0.4);
console.log('═══════════════════════════════════════════════════════════════');
console.log('  MODEL-SPECIFIC MISSES — market saw it, model didn\'t');
console.log(`  (model gave winner <40%, market gave winner ≥55%) — ${modelSpecific.length} of ${rows.length}`);
console.log('═══════════════════════════════════════════════════════════════');
for (const r of modelSpecific.slice(0, 22)) {
  console.log(
    `  ${r.date}  ${r.winner} bt ${r.loser}  [${r.division.slice(0, 14)}]\n` +
    `     model gave winner ${pct(r.modelForWinner)} (market ${pct(r.marketForWinner)})  |  ` +
    `winner: fight#${r.winnerFightNo} form ${r.winnerForm}${r.winnerProv ? ' PROV' : ''}  |  ` +
    `loser: fight#${r.loserFightNo} form ${r.loserForm} layoff ${r.loserLayoff.toFixed(0)}mo${r.weightMove ? '  WTMOVE' : ''}`
  );
}

// ── pattern tally over the worst 150 misses (model most confident in the loser) ──
const worst = sorted.slice(0, 150);
const has = (s: string, ch: string) => s.startsWith(ch);
const tally = {
  winnerNewcomer: worst.filter((r) => r.winnerFightNo <= 4).length,
  winnerProvisional: worst.filter((r) => r.winnerProv).length,
  loserLongLayoff: worst.filter((r) => r.loserLayoff >= 12).length,
  weightMove: worst.filter((r) => r.weightMove).length,
  marketAlsoWrong: worst.filter((r) => r.marketForWinner < 0.5).length,
  winnerOnStreak: worst.filter((r) => has(r.winnerForm, 'WW')).length, // ≥2 wins entering
  loserOffLoss: worst.filter((r) => r.loserForm.includes('L')).length, // had a recent loss
  bothEstablished: worst.filter((r) => r.bothEst).length,
};
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  PATTERN TALLY over the 150 worst misses');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  winner was a newcomer (≤4 UFC fights) : ${tally.winnerNewcomer}  (${pct(tally.winnerNewcomer / 150)})`);
console.log(`    └ still provisional at fight time   : ${tally.winnerProvisional}`);
console.log(`  winner entered on a 2+ win streak     : ${tally.winnerOnStreak}  (${pct(tally.winnerOnStreak / 150)})`);
console.log(`  loser on a 12+ month layoff           : ${tally.loserLongLayoff}  (${pct(tally.loserLongLayoff / 150)})`);
console.log(`  loser had a recent loss on the record : ${tally.loserOffLoss}  (${pct(tally.loserOffLoss / 150)})`);
console.log(`  a weight-class move was involved      : ${tally.weightMove}  (${pct(tally.weightMove / 150)})`);
console.log(`  MARKET was also wrong (shared upset)  : ${tally.marketAlsoWrong}  (${pct(tally.marketAlsoWrong / 150)})`);
console.log(`  both fighters established (clean)      : ${tally.bothEstablished}  (${pct(tally.bothEstablished / 150)})`);
