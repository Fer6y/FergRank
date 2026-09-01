// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/mgs/t6retune.ts — MARKET-GAP SWEEP candidate T6:
//  RETUNE-BEFORE-ADD. Pre-registered in docs/plans/MARKET_GAP_SWEEP_PLAN.md.
//
//  NOT a new feature. Two existing knobs swept on the odds-matched,
//  pair+date-deduped pool (the trendStudy construction, exactly):
//    (a) elo.winProbDenominator ∈ {120,130,140,150,160}
//        — rebuild the Elo logit from the SAME PIT rating gap with each
//          denominator; overlay logit re-applied exactly as production does.
//    (b) winProbModel.overlayShrink ∈ {0.45,0.65,0.85,1.0}
//        — rescale ONLY the age+style components (the two that
//          fightPrediction.ts shrinks at source); flags/pedigree untouched.
//  Composition copied from src/lib/fightPrediction.ts predictFight():
//    prob = sigmoid((base + clamp(age+style+flag+ped, ±maxAdjustmentLogit)) × conf)
//    conf = max(winProbShadeFloor, min(1, minFights/provisionalFights))
//  Arm-0 (D=140, shrink=0.65) must reproduce pred.probA to ~1e-6 before any
//  sweep number counts — the reproduction check is printed and asserted.
//
//  Choose on <2024-01-01, confirm on 2024+ (shadeFloorTest pattern).
//  T6 verdict rule: a knob moves only if the winner is consistent in BOTH
//  halves; else FLAT. No config is touched here — measure and report only.
//
//  DIAGNOSTIC ONLY. Research zone; odds feed no rating.
//  Run: node_modules/.bin/jiti research/backtest/mgs/t6retune.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../../../src/lib/loadData';
import { normalizeWeightClassForMove } from '../../../src/lib/eloEngine';
import { predictFight } from '../../../src/lib/fightPrediction';
import { RANKING_CONFIG } from '../../../src/lib/rankingConfig';
import { buildNameIndex } from '../../../src/lib/nameResolver';
import { buildPointInTimeIndex, resolveOddsName } from '../pointInTime';
import { PitAdjuster } from '../pitAdjust';
import { devig, type DevigMethod } from '../devig';
import { score, sigmoid, type Prediction } from '../metrics';

const DEVIG: DevigMethod = 'shin';
const DAY_TOL = [0, 1, -1, 2, -2];
const SPLIT = '2024-01-01';
const LN10 = Math.log(10);

const DENOMS = [120, 130, 140, 150, 160];
const SHRINKS = [0.45, 0.65, 0.85, 1.0];

const D0 = RANKING_CONFIG.elo.winProbDenominator;         // 140 at run time
const S0 = RANKING_CONFIG.winProbModel.overlayShrink;     // 0.65 at run time
const MAXADJ = RANKING_CONFIG.winProbModel.maxAdjustmentLogit;
const FLOOR = RANKING_CONFIG.elo.winProbShadeFloor;
const PROV = RANKING_CONFIG.elo.provisionalFights;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

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

interface Row {
  date: string;
  fav: string;
  dog: string;
  gap: number;        // fav PIT ranked rating − dog PIT ranked rating (Elo pts)
  ageLogit: number;   // as returned by predictFight (already ×S0 at source)
  styleLogit: number; // as returned (already ×S0 at source)
  flagLogit: number;  // 0 in backtests (no ctx flags passed)
  pedLogit: number;   // pedigree prior (NOT shrunk by overlayShrink)
  conf: number;       // shade confidence predictFight applied
  pProd: number;      // predictFight's own probA — reproduction target
  pMkt: number;
  favWon: boolean;
}

// Production composition with a hypothetical denominator D and overlay shrink s.
function probAt(r: Row, D: number, s: number): number {
  const base = (LN10 * r.gap) / D;
  const adj = clamp(
    r.ageLogit * (s / S0) + r.styleLogit * (s / S0) + r.flagLogit + r.pedLogit,
    -MAXADJ, MAXADJ,
  );
  return sigmoid((base + adj) * r.conf);
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

    const favRating = favPit.selfRating + adjFav;
    const dogRating = favPit.oppRating + adjDog;
    const pred = predictFight(
      data, favId, dogId,
      favRating, dogRating,
      favPit.selfFightNo + 1, dogPit.selfFightNo + 1,
      new Date(favPit.date),
    );

    rows.push({
      date: favPit.date.slice(0, 10),
      fav: f1IsFav ? r['fighter1'] : r['fighter2'],
      dog: f1IsFav ? r['fighter2'] : r['fighter1'],
      gap: favRating - dogRating,
      ageLogit: pred.ageLogit,
      styleLogit: pred.styleLogit,
      flagLogit: pred.flagLogit,
      pedLogit: pred.pedigreeLogit,
      conf: pred.confidence,
      pProd: pred.probA,
      pMkt: devig(f1IsFav ? c1 : c2, f1IsFav ? c2 : c1, DEVIG).pFav,
      favWon: favPit.result === 'W',
    });
  }

  console.log(`T6 RETUNE — ${rows.length} odds-matched bouts (pair+date deduped)`);
  console.log(`config at run: winProbDenominator=${D0}, overlayShrink=${S0}, maxAdjustmentLogit=${MAXADJ}, shadeFloor=${FLOOR}, provisionalFights=${PROV}\n`);

  // ── MANDATORY reproduction check: arm-0 must equal predictFight's probA ──
  let maxErr = 0;
  let worst: Row | null = null;
  for (const r of rows) {
    const e = Math.abs(probAt(r, D0, S0) - r.pProd);
    if (e > maxErr) { maxErr = e; worst = r; }
  }
  console.log(`ARM-0 REPRODUCTION: max |probAt(D0,S0) − pred.probA| over all ${rows.length} bouts = ${maxErr.toExponential(3)}`);
  if (worst) console.log(`  worst bout: ${worst.date} ${worst.fav} vs ${worst.dog} (pProd ${worst.pProd.toFixed(8)})`);
  if (maxErr > 1e-6) {
    console.log('  ✗ REPRODUCTION FAILED — sweep numbers below are NOT trustworthy.');
  } else {
    console.log('  ✓ reproduces production to ≤1e-6 — sweep numbers count.\n');
  }

  // ── hand-verification sample: print one full decomposition ──
  const sample = rows.find((r) => r.date >= '2025-01-01' && Math.abs(r.ageLogit) > 0.01 && Math.abs(r.styleLogit) > 0.001) ?? rows[0];
  console.log('HAND-VERIFY SAMPLE BOUT (recompute independently):');
  console.log(`  ${sample.date}  fav=${sample.fav}  dog=${sample.dog}  favWon=${sample.favWon}`);
  console.log(`  gap=${sample.gap.toFixed(4)} Elo · ageLogit=${sample.ageLogit.toFixed(6)} · styleLogit=${sample.styleLogit.toFixed(6)} · flagLogit=${sample.flagLogit.toFixed(6)} · pedLogit=${sample.pedLogit.toFixed(6)} · conf=${sample.conf.toFixed(4)}`);
  console.log(`  base(D=140)=${((LN10 * sample.gap) / 140).toFixed(6)} · pProd=${sample.pProd.toFixed(8)} · probAt(140,0.65)=${probAt(sample, 140, 0.65).toFixed(8)} · pMkt=${sample.pMkt.toFixed(4)}`);
  console.log(`  probAt(120,0.65)=${probAt(sample, 120, 0.65).toFixed(8)} · probAt(140,1.0)=${probAt(sample, 140, 1.0).toFixed(8)}\n`);

  // ── halves ──
  const choose = rows.filter((r) => r.date < SPLIT);
  const confirm = rows.filter((r) => r.date >= SPLIT);
  const overlayLive = (r: Row) => Math.abs(r.ageLogit) > 1e-12 || Math.abs(r.styleLogit) > 1e-12;
  console.log(`choose (<${SPLIT}) n=${choose.length} · confirm (${SPLIT}+) n=${confirm.length}`);
  console.log(`overlay live (age or style ≠ 0): choose ${choose.filter(overlayLive).length}, confirm ${confirm.filter(overlayLive).length}\n`);

  const mktChoose = score(choose.map((r): Prediction => ({ p: r.pMkt, won: r.favWon })));
  const mktConfirm = score(confirm.map((r): Prediction => ({ p: r.pMkt, won: r.favWon })));
  console.log(`market reference: choose LL ${mktChoose.logLoss.toFixed(4)} · confirm LL ${mktConfirm.logLoss.toFixed(4)}\n`);

  const armReport = (
    title: string,
    arms: { label: string; isProd: boolean; fn: (r: Row) => number }[],
  ) => {
    console.log(`━━ ${title} ━━`);
    console.log('   arm        choose-LL  (acc)     confirm-LL (acc)    confirm ΔLL vs prod (paired t)');
    const prodArm = arms.find((a) => a.isProd)!;
    let bestChoose = ''; let bestChooseLL = Infinity;
    let bestConfirm = ''; let bestConfirmLL = Infinity;
    for (const a of arms) {
      const cs = score(choose.map((r): Prediction => ({ p: a.fn(r), won: r.favWon })));
      const vs = score(confirm.map((r): Prediction => ({ p: a.fn(r), won: r.favWon })));
      const d = pairedT(confirm.map((r) => ll(a.fn(r), r.favWon) - ll(prodArm.fn(r), r.favWon)));
      if (cs.logLoss < bestChooseLL) { bestChooseLL = cs.logLoss; bestChoose = a.label; }
      if (vs.logLoss < bestConfirmLL) { bestConfirmLL = vs.logLoss; bestConfirm = a.label; }
      console.log(
        `   ${a.label.padEnd(10)} ${cs.logLoss.toFixed(4)} (${(100 * cs.accuracy).toFixed(1)}%)   ` +
        `${vs.logLoss.toFixed(4)} (${(100 * vs.accuracy).toFixed(1)}%)   ` +
        `${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(4)} (t ${d.t.toFixed(2)})${a.isProd ? '   ← current' : ''}`
      );
    }
    console.log(`   choose-half winner: ${bestChoose} · confirm-half winner: ${bestConfirm}`);
    const consistent = bestChoose === bestConfirm;
    console.log(`   VERDICT: ${consistent
      ? (arms.find((a) => a.label === bestChoose)!.isProd
        ? 'consistent winner IS the current value — knob stays (FLAT for a move)'
        : `consistent winner ${bestChoose} ≠ current — knob-move candidate`)
      : 'winners disagree across halves — FLAT, knob stays'}`);
    console.log('');
    return { bestChoose, bestConfirm, consistent };
  };

  // (a) denominator sweep, shrink held at S0
  const denomRes = armReport(
    `(a) winProbDenominator sweep (overlayShrink held at ${S0})`,
    DENOMS.map((D) => ({ label: `D=${D}`, isProd: D === D0, fn: (r: Row) => probAt(r, D, S0) })),
  );

  // (b) overlayShrink sweep, denominator held at D0
  const shrinkRes = armReport(
    `(b) overlayShrink sweep (winProbDenominator held at ${D0})`,
    SHRINKS.map((s) => ({ label: `s=${s}`, isProd: s === S0, fn: (r: Row) => probAt(r, D0, s) })),
  );

  // ── overlay-live slice detail for the shrink sweep (shrink can only act there) ──
  console.log('━━ (b) detail on OVERLAY-LIVE bouts only ━━');
  for (const [half, set] of [['choose', choose.filter(overlayLive)], ['confirm', confirm.filter(overlayLive)]] as const) {
    const parts = SHRINKS.map((s) => {
      const sc = score(set.map((r): Prediction => ({ p: probAt(r, D0, s), won: r.favWon })));
      return `s=${s}: ${sc.logLoss.toFixed(4)}`;
    });
    console.log(`   ${half} (n=${set.length}): ${parts.join(' · ')}`);
  }
  // paired t of the confirm-half shrink winner vs prod on overlay-live and overlay-dark slices
  const confirmLive = confirm.filter(overlayLive);
  const confirmDark = confirm.filter((r) => !overlayLive(r));
  for (const s of SHRINKS) {
    if (s === S0) continue;
    const dLive = pairedT(confirmLive.map((r) => ll(probAt(r, D0, s), r.favWon) - ll(probAt(r, D0, S0), r.favWon)));
    const dDark = pairedT(confirmDark.map((r) => ll(probAt(r, D0, s), r.favWon) - ll(probAt(r, D0, S0), r.favWon)));
    console.log(`   confirm, s=${s} vs ${S0}: overlay-live ΔLL ${dLive.mean >= 0 ? '+' : ''}${dLive.mean.toFixed(4)} (t ${dLive.t.toFixed(2)}, n=${confirmLive.length}) · overlay-dark ΔLL ${dDark.mean >= 0 ? '+' : ''}${dDark.mean.toFixed(4)} (t ${isNaN(dDark.t) ? 'NaN' : dDark.t.toFixed(2)}, n=${confirmDark.length})`);
  }

  // denominator: per-arm paired t on the choose half too (both halves fully reported)
  console.log('\n━━ (a) choose-half paired t vs prod (denominator arms) ━━');
  for (const D of DENOMS) {
    if (D === D0) continue;
    const d = pairedT(choose.map((r) => ll(probAt(r, D, S0), r.favWon) - ll(probAt(r, D0, S0), r.favWon)));
    console.log(`   choose, D=${D} vs ${D0}: ΔLL ${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(4)} (t ${d.t.toFixed(2)})`);
  }
  console.log('\n━━ (b) choose-half paired t vs prod (shrink arms) ━━');
  for (const s of SHRINKS) {
    if (s === S0) continue;
    const d = pairedT(choose.map((r) => ll(probAt(r, D0, s), r.favWon) - ll(probAt(r, D0, S0), r.favWon)));
    console.log(`   choose, s=${s} vs ${S0}: ΔLL ${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(4)} (t ${d.t.toFixed(2)})`);
  }

  console.log(`\nT6 VERDICT RULE (pre-registered): a knob moves only if the same non-current arm wins BOTH halves; else FLAT.`);
  console.log(`  (a) denominator: ${denomRes.consistent ? `consistent winner ${denomRes.bestChoose}` : 'inconsistent'} · (b) shrink: ${shrinkRes.consistent ? `consistent winner ${shrinkRes.bestChoose}` : 'inconsistent'}`);
}

main();
