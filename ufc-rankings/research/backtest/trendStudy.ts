// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/trendStudy.ts — the 4–6 fight TREND study.
//  PLAN + VERDICT RULE PRE-REGISTERED in docs/plans/TREND_STUDY_PLAN.md
//  (commit f648ca5) BEFORE this script ran. Features, the six models, the
//  temporal split and both offsets are exactly the plan's — no variants.
//
//  Question: do per-fighter performance TRENDS over the last 4–6 fights
//  (strike-differential trajectory, absorption trajectory, recently-finished
//  count, knockdowns conceded) carry information about the next result beyond
//  the production win probability? The metrics composite reads recent LEVEL;
//  nothing in the engine or overlay reads DIRECTION.
//
//  DIAGNOSTIC ONLY. Research zone; odds feed no rating.
//  Run: node_modules/.bin/jiti research/backtest/trendStudy.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../../src/lib/loadData';
import { normalizeWeightClassForMove, buildEloWithTraces, type FightTrace } from '../../src/lib/eloEngine';
import { predictFight } from '../../src/lib/fightPrediction';
import { buildNameIndex } from '../../src/lib/nameResolver';
import { buildPointInTimeIndex, resolveOddsName } from './pointInTime';
import { PitAdjuster } from './pitAdjust';
import { devig, type DevigMethod } from './devig';
import { score, sigmoid, logit, fitLogistic, type Prediction } from './metrics';
import type { Fight } from '../../src/lib/types';

const DEVIG: DevigMethod = 'shin';
const DAY_TOL = [0, 1, -1, 2, -2];
const SPLIT = '2024-01-01';
const WINDOW = 6;
const MIN_METRIC_FIGHTS = 4;

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

// ── pre-registered per-fighter trend features, strictly pre-bout ──
interface TrendRead {
  ok: boolean;          // ≥4 metric fights in window (else all features 0)
  strDiffTrend: number; // (newest-half mean − oldest-half mean) strike diff, /10
  absorbedTrend: number;// same construction on strikes absorbed, /10
  kdConceded: number;   // knockdowns conceded across the window (count)
  oppEloTrend: number;  // control: same construction on fight-time opp Elo, /100
  recentFinished: number; // losses by KO/TKO/SUB in last 6 BOUTS (trace walk)
}
const ZERO: TrendRead = { ok: false, strDiffTrend: 0, absorbedTrend: 0, kdConceded: 0, oppEloTrend: 0, recentFinished: 0 };

interface PerFight { landed: number; absorbed: number; kdConceded: number; oppElo: number | null }

function main(): void {
  const data = loadAllData();
  const idx = buildPointInTimeIndex(data);
  const nameIndex = buildNameIndex(data.fighters);
  const adjuster = new PitAdjuster(data);
  const { history } = buildEloWithTraces(data);
  const tracesById = new Map<string, FightTrace[]>();
  const oppEloByFight = new Map<string, Map<string, number>>(); // fighterId -> fightId -> fight-time opp rating
  for (const [id, traces] of history) {
    const chron = [...traces].sort((a, b) => (a.date < b.date ? -1 : 1));
    tracesById.set(id, chron);
    const m = new Map<string, number>();
    for (const t of chron) m.set(t.fightId, t.opponentRating);
    oppEloByFight.set(id, m);
  }

  // Per-fighter chronological metric-fight list (Fights.csv rows with metrics).
  const metricFightsById = new Map<string, { date: number; pf: PerFight }[]>();
  for (const [fid, fights] of data.fighterFights) {
    const oppMap = oppEloByFight.get(fid);
    const list: { date: number; pf: PerFight }[] = [];
    for (const f of fights as Fight[]) {
      if (!f.eventDate || f.hasMetrics === false) continue;
      const self1 = f.fighterId1 === fid;
      if (!self1 && f.fighterId2 !== fid) continue;
      list.push({
        date: f.eventDate.getTime(),
        pf: {
          landed: self1 ? f.str1 : f.str2,
          absorbed: self1 ? f.str2 : f.str1,
          kdConceded: self1 ? f.kd2 : f.kd1,
          oppElo: oppMap?.get(f.fightId) ?? null,
        },
      });
    }
    list.sort((a, b) => a.date - b.date);
    metricFightsById.set(fid, list);
  }

  const halfTrend = (vals: (number | null)[]): number => {
    const w = vals.length;
    const h = Math.floor(w / 2);
    const clean = (xs: (number | null)[]) => xs.filter((v): v is number => v != null);
    const oldest = clean(vals.slice(0, h));
    const newest = clean(vals.slice(w - h));
    if (!oldest.length || !newest.length) return 0;
    return mean(newest) - mean(oldest);
  };

  const trendRead = (fid: string, dateIso: string): TrendRead => {
    const cutoff = new Date(dateIso).getTime();
    const all = metricFightsById.get(fid) ?? [];
    const prior = all.filter((x) => x.date < cutoff);
    const win = prior.slice(-WINDOW);
    // recentFinished from the trace walk (all bouts, incl. metric-less)
    const traces = (tracesById.get(fid) ?? []).filter((t) => t.date < dateIso);
    const last6 = traces.slice(-6);
    const recentFinished = last6.filter((t) => t.result === 'L' && /ko|tko|sub/i.test(t.method)).length;
    if (win.length < MIN_METRIC_FIGHTS) return { ...ZERO, recentFinished: 0 };
    return {
      ok: true,
      strDiffTrend: halfTrend(win.map((x) => x.pf.landed - x.pf.absorbed)) / 10,
      absorbedTrend: halfTrend(win.map((x) => x.pf.absorbed)) / 10,
      kdConceded: win.reduce((s, x) => s + x.pf.kdConceded, 0),
      oppEloTrend: halfTrend(win.map((x) => x.pf.oppElo)) / 100,
      recentFinished,
    };
  };

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

  interface Row {
    date: string;
    pProd: number;
    pMkt: number;
    favWon: boolean;
    fav: TrendRead;
    dog: TrendRead;
  }
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
      pProd: pred.probA,
      pMkt: devig(f1IsFav ? c1 : c2, f1IsFav ? c2 : c1, DEVIG).pFav,
      favWon: favPit.result === 'W',
      fav: trendRead(favId, favPit.date),
      dog: trendRead(dogId, favPit.date),
    });
  }

  const affected = (r: Row) => r.fav.ok || r.dog.ok;
  console.log(`TREND STUDY — ${rows.length} odds-matched bouts (pair+date deduped); either side ≥${MIN_METRIC_FIGHTS} metric fights on ${rows.filter(affected).length}\n`);

  // ── descriptive phase: quartiles of each per-fighter feature ──
  console.log('━━ DESCRIPTIVE (per-fighter entries with ok windows; win rate vs model/market price) ━━');
  const sides = rows.flatMap((r) => [
    { read: r.fav, won: r.favWon, pModel: r.pProd, pMkt: r.pMkt },
    { read: r.dog, won: !r.favWon, pModel: 1 - r.pProd, pMkt: 1 - r.pMkt },
  ]).filter((s) => s.read.ok);
  const qReport = (label: string, get: (s: typeof sides[0]) => number) => {
    const sorted = [...sides].sort((a, b) => get(a) - get(b));
    const q = Math.floor(sorted.length / 4);
    console.log(`  ${label}:`);
    for (let i = 0; i < 4; i++) {
      const sl = sorted.slice(i * q, i === 3 ? sorted.length : (i + 1) * q);
      const wr = sl.filter((s) => s.won).length / sl.length;
      const vals = sl.map(get);
      console.log(
        `    Q${i + 1} [${mean(vals).toFixed(2).padStart(6)}]  n=${String(sl.length).padStart(4)}  won ${(100 * wr).toFixed(1)}%  model ${(100 * mean(sl.map((s) => s.pModel))).toFixed(1)}%  mkt ${(100 * mean(sl.map((s) => s.pMkt))).toFixed(1)}%`
      );
    }
  };
  qReport('F1 strDiffTrend (Δ strike diff /10)', (s) => s.read.strDiffTrend);
  qReport('F2 absorbedTrend (Δ absorbed /10)', (s) => s.read.absorbedTrend);
  qReport('C1 oppEloTrend (Δ opp Elo /100)', (s) => s.read.oppEloTrend);
  const catReport = (label: string, get: (s: typeof sides[0]) => number, cats: number[]) => {
    console.log(`  ${label}:`);
    for (const c of cats) {
      const sl = sides.filter((s) => (c === cats[cats.length - 1] ? get(s) >= c : get(s) === c));
      if (sl.length < 15) continue;
      const wr = sl.filter((s) => s.won).length / sl.length;
      console.log(
        `    ${c === cats[cats.length - 1] ? c + '+' : String(c)}  n=${String(sl.length).padStart(4)}  won ${(100 * wr).toFixed(1)}%  model ${(100 * mean(sl.map((s) => s.pModel))).toFixed(1)}%  mkt ${(100 * mean(sl.map((s) => s.pMkt))).toFixed(1)}%`
      );
    }
  };
  catReport('F3 recentFinished (finish losses, last 6 bouts)', (s) => s.read.recentFinished, [0, 1, 2, 3]);
  catReport('F4 kdConceded (KDs conceded, window)', (s) => s.read.kdConceded, [0, 1, 2, 3]);

  // ── inferential phase: the six pre-registered models, both offsets ──
  const train = rows.filter((r) => r.date < SPLIT);
  const test = rows.filter((r) => r.date >= SPLIT);
  const testAff = test.filter(affected);
  const testUnaff = test.filter((r) => !affected(r));

  type FeatFn = (r: Row) => number[];
  const d1: FeatFn = (r) => [r.fav.strDiffTrend - r.dog.strDiffTrend];
  const M: { name: string; feats: FeatFn }[] = [
    { name: 'T1 strDiffTrendDiff', feats: d1 },
    { name: 'T2 absorbedTrendDiff', feats: (r) => [r.fav.absorbedTrend - r.dog.absorbedTrend] },
    { name: 'T3 recentFinishedDiff', feats: (r) => [r.fav.recentFinished - r.dog.recentFinished] },
    { name: 'T4 kdConcededDiff', feats: (r) => [r.fav.kdConceded - r.dog.kdConceded] },
    { name: 'T5 T1 + oppEloTrendDiff', feats: (r) => [...d1(r), r.fav.oppEloTrend - r.dog.oppEloTrend] },
    {
      name: 'T6 trend block (F1..F4)',
      feats: (r) => [
        ...d1(r),
        r.fav.absorbedTrend - r.dog.absorbedTrend,
        r.fav.recentFinished - r.dog.recentFinished,
        r.fav.kdConceded - r.dog.kdConceded,
      ],
    },
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

  console.log('\nVERDICT RULE (pre-registered, production offset only): CONFIRMED iff test-affected t ≤ −2 AND test-unaffected t < +2 AND held-out refit keeps every sign. T5 additionally: T1 coef keeps sign within ~2× or F1 is a schedule artifact.');
}

main();
