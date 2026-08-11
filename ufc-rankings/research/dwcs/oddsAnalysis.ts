// ─────────────────────────────────────────────────────────────────────────
//  research/dwcs/oddsAnalysis.ts — Phase C.3 of docs/plans/DWCS_PLAN.md.
//
//  MARKET-ONLY BY DESIGN: DWCS bouts are not in the Elo sweep, so there is no
//  model probability to compare — this scores the MARKET itself on DWCS and
//  then asks the prospect question (pre-registered H6): does the DWCS closing
//  price predict which graduates succeed in the UFC, beyond pedigree features?
//
//  1. Market calibration on DWCS bouts: devig('power') → P(favourite),
//     winner from dwcs_bouts.csv (NOT any Elo trace); logloss / brier /
//     accuracy / ECE, favourite win rate, split by season. Expectation going
//     in: tryout matchmaking builds cards FOR one side → heavier favourites
//     than UFC cards.
//  2. Graduate-predictive (H6): on graduates with a matched DWCS price,
//     nested logistics on reachedTop15 — {market P(win)} vs {pedigree} vs
//     {both} — plus Spearman vs settled Elo gain. Small n; CIs carried.
//  3. Descriptive: UFC outcomes of DWCS underdog winners vs favourite winners.
//
//  Run: node_modules/.bin/jiti research/dwcs/oddsAnalysis.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { devig } from '../backtest/devig';
import { score, auc, spearman, fitLogistic, predictLogistic, type Prediction } from '../backtest/metrics';
import { loadDwcsBouts, joinDwcsOdds, type JoinedDwcsBout } from './joinDwcsOdds';

const num = (s: string): number | null => (s === '' || s == null ? null : Number(s));

interface GradRow {
  sherdogId: string;
  marketPWin: number;   // devigged P(this fighter wins their DWCS bout)
  wonDwcs: boolean;
  preW: number | null;
  preL: number | null;
  age: number | null;
  relFactor: number;
  top15: boolean;
  eloGain: number | null;
}

function main(): void {
  const bouts = loadDwcsBouts();
  const { joined, oddsRows, unmatchedOdds } = joinDwcsOdds(bouts);
  if (!joined.length) {
    console.log('No DWCS odds available (data/bfo_dwcs_odds.csv missing or empty) — Phase C is a no-op.');
    return;
  }
  const matchable = oddsRows - unmatchedOdds.length;
  console.log(`DWCS odds join: ${oddsRows} odds rows → ${joined.length} matched bouts (${((100 * matchable) / oddsRows).toFixed(1)}%)`);
  if (unmatchedOdds.length) {
    console.log(`  unmatched (add safe aliases to research/oddsNameOverrides.ts):`);
    for (const o of unmatchedOdds.slice(0, 12)) console.log(`    ${o.date}  ${o.fighter1} vs ${o.fighter2}`);
  }
  const bySeason = new Map<number, JoinedDwcsBout[]>();
  for (const j of joined) {
    const s = Number(j.bout.season);
    bySeason.set(s, [...(bySeason.get(s) ?? []), j]);
  }
  console.log(`  coverage by season: ${[...bySeason.entries()].sort().map(([s, v]) => `${s}:${v.length}`).join(' ')}`);
  const total = bouts.length;
  console.log(`  (of ${total} DWCS bouts overall — 2017–2020 pages use BFO's legacy format and stay uncovered)\n`);

  // ── 1. market calibration ──────────────────────────────────────────
  const decided = joined.filter((j) => j.bout.winnerSherdogId);
  const preds: Prediction[] = [];
  let favWins = 0;
  const pFavs: number[] = [];
  for (const j of decided) {
    const favIsA = j.closeA <= j.closeB;
    const [favOdds, dogOdds] = favIsA ? [j.closeA, j.closeB] : [j.closeB, j.closeA];
    const { pFav } = devig(favOdds, dogOdds, 'power');
    const favSherdogId = favIsA ? j.bout.sherdogIdA : j.bout.sherdogIdB;
    const favWon = j.bout.winnerSherdogId === favSherdogId;
    preds.push({ p: pFav, won: favWon });
    pFavs.push(pFav);
    if (favWon) favWins++;
  }
  const s = score(preds);
  const meanPFav = pFavs.reduce((a, b) => a + b, 0) / pFavs.length;
  console.log('════ MARKET CALIBRATION ON DWCS (no model side exists — market only) ════');
  console.log(`  n=${s.n} decided bouts   logloss ${s.logLoss.toFixed(4)}   brier ${s.brier.toFixed(4)}   acc ${(100 * s.accuracy).toFixed(1)}%   ECE ${s.ece.toFixed(3)}`);
  console.log(`  favourite win rate ${(100 * favWins / preds.length).toFixed(1)}%   mean devigged P(fav) ${(100 * meanPFav).toFixed(1)}%`);
  console.log(`  (UFC-card reference: the market runs ~68% acc / mean P(fav) ~66% on our bfo sample)`);
  for (const [season, js] of [...bySeason.entries()].sort()) {
    const sp: Prediction[] = [];
    for (const j of js) {
      if (!j.bout.winnerSherdogId) continue;
      const favIsA = j.closeA <= j.closeB;
      const [f, d] = favIsA ? [j.closeA, j.closeB] : [j.closeB, j.closeA];
      sp.push({ p: devig(f, d, 'power').pFav, won: j.bout.winnerSherdogId === (favIsA ? j.bout.sherdogIdA : j.bout.sherdogIdB) });
    }
    if (sp.length) {
      const ss = score(sp);
      console.log(`    ${season}: n=${ss.n}  acc ${(100 * ss.accuracy).toFixed(0)}%  logloss ${ss.logLoss.toFixed(3)}`);
    }
  }

  // ── 2 + 3. the prospect tie-in (H6) ────────────────────────────────
  const fCsv = fs.readFileSync(path.join(process.cwd(), 'data', 'dwcs_fighters.csv'), 'utf8');
  const fighters = Papa.parse<Record<string, string>>(fCsv, { header: true, skipEmptyLines: true }).data;
  const byId = new Map(fighters.map((f) => [f.sherdogId, f]));

  const grads: GradRow[] = [];
  for (const j of joined) {
    for (const side of ['A', 'B'] as const) {
      const sid = side === 'A' ? j.bout.sherdogIdA : j.bout.sherdogIdB;
      const f = byId.get(sid);
      if (!f || f.gotContract !== '1') continue;
      const [selfOdds, oppOdds] = side === 'A' ? [j.closeA, j.closeB] : [j.closeB, j.closeA];
      const dv = selfOdds <= oppOdds ? devig(selfOdds, oppOdds, 'power').pFav : devig(oppOdds, selfOdds, 'power').pDog;
      grads.push({
        sherdogId: sid,
        marketPWin: dv,
        wonDwcs: j.bout.winnerSherdogId === sid,
        preW: num(f.preDwcsWins),
        preL: num(f.preDwcsLosses),
        age: num(f.ageAtDwcs),
        relFactor: num(f.feederRelFactor) ?? 1,
        top15: f.reachedTop15 === '1',
        eloGain: num(f.settledEloGain),
      });
    }
  }
  const model = grads.filter((g) => g.preW != null && g.preL != null && (g.preW + g.preL!) > 0 && g.age != null);
  const y = model.map((g) => (g.top15 ? 1 : 0));
  const pos = y.reduce((a, b) => a + b, 0);
  console.log(`\n════ H6 — DOES THE DWCS PRICE PREDICT UFC SUCCESS? (graduates with odds) ════`);
  console.log(`  n=${model.length}, top-15 positives=${pos}${pos < 10 ? '   ⚠ SEVERELY underpowered — directional read only' : ''}`);

  const sets: [string, (g: GradRow) => number[]][] = [
    ['market P(win) only', (g) => [g.marketPWin]],
    ['pedigree only', (g) => [g.preW! / (g.preW! + g.preL!), (g.age! - 26) / 5, (g.relFactor - 1) * 5]],
    ['both', (g) => [g.marketPWin, g.preW! / (g.preW! + g.preL!), (g.age! - 26) / 5, (g.relFactor - 1) * 5]],
  ];
  for (const [label, fx] of sets) {
    const X = model.map(fx);
    const w = fitLogistic(X, y);
    const p: Prediction[] = model.map((g, i) => ({ p: predictLogistic(w, X[i]), won: g.top15 }));
    console.log(`  ${label.padEnd(20)} AUC ${auc(p).toFixed(3)} (in-sample)`);
  }
  const gains = model.filter((g) => g.eloGain != null);
  console.log(`  Spearman ρ(market P(win), settled Elo gain): ${spearman(gains.map((g) => g.marketPWin), gains.map((g) => g.eloGain!)).toFixed(3)} (n=${gains.length})`);

  const dogWinners = grads.filter((g) => g.wonDwcs && g.marketPWin < 0.5);
  const favWinners = grads.filter((g) => g.wonDwcs && g.marketPWin >= 0.5);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  console.log(`\n  DWCS UNDERDOG winners who graduated: n=${dogWinners.length}, top15 ${(100 * mean(dogWinners.map((g) => (g.top15 ? 1 : 0)))).toFixed(0)}%, mean Elo gain ${mean(dogWinners.map((g) => g.eloGain ?? 0)).toFixed(1)}`);
  console.log(`  DWCS FAVOURITE winners who graduated: n=${favWinners.length}, top15 ${(100 * mean(favWinners.map((g) => (g.top15 ? 1 : 0)))).toFixed(0)}%, mean Elo gain ${mean(favWinners.map((g) => g.eloGain ?? 0)).toFixed(1)}`);
}

main();
