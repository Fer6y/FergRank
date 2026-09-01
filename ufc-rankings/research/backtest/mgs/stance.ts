// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/mgs/stance.ts — MARKET-GAP SWEEP candidate T2: STANCE.
//  Pre-registered in docs/plans/MARKET_GAP_SWEEP_PLAN.md (2026-09-01).
//
//  Feature (fixed by the plan, no variants): southpaw-vs-orthodox matchup
//  flag from data/Fighters.csv `Stance`. Fav-oriented: +1 when the favourite
//  is Southpaw and the underdog Orthodox, −1 when the favourite is Orthodox
//  and the underdog Southpaw, 0 otherwise (same stance, Switch, Open,
//  Sideways, or missing either side = UNAFFECTED). Single coefficient.
//
//  Harness copied from trendStudy.ts exactly: PIT ratings via
//  buildPointInTimeIndex + PitAdjuster + predictFight, Shin de-vig, DAY_TOL
//  matching, pair+date dedupe of BFO rows, orientation-symmetrized logistic
//  with a FIXED OFFSET (production logit = ship gate; market logit =
//  informational), fit <2024-01-01, score 2024+, held-out refit sign check.
//
//  DIAGNOSTIC ONLY. Research zone; odds feed no rating.
//  Run: node_modules/.bin/jiti research/backtest/mgs/stance.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../../../src/lib/loadData';
import { normalizeWeightClassForMove } from '../../../src/lib/eloEngine';
import { predictFight } from '../../../src/lib/fightPrediction';
import { buildNameIndex } from '../../../src/lib/nameResolver';
import { buildPointInTimeIndex, resolveOddsName } from '../pointInTime';
import { PitAdjuster } from '../pitAdjust';
import { devig, type DevigMethod } from '../devig';
import { score, sigmoid, logit, fitLogistic, type Prediction } from '../metrics';

const DEVIG: DevigMethod = 'shin';
const DAY_TOL = [0, 1, -1, 2, -2];
const SPLIT = '2024-01-01';

function dayNum(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? NaN : Math.floor(t / 86_400_000);
}
const ll = (p: number, won: boolean): number =>
  -Math.log(Math.max(1e-12, won ? p : 1 - p));

function pairedT(diffs: number[]): { mean: number; t: number } {
  const n = diffs.length;
  if (n < 2) return { mean: NaN, t: NaN };
  const mean = diffs.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(diffs.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (n - 1));
  return { mean, t: sd > 0 ? mean / (sd / Math.sqrt(n)) : NaN };
}
const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);

// ── stance lookup: data/Fighters.csv, Fighter_Id shares the canonical id
//    space (verified in src/lib/fighterPhysical.ts). Static career attribute —
//    no per-date value exists in any source; recorded as a caveat, not a leak
//    fix, since stance is essentially fixed for a career. ──
type Stance = 'southpaw' | 'orthodox' | 'other';
function loadStance(): Map<string, Stance> {
  const rows = Papa.parse<Record<string, string>>(
    fs.readFileSync(path.join(process.cwd(), 'data', 'Fighters.csv'), 'utf-8'),
    { header: true, skipEmptyLines: true }
  ).data;
  const map = new Map<string, Stance>();
  for (const r of rows) {
    const id = (r['Fighter_Id'] || '').trim();
    const s = (r['Stance'] || '').trim().toLowerCase();
    if (!id || !s) continue; // missing stance → not in map → unaffected
    map.set(id, s === 'southpaw' ? 'southpaw' : s === 'orthodox' ? 'orthodox' : 'other');
  }
  return map;
}

// +1 fav southpaw vs orthodox dog · −1 fav orthodox vs southpaw dog · 0 else.
function stanceFlag(fav: Stance | undefined, dog: Stance | undefined): number {
  if (fav === 'southpaw' && dog === 'orthodox') return 1;
  if (fav === 'orthodox' && dog === 'southpaw') return -1;
  return 0;
}

interface Row {
  date: string;
  fav: string;
  dog: string;
  pProd: number;
  pMkt: number;
  favWon: boolean;
  flag: number; // +1 / −1 / 0, fav-oriented
}

function main(): void {
  const data = loadAllData();
  const idx = buildPointInTimeIndex(data);
  const nameIndex = buildNameIndex(data.fighters);
  const adjuster = new PitAdjuster(data);
  const stanceById = loadStance();

  const lookup = (a: string, b: string, day: number) => {
    for (const off of DAY_TOL) {
      const hit = idx.get(`${a}#${b}#${day + off}`);
      if (hit) return hit;
    }
    return null;
  };

  const bfo = Papa.parse<Record<string, string>>(
    fs.readFileSync(path.join(process.cwd(), 'data', 'bfo_odds.csv'), 'utf-8'),
    { header: true, skipEmptyLines: true }
  ).data;

  const rows: Row[] = [];
  const seenPair = new Set<string>(); // pair+date dedupe (the BFO duplicate-slug bug)
  for (const r of bfo) {
    const c1 = parseFloat(r['close1']);
    const c2 = parseFloat(r['close2']);
    if (!(c1 > 1) || !(c2 > 1)) continue;
    const id1 = resolveOddsName(r['fighter1'], nameIndex);
    const id2 = resolveOddsName(r['fighter2'], nameIndex);
    if (!id1 || !id2) continue;
    const day = dayNum(r['date']);
    const pairKey = [id1, id2].sort().join('#') + '#' + day;
    if (seenPair.has(pairKey)) continue;
    const p1 = lookup(id1, id2, day);
    const p2 = lookup(id2, id1, day);
    if (!p1 || !p2) continue;
    seenPair.add(pairKey);

    const f1IsFav = c1 <= c2;
    const favId = f1IsFav ? id1 : id2;
    const dogId = f1IsFav ? id2 : id1;
    const favPit = f1IsFav ? p1 : p2;
    const dogPit = f1IsFav ? p2 : p1;
    const division = normalizeWeightClassForMove(favPit.weightClass) ?? favPit.weightClass;
    const adjFav = adjuster.adjustment(favId, favPit.date, division);
    const adjDog = adjuster.adjustment(dogId, dogPit.date, division);

    const pred = predictFight(
      data, favId, dogId,
      favPit.selfRating + adjFav, favPit.oppRating + adjDog,
      favPit.selfFightNo + 1, dogPit.selfFightNo + 1,
      new Date(favPit.date),
    );

    rows.push({
      date: favPit.date.slice(0, 10),
      fav: f1IsFav ? r['fighter1'] : r['fighter2'],
      dog: f1IsFav ? r['fighter2'] : r['fighter1'],
      pProd: pred.probA,
      pMkt: devig(f1IsFav ? c1 : c2, f1IsFav ? c2 : c1, DEVIG).pFav,
      favWon: favPit.result === 'W',
      flag: stanceFlag(stanceById.get(favId), stanceById.get(dogId)),
    });
  }

  const affected = (r: Row) => r.flag !== 0;
  const nAff = rows.filter(affected).length;
  console.log(`MGS T2 STANCE — ${rows.length} odds-matched bouts (pair+date deduped); southpaw-vs-orthodox on ${nAff}\n`);

  // ── hand-verification aid: a few concrete affected bouts with names ──
  console.log('━━ SAMPLE AFFECTED BOUTS (for independent hand-check vs Fighters.csv) ━━');
  for (const r of rows.filter(affected).slice(-5)) {
    console.log(`  ${r.date}  fav=${r.fav}  dog=${r.dog}  flag=${r.flag > 0 ? '+1 (fav southpaw)' : '-1 (fav orthodox)'}  favWon=${r.favWon}`);
  }

  // ── descriptive phase: the SOUTHPAW side of every affected bout ──
  console.log('\n━━ DESCRIPTIVE (southpaw side of each southpaw-vs-orthodox bout) ━━');
  const sp = rows.filter(affected).map((r) => ({
    won: r.flag > 0 ? r.favWon : !r.favWon,
    pModel: r.flag > 0 ? r.pProd : 1 - r.pProd,
    pMkt: r.flag > 0 ? r.pMkt : 1 - r.pMkt,
    isFav: r.flag > 0,
  }));
  const dRep = (label: string, sl: typeof sp) => {
    if (!sl.length) return;
    console.log(`  ${label}: n=${sl.length}  southpaw won ${(100 * mean(sl.map((s) => (s.won ? 1 : 0)))).toFixed(1)}%  model priced ${(100 * mean(sl.map((s) => s.pModel))).toFixed(1)}%  mkt ${(100 * mean(sl.map((s) => s.pMkt))).toFixed(1)}%`);
  };
  dRep('all southpaw-vs-orthodox', sp);
  dRep('southpaw is market favourite', sp.filter((s) => s.isFav));
  dRep('southpaw is market underdog', sp.filter((s) => !s.isFav));

  // ── inferential phase: single pre-registered model, both offsets ──
  const train = rows.filter((r) => r.date < SPLIT);
  const test = rows.filter((r) => r.date >= SPLIT);
  const testAff = test.filter(affected);
  const testUnaff = test.filter((r) => !affected(r));

  type FeatFn = (r: Row) => number[];
  const M: { name: string; feats: FeatFn }[] = [
    { name: 'T2 stanceFlag (southpaw-vs-orthodox, fav-oriented)', feats: (r) => [r.flag] },
  ];

  for (const [offLabel, offOf] of [
    ['offset = PRODUCTION logit (the ship gate)', (r: Row) => logit(r.pProd)],
    ['offset = MARKET logit (informational: does the market already price it?)', (r: Row) => logit(r.pMkt)],
  ] as const) {
    console.log(`\n━━ INFERENTIAL — ${offLabel}; symmetrized; fit <${SPLIT}, score ${SPLIT}+ ━━`);
    console.log(`  train n=${train.length} (affected ${train.filter(affected).length}) · test n=${test.length} (affected ${testAff.length})`);

    const fitOn = (set: Row[], feats: FeatFn): number[] => {
      const X: number[][] = [];
      const y: number[] = [];
      const off: number[] = [];
      for (const r of set) {
        const f = feats(r);
        const o = offOf(r);
        X.push(f); y.push(r.favWon ? 1 : 0); off.push(o);
        X.push(f.map((v) => -v)); y.push(r.favWon ? 0 : 1); off.push(-o);
      }
      return fitLogistic(X, y, 40, 1e-6, off);
    };
    const predict = (r: Row, w: number[], feats: FeatFn): number =>
      sigmoid(offOf(r) + feats(r).reduce((s, v, j) => s + v * w[j + 1], 0));

    for (const m of M) {
      const w = fitOn(train, m.feats);
      const wHold = fitOn(test, m.feats); // sign-stability check only
      const coefs = w.slice(1).map((c) => c.toFixed(3)).join(', ');
      const coefsH = wHold.slice(1).map((c) => c.toFixed(3)).join(', ');
      console.log(`\n  ${m.name}: train coef [${coefs}] · held-out refit [${coefsH}] (sign check)`);
      for (const [label, set] of [['test affected', testAff], ['test unaffected', testUnaff], ['test all', test]] as const) {
        if (set.length < 10) { console.log(`    ${label}: n=${set.length} thin`); continue; }
        const base = score(set.map((r): Prediction => ({ p: sigmoid(offOf(r)), won: r.favWon })));
        const cand = score(set.map((r): Prediction => ({ p: predict(r, w, m.feats), won: r.favWon })));
        const d = pairedT(set.map((r) => ll(predict(r, w, m.feats), r.favWon) - ll(sigmoid(offOf(r)), r.favWon)));
        console.log(`    ${label.padEnd(16)} n=${String(set.length).padStart(3)}  LL ${base.logLoss.toFixed(4)} → ${cand.logLoss.toFixed(4)}  paired Δ ${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(4)} (t ${d.t.toFixed(2)})`);
      }
    }
  }

  console.log('\nVERDICT RULE (pre-registered, production offset only): CONFIRMED iff test-affected t ≤ −2 AND test-unaffected t < +2 AND held-out refit keeps the coefficient sign.');
}

main();
