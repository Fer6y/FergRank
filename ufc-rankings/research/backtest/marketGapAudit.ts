// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/marketGapAudit.ts — WHERE does the model miss the line?
//
//  Scores the PRODUCTION prediction surface (predictFight fed ranked ratings —
//  the same composition /upcoming, /compare and the Analyst show) against the
//  de-vigged BFO close on every odds-matched bout, then slices the per-bout
//  logloss gap and the signed probability divergence across every tag we can
//  reconstruct point-in-time: experience, division, gender, layoffs, weight
//  moves, chalk band, age gap, win/loss streaks, rematches.
//
//  For each slice: n · model LL · market LL · gap · paired t · accuracies ·
//  BIAS = (mean predicted fav prob − realized fav win rate) for model and
//  market — a signed over/under-rating read the raw gap can't give — plus who
//  wins the pick disagreements inside the slice.
//
//  DIAGNOSTIC ONLY. Odds feed no rating (research-zone firewall). No config
//  change is proposed here; this ranks where the misses live.
//
//  Run: node_modules/.bin/jiti research/backtest/marketGapAudit.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../../src/lib/loadData';
import { winProbability, normalizeWeightClassForMove, buildEloWithTraces, type FightTrace } from '../../src/lib/eloEngine';
import { predictFight } from '../../src/lib/fightPrediction';
import { buildNameIndex } from '../../src/lib/nameResolver';
import { buildPointInTimeIndex, resolveOddsName } from './pointInTime';
import { PitAdjuster } from './pitAdjust';
import { devig, type DevigMethod } from './devig';
import { score, reliability, type Prediction } from './metrics';

const DEVIG: DevigMethod = 'shin';
const DAY_TOL = [0, 1, -1, 2, -2];

function dayNum(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? NaN : Math.floor(t / 86_400_000);
}
const ll = (p: number, won: boolean): number =>
  -Math.log(Math.max(1e-12, won ? p : 1 - p));

interface Row {
  date: string;
  year: number;
  fav: string;
  dog: string;
  division: string;
  womens: boolean;
  pElo: number;
  pProd: number; // production: ranked ratings + overlay
  pMkt: number;
  favWon: boolean;
  minFightNo: number;
  favFightNo: number;
  dogFightNo: number;
  favLayoff: number;
  dogLayoff: number;
  favMove: boolean;
  dogMove: boolean;
  ageEdgeYears: number; // + = fav younger
  ageKnown: boolean;
  favStreak: number; // + = W streak entering, − = L streak
  dogStreak: number;
  rematch: boolean;
  favWonPrior: boolean; // last prior meeting, if rematch
}

function pairedT(diffs: number[]): { mean: number; t: number } {
  const n = diffs.length;
  if (n < 2) return { mean: NaN, t: NaN };
  const mean = diffs.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(diffs.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (n - 1));
  return { mean, t: sd > 0 ? mean / (sd / Math.sqrt(n)) : NaN };
}

// streak entering asOf: consecutive same results at the tail of pre-date traces
function streakBefore(traces: FightTrace[], dateIso: string): number {
  let s = 0;
  let sign: 'W' | 'L' | null = null;
  for (let i = traces.length - 1; i >= 0; i--) {
    const t = traces[i];
    if (t.date >= dateIso) continue;
    if (t.result === 'D') break;
    if (sign === null) sign = t.result as 'W' | 'L';
    if (t.result !== sign) break;
    s++;
  }
  return sign === 'L' ? -s : s;
}

function main(): void {
  const data = loadAllData();
  const idx = buildPointInTimeIndex(data);
  const nameIndex = buildNameIndex(data.fighters);
  const adjuster = new PitAdjuster(data);

  // own trace map for streak/rematch tags
  const { history } = buildEloWithTraces(data);
  const tracesById = new Map<string, FightTrace[]>();
  for (const [id, traces] of history) {
    tracesById.set(id, [...traces].sort((a, b) => (a.date < b.date ? -1 : 1)));
  }

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
  let unresolved = 0, noElo = 0;
  for (const r of bfo) {
    const c1 = parseFloat(r['close1']);
    const c2 = parseFloat(r['close2']);
    if (!(c1 > 1) || !(c2 > 1)) continue;
    const id1 = resolveOddsName(r['fighter1'], nameIndex);
    const id2 = resolveOddsName(r['fighter2'], nameIndex);
    if (!id1 || !id2) { unresolved++; continue; }
    const day = dayNum(r['date']);
    const p1 = lookup(id1, id2, day);
    const p2 = lookup(id2, id1, day);
    if (!p1 || !p2) { noElo++; continue; }

    const f1IsFav = c1 <= c2;
    const favId = f1IsFav ? id1 : id2;
    const dogId = f1IsFav ? id2 : id1;
    const favClose = f1IsFav ? c1 : c2;
    const dogClose = f1IsFav ? c2 : c1;
    const favPit = f1IsFav ? p1 : p2;
    const dogPit = f1IsFav ? p2 : p1;

    const division = normalizeWeightClassForMove(favPit.weightClass) ?? favPit.weightClass;
    const adjFav = adjuster.adjustment(favId, favPit.date, division);
    const adjDog = adjuster.adjustment(dogId, dogPit.date, division);
    const asOf = new Date(favPit.date);

    const pred = predictFight(
      data, favId, dogId,
      favPit.selfRating + adjFav, favPit.oppRating + adjDog,
      favPit.selfFightNo + 1, dogPit.selfFightNo + 1,
      asOf,
    );

    const favTraces = tracesById.get(favId) ?? [];
    const priors = favTraces.filter((t) => t.date < favPit.date && t.opponentId === dogId);
    const lastPrior = priors[priors.length - 1];

    rows.push({
      date: favPit.date.slice(0, 10),
      year: new Date(favPit.date).getFullYear(),
      fav: f1IsFav ? r['fighter1'] : r['fighter2'],
      dog: f1IsFav ? r['fighter2'] : r['fighter1'],
      division,
      womens: /women/i.test(division),
      pElo: winProbability(favPit.selfRating, favPit.oppRating),
      pProd: pred.probA,
      pMkt: devig(favClose, dogClose, DEVIG).pFav,
      favWon: favPit.result === 'W',
      minFightNo: Math.min(favPit.selfFightNo, dogPit.selfFightNo),
      favFightNo: favPit.selfFightNo,
      dogFightNo: dogPit.selfFightNo,
      favLayoff: favPit.selfLayoffMonths,
      dogLayoff: dogPit.selfLayoffMonths,
      favMove: favPit.selfWeightMove,
      dogMove: dogPit.selfWeightMove,
      ageEdgeYears: pred.ageEdgeYears,
      ageKnown: pred.ageLogit !== 0 || pred.ageEdgeYears !== 0,
      favStreak: streakBefore(favTraces, favPit.date),
      dogStreak: streakBefore(tracesById.get(dogId) ?? [], favPit.date),
      rematch: priors.length > 0,
      favWonPrior: lastPrior?.result === 'W',
    });
  }

  console.log(`MARKET-GAP AUDIT — production model (ranked + overlay) vs de-vigged close`);
  console.log(`matched ${rows.length} bouts (${unresolved} unresolved names, ${noElo} no PIT record) · de-vig=${DEVIG}\n`);

  // ── global scores + calibration ──
  const sProd = score(rows.map((r): Prediction => ({ p: r.pProd, won: r.favWon })));
  const sElo = score(rows.map((r): Prediction => ({ p: r.pElo, won: r.favWon })));
  const sMkt = score(rows.map((r): Prediction => ({ p: r.pMkt, won: r.favWon })));
  const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : '  –  ');
  console.log('GLOBAL                logloss    brier    acc      ECE');
  console.log(`  pure Elo            ${fmt(sElo.logLoss)}   ${fmt(sElo.brier)}  ${(100 * sElo.accuracy).toFixed(1)}%   ${fmt(sElo.ece)}`);
  console.log(`  production          ${fmt(sProd.logLoss)}   ${fmt(sProd.brier)}  ${(100 * sProd.accuracy).toFixed(1)}%   ${fmt(sProd.ece)}`);
  console.log(`  market close        ${fmt(sMkt.logLoss)}   ${fmt(sMkt.brier)}  ${(100 * sMkt.accuracy).toFixed(1)}%   ${fmt(sMkt.ece)}`);
  const g = pairedT(rows.map((r) => ll(r.pProd, r.favWon) - ll(r.pMkt, r.favWon)));
  console.log(`  gap (prod − mkt)    ${g.mean >= 0 ? '+' : ''}${g.mean.toFixed(4)} LL/bout   t=${g.t.toFixed(2)}\n`);

  console.log('CALIBRATION (production) — predicted fav prob vs realized:');
  for (const b of reliability(rows.map((r): Prediction => ({ p: r.pProd, won: r.favWon })), 10)) {
    if (!b.n) continue;
    console.log(`  ${(100 * b.lo).toFixed(0).padStart(3)}–${(100 * b.hi).toFixed(0).padEnd(3)}%  n=${String(b.n).padStart(4)}  pred ${(100 * b.predMean).toFixed(1)}%  realized ${(100 * b.realized).toFixed(1)}%  ${b.realized - b.predMean >= 0 ? '+' : ''}${(100 * (b.realized - b.predMean)).toFixed(1)}pt`);
  }
  console.log('');

  // ── slice engine ──
  interface Slice { label: string; test: (r: Row) => boolean }
  const slices: (Slice | null)[] = [
    { label: '━ EXPERIENCE (min prior fights of the two)', test: () => false },
    { label: '0–2 prior', test: (r) => r.minFightNo <= 2 },
    { label: '3–5 prior', test: (r) => r.minFightNo >= 3 && r.minFightNo <= 5 },
    { label: '6–9 prior', test: (r) => r.minFightNo >= 6 && r.minFightNo <= 9 },
    { label: '10+ prior', test: (r) => r.minFightNo >= 10 },
    { label: '━ CHALK BAND (market fav prob)', test: () => false },
    { label: 'mkt 50–60%', test: (r) => r.pMkt < 0.60 },
    { label: 'mkt 60–70%', test: (r) => r.pMkt >= 0.60 && r.pMkt < 0.70 },
    { label: 'mkt 70–80%', test: (r) => r.pMkt >= 0.70 && r.pMkt < 0.80 },
    { label: 'mkt 80%+', test: (r) => r.pMkt >= 0.80 },
    { label: '━ LAYOFF', test: () => false },
    { label: 'fav layoff 12mo+', test: (r) => r.favLayoff >= 12 },
    { label: 'dog layoff 12mo+', test: (r) => r.dogLayoff >= 12 },
    { label: 'either layoff 18mo+', test: (r) => r.favLayoff >= 18 || r.dogLayoff >= 18 },
    { label: 'both active (<8mo)', test: (r) => r.favLayoff < 8 && r.dogLayoff < 8 && r.favLayoff > 0 && r.dogLayoff > 0 },
    { label: '━ WEIGHT MOVE (division change vs prev fight)', test: () => false },
    { label: 'fav just moved', test: (r) => r.favMove },
    { label: 'dog just moved', test: (r) => r.dogMove },
    { label: '━ AGE (fighterAges @ fight date)', test: () => false },
    { label: 'fav older by 6y+', test: (r) => r.ageKnown && r.ageEdgeYears <= -6 },
    { label: 'fav younger by 6y+', test: (r) => r.ageKnown && r.ageEdgeYears >= 6 },
    { label: 'age unknown a side', test: (r) => !r.ageKnown },
    { label: '━ FORM (streak entering)', test: () => false },
    { label: 'fav on 2+ L streak', test: (r) => r.favStreak <= -2 },
    { label: 'dog on 2+ L streak', test: (r) => r.dogStreak <= -2 },
    { label: 'fav on 4+ W streak', test: (r) => r.favStreak >= 4 },
    { label: 'dog on 3+ W streak', test: (r) => r.dogStreak >= 3 },
    { label: '━ REMATCH', test: () => false },
    { label: 'rematch, fav won prior', test: (r) => r.rematch && r.favWonPrior },
    { label: 'rematch, fav lost prior', test: (r) => r.rematch && !r.favWonPrior },
    { label: '━ GENDER', test: () => false },
    { label: 'women\'s bouts', test: (r) => r.womens },
    { label: 'men\'s bouts', test: (r) => !r.womens },
    { label: '━ YEAR', test: () => false },
    ...[2021, 2022, 2023, 2024, 2025, 2026].map((y) => ({ label: `${y}`, test: (r: Row) => r.year === y })),
    { label: '━ DIVISION', test: () => false },
  ];
  const divs = [...new Set(rows.map((r) => r.division))].sort();
  for (const d of divs) slices.push({ label: d, test: (r) => r.division === d });

  console.log('SLICES — n · LL(prod) · LL(mkt) · gap(t) · acc prod/mkt · BIAS prod/mkt (mean pred − realized; + = overrates favs) · disagreements (model right–market right)');
  for (const s of slices) {
    if (!s) continue;
    if (s.label.startsWith('━')) { console.log(`\n${s.label}`); continue; }
    const sub = rows.filter(s.test);
    if (sub.length < 15) { console.log(`  ${s.label.padEnd(26)} n=${sub.length} — thin`); continue; }
    const p = score(sub.map((r): Prediction => ({ p: r.pProd, won: r.favWon })));
    const m = score(sub.map((r): Prediction => ({ p: r.pMkt, won: r.favWon })));
    const d = pairedT(sub.map((r) => ll(r.pProd, r.favWon) - ll(r.pMkt, r.favWon)));
    const realized = sub.filter((r) => r.favWon).length / sub.length;
    const biasP = sub.reduce((s2, r) => s2 + r.pProd, 0) / sub.length - realized;
    const biasM = sub.reduce((s2, r) => s2 + r.pMkt, 0) / sub.length - realized;
    const dis = sub.filter((r) => (r.pProd >= 0.5) !== (r.pMkt >= 0.5));
    const modelRight = dis.filter((r) => (r.pProd >= 0.5) === r.favWon).length;
    console.log(
      `  ${s.label.padEnd(26)} n=${String(sub.length).padStart(4)}  ${p.logLoss.toFixed(4)} vs ${m.logLoss.toFixed(4)}  gap ${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(4)} (t ${Number.isFinite(d.t) ? d.t.toFixed(1) : '–'})  acc ${(100 * p.accuracy).toFixed(0)}/${(100 * m.accuracy).toFixed(0)}%  bias ${biasP >= 0 ? '+' : ''}${(100 * biasP).toFixed(1)}/${biasM >= 0 ? '+' : ''}${(100 * biasM).toFixed(1)}pt  dis ${modelRight}–${dis.length - modelRight}`
    );
  }

  // ── divergence buckets: when we differ from the line, who is right? ──
  console.log('\nDIVERGENCE FROM THE LINE (pProd − pMkt) — realized vs both:');
  const bands: { label: string; lo: number; hi: number }[] = [
    { label: 'model −15pt or more below', lo: -1, hi: -0.15 },
    { label: 'model −15…−8pt below', lo: -0.15, hi: -0.08 },
    { label: 'model −8…−3pt below', lo: -0.08, hi: -0.03 },
    { label: 'agree (±3pt)', lo: -0.03, hi: 0.03 },
    { label: 'model +3…+8pt above', lo: 0.03, hi: 0.08 },
    { label: 'model +8…+15pt above', lo: 0.08, hi: 0.15 },
    { label: 'model +15pt or more above', lo: 0.15, hi: 1 },
  ];
  for (const b of bands) {
    const sub = rows.filter((r) => {
      const dv = r.pProd - r.pMkt;
      return dv >= b.lo && dv < b.hi;
    });
    if (!sub.length) continue;
    const realized = sub.filter((r) => r.favWon).length / sub.length;
    const mProd = sub.reduce((s2, r) => s2 + r.pProd, 0) / sub.length;
    const mMkt = sub.reduce((s2, r) => s2 + r.pMkt, 0) / sub.length;
    console.log(
      `  ${b.label.padEnd(28)} n=${String(sub.length).padStart(4)}  model ${(100 * mProd).toFixed(1)}%  mkt ${(100 * mMkt).toFixed(1)}%  realized ${(100 * realized).toFixed(1)}%`
    );
  }

  // ── biggest per-bout misses vs the line (for qualitative pattern reading) ──
  console.log('\nBIGGEST PER-BOUT LOGLOSS GAPS vs the market (top 25):');
  const worst = rows
    .map((r) => ({ r, d: ll(r.pProd, r.favWon) - ll(r.pMkt, r.favWon) }))
    .sort((a, b) => b.d - a.d)
    .slice(0, 25);
  for (const { r, d } of worst) {
    const winner = r.favWon ? r.fav : r.dog;
    const tags = [
      r.minFightNo <= 2 ? 'newcomer' : '',
      r.favMove || r.dogMove ? 'move' : '',
      r.favLayoff >= 12 || r.dogLayoff >= 12 ? 'layoff' : '',
      r.rematch ? 'rematch' : '',
      r.womens ? 'W' : '',
    ].filter(Boolean).join(',');
    console.log(
      `  ${r.date}  ${r.fav.padEnd(24)} model ${(100 * r.pProd).toFixed(0)}% mkt ${(100 * r.pMkt).toFixed(0)}%  won: ${winner.padEnd(24)} ΔLL +${d.toFixed(2)}  ${tags}`
    );
  }
}

main();
