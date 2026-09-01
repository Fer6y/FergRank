// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/mgs/titleChamp.ts — MARKET-GAP SWEEP candidate T5:
//  FIVE-ROUND/TITLE CHAMPION EDGE.
//  Plan + verdict rule pre-registered in docs/plans/MARKET_GAP_SWEEP_PLAN.md
//  BEFORE this ran. Harness copied from skidStudy/trendStudy exactly:
//  PIT ratings (buildPointInTimeIndex + PitAdjuster + predictFight), Shin
//  de-vig, DAY_TOL matching, pair+date dedupe of BFO rows, orientation-
//  symmetrized logistic with a FIXED OFFSET (production logit = ship gate;
//  market logit = informational), SPLIT 2024-01-01, held-out refit sign check.
//
//  FEATURE (title bouts only): +1 for the side who is the REIGNING champion
//  entering the bout, −1 for the challenger, 0 (unaffected) everywhere else.
//
//  CHAMPION IDENTITY — strictly pre-bout, derived by a chronological walk of
//  data/title_fights.csv, NOT read off the row's own `champion` column:
//  the builder (scripts/buildTitleFights.ts) writes the DEFENDING champion
//  for defenses but the WINNER for vacant/crowning bouts (and ~18 title-change
//  rows carry ledger date quirks that flip the label to the winner) — using
//  the column directly would leak the outcome. The walk instead carries each
//  division's undisputed belt-holder forward from PRIOR rows' results:
//    • pre-bout champion of row R = whoever held the belt after the rows
//      strictly before R (prior outcomes are legitimately pre-bout info);
//    • after a non-interim row, the winner holds the belt (draw/NC retains);
//    • interim rows (interim=1) NEVER update the lineage — an interim belt is
//      not the championship — and their bouts are affected only if the
//      undisputed holder is somehow a participant (in practice: unaffected);
//    • a division's first row, vacant/crowning bouts (holder not a
//      participant), and unresolvable names ⇒ neither side parses as champion
//      ⇒ UNAFFECTED, per the plan.
//  Known limit (caveat): vacations/strippings are not in the file, so a champ
//  who vacates and later returns to a title bout in the same division would be
//  mislabelled as still reigning; no such case exists in the 2021+ odds span.
//
//  DIAGNOSTIC ONLY. Research zone; odds feed no rating.
//  Run: node_modules/.bin/jiti research/backtest/mgs/titleChamp.ts
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
const TITLE_JOIN_TOL_DAYS = 7; // pre-registered ±7-day pair+date join tolerance

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

// Same normalizer family as buildTitleFights.ts — names inside title_fights.csv
// come from Fights.csv and are self-consistent, so the lineage walk keys on
// normalized NAME (ids are only needed for the odds-pool join).
const norm = (s: string) =>
  (s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

interface TitleBout {
  day: number;
  date: string;
  division: string;
  pairKey: string | null;    // sorted resolved-id pair (null if either name unresolved)
  champId: string | null;    // resolved id of the PRE-BOUT reigning champion side, if a participant
  csvChampion: string;       // the file's champion column (cross-check only)
  interim: boolean;
}

function main(): void {
  const data = loadAllData();
  const idx = buildPointInTimeIndex(data);
  const nameIndex = buildNameIndex(data.fighters);
  const adjuster = new PitAdjuster(data);

  // ── build the pre-bout champion lineage from title_fights.csv ──
  const tf = Papa.parse<Record<string, string>>(
    fs.readFileSync(path.join(process.cwd(), 'data', 'title_fights.csv'), 'utf-8'),
    { header: true, skipEmptyLines: true }
  ).data;
  tf.sort((a, b) => (a['date'] < b['date'] ? -1 : a['date'] > b['date'] ? 1 : 0));

  const curChamp = new Map<string, string>(); // division -> normName of undisputed holder
  const titleBouts: TitleBout[] = [];
  let colAgree = 0, colDisagree = 0;
  const disagreeRows: string[] = [];
  let crowningOrVacant = 0, interimCount = 0;

  for (const r of tf) {
    const division = r['division'];
    const n1 = norm(r['fighter_1']);
    const n2 = norm(r['fighter_2']);
    const interim = r['interim'] === '1';
    const holder = curChamp.get(division) ?? null;
    const champNorm = holder && (holder === n1 || holder === n2) ? holder : null;

    if (!interim && champNorm == null) crowningOrVacant++;
    if (interim) interimCount++;

    // cross-check the walk against the file's champion column (defenses only)
    if (champNorm != null) {
      if (norm(r['champion']) === champNorm) colAgree++;
      else { colDisagree++; disagreeRows.push(`${r['date']} ${r['division']}: walk=${champNorm} vs csv=${norm(r['champion'])}`); }
    }

    const id1 = resolveOddsName(r['fighter_1'], nameIndex);
    const id2 = resolveOddsName(r['fighter_2'], nameIndex);
    const champId =
      champNorm == null ? null : champNorm === n1 ? id1 : id2;

    titleBouts.push({
      day: dayNum(r['date']),
      date: r['date'],
      division,
      pairKey: id1 && id2 ? [id1, id2].sort().join('#') : null,
      champId: champId ?? null,
      csvChampion: r['champion'],
      interim,
    });

    // update the lineage AFTER the bout — interim never touches it
    if (!interim) {
      const res1 = r['result_fighter1'];
      const winner = res1 === 'W' ? n1 : res1 === 'L' ? n2 : null; // D/NC retains
      if (winner) curChamp.set(division, winner);
    }
  }

  const titleByPair = new Map<string, TitleBout[]>();
  for (const b of titleBouts) {
    if (!b.pairKey) continue;
    (titleByPair.get(b.pairKey) ?? titleByPair.set(b.pairKey, []).get(b.pairKey)!).push(b);
  }
  const lookupTitle = (idA: string, idB: string, day: number): TitleBout | null => {
    const list = titleByPair.get([idA, idB].sort().join('#'));
    if (!list) return null;
    let best: TitleBout | null = null;
    let bestGap = Infinity;
    for (const b of list) {
      const gap = Math.abs(b.day - day);
      if (gap < bestGap) { bestGap = gap; best = b; }
    }
    return best && bestGap <= TITLE_JOIN_TOL_DAYS ? best : null;
  };

  console.log(`TITLE LINEAGE WALK — ${titleBouts.length} rows in title_fights.csv`);
  console.log(`  defenses where walk found a reigning champ: ${colAgree + colDisagree} (csv champion column agrees ${colAgree}, disagrees ${colDisagree})`);
  for (const d of disagreeRows) console.log(`    DISAGREE ${d}`);
  console.log(`  non-interim rows with NO pre-bout champ participant (crowning/vacant/first-row): ${crowningOrVacant}`);
  console.log(`  interim rows (never update lineage): ${interimCount}\n`);

  // ── the odds-matched pool (trendStudy construction, pair+date deduped) ──
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
    fav: string;
    dog: string;
    pProd: number;
    pMkt: number;
    favWon: boolean;
    champEdge: number; // +1 fav is reigning champ, −1 dog is, 0 unaffected
    isTitle: boolean;
    interim: boolean;
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

    const tb = lookupTitle(id1, id2, day);
    const champEdge = tb?.champId == null ? 0 : tb.champId === favId ? 1 : tb.champId === dogId ? -1 : 0;

    rows.push({
      date: favPit.date.slice(0, 10),
      fav: f1IsFav ? r['fighter1'] : r['fighter2'],
      dog: f1IsFav ? r['fighter2'] : r['fighter1'],
      pProd: pred.probA,
      pMkt: devig(f1IsFav ? c1 : c2, f1IsFav ? c2 : c1, DEVIG).pFav,
      favWon: favPit.result === 'W',
      champEdge,
      isTitle: tb != null,
      interim: tb?.interim ?? false,
    });
  }

  const affected = (r: Row) => r.champEdge !== 0;
  const titleMatched = rows.filter((r) => r.isTitle);
  console.log(`T5 TITLE CHAMPION EDGE — ${rows.length} odds-matched bouts (pair+date deduped)`);
  console.log(`  title bouts joined to the pool: ${titleMatched.length} (interim ${titleMatched.filter((r) => r.interim).length}); AFFECTED (champ side identified): ${rows.filter(affected).length}\n`);

  // ── descriptive: the reigning champion's side of every affected bout ──
  console.log('━━ DESCRIPTIVE (champion-side entries, affected bouts) ━━');
  const champSides = rows.filter(affected).map((r) => ({
    won: r.champEdge === 1 ? r.favWon : !r.favWon,
    isFav: r.champEdge === 1,
    pModel: r.champEdge === 1 ? r.pProd : 1 - r.pProd,
    pMkt: r.champEdge === 1 ? r.pMkt : 1 - r.pMkt,
    date: r.date,
  }));
  const dRep = (label: string, set: typeof champSides) => {
    if (!set.length) { console.log(`  ${label}: n=0`); return; }
    console.log(`  ${label}: n=${set.length}  champ won ${(100 * set.filter((s) => s.won).length / set.length).toFixed(1)}%  model priced champ ${(100 * mean(set.map((s) => s.pModel))).toFixed(1)}%  mkt ${(100 * mean(set.map((s) => s.pMkt))).toFixed(1)}%`);
  };
  dRep('all affected', champSides);
  dRep('champ as market favourite', champSides.filter((s) => s.isFav));
  dRep('champ as market underdog', champSides.filter((s) => !s.isFav));
  dRep('train (<2024)', champSides.filter((s) => s.date < SPLIT));
  dRep('held-out (2024+)', champSides.filter((s) => s.date >= SPLIT));

  // print every affected held-out bout — small n, hand-checkable
  console.log('\n  held-out affected bouts (date · fav vs dog · champEdge · pProd · pMkt · favWon):');
  for (const r of rows.filter((x) => affected(x) && x.date >= SPLIT)) {
    console.log(`    ${r.date}  ${r.fav} vs ${r.dog}  edge ${r.champEdge > 0 ? '+1(fav)' : '-1(dog)'}  prod ${(100 * r.pProd).toFixed(1)}%  mkt ${(100 * r.pMkt).toFixed(1)}%  favWon=${r.favWon}`);
  }

  // ── inferential: both offsets, symmetrized, fit <2024, score 2024+ ──
  const train = rows.filter((r) => r.date < SPLIT);
  const test = rows.filter((r) => r.date >= SPLIT);
  const testAff = test.filter(affected);
  const testUnaff = test.filter((r) => !affected(r));

  type FeatFn = (r: Row) => number[];
  const feats: FeatFn = (r) => [r.champEdge];

  for (const [offLabel, offOf] of [
    ['offset = PRODUCTION logit (the ship gate)', (r: Row) => logit(r.pProd)],
    ['offset = MARKET logit (informational: does the market already price it?)', (r: Row) => logit(r.pMkt)],
  ] as const) {
    console.log(`\n━━ INFERENTIAL — ${offLabel}; symmetrized; fit <${SPLIT}, score ${SPLIT}+ ━━`);
    console.log(`  train n=${train.length} (affected ${train.filter(affected).length}) · test n=${test.length} (affected ${testAff.length})`);

    const fitOn = (set: Row[]): number[] => {
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
    const predict = (r: Row, w: number[]): number =>
      sigmoid(offOf(r) + feats(r).reduce((s, v, j) => s + v * w[j + 1], 0));

    const w = fitOn(train);
    const wHold = fitOn(test); // sign-stability check only
    console.log(`  champEdge: train coef [${w.slice(1).map((c) => c.toFixed(3)).join(', ')}] · held-out refit [${wHold.slice(1).map((c) => c.toFixed(3)).join(', ')}] (sign check)`);
    for (const [label, set] of [['test affected', testAff], ['test unaffected', testUnaff], ['test all', test]] as const) {
      if (set.length < 10) { console.log(`    ${label}: n=${set.length} thin`); continue; }
      const base = score(set.map((r): Prediction => ({ p: sigmoid(offOf(r)), won: r.favWon })));
      const cand = score(set.map((r): Prediction => ({ p: predict(r, w), won: r.favWon })));
      const d = pairedT(set.map((r) => ll(predict(r, w), r.favWon) - ll(sigmoid(offOf(r)), r.favWon)));
      console.log(`    ${label.padEnd(16)} n=${String(set.length).padStart(4)}  LL ${base.logLoss.toFixed(4)} → ${cand.logLoss.toFixed(4)}  paired Δ ${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(4)} (t ${d.t.toFixed(2)})`);
    }
  }

  console.log('\nVERDICT RULE (pre-registered, production offset only): CONFIRMED iff test-affected t ≤ −2 AND test-unaffected t < +2 AND held-out refit keeps the sign. Affected held-out n < 25 ⇒ underpowered regardless of t.');
}

main();
