// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/coverage.ts — make the missing data visible.
//
//  ~3% of odds rows don't join, and the gap isn't random (newer fighters, name
//  quirks, fighters absent from our CSV). Any metric computed on the matched
//  set inherits that bias. This reports match rate by year and matched volume
//  by division so you can see where the sample is thin before trusting a number.
//
//  Run:  node_modules/.bin/jiti research/backtest/coverage.ts
// ─────────────────────────────────────────────────────────────────────────

import { loadAllData, type LoadedData } from '../../src/lib/loadData';
import { loadClosingOdds } from '../loadOdds';
import { joinOddsToPredictions } from './pointInTime';

export interface EraCoverage {
  year: number;
  total: number;   // odds rows for that year
  matched: number; // joined to an Elo bout with a decided outcome
}

export interface CoverageReport {
  totalOdds: number;
  matched: number;
  byEra: EraCoverage[];
  byDivision: { division: string; matched: number }[];
}

export function computeCoverage(data?: LoadedData): CoverageReport {
  const d = data ?? loadAllData();
  const odds = loadClosingOdds();
  const { samples } = joinOddsToPredictions(d);

  const totalByYear = new Map<number, number>();
  for (const o of odds) {
    const y = new Date(o.date).getFullYear();
    if (!Number.isNaN(y)) totalByYear.set(y, (totalByYear.get(y) ?? 0) + 1);
  }
  const matchedByYear = new Map<number, number>();
  const matchedByDiv = new Map<string, number>();
  for (const s of samples) {
    matchedByYear.set(s.era, (matchedByYear.get(s.era) ?? 0) + 1);
    matchedByDiv.set(s.division, (matchedByDiv.get(s.division) ?? 0) + 1);
  }

  const byEra: EraCoverage[] = [...totalByYear.keys()]
    .sort((a, b) => a - b)
    .map((year) => ({ year, total: totalByYear.get(year)!, matched: matchedByYear.get(year) ?? 0 }));

  const byDivision = [...matchedByDiv.entries()]
    .map(([division, matched]) => ({ division, matched }))
    .sort((a, b) => b.matched - a.matched);

  return { totalOdds: odds.length, matched: samples.length, byEra, byDivision };
}

export function printCoverage(rep: CoverageReport): void {
  console.log('───────────────────────────────────────────────────────────────');
  console.log('  COVERAGE — match rate by year (watch for thin/biased years)');
  console.log('───────────────────────────────────────────────────────────────');
  for (const e of rep.byEra) {
    const rate = e.total ? (e.matched / e.total) * 100 : 0;
    const bar = '█'.repeat(Math.round(rate / 5));
    console.log(
      `   ${e.year}  ${String(e.matched).padStart(4)}/${String(e.total).padEnd(4)} ` +
        `${rate.toFixed(0).padStart(3)}%  ${bar}`
    );
  }
  console.log('───────────────────────────────────────────────────────────────');
  console.log('  matched bouts by division');
  console.log('───────────────────────────────────────────────────────────────');
  for (const d of rep.byDivision) {
    console.log(`   ${d.division.padEnd(22)} ${String(d.matched).padStart(4)}`);
  }
}

// Standalone entry.
if (process.argv[1] && process.argv[1].endsWith('coverage.ts')) {
  printCoverage(computeCoverage());
}
