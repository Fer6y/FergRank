// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/disagreementSlice.ts — "when the model disagrees with the
//  close, who is right?" — the decision-relevant test for value betting.
//
//  Buckets every odds-matched decisive bout by the model's disagreement with
//  the de-vigged close ON THE MARKET FAVOURITE, then reports what actually
//  happened and what flat-betting the model's preferred side would have
//  returned AT CLOSING PRICES.
//
//  Motivation: the 2026-08-18 market-gap audit found the model under-states the
//  favourite in nearly every slice, and that where it sits ≥15pt under the line
//  the favourite still realizes ~74%. A naive "back the side the model likes
//  more than the market" rule is therefore a DOG-BACKING MACHINE driven by a
//  known bias, not an edge. This script re-derives that from scratch so the
//  claim is verified rather than quoted.
//
//  Same leak discipline as cardReport.ts: ratings are point-in-time
//  (`ratingBefore` + PitAdjuster traces filtered to < asOf); results are read
//  only for grading. Duplicate BFO event slugs deduped by fighter-pair + date.
//
//  Run:  node_modules/.bin/jiti research/backtest/disagreementSlice.ts
//        SINCE=2023-01-01 node_modules/.bin/jiti research/backtest/disagreementSlice.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../../src/lib/loadData';
import { normalizeWeightClassForMove } from '../../src/lib/eloEngine';
import { predictFight } from '../../src/lib/fightPrediction';
import { buildNameIndex } from '../../src/lib/nameResolver';
import { buildPointInTimeIndex, resolveOddsName } from './pointInTime';
import { PitAdjuster } from './pitAdjust';
import { devig } from './devig';

const SINCE = process.env.SINCE ?? '';
const MIN_PRIOR = process.env.MINPRIOR ? Number(process.env.MINPRIOR) : 0;
const DAY_TOL = [0, 1, -1, 2, -2];
const dayNum = (iso: string) => Math.floor(new Date(iso).getTime() / 86_400_000);

interface B {
  date: string; pMkt: number; pModel: number;
  favOdds: number; dogOdds: number; favWon: boolean;
  minPrior: number;
}

function main(): void {
  const data = loadAllData();
  const idx = buildPointInTimeIndex(data);
  const nameIndex = buildNameIndex(data.fighters);
  const adjuster = new PitAdjuster(data);
  const lookup = (x: string, y: string, d: number) => {
    for (const o of DAY_TOL) { const h = idx.get(`${x}#${y}#${d + o}`); if (h) return h; }
    return null;
  };

  const bfo = Papa.parse<Record<string, string>>(
    fs.readFileSync(path.join(process.cwd(), 'data', 'bfo_odds.csv'), 'utf-8'),
    { header: true, skipEmptyLines: true },
  ).data;

  const seen = new Set<string>();
  const bouts: B[] = [];
  for (const r of bfo) {
    if (SINCE && r['date'] < SINCE) continue;
    const c1 = parseFloat(r['close1']); const c2 = parseFloat(r['close2']);
    if (!(c1 > 1) || !(c2 > 1)) continue;
    const key = `${r['date']}|${[r['fighter1'], r['fighter2']].map((s) => s.toLowerCase()).sort().join('|')}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const id1 = resolveOddsName(r['fighter1'], nameIndex);
    const id2 = resolveOddsName(r['fighter2'], nameIndex);
    if (!id1 || !id2) continue;
    const d = dayNum(r['date']);
    const p1 = lookup(id1, id2, d); const p2 = lookup(id2, id1, d);
    if (!p1 || !p2) continue;
    if (p1.result === 'D' || p2.result === 'D') continue;

    const f1Fav = c1 <= c2;
    const favId = f1Fav ? id1 : id2, dogId = f1Fav ? id2 : id1;
    const favPit = f1Fav ? p1 : p2, dogPit = f1Fav ? p2 : p1;
    const favOdds = f1Fav ? c1 : c2, dogOdds = f1Fav ? c2 : c1;
    if (Math.min(favPit.selfFightNo, dogPit.selfFightNo) < MIN_PRIOR) continue;

    const division = normalizeWeightClassForMove(favPit.weightClass) ?? favPit.weightClass;
    const m = predictFight(
      data, favId, dogId,
      favPit.selfRating + adjuster.adjustment(favId, favPit.date, division),
      favPit.oppRating + adjuster.adjustment(dogId, dogPit.date, division),
      favPit.selfFightNo + 1, dogPit.selfFightNo + 1, new Date(favPit.date),
    );
    bouts.push({
      date: favPit.date.slice(0, 10),
      pMkt: devig(favOdds, dogOdds, 'shin').pFav,
      pModel: m.probA, favOdds, dogOdds,
      favWon: favPit.result === 'W',
      minPrior: Math.min(favPit.selfFightNo, dogPit.selfFightNo),
    });
  }

  console.log(`\n════ DISAGREEMENT SLICES ${SINCE ? `(since ${SINCE})` : '(all)'} — n=${bouts.length} ════`);
  console.log('gap = market P(fav) − model P(fav);  + means the model is UNDER the favourite\n');

  const buckets: [string, (g: number) => boolean][] = [
    ['model ≥25pt UNDER fav', (g) => g >= 0.25],
    ['model 15–25pt under  ', (g) => g >= 0.15 && g < 0.25],
    ['model  5–15pt under  ', (g) => g >= 0.05 && g < 0.15],
    ['broad agreement ±5pt ', (g) => g > -0.05 && g < 0.05],
    ['model OVER the fav   ', (g) => g <= -0.05],
  ];

  console.log('SLICE                    n   fav won   mkt P(fav)  model P(fav)   flat-bet MODEL side');
  console.log('─'.repeat(88));
  for (const [name, test] of buckets) {
    const rows = bouts.filter((b) => test(b.pMkt - b.pModel));
    if (!rows.length) { console.log(`${name}  ${String(0).padStart(4)}      –`); continue; }
    const favWinRate = rows.filter((b) => b.favWon).length / rows.length;
    const mMkt = rows.reduce((s, b) => s + b.pMkt, 0) / rows.length;
    const mMod = rows.reduce((s, b) => s + b.pModel, 0) / rows.length;
    // Flat 1u on whichever side the model prefers vs the market.
    let staked = 0, ret = 0;
    for (const b of rows) {
      const modelLikesFav = b.pModel > b.pMkt;
      staked += 1;
      const hit = modelLikesFav ? b.favWon : !b.favWon;
      if (hit) ret += modelLikesFav ? b.favOdds : b.dogOdds;
    }
    const pnl = ret - staked;
    console.log(
      `${name}  ${String(rows.length).padStart(4)}   ${(favWinRate * 100).toFixed(1).padStart(5)}%    ` +
      `${(mMkt * 100).toFixed(1).padStart(5)}%       ${(mMod * 100).toFixed(1).padStart(5)}%       ` +
      `${(pnl >= 0 ? '+' : '') + pnl.toFixed(1)}u / ${staked}u  (ROI ${((pnl / staked) * 100).toFixed(1)}%)`,
    );
  }

  // The specific rule I used on the 2026-08-22 card: back the model's side when
  // it disagrees by ≥13pt. Report it standalone at closing prices.
  console.log('\n──── RULE CHECK: back the model side when |edge| ≥ 13pt ────');
  for (const minPrior of [0, 3]) {
    const rows = bouts.filter(
      (b) => Math.abs(b.pModel - b.pMkt) >= 0.13 && b.minPrior >= minPrior,
    );
    let staked = 0, ret = 0, won = 0;
    for (const b of rows) {
      const likesFav = b.pModel > b.pMkt;
      staked += 1;
      const hit = likesFav ? b.favWon : !b.favWon;
      if (hit) { ret += likesFav ? b.favOdds : b.dogOdds; won++; }
    }
    const pnl = ret - staked;
    console.log(
      `  min ${minPrior} priors: ${won}-${staked - won} · staked ${staked}u · ` +
      `P&L ${(pnl >= 0 ? '+' : '') + pnl.toFixed(2)}u · ROI ${((pnl / staked) * 100).toFixed(1)}% · ` +
      `hit rate ${((won / staked) * 100).toFixed(1)}%`,
    );
  }
}

main();
