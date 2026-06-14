// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/proposeConfig.ts — turn a search winner into a reviewable
//  proposal. NEVER edits rankingConfig.ts (frozen-live decision); it prints the
//  recommended values + a before/after RAW-ELO ranking diff per division.
//
//  Why raw Elo: these params change the Elo core only. The metrics/SoS/official
//  bounded layers in scoringEngine sit on top unchanged, so the raw-Elo rank
//  movement is the faithful preview of impact. Adopting a proposal is a manual,
//  reviewed edit of rankingConfig.ts.
// ─────────────────────────────────────────────────────────────────────────

import { RANKING_CONFIG } from '../../src/lib/rankingConfig';
import { buildEloWithTraces } from '../../src/lib/eloEngine';
import type { LoadedData } from '../../src/lib/loadData';
import type { EloMap } from '../../src/lib/eloEngine';
import { paramsToEngine, type SearchParams, type SearchResult } from './paramSearch';

const BASE = RANKING_CONFIG.elo;

interface RankedRow { id: string; name: string; rating: number }

function rankDivision(ratings: EloMap, data: LoadedData, division: string, depth: number): RankedRow[] {
  const minF = RANKING_CONFIG.minUFCFights;
  return data.fighters
    .filter(
      (f) =>
        f.weightClass === division &&
        (data.fighterFights.get(f.fighterId)?.length ?? 0) >= minF
    )
    .map((f) => ({ id: f.fighterId, name: f.fullName, rating: ratings.get(f.fighterId)?.rating ?? BASE.initialRating }))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, depth);
}

function diffLine(key: string, cur: number, prop: number): string {
  if (cur === prop) return '';
  return `   ${key.padEnd(28)} ${String(cur).padStart(6)}  →  ${String(prop).padStart(6)}\n`;
}

export function printProposal(
  data: LoadedData,
  result: SearchResult,
  divisions: string[] = ['Lightweight', 'Welterweight', 'Bantamweight'],
  depth = 15
): void {
  const { best, baseline, bestScore, baselineScore } = result;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PROPOSED CONFIG (review only — rankingConfig.ts is NOT edited)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(
    `  OOS calibrated log-loss: ${baselineScore.toFixed(4)} (current) → ` +
      `${bestScore.toFixed(4)} (proposed)   Δ ${(bestScore - baselineScore).toFixed(4)}`
  );
  const improved = bestScore < baselineScore - 1e-4;
  console.log(improved ? '  → proposed params predict held-out fights better.' : '  → no material improvement; keep current config.');

  let diff = '';
  for (const k of Object.keys(best) as (keyof SearchParams)[]) {
    diff += diffLine(k, baseline[k], best[k]);
  }
  console.log('\n  Config changes (rankingConfig.elo / finishMultipliers):');
  console.log(diff.trimEnd() || '   (none — search kept the current values)');
  if (best.finishSpread !== baseline.finishSpread) {
    console.log('   note: finishSpread scales each finishMultiplier deviation from 1.0.');
  }

  if (!improved) return; // no point showing a ranking diff for a non-change

  const curRatings = buildEloWithTraces(data, paramsToEngine(baseline)).ratings;
  const propRatings = buildEloWithTraces(data, paramsToEngine(best)).ratings;

  for (const division of divisions) {
    const cur = rankDivision(curRatings, data, division, 100);
    const prop = rankDivision(propRatings, data, division, depth);
    const curRank = new Map(cur.map((r, i) => [r.id, i + 1]));
    console.log(`\n  ${division} — raw-Elo top ${depth} (proposed), vs current rank:`);
    for (let i = 0; i < prop.length; i++) {
      const r = prop[i];
      const was = curRank.get(r.id);
      const move = was == null ? '  (new)' : was === i + 1 ? '   —' : `  ${was}→${i + 1} (${was - (i + 1) > 0 ? '+' : ''}${was - (i + 1)})`;
      console.log(`   #${String(i + 1).padStart(2)}  ${r.name.padEnd(24)} ${r.rating.toFixed(0).padStart(5)}${move}`);
    }
  }
}
