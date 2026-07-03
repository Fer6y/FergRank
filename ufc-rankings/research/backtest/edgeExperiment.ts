// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/edgeExperiment.ts — can we close the gap to the close?
//
//  Firewalled research. Trains WALK-FORWARD (expanding window, chronological —
//  every prediction uses only earlier fights, zero leakage) on all BFO-matched
//  established bouts, and asks whether cheap, leak-free additions move the model
//  toward the market:
//     A. Elo raw            — production win-prob (baseline)
//     B. Elo recalibrated   — 1-feature logistic on logit(Elo) (Platt)
//     C. Elo + context      — + age / reach / layoff / weight-move / experience
//                              diffs (what the market prices, Elo ignores)
//     D. Blend(Elo, market) — logit(Elo)+logit(market): does Elo add anything?
//     MARKET                — de-vigged BFO close (benchmark)
//
//  Reports proper scores (logloss/brier/acc/ECE) on the OOS eval set, both the
//  last-50-card window and the full OOS span, plus the full-sample standardized
//  coefficients so the useful features (and their sign) are visible.
//
//  Run: node_modules/.bin/jiti research/backtest/edgeExperiment.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData, type LoadedData } from '../../src/lib/loadData';
import type { Fight } from '../../src/lib/types';
import { winProbability } from '../../src/lib/eloEngine';
import { RANKING_CONFIG } from '../../src/lib/rankingConfig';
import { buildNameIndex } from '../../src/lib/nameResolver';
import { getFighterAge } from '../../src/lib/fighterAges';
import { styleProfile, styleMatchup } from '../../src/lib/fightPrediction';
import { buildPointInTimeIndex, resolveOddsName } from './pointInTime';
import { devig, type DevigMethod } from './devig';
import { score, fitLogistic, predictLogistic, logit, type Prediction } from './metrics';

const MIN_FIGHTNO = 6;               // both fighters >5 prior bouts
const DEVIG: DevigMethod = 'shin';
const WINDOW_CARDS = 50;             // reporting window for the "recent" subset
const MIN_TRAIN = 120;               // warmup before a fold is scored
const RIDGE = 1.5;                   // on standardized features — guards overfit
const EXCLUDE = /road to ufc|contender series|dana white/i;
const DAY_TOL = [0, 1, -1, 2, -2];

function dayNum(iso: string): number { const t = new Date(iso).getTime(); return Number.isNaN(t) ? NaN : Math.floor(t / 86_400_000); }
function norm(s: string): string { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ''); }
function pairKey(a: string, b: string): string { return [norm(a), norm(b)].sort().join('|'); }

function buildEventNameLookup(data: LoadedData): (f: Fight) => string {
  const fp = path.join(process.cwd(), 'data', 'recent_ufc_fights.csv');
  const rec = new Map<string, string>();
  if (fs.existsSync(fp)) {
    const rows = Papa.parse<Record<string, string>>(fs.readFileSync(fp, 'utf-8'), { header: true, skipEmptyLines: true }).data;
    for (const r of rows) if (r['eventName']) rec.set(`${pairKey(r['fighter1_name'], r['fighter2_name'])}|${r['date']}`, r['eventName']);
  }
  return (f: Fight) => {
    if (f.eventId) { const ev = data.events.get(f.eventId); if (ev?.name) return ev.name; }
    const d = f.eventDate ? f.eventDate.toISOString().slice(0, 10) : '';
    return rec.get(`${pairKey(f.fighter1Name, f.fighter2Name)}|${d}`) ?? '';
  };
}
function lastNCardCutoff(data: LoadedData, n: number): string {
  const nameOf = buildEventNameLookup(data);
  const byEvent = new Map<string, string>();
  for (const f of data.fights) {
    if (!f.eventDate) continue;
    const name = nameOf(f); if (!name || EXCLUDE.test(name)) continue;
    const d = f.eventDate.toISOString().slice(0, 10);
    if (!byEvent.has(name) || d > byEvent.get(name)!) byEvent.set(name, d);
  }
  const dates = [...byEvent.values()].sort((a, b) => (a < b ? 1 : -1)).slice(0, n);
  return dates[dates.length - 1];
}

interface Sample {
  date: string; favWon: boolean;
  eloLogit: number; mktLogit: number;
  ageEdge: number; grapEdge: number; strEdge: number; powEdge: number;
}
const CTX_KEYS = ['ageEdge', 'grapEdge', 'strEdge', 'powEdge'] as const;

function main() {
  const data = loadAllData();
  const idx = buildPointInTimeIndex(data);
  const nameIndex = buildNameIndex(data.fighters);
  const lookup = (a: string, b: string, day: number) => { for (const o of DAY_TOL) { const h = idx.get(`${a}#${b}#${day + o}`); if (h) return h; } return null; };

  const bfo = Papa.parse<Record<string, string>>(fs.readFileSync(path.join(process.cwd(), 'data', 'bfo_odds.csv'), 'utf-8'), { header: true, skipEmptyLines: true }).data;

  const samples: Sample[] = [];
  let ageCov = 0, reachCov = 0;
  for (const r of bfo) {
    const c1 = parseFloat(r['close1']); const c2 = parseFloat(r['close2']);
    if (!(c1 > 1) || !(c2 > 1)) continue;
    const id1 = resolveOddsName(r['fighter1'], nameIndex); const id2 = resolveOddsName(r['fighter2'], nameIndex);
    if (!id1 || !id2) continue;
    const day = dayNum(r['date']);
    const p1 = lookup(id1, id2, day); if (!p1) continue;
    const p2 = lookup(id2, id1, day);
    if (p1.selfFightNo < MIN_FIGHTNO || (p2?.selfFightNo ?? 0) < MIN_FIGHTNO) continue;

    // Frame from the ELO favourite (higher pre-fight rating) — production-legitimate:
    // the model always knows its own favourite, whereas the market's favourite is
    // information a standalone model doesn't have at prediction time.
    const f1IsFav = winProbability(p1.selfRating, p1.oppRating) >= 0.5;
    const favId = f1IsFav ? id1 : id2; const dogId = f1IsFav ? id2 : id1;
    const favClose = f1IsFav ? c1 : c2; const dogClose = f1IsFav ? c2 : c1;
    const favPit = f1IsFav ? p1 : p2!;
    const at = new Date(p1.date);
    const favAge = getFighterAge(favId, at)?.age ?? null; const dogAge = getFighterAge(dogId, at)?.age ?? null;
    // Point-in-time style profiles (fights strictly before this bout → leak-free).
    const favProf = styleProfile(data, favId, at); const dogProf = styleProfile(data, dogId, at);
    const sm = favProf && dogProf && favProf.fights >= 3 && dogProf.fights >= 3 ? styleMatchup(favProf, dogProf) : null;
    if (favAge != null && dogAge != null) ageCov++;
    if (sm) reachCov++;

    samples.push({
      date: p1.date.slice(0, 10),
      favWon: favPit.result === 'W',
      eloLogit: logit(winProbability(favPit.selfRating, favPit.oppRating)),
      mktLogit: logit(devig(favClose, dogClose, DEVIG).pFav),
      ageEdge: (favAge != null && dogAge != null) ? dogAge - favAge : 0, // + = favourite is younger
      grapEdge: sm ? sm.grapplingEdge : 0,
      strEdge: sm ? sm.strikingEdge : 0,
      powEdge: sm ? sm.powerEdge : 0,
    });
  }
  samples.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Feature extractors per model.
  const feats: Record<string, (s: Sample) => number[]> = {
    recal: (s) => [s.eloLogit],
    context: (s) => [s.eloLogit, ...CTX_KEYS.map((k) => s[k])],
    blend: (s) => [s.eloLogit, s.mktLogit],
  };

  // Standardize columns by training mean/std.
  function standardizer(rows: number[][]) {
    const k = rows[0].length;
    const mean = new Array(k).fill(0), std = new Array(k).fill(0);
    for (const r of rows) for (let j = 0; j < k; j++) mean[j] += r[j] / rows.length;
    for (const r of rows) for (let j = 0; j < k; j++) std[j] += (r[j] - mean[j]) ** 2 / rows.length;
    for (let j = 0; j < k; j++) std[j] = Math.sqrt(std[j]) || 1;
    return (r: number[]) => r.map((v, j) => (v - mean[j]) / std[j]);
  }

  // Walk-forward: predict each card from a model fit on all strictly-earlier cards.
  const cards = [...new Set(samples.map((s) => s.date))].sort();
  function walkForward(featFn: (s: Sample) => number[]): (Prediction & { date: string })[] {
    const trainRaw: number[][] = []; const trainY: number[] = [];
    const out: (Prediction & { date: string })[] = [];
    for (const d of cards) {
      const card = samples.filter((s) => s.date === d);
      if (trainRaw.length >= MIN_TRAIN) {
        const std = standardizer(trainRaw);
        const w = fitLogistic(trainRaw.map(std), trainY, 30, RIDGE);
        for (const s of card) out.push({ p: predictLogistic(w, std(featFn(s))), won: s.favWon, date: s.date });
      }
      for (const s of card) { trainRaw.push(featFn(s)); trainY.push(s.favWon ? 1 : 0); }
    }
    return out;
  }

  const cutoff = lastNCardCutoff(data, WINDOW_CARDS);
  const evalDates = new Set<string>();
  { // eval set = cards scored under warmup (same for every model)
    let n = 0; for (const d of cards) { if (n >= MIN_TRAIN) evalDates.add(d); n += samples.filter((s) => s.date === d).length; }
  }
  const evalSamples = samples.filter((s) => evalDates.has(s.date));
  const baseline = (pFn: (s: Sample) => number): (Prediction & { date: string })[] =>
    evalSamples.map((s) => ({ p: pFn(s), won: s.favWon, date: s.date }));

  // The SHIPPED product formula (fixed config coefficients, no fitting) — the
  // real proof that fightPrediction.ts beats pure Elo out of sample.
  const wm = RANKING_CONFIG.winProbModel;
  const cl = (x: number) => Math.max(-wm.maxAdjustmentLogit, Math.min(wm.maxAdjustmentLogit, x));
  const productLogit = (s: Sample) => s.eloLogit + cl(
    wm.ageEdgeCoef * s.ageEdge + wm.grapplingEdgeCoef * s.grapEdge +
    wm.strikingEdgeCoef * s.strEdge + wm.powerEdgeCoef * s.powEdge);

  const models: Record<string, (Prediction & { date: string })[]> = {
    'A. Elo raw       ': baseline((s) => 1 / (1 + Math.exp(-s.eloLogit))),
    'P. PRODUCT (cfg) ': baseline((s) => 1 / (1 + Math.exp(-productLogit(s)))),
    'C. Elo+ctx (fit) ': walkForward(feats.context),
    'D. Blend(Elo,mkt)': walkForward(feats.blend),
    'MARKET close     ': baseline((s) => 1 / (1 + Math.exp(-s.mktLogit))),
  };

  const sub = (rows: (Prediction & { date: string })[], recent: boolean) =>
    rows.filter((r) => (recent ? r.date >= cutoff : true));

  console.log(`EDGE EXPERIMENT — walk-forward, established BFO bouts (both >5 UFC fights)`);
  console.log(`Assembled ${samples.length} matched bouts (${samples[0]?.date} → ${samples[samples.length - 1]?.date}); age cover ${(100 * ageCov / samples.length).toFixed(0)}%, style cover ${(100 * reachCov / samples.length).toFixed(0)}%`);
  console.log(`OOS eval set ${evalSamples.length} bouts after ${MIN_TRAIN}-fight warmup; last-${WINDOW_CARDS}-card subset = date ≥ ${cutoff}\n`);

  for (const [scope, recent] of [['── LAST 50 CARDS (OOS) ──', true], ['── FULL OOS SPAN ──', false]] as [string, boolean][]) {
    console.log(scope);
    console.log('  model               n    logloss   brier   acc     ECE');
    for (const [name, rows] of Object.entries(models)) {
      const sc = score(sub(rows, recent));
      console.log(`  ${name}  ${String(sc.n).padStart(3)}   ${sc.logLoss.toFixed(3)}    ${sc.brier.toFixed(3)}   ${(100 * sc.accuracy).toFixed(1)}%   ${sc.ece.toFixed(3)}`);
    }
    console.log('');
  }

  // Full-sample standardized coefficients (interpretation only).
  const std = standardizer(samples.map(feats.context));
  const w = fitLogistic(samples.map((s) => std(feats.context(s))), samples.map((s) => (s.favWon ? 1 : 0)), 40, RIDGE);
  const labels = ['(intercept)', 'eloLogit', ...CTX_KEYS];
  console.log('CONTEXT-MODEL standardized weights (sign = direction of favourite-win signal):');
  labels.forEach((lab, i) => console.log(`  ${lab.padEnd(12)} ${w[i] >= 0 ? '+' : '−'}${Math.abs(w[i]).toFixed(3)}`));
  console.log('\n  (a big +eloLogit = Elo dominates; nonzero context weight = signal Elo misses.)');

  // CONFIG coefficients: fit the add-ons with eloLogit FIXED at 1 (offset) — we
  // trust the calibrated Elo scale and only learn what to add. Intercept dropped
  // for the product (features are antisymmetric → symmetric probability). These
  // map straight onto RANKING_CONFIG.winProbModel (logit = eloLogit + Σ coef·feat).
  const addOn = fitLogistic(
    samples.map((s) => CTX_KEYS.map((k) => s[k])),
    samples.map((s) => (s.favWon ? 1 : 0)),
    40, 1e-3,
    samples.map((s) => s.eloLogit),
  );
  console.log('\n→ CONFIG coefficients (eloLogit fixed at 1 via offset; drop intercept):');
  console.log(`  (intercept ${addOn[0].toFixed(3)} — not used in the symmetric product model)`);
  CTX_KEYS.forEach((k, i) => console.log(`  ${k.padEnd(9)} ${addOn[1 + i].toFixed(4)}`));
}

main();
