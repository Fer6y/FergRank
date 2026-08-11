// ─────────────────────────────────────────────────────────────────────────
//  research/dwcs/calibratePreUfc.ts — fits the PRE-UFC RATING weights.
//
//  The pre-UFC rating is a SEPARATE system from the Elo core: it scores a
//  fighter who has never been in the UFC, from the only things consistently
//  available before they arrive — age, record shape, finish rate, and the
//  promotion they came from. It must never be hand-tuned, so this script
//  FITS it on the nine-season DWCS cohort (data/dwcs_fighters.csv) and the
//  weights it prints are pasted into rankingConfig.preUfcRating with the
//  fit date and validation numbers alongside.
//
//  Target: reachedTop15 — external (the UFC's own board), the same target the
//  prospect harness uses, chosen because it is not autocorrelated with our
//  engine. Secondary read: settled Elo gain (Spearman).
//
//  Validation is TEMPORAL, not in-sample: fit on entrants from the earlier
//  seasons, score on the later ones. An in-sample AUC would flatter every
//  weight set and teach us nothing (the same trap the shade-floor sweep hit).
//
//  Run: node_modules/.bin/jiti research/dwcs/calibratePreUfc.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { fitLogistic, predictLogistic, auc, spearman, type Prediction } from '../backtest/metrics';
import { RANKING_CONFIG } from '../../src/lib/rankingConfig';

const SPLIT_DATE = '2022-01-01'; // fit < this, validate ≥ this
const num = (s: string): number | null => (s === '' || s == null ? null : Number(s));

interface Row {
  name: string;
  firstDwcsDate: string;
  preDwcsWins: string;
  preDwcsLosses: string;
  preDwcsDraws: string;
  preDwcsFinishes: string;
  feederTier: string;
  feederRelFactor: string;
  ageAtDwcs: string;
  gotContract: string;
  settledEloGain: string;
  reachedTop15: string;
}

export interface Features {
  winRate: number;    // 0..1
  finishRate: number; // finishes / wins, 0..1
  ageZ: number;       // (26 − age) / 4 — POSITIVE = younger = better
  tierMult: number;   // static feeder multiplier (0 when unattributed)
  logFights: number;  // ln(1 + total pre-DWCS fights) — experience volume
}

// Feature extraction shared with the runtime scorer's shape (src/lib/preUfcRating.ts
// re-implements this from the same config; keep the two in step).
function featuresOf(r: Row): (Features & { y: number; eloGain: number | null; date: string }) | null {
  const w = num(r.preDwcsWins);
  const l = num(r.preDwcsLosses);
  const d = num(r.preDwcsDraws) ?? 0;
  const f = num(r.preDwcsFinishes);
  const age = num(r.ageAtDwcs);
  if (w == null || l == null || f == null || age == null) return null;
  const total = w + l + d;
  if (total < 1) return null;
  const tiers = RANKING_CONFIG.promotionTiers as Record<string, { multiplier: number }>;
  const tierMult = tiers[r.feederTier]?.multiplier ?? 0;
  return {
    winRate: w / total,
    finishRate: w > 0 ? f / w : 0,
    ageZ: (26 - age) / 4,
    tierMult,
    logFights: Math.log1p(total),
    y: r.reachedTop15 === '1' ? 1 : 0,
    contract: r.gotContract === '1' ? 1 : 0,
    eloGain: num(r.settledEloGain),
    date: r.firstDwcsDate,
  };
}

const X = (x: Features): number[] => [x.winRate, x.finishRate, x.ageZ, x.tierMult, x.logFights];
const LABELS = ['winRate', 'finishRate', 'ageZ', 'tierMult', 'logFights'];

function main(): void {
  const csv = fs.readFileSync(path.join(process.cwd(), 'data', 'dwcs_fighters.csv'), 'utf8');
  const raw = Papa.parse<Row>(csv, { header: true, skipEmptyLines: true }).data;
  const rows = raw.map(featuresOf).filter((r): r is NonNullable<typeof r> => r != null);

  const fit = rows.filter((r) => r.date < SPLIT_DATE);
  const val = rows.filter((r) => r.date >= SPLIT_DATE);
  console.log(`PRE-UFC RATING CALIBRATION — ${rows.length} entrants with full features`);
  console.log(`  fit    ${fit.length} (< ${SPLIT_DATE}), ${fit.filter((r) => r.y).length} reached top 15`);
  console.log(`  valid  ${val.length} (≥ ${SPLIT_DATE}), ${val.filter((r) => r.y).length} reached top 15`);
  console.log(`  NOTE: later cohorts have had less time to climb, so the validation`);
  console.log(`  positive rate is structurally lower — read AUC (rank-based), not calibration.\n`);

  const w = fitLogistic(fit.map((r) => X(r)), fit.map((r) => r.y));
  console.log('Fitted coefficients (logit units, intercept first):');
  console.log(`  intercept ${w[0].toFixed(3)}`);
  LABELS.forEach((l, i) => console.log(`  ${l.padEnd(11)} ${w[i + 1] >= 0 ? '+' : ''}${w[i + 1].toFixed(3)}`));

  const scoreOf = (r: Features) => predictLogistic(w, X(r));
  const aucOn = (set: typeof rows) => auc(set.map((r): Prediction => ({ p: scoreOf(r), won: r.y === 1 })));
  console.log(`\nAUC(reachedTop15)  in-sample ${aucOn(fit).toFixed(3)}   HELD-OUT ${aucOn(val).toFixed(3)}`);

  // Single-feature AUCs on the held-out set — which signals actually carry it.
  console.log('\nHeld-out AUC by single feature (what each is worth alone):');
  for (const [i, label] of LABELS.entries()) {
    const a = auc(val.map((r): Prediction => ({ p: X(r)[i], won: r.y === 1 })));
    console.log(`  ${label.padEnd(11)} ${Number.isFinite(a) ? a.toFixed(3) : '  –  '}`);
  }

  // ── MODEL CURATION ────────────────────────────────────────────────────
  // The full fit has two suspicious coefficients: finishRate goes NEGATIVE
  // despite a positive univariate AUC, and logFights goes POSITIVE despite a
  // BELOW-RANDOM univariate AUC (both classic collinearity/suppressor
  // artifacts on n=224 with 18 positives). A rating we ship must not carry a
  // term whose sign we can't defend, so compare candidate feature sets on the
  // HELD-OUT set and keep the simplest one that doesn't lose.
  const CANDIDATES: [string, (keyof Features)[]][] = [
    ['full (all 5)', ['winRate', 'finishRate', 'ageZ', 'tierMult', 'logFights']],
    ['drop logFights', ['winRate', 'finishRate', 'ageZ', 'tierMult']],
    ['drop finishRate', ['winRate', 'ageZ', 'tierMult', 'logFights']],
    ['core 3 (rate+age+tier)', ['winRate', 'ageZ', 'tierMult']],
    ['record+age only', ['winRate', 'ageZ']],
    ['age only', ['ageZ']],
  ];
  console.log('\nMODEL CURATION — held-out AUC by feature set (fit on the early half):');
  let best: { label: string; keys: (keyof Features)[]; auc: number; w: number[] } | null = null;
  for (const [label, keys] of CANDIDATES) {
    const xs = (r: Features) => keys.map((k) => r[k]);
    const wk = fitLogistic(fit.map(xs), fit.map((r) => r.y));
    const a = auc(val.map((r): Prediction => ({ p: predictLogistic(wk, xs(r)), won: r.y === 1 })));
    const coefs = keys.map((k, i) => `${k} ${wk[i + 1] >= 0 ? '+' : ''}${wk[i + 1].toFixed(2)}`).join(', ');
    console.log(`  ${label.padEnd(24)} AUC ${a.toFixed(3)}   [${coefs}]`);
    if (!best || a > best.auc + 1e-9) best = { label, keys, auc: a, w: wk };
  }
  console.log(`  → best held-out: ${best!.label} (AUC ${best!.auc.toFixed(3)})`);

  // ── SECOND TARGET: does finish rate predict getting SIGNED? ───────────
  // finishRate carries real univariate signal on reachedTop15 (AUC 0.597) yet
  // dies in the multivariate fit — the classic sign of collinearity with win
  // rate (finishers win more). But "becomes a contender" and "gets signed at
  // all" are different questions, and the cohort already showed the DWCS-night
  // finish is worth 98% vs 89% on the contract. Test whether the PRE-DWCS
  // finish habit predicts the contract too, before discarding the feature.
  // ⚠️ READ THE CAVEAT BELOW BEFORE TRUSTING THESE NUMBERS.
  console.log('\nSECOND TARGET — gotContract (did they reach the UFC at all):');
  console.log('  ⚠ LEAKED TARGET: tierMult is non-zero only for crosswalked fighters,');
  console.log('  and being crosswalked ≈ having reached the roster. Any model carrying');
  console.log('  tierMult predicts gotContract from a proxy for itself (hence AUC 1.000');
  console.log('  and absurd coefficients). Only the finishRate-alone row is meaningful.');
  for (const [label, keys] of [
    ['core 3', ['winRate', 'ageZ', 'tierMult']],
    ['core 3 + finishRate', ['winRate', 'ageZ', 'tierMult', 'finishRate']],
    ['finishRate alone', ['finishRate']],
  ] as [string, (keyof Features)[]][]) {
    const xs = (r: Features) => keys.map((k) => r[k]);
    const wk = fitLogistic(fit.map(xs), fit.map((r) => r.contract));
    const a = auc(val.map((r): Prediction => ({ p: predictLogistic(wk, xs(r)), won: r.contract === 1 })));
    const coefs = keys.map((k, i) => `${k} ${wk[i + 1] >= 0 ? '+' : ''}${wk[i + 1].toFixed(2)}`).join(', ');
    console.log(`  ${label.padEnd(22)} AUC ${a.toFixed(3)}   [${coefs}]`);
  }

  // Secondary target: does the score track settled Elo gain among graduates?
  const withGain = val.filter((r) => r.eloGain != null);
  console.log(`\nSpearman ρ(score, settled Elo gain) held-out: ${spearman(withGain.map(scoreOf), withGain.map((r) => r.eloGain!)).toFixed(3)} (n=${withGain.length})`);

  // The display scale for the CHOSEN model (core 3), refit on ALL rows so the
  // shipped weights use every season, then anchored over the observed spread.
  const chosen = best!.keys;
  const xsC = (r: Features) => chosen.map((k) => r[k]);
  const wFull = fitLogistic(rows.map(xsC), rows.map((r) => r.y));
  console.log(`\nSHIPPING MODEL — ${best!.label}, refit on all ${rows.length} rows:`);
  console.log(`  intercept ${wFull[0].toFixed(4)}`);
  chosen.forEach((k, i) => console.log(`  ${String(k).padEnd(11)} ${wFull[i + 1] >= 0 ? '+' : ''}${wFull[i + 1].toFixed(4)}`));
  const logits = rows.map((r) => {
    const p = predictLogistic(wFull, xsC(r));
    return Math.log(p / (1 - p));
  }).sort((a, b) => a - b);
  console.log(`  display anchors (logit p05 → p95): ${logits[Math.floor(logits.length * 0.05)].toFixed(4)} → ${logits[Math.floor(logits.length * 0.95)].toFixed(4)}`);

  // Legacy full-model anchors (kept for reference only).
  const all = rows.map((r) => Math.log(scoreOf(r) / (1 - scoreOf(r))));
  const sorted = [...all].sort((a, b) => a - b);
  const p05 = sorted[Math.floor(sorted.length * 0.05)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  console.log(`\nDisplay anchors (logit p05 → p95): ${p05.toFixed(3)} → ${p95.toFixed(3)}`);
  console.log('Paste the coefficients + anchors into rankingConfig.preUfcRating.');
}

main();
