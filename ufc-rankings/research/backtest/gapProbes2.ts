// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/gapProbes2.ts — two follow-ups to gapProbes.ts:
//
//  A2. SHADE-FLOOR SWEEP on the 2023+ regime (matches the 2026-08-11
//      shadeFloorTest protocol's re-test condition): floors {0.25, 0.5,
//      0.75, 1.0} scored on 2023–2024-08 (choose) and 2024-09+ (confirm),
//      shade-binding bouts only. Monotone agreement across both halves is
//      the ship signal the original test asked for.
//
//  B2. ESPN DOB COUNTERFACTUAL: for age-dark bouts, compute the age logit
//      the production formula WOULD emit with the merged ESPN birthdates
//      (data/regional_dob_merged.csv), add it exactly where predictFight
//      would (inside the conf multiplier), and paired-test vs production.
//      No fitting — production coefficients as-is — so no split needed;
//      reported on all age-dark bouts and 2023+ only.
//
//  Run: node_modules/.bin/jiti research/backtest/gapProbes2.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../../src/lib/loadData';
import { normalizeWeightClassForMove } from '../../src/lib/eloEngine';
import { predictFight } from '../../src/lib/fightPrediction';
import { getFighterAge } from '../../src/lib/fighterAges';
import { RANKING_CONFIG } from '../../src/lib/rankingConfig';
import { buildNameIndex } from '../../src/lib/nameResolver';
import { buildPointInTimeIndex, resolveOddsName } from './pointInTime';
import { PitAdjuster } from './pitAdjust';
import { devig, type DevigMethod } from './devig';
import { score, sigmoid, logit, type Prediction } from './metrics';

const DEVIG: DevigMethod = 'shin';
const DAY_TOL = [0, 1, -1, 2, -2];

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

function nameKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

interface Row {
  date: string;
  pProd: number;
  conf: number;
  minFights: number; // min(favFightNo, dogFightNo) entering — drives conf
  pMkt: number;
  favWon: boolean;
  ageDark: boolean;
  espnAgeLogit: number | null; // fav-perspective age logit from merged DOBs (dark bouts only)
}

function main(): void {
  const data = loadAllData();
  const idx = buildPointInTimeIndex(data);
  const nameIndex = buildNameIndex(data.fighters);
  const adjuster = new PitAdjuster(data);
  const cfg = RANKING_CONFIG.winProbModel;

  const merged = new Map<string, string>(); // nameKey → dob
  for (const m of Papa.parse<Record<string, string>>(
    fs.readFileSync(path.join(process.cwd(), 'data', 'regional_dob_merged.csv'), 'utf-8'),
    { header: true, skipEmptyLines: true }
  ).data) merged.set(m['nameKey'], m['dob']);

  const fighterName = new Map<string, string>();
  for (const f of data.fighters) fighterName.set(f.fighterId, f.fullName);

  const ageAt = (id: string, asOf: Date): number | null => {
    const known = getFighterAge(id, asOf);
    if (known) return known.age;
    const nm = fighterName.get(id);
    const dob = nm ? merged.get(nameKey(nm)) : undefined;
    if (!dob) return null;
    const t = new Date(dob).getTime();
    if (Number.isNaN(t)) return null;
    return (asOf.getTime() - t) / (365.25 * 86_400_000);
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

  const rows: Row[] = [];
  for (const r of bfo) {
    const c1 = parseFloat(r['close1']);
    const c2 = parseFloat(r['close2']);
    if (!(c1 > 1) || !(c2 > 1)) continue;
    const id1 = resolveOddsName(r['fighter1'], nameIndex);
    const id2 = resolveOddsName(r['fighter2'], nameIndex);
    if (!id1 || !id2) continue;
    const day = dayNum(r['date']);
    const p1 = lookup(id1, id2, day);
    const p2 = lookup(id2, id1, day);
    if (!p1 || !p2) continue;

    const f1IsFav = c1 <= c2;
    const favId = f1IsFav ? id1 : id2;
    const dogId = f1IsFav ? id2 : id1;
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

    const ageDark = getFighterAge(favId, asOf) == null || getFighterAge(dogId, asOf) == null;
    let espnAgeLogit: number | null = null;
    if (ageDark) {
      const aFav = ageAt(favId, asOf);
      const aDog = ageAt(dogId, asOf);
      if (aFav != null && aDog != null) {
        const edge = aDog - aFav; // + = fav younger
        espnAgeLogit = cfg.overlayShrink * cfg.ageEdgeCoef * cfg.ageSaturationYears * Math.tanh(edge / cfg.ageSaturationYears);
      }
    }

    rows.push({
      date: favPit.date.slice(0, 10),
      pProd: pred.probA,
      conf: pred.confidence,
      minFights: Math.min(favPit.selfFightNo, dogPit.selfFightNo),
      pMkt: devig(f1IsFav ? c1 : c2, f1IsFav ? c2 : c1, DEVIG).pFav,
      favWon: favPit.result === 'W',
      ageDark,
      espnAgeLogit,
    });
  }
  console.log(`joined ${rows.length} bouts\n`);

  // ── A2: shade-floor sweep, 2023+ split into choose/confirm halves ──
  console.log('━━ A2: SHADE-FLOOR SWEEP (shade-binding bouts, conf<1) ━━');
  const withFloor = (r: Row, floor: number): number => {
    const raw = logit(r.pProd) / r.conf; // (base+adj), exact
    const confF = Math.max(floor, Math.min(1, r.minFights / RANKING_CONFIG.elo.provisionalFights));
    return sigmoid(raw * confF);
  };
  for (const [label, filt] of [
    ['choose: 2023-01 → 2024-08', (r: Row) => r.date >= '2023-01-01' && r.date < '2024-09-01'],
    ['confirm: 2024-09 →', (r: Row) => r.date >= '2024-09-01'],
    ['pooled 2023+', (r: Row) => r.date >= '2023-01-01'],
  ] as const) {
    const sub = rows.filter((r) => r.conf < 1 && filt(r));
    const line = [0.25, 0.5, 0.75, 1.0]
      .map((f) => {
        const s = score(sub.map((r): Prediction => ({ p: withFloor(r, f), won: r.favWon })));
        return `floor ${f.toFixed(2)}: ${s.logLoss.toFixed(4)}`;
      })
      .join('   ');
    console.log(`  ${label} (n=${sub.length})   ${line}`);
  }

  // ── B2: ESPN DOB counterfactual on age-dark bouts ──
  console.log('\n━━ B2: ESPN DOB COUNTERFACTUAL (production age formula, no fitting) ━━');
  const withEspnAge = (r: Row): number =>
    r.espnAgeLogit == null ? r.pProd : sigmoid(logit(r.pProd) + r.conf * r.espnAgeLogit);
  for (const [label, filt] of [
    ['all age-dark bouts', (r: Row) => r.ageDark],
    ['age-dark, DOB recovered', (r: Row) => r.ageDark && r.espnAgeLogit != null],
    ['age-dark 2023+', (r: Row) => r.ageDark && r.date >= '2023-01-01'],
  ] as const) {
    const sub = rows.filter(filt);
    if (sub.length < 10) { console.log(`  ${label}: n=${sub.length} thin`); continue; }
    const a = score(sub.map((r): Prediction => ({ p: r.pProd, won: r.favWon })));
    const b = score(sub.map((r): Prediction => ({ p: withEspnAge(r), won: r.favWon })));
    const m = score(sub.map((r): Prediction => ({ p: r.pMkt, won: r.favWon })));
    const d = pairedT(sub.map((r) => ll(withEspnAge(r), r.favWon) - ll(r.pProd, r.favWon)));
    console.log(`  ${label}: n=${sub.length}  LL ${a.logLoss.toFixed(4)} → ${b.logLoss.toFixed(4)} (mkt ${m.logLoss.toFixed(4)})  acc ${(100 * a.accuracy).toFixed(1)}% → ${(100 * b.accuracy).toFixed(1)}% (mkt ${(100 * m.accuracy).toFixed(1)}%)  paired Δ ${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(4)} (t ${d.t.toFixed(2)})`);
  }

  // ── COMBINED: shade removed (floor 1.0) + ESPN age, vs production ──
  console.log('\n━━ COMBINED: shade floor → 1.0 AND ESPN DOBs (2023+ regime) ━━');
  const combined = (r: Row): number => {
    const raw = logit(r.pProd) / r.conf + (r.espnAgeLogit ?? 0); // conf→1, ESPN age added pre-shade
    return sigmoid(raw);
  };
  for (const [label, filt] of [
    ['2023+ all bouts', (r: Row) => r.date >= '2023-01-01'],
    ['2023+ affected only (shade binds or age-dark)', (r: Row) => r.date >= '2023-01-01' && (r.conf < 1 || r.ageDark)],
    ['2021–22 all bouts (old regime, reference)', (r: Row) => r.date < '2023-01-01'],
  ] as const) {
    const sub = rows.filter(filt);
    const a = score(sub.map((r): Prediction => ({ p: r.pProd, won: r.favWon })));
    const b = score(sub.map((r): Prediction => ({ p: combined(r), won: r.favWon })));
    const m = score(sub.map((r): Prediction => ({ p: r.pMkt, won: r.favWon })));
    const d = pairedT(sub.map((r) => ll(combined(r), r.favWon) - ll(r.pProd, r.favWon)));
    console.log(`  ${label}: n=${sub.length}  LL ${a.logLoss.toFixed(4)} → ${b.logLoss.toFixed(4)} (mkt ${m.logLoss.toFixed(4)})  acc ${(100 * a.accuracy).toFixed(1)}% → ${(100 * b.accuracy).toFixed(1)}% (mkt ${(100 * m.accuracy).toFixed(1)}%)  paired Δ ${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(4)} (t ${d.t.toFixed(2)})`);
  }
}

main();
