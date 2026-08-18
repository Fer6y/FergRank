// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/gapProbes.ts — three targeted probes from marketGapAudit:
//
//  A. SHADE FLOOR (pre-registered re-test, condition now met): the 2026-08-11
//     shadeFloorTest found the confirm half monotone toward NO shade and wrote
//     the re-test condition "re-run with 2023+ as the choose half once another
//     year of odds exists". We now have 2024–2026. Paired test of production
//     vs production-with-shade-removed (conf→1) on 2023+, overall and on the
//     0–2-prior bucket where the shade binds.
//
//  B. AGE BLINDNESS: 34% of odds-matched bouts run with the age overlay dark
//     (a side has no DOB in canonical/fighter_dob.csv), and that slice's
//     accuracy gap to the market is the widest in the audit (54% vs 66%). The
//     ESPN harvest (data/regional_dob_merged.csv, 12k verified DOBs) exists
//     but is not wired into fighterAges. Count how many age-dark bouts it
//     would light up — a pure data fix, zero model change.
//
//  C. ARRIVAL REGIONAL ELO as a debut-bout feature: the market's biggest edge
//     is on 0–2-prior newcomers, exactly where our Elo is a near-blank ~1500.
//     We already hold each arrival's pre-UFC regional rating snapshotted
//     BEFORE their debut (data/regional_arrival.csv — frozen, non-leaky).
//     Fit ONE slope on 2021–2023 (orientation-symmetrized, offset = the
//     production logit), score 2024+. Exploratory: a positive result means a
//     pre-registered gate is worth writing, not that anything ships.
//
//  Run: node_modules/.bin/jiti research/backtest/gapProbes.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../../src/lib/loadData';
import { normalizeWeightClassForMove } from '../../src/lib/eloEngine';
import { predictFight } from '../../src/lib/fightPrediction';
import { getFighterAge } from '../../src/lib/fighterAges';
import { buildNameIndex } from '../../src/lib/nameResolver';
import { buildPointInTimeIndex, resolveOddsName } from './pointInTime';
import { PitAdjuster } from './pitAdjust';
import { devig, type DevigMethod } from './devig';
import { score, sigmoid, logit, fitLogistic, type Prediction } from './metrics';

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

// token-sorted name key, mirroring regional_dob_merged.csv's nameKey
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
  favId: string;
  dogId: string;
  pProd: number;
  conf: number;
  pMkt: number;
  favWon: boolean;
  minFightNo: number;
  favFightNo: number;
  dogFightNo: number;
  ageDark: boolean;
  darkIds: string[];
}

function main(): void {
  const data = loadAllData();
  const idx = buildPointInTimeIndex(data);
  const nameIndex = buildNameIndex(data.fighters);
  const adjuster = new PitAdjuster(data);

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

    const darkIds = [favId, dogId].filter((id) => getFighterAge(id, asOf) == null);

    rows.push({
      date: favPit.date.slice(0, 10),
      favId, dogId,
      pProd: pred.probA,
      conf: pred.confidence,
      pMkt: devig(f1IsFav ? c1 : c2, f1IsFav ? c2 : c1, DEVIG).pFav,
      favWon: favPit.result === 'W',
      minFightNo: Math.min(favPit.selfFightNo, dogPit.selfFightNo),
      favFightNo: favPit.selfFightNo,
      dogFightNo: dogPit.selfFightNo,
      ageDark: darkIds.length > 0,
      darkIds,
    });
  }
  console.log(`joined ${rows.length} odds-matched bouts\n`);

  // ── PROBE A: shade floor on 2023+ ──
  console.log('━━ PROBE A: SHADE FLOOR (pre-registered re-test — 2023+ data) ━━');
  const unshade = (r: Row) => sigmoid(logit(r.pProd) / r.conf);
  for (const [label, filt] of [
    ['2023+ all bouts', (r: Row) => r.date >= '2023-01-01'],
    ['2023+ 0–2 prior', (r: Row) => r.date >= '2023-01-01' && r.minFightNo <= 2],
    ['2023+ 3–5 prior', (r: Row) => r.date >= '2023-01-01' && r.minFightNo >= 3 && r.minFightNo <= 5],
    ['2021–22 0–2 prior (old regime, reference)', (r: Row) => r.date < '2023-01-01' && r.minFightNo <= 2],
  ] as const) {
    const sub = rows.filter(filt);
    const shaded = sub.filter((r) => r.conf < 1); // shade actually binding
    const d = pairedT(shaded.map((r) => ll(unshade(r), r.favWon) - ll(r.pProd, r.favWon)));
    const a = score(shaded.map((r): Prediction => ({ p: r.pProd, won: r.favWon })));
    const c = score(shaded.map((r): Prediction => ({ p: unshade(r), won: r.favWon })));
    console.log(`  ${label}: shade binds on n=${shaded.length}`);
    if (shaded.length >= 10)
      console.log(`    shaded LL ${a.logLoss.toFixed(4)} → unshaded ${c.logLoss.toFixed(4)}   paired Δ ${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(4)} (t ${d.t.toFixed(2)}; negative = removing the shade helps)`);
  }

  // ── PROBE B: age blindness vs the ESPN merged DOB file ──
  console.log('\n━━ PROBE B: AGE-DARK BOUTS vs data/regional_dob_merged.csv ━━');
  const merged = Papa.parse<Record<string, string>>(
    fs.readFileSync(path.join(process.cwd(), 'data', 'regional_dob_merged.csv'), 'utf-8'),
    { header: true, skipEmptyLines: true }
  ).data;
  const mergedKeys = new Set(merged.map((m) => m['nameKey']));
  const fighterName = new Map<string, string>();
  for (const f of data.fighters) fighterName.set(f.fighterId, f.fullName);

  const darkBouts = rows.filter((r) => r.ageDark);
  const darkFighters = new Set(darkBouts.flatMap((r) => r.darkIds));
  let coveredFighters = 0;
  for (const id of darkFighters) {
    const nm = fighterName.get(id);
    if (nm && mergedKeys.has(nameKey(nm))) coveredFighters++;
  }
  const rescuable = darkBouts.filter((r) =>
    r.darkIds.every((id) => {
      const nm = fighterName.get(id);
      return nm && mergedKeys.has(nameKey(nm));
    })
  );
  console.log(`  age-dark bouts: ${darkBouts.length}/${rows.length} (${(100 * darkBouts.length / rows.length).toFixed(0)}%)`);
  console.log(`  distinct DOB-missing fighters in those bouts: ${darkFighters.size}; found in ESPN merged file: ${coveredFighters} (${(100 * coveredFighters / darkFighters.size).toFixed(0)}%)`);
  console.log(`  bouts fully rescued (every dark side found): ${rescuable.length}/${darkBouts.length} (${(100 * rescuable.length / darkBouts.length).toFixed(0)}%)`);

  // ── PROBE C: arrival regional Elo as a newcomer win-prob feature ──
  console.log('\n━━ PROBE C: ARRIVAL REGIONAL ELO on newcomer bouts (exploratory) ━━');
  const arrival = Papa.parse<Record<string, string>>(
    fs.readFileSync(path.join(process.cwd(), 'data', 'regional_arrival.csv'), 'utf-8'),
    { header: true, skipEmptyLines: true }
  ).data;
  const arrivalById = new Map<string, number>();
  for (const a of arrival) {
    const e = parseFloat(a['arrivalElo']);
    if (Number.isFinite(e)) arrivalById.set(a['ourId'], e);
  }
  const TAPER = 6; // like the pedigree seed: gone once a real UFC sample exists
  const MED = 1595, SCALE = 50; // arrival pool median / ~half the p10–p90 spread
  const eff = (id: string, fightNo: number): number => {
    const e = arrivalById.get(id);
    if (e == null) return 0;
    return ((e - MED) / SCALE) * Math.max(0, 1 - fightNo / TAPER);
  };
  const feat = (r: Row) => eff(r.favId, r.favFightNo) - eff(r.dogId, r.dogFightNo);

  const pool = rows.filter((r) => r.minFightNo <= 5);
  const withFeat = pool.filter((r) => Math.abs(feat(r)) > 1e-9);
  console.log(`  ≤5-prior bouts: ${pool.length}; arrival feature nonzero on ${withFeat.length}`);

  const train = pool.filter((r) => r.date < SPLIT);
  const test = pool.filter((r) => r.date >= SPLIT);

  // orientation-symmetrized fit (both orientations → intercept forced ~0),
  // offset = production logit so the slope prices only the residual.
  const X: number[][] = [];
  const y: number[] = [];
  const off: number[] = [];
  for (const r of train) {
    const f = feat(r);
    const o = logit(r.pProd);
    X.push([f]); y.push(r.favWon ? 1 : 0); off.push(o);
    X.push([-f]); y.push(r.favWon ? 0 : 1); off.push(-o);
  }
  const w = fitLogistic(X, y, 40, 1e-6, off);
  console.log(`  fitted on train (n=${train.length}×2 sym): intercept ${w[0].toFixed(3)} (≈0 by construction), slope ${w[1].toFixed(3)} logit per (100 arrival-Elo diff × taper)`);

  const withArr = (r: Row) => sigmoid(logit(r.pProd) + w[1] * feat(r));
  for (const [label, set] of [
    ['TEST 2024+ ≤5-prior', test],
    ['TEST 2024+ feature-live only', test.filter((r) => Math.abs(feat(r)) > 1e-9)],
    ['train (reference)', train],
  ] as const) {
    if (set.length < 10) { console.log(`  ${label}: n=${set.length} thin`); continue; }
    const a = score(set.map((r): Prediction => ({ p: r.pProd, won: r.favWon })));
    const b = score(set.map((r): Prediction => ({ p: withArr(r), won: r.favWon })));
    const m = score(set.map((r): Prediction => ({ p: r.pMkt, won: r.favWon })));
    const d = pairedT(set.map((r) => ll(withArr(r), r.favWon) - ll(r.pProd, r.favWon)));
    console.log(`  ${label}: n=${set.length}  LL ${a.logLoss.toFixed(4)} → ${b.logLoss.toFixed(4)} (mkt ${m.logLoss.toFixed(4)})  acc ${(100 * a.accuracy).toFixed(0)}% → ${(100 * b.accuracy).toFixed(0)}% (mkt ${(100 * m.accuracy).toFixed(0)}%)  paired Δ ${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(4)} (t ${d.t.toFixed(2)})`);
  }
}

main();
