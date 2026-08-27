// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/cardReport.ts — single-card model-vs-market scorecard.
//
//  Grades ONE event: point-in-time model probabilities (no look-ahead) against
//  the de-vigged BFO close and the actual results, plus a mechanical betting
//  rule's P&L at closing prices.
//
//  LEAK DISCIPLINE — the whole point of this script. Ratings come from
//  `buildPointInTimeIndex` (`FightTrace.ratingBefore`, the rating entering the
//  bout) and ranking-layer terms from `PitAdjuster` (traces filtered to
//  `< asOf`). Re-running today's engine over a past card would score a model
//  that already contains that card's results — the leak that invalidated the
//  regional-Elo prospect finding (CHANGELOG 2026-08-12). `result` is read ONLY
//  for grading, never for prediction.
//
//  DEDUPE — BestFightOdds lists some events under TWO slugs with identical
//  lines (ufc-281, ufc-322, ufc-329, ufc-330 …). Rows are keyed by
//  fighter-pair + date so a duplicated card is scored once, not twice.
//
//  Research zone: odds feed NO rating. Display/analysis only.
//
//  Run:  CARD_DATE=2026-08-15 node_modules/.bin/jiti research/backtest/cardReport.ts
//        CARD_DATE=2026-08-22 EDGE=0.13 node_modules/.bin/jiti research/backtest/cardReport.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../../src/lib/loadData';
import { winProbability, normalizeWeightClassForMove } from '../../src/lib/eloEngine';
import { predictFight } from '../../src/lib/fightPrediction';
import { buildNameIndex } from '../../src/lib/nameResolver';
import { buildPointInTimeIndex, resolveOddsName } from './pointInTime';
import { PitAdjuster } from './pitAdjust';
import { devig, type DevigMethod } from './devig';
import { logLoss, accuracy, type Prediction } from './metrics';

const CARD_DATE = process.env.CARD_DATE ?? '';
// Betting rule knobs — see the RULE block below. Defaults mirror the rule
// stated in the 2026-08-20 card writeup, BEFORE any of these results were read.
const EDGE = process.env.EDGE ? Number(process.env.EDGE) : 0.13;
const MIN_PRIOR_FIGHTS = process.env.MINPRIOR ? Number(process.env.MINPRIOR) : 3;
const DEVIG: DevigMethod = 'shin';
const DAY_TOL = [0, 1, -1, 2, -2];

const dayNum = (iso: string) => Math.floor(new Date(iso).getTime() / 86_400_000);

interface Bout {
  date: string;
  a: string; b: string;              // a = market favourite
  aOdds: number; bOdds: number;
  pMkt: number;                      // de-vigged P(a)
  pElo: number;                      // pure Elo P(a)
  pModel: number;                    // production surface: ranked + overlay
  aFightNo: number; bFightNo: number;
  aMove: boolean; bMove: boolean;
  aWon: boolean | null;              // null = not yet fought / no result
  method: string;
}

function main(): void {
  if (!CARD_DATE) { console.error('set CARD_DATE=YYYY-MM-DD'); process.exit(1); }

  const data = loadAllData();
  const idx = buildPointInTimeIndex(data);
  const nameIndex = buildNameIndex(data.fighters);
  const adjuster = new PitAdjuster(data);

  const lookup = (x: string, y: string, day: number) => {
    for (const off of DAY_TOL) { const hit = idx.get(`${x}#${y}#${day + off}`); if (hit) return hit; }
    return null;
  };

  const bfoFp = path.join(process.cwd(), 'data', 'bfo_odds.csv');
  const bfo = Papa.parse<Record<string, string>>(
    fs.readFileSync(bfoFp, 'utf-8'), { header: true, skipEmptyLines: true },
  ).data;

  const seen = new Set<string>();   // fighter-pair dedupe across duplicate slugs
  const bouts: Bout[] = [];
  let unmatched = 0;

  for (const r of bfo) {
    if (r['date'] !== CARD_DATE) continue;
    const c1 = parseFloat(r['close1']); const c2 = parseFloat(r['close2']);
    if (!(c1 > 1) || !(c2 > 1)) continue;

    const pairKey = [r['fighter1'], r['fighter2']].map((s) => s.toLowerCase()).sort().join('|');
    if (seen.has(pairKey)) continue;
    seen.add(pairKey);

    const id1 = resolveOddsName(r['fighter1'], nameIndex);
    const id2 = resolveOddsName(r['fighter2'], nameIndex);
    if (!id1 || !id2) { unmatched++; continue; }

    const day = dayNum(r['date']);
    const p1 = lookup(id1, id2, day);
    const p2 = lookup(id2, id1, day);
    if (!p1 || !p2) { unmatched++; continue; }

    // Orient on the market favourite.
    const f1Fav = c1 <= c2;
    const aId = f1Fav ? id1 : id2, bId = f1Fav ? id2 : id1;
    const aPit = f1Fav ? p1 : p2, bPit = f1Fav ? p2 : p1;
    const aOdds = f1Fav ? c1 : c2, bOdds = f1Fav ? c2 : c1;

    const division = normalizeWeightClassForMove(aPit.weightClass) ?? aPit.weightClass;
    const adjA = adjuster.adjustment(aId, aPit.date, division);
    const adjB = adjuster.adjustment(bId, bPit.date, division);
    const asOf = new Date(aPit.date);

    const model = predictFight(
      data, aId, bId,
      aPit.selfRating + adjA, aPit.oppRating + adjB,
      aPit.selfFightNo + 1, bPit.selfFightNo + 1,
      asOf,
    );

    bouts.push({
      date: aPit.date.slice(0, 10),
      a: f1Fav ? r['fighter1'] : r['fighter2'],
      b: f1Fav ? r['fighter2'] : r['fighter1'],
      aOdds, bOdds,
      pMkt: devig(aOdds, bOdds, DEVIG).pFav,
      pElo: winProbability(aPit.selfRating, aPit.oppRating),
      pModel: model.probA,
      aFightNo: aPit.selfFightNo, bFightNo: bPit.selfFightNo,
      aMove: aPit.selfWeightMove, bMove: bPit.selfWeightMove,
      aWon: aPit.result === 'D' ? null : aPit.result === 'W',
      method: '',
    });
  }

  if (!bouts.length) { console.error(`no matched bouts for ${CARD_DATE}`); process.exit(1); }

  console.log(`\n════════ CARD REPORT — ${CARD_DATE} ════════`);
  console.log(`${bouts.length} odds-matched bouts (deduped), ${unmatched} unmatched\n`);

  const pct = (x: number) => (x * 100).toFixed(1).padStart(5);
  console.log('FAVOURITE (market)          MKT   ELO  MODEL   EDGE  RESULT');
  console.log('─'.repeat(72));
  for (const t of bouts) {
    const edge = t.pModel - t.pMkt;
    const res = t.aWon === null ? ' draw ' : t.aWon ? ' FAV✓ ' : ' DOG✗ ';
    console.log(
      `${(t.a + ' vs ' + t.b).slice(0, 26).padEnd(26)} ${pct(t.pMkt)} ${pct(t.pElo)} ${pct(t.pModel)}  ` +
      `${(edge >= 0 ? '+' : '') + (edge * 100).toFixed(1).padStart(5)}  ${res}`,
    );
  }

  // ── Scoring (decisive bouts only) ──
  const graded = bouts.filter((t) => t.aWon !== null);
  if (!graded.length) { console.log('\n(no results yet — prediction-only run)'); return; }

  const mk = (get: (t: Bout) => number): Prediction[] =>
    graded.map((t) => ({ p: get(t), won: t.aWon as boolean }));
  const rows: [string, Prediction[]][] = [
    ['PURE ELO', mk((t) => t.pElo)],
    ['MODEL (ranked+overlay)', mk((t) => t.pModel)],
    ['MARKET (de-vigged close)', mk((t) => t.pMkt)],
  ];
  console.log(`\n──── SCORING (n=${graded.length} decisive) ────`);
  console.log('                            ACC     LOGLOSS');
  for (const [name, preds] of rows) {
    console.log(`${name.padEnd(26)} ${(accuracy(preds) * 100).toFixed(1).padStart(5)}%   ${logLoss(preds).toFixed(4)}`);
  }

  // ── Mechanical betting rule ──
  //  RULE (stated in the 2026-08-20 writeup, before these results were read):
  //   1. Back the side where model − market ≥ EDGE on the de-vigged line.
  //   2. SKIP if either corner enters with < MIN_PRIOR_FIGHTS UFC fights
  //      (the market-gap audit's worst-calibrated slice — 0–2 priors).
  //   3. SKIP if the backed side is a division mover (audit's −18pt bias slice).
  //  Flat 1u stakes, settled at the CLOSING price.
  console.log(`\n──── BETTING RULE (edge ≥ ${(EDGE * 100).toFixed(0)}pt, skip <${MIN_PRIOR_FIGHTS} priors & movers) ────`);
  let staked = 0, ret = 0, won = 0, lost = 0;
  const skipped: string[] = [];
  for (const t of graded) {
    for (const side of ['a', 'b'] as const) {
      const p = side === 'a' ? t.pModel : 1 - t.pModel;
      const m = side === 'a' ? t.pMkt : 1 - t.pMkt;
      if (p - m < EDGE) continue;
      const name = side === 'a' ? t.a : t.b;
      const odds = side === 'a' ? t.aOdds : t.bOdds;
      const mover = side === 'a' ? t.aMove : t.bMove;
      const thin = Math.min(t.aFightNo, t.bFightNo) < MIN_PRIOR_FIGHTS;
      if (thin) { skipped.push(`${name} (+${((p - m) * 100).toFixed(0)}pt) — thin sample`); continue; }
      if (mover) { skipped.push(`${name} (+${((p - m) * 100).toFixed(0)}pt) — division mover`); continue; }
      const hit = side === 'a' ? t.aWon! : !t.aWon!;
      staked += 1; ret += hit ? odds : 0; hit ? won++ : lost++;
      console.log(
        `  ${hit ? '✓ WON ' : '✗ LOST'}  ${name.padEnd(22)} @ ${odds.toFixed(2)}  ` +
        `(model ${(p * 100).toFixed(1)}% vs mkt ${(m * 100).toFixed(1)}%, +${((p - m) * 100).toFixed(1)}pt)`,
      );
    }
  }
  for (const s of skipped) console.log(`  – SKIP  ${s}`);
  if (staked === 0) console.log('  (no qualifying bets)');
  else console.log(
    `\n  ${won}-${lost} · staked ${staked}u · returned ${ret.toFixed(2)}u · ` +
    `P&L ${(ret - staked >= 0 ? '+' : '') + (ret - staked).toFixed(2)}u · ` +
    `ROI ${(((ret - staked) / staked) * 100).toFixed(1)}%`,
  );
}

main();
