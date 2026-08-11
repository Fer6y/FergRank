// ─────────────────────────────────────────────────────────────────────────
//  research/dwcs/recordShape.ts — Phase B.iii of DWCS_PLAN.md.
//
//  The "4-0 vs 13-4" question: does the SHAPE of a DWCS entrant's pre-DWCS
//  record (experience volume, loss count, age) predict (1) getting to the
//  UFC at all and (2) UFC success once there? Tests the pre-registered
//  H1–H5. Reads data/dwcs_fighters.csv (buildDwcsDataset.ts).
//
//  Two outcome layers with DIFFERENT denominators, never mixed:
//    • contract layer — all participants. HONEST CUT ONLY on fields known for
//      everyone (DWCS result, appearances). Record/age buckets exist only for
//      crosswalk+cache fighters, and crosswalk ≈ "reached the roster", so a
//      contract-rate-by-record table on that subset is nearly tautological —
//      reported, but labelled with that bias.
//    • UFC-success layer — graduates only (gotContract=1): later win%, settled
//      Elo gain, current-top-15 rate.
//
//  Cells with n < MIN_CELL are suppressed. Proportions/means carry 500-boot
//  90% CIs.
//
//  Run: node_modules/.bin/jiti research/dwcs/recordShape.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { fitLogistic, predictLogistic, auc, spearman, type Prediction } from '../backtest/metrics';

const MIN_CELL = 25;
const BOOT = 500;

interface Row {
  sherdogId: string;
  ourId: string;
  name: string;
  appearances: number;
  dwcsRecord: string;
  firstDwcsDate: string;
  bestDwcsResult: string;
  preDwcsWins: string;
  preDwcsLosses: string;
  preDwcsDraws: string;
  preDwcsSource: string;
  feederOrg: string;
  feederTier: string;
  feederRelFactor: string;
  ageAtDwcs: string;
  gotContract: string;
  ufcFights: number;
  ufcWins: number;
  ufcLosses: number;
  settledEloGain: string;
  eloAt1yr: string;
  eloAt2yr: string;
  reachedTop15: string;
}

const num = (s: string): number | null => (s === '' || s == null ? null : Number(s));

interface F {
  preW: number | null;
  preL: number | null;
  preFights: number | null;
  age: number | null;
  tierMult: number;
  source: string;
  bestDwcs: string;
  contract: boolean;
  top15: boolean;
  eloGain: number | null;
  laterWinRate: number | null;
  ufcFights: number;
}

function boot90(vals: number[], stat: (xs: number[]) => number): { v: number; lo: number; hi: number } {
  const v = stat(vals);
  const bs: number[] = [];
  for (let i = 0; i < BOOT; i++) {
    const s: number[] = [];
    for (let j = 0; j < vals.length; j++) s.push(vals[Math.floor(Math.random() * vals.length)]);
    bs.push(stat(s));
  }
  bs.sort((a, b) => a - b);
  return { v, lo: bs[Math.floor(BOOT * 0.05)], hi: bs[Math.floor(BOOT * 0.95)] };
}

const mean = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / (xs.length || 1);

function cell(label: string, vals: number[], pct = true): string {
  if (vals.length < MIN_CELL) return `   ${label.padEnd(16)} n=${String(vals.length).padStart(3)}   insufficient sample (<${MIN_CELL})`;
  const b = boot90(vals, mean);
  const f = (x: number) => (pct ? `${(100 * x).toFixed(0)}%` : x.toFixed(1));
  return `   ${label.padEnd(16)} n=${String(vals.length).padStart(3)}   ${f(b.v).padStart(6)}  [${f(b.lo)}, ${f(b.hi)}]`;
}

function bucketTable(
  title: string,
  rows: F[],
  bucketOf: (f: F) => string | null,
  valueOf: (f: F) => number | null,
  order: string[],
  pct = true
): void {
  console.log(title);
  for (const b of order) {
    const vals = rows
      .map((f) => (bucketOf(f) === b ? valueOf(f) : null))
      .filter((v): v is number => v != null);
    console.log(cell(b, vals, pct));
  }
  console.log('');
}

const expBucket = (f: F): string | null =>
  f.preFights == null ? null : f.preFights <= 5 ? '≤5 fights' : f.preFights <= 10 ? '6–10 fights' : '11+ fights';
const lossBucket = (f: F): string | null =>
  f.preL == null ? null : f.preL === 0 ? 'undefeated' : f.preL === 1 ? '1 loss' : f.preL === 2 ? '2 losses' : '3+ losses';
const ageBucket = (f: F): string | null =>
  f.age == null ? null : f.age < 25 ? '<25' : f.age <= 28 ? '25–28' : '29+';

function main(): void {
  const csv = fs.readFileSync(path.join(process.cwd(), 'data', 'dwcs_fighters.csv'), 'utf8');
  const raw = Papa.parse<Row>(csv, { header: true, skipEmptyLines: true, dynamicTyping: false }).data;
  const rows: F[] = raw.map((r) => {
    const preW = num(r.preDwcsWins);
    const preL = num(r.preDwcsLosses);
    const preD = num(r.preDwcsDraws) ?? 0;
    return {
      preW,
      preL,
      preFights: preW != null && preL != null ? preW + preL + preD : null,
      age: num(r.ageAtDwcs),
      tierMult: num(r.feederRelFactor) ?? 1,
      source: r.preDwcsSource,
      bestDwcs: r.bestDwcsResult,
      contract: r.gotContract === '1',
      top15: r.reachedTop15 === '1',
      eloGain: num(r.settledEloGain),
      laterWinRate: Number(r.ufcFights) > 0 ? Number(r.ufcWins) / Number(r.ufcFights) : null,
      ufcFights: Number(r.ufcFights),
    };
  });

  const grads = rows.filter((f) => f.contract);
  const withRecord = rows.filter((f) => f.preFights != null);
  console.log(`DWCS record-shape analysis — ${rows.length} participants, ${grads.length} graduates,`);
  console.log(`${withRecord.length} with a pre-DWCS record (${rows.length - withRecord.length} denominator-only).\n`);

  // ── contract layer ──────────────────────────────────────────────────
  console.log('════ CONTRACT LAYER (fought-in-UFC proxy) — all participants ════\n');
  bucketTable(
    'H4 — contract rate by DWCS result (full denominator, unbiased):',
    rows,
    (f) => (f.bestDwcs === 'noWin' ? 'no DWCS win' : f.bestDwcs === 'finishWin' ? 'finish win' : 'decision win'),
    (f) => (f.contract ? 1 : 0),
    ['finish win', 'decision win', 'no DWCS win']
  );
  console.log('⚠ record/age buckets below are conditioned on record availability');
  console.log('  (crosswalk ≈ reached the roster) — biased up, shape-comparison only:\n');
  bucketTable('Contract rate by experience:', withRecord, expBucket, (f) => (f.contract ? 1 : 0), ['≤5 fights', '6–10 fights', '11+ fights']);

  // ── UFC-success layer ───────────────────────────────────────────────
  console.log('════ UFC-SUCCESS LAYER — graduates only ════\n');
  bucketTable('Top-15 rate by pre-DWCS experience:', grads, expBucket, (f) => (f.top15 ? 1 : 0), ['≤5 fights', '6–10 fights', '11+ fights']);
  bucketTable('Top-15 rate by pre-DWCS losses (H2 surface read):', grads, lossBucket, (f) => (f.top15 ? 1 : 0), ['undefeated', '1 loss', '2 losses', '3+ losses']);
  bucketTable('Top-15 rate by age at DWCS (H3 surface read):', grads, ageBucket, (f) => (f.top15 ? 1 : 0), ['<25', '25–28', '29+']);
  bucketTable('Mean settled Elo gain by experience:', grads, expBucket, (f) => f.eloGain, ['≤5 fights', '6–10 fights', '11+ fights'], false);
  bucketTable('Mean settled Elo gain by losses:', grads, lossBucket, (f) => f.eloGain, ['undefeated', '1 loss', '2 losses', '3+ losses'], false);
  bucketTable('Mean settled Elo gain by age:', grads, ageBucket, (f) => f.eloGain, ['<25', '25–28', '29+'], false);

  // ── H5: finish vs decision among graduates ──────────────────────────
  const fin = grads.filter((f) => f.bestDwcs === 'finishWin' && f.eloGain != null).map((f) => f.eloGain!);
  const dec = grads.filter((f) => f.bestDwcs === 'decisionWin' && f.eloGain != null).map((f) => f.eloGain!);
  const bf = boot90(fin, mean);
  const bd = boot90(dec, mean);
  console.log('H5 — DWCS finish vs decision win, graduates, mean settled Elo gain:');
  console.log(`   finish win       n=${fin.length}   ${bf.v.toFixed(1)}  [${bf.lo.toFixed(1)}, ${bf.hi.toFixed(1)}]`);
  console.log(`   decision win     n=${dec.length}   ${bd.v.toFixed(1)}  [${bd.lo.toFixed(1)}, ${bd.hi.toFixed(1)}]`);
  console.log(`   gap ${(bf.v - bd.v).toFixed(1)} Elo (2026-07-03 measured 0.9 — noise)\n`);

  // ── feature-level logistics on graduates with full features ─────────
  const model = grads.filter((f) => f.preW != null && f.preL != null && f.preFights! > 0 && f.age != null);
  const y = model.map((f) => (f.top15 ? 1 : 0));
  console.log(`════ FEATURE TESTS (graduates with record+age, n=${model.length}, positives=${y.reduce((s, v) => s + v, 0)}) ════\n`);

  const sets: [string, (f: F) => number[]][] = [
    ['win rate only', (f) => [f.preW! / f.preFights!]],
    ['H1: + experience', (f) => [f.preW! / f.preFights!, f.preFights! / 10]],
    ['H2: + losses', (f) => [f.preW! / f.preFights!, f.preL! / 3]],
    ['H3: age only', (f) => [(f.age! - 26) / 5]],
    ['record + age', (f) => [f.preW! / f.preFights!, f.preFights! / 10, (f.age! - 26) / 5]],
  ];
  for (const [label, fx] of sets) {
    const X = model.map(fx);
    const w = fitLogistic(X, y);
    const preds: Prediction[] = model.map((f, i) => ({ p: predictLogistic(w, X[i]), won: f.top15 }));
    const coefs = w.slice(1).map((c) => c.toFixed(2)).join(', ');
    console.log(`   ${label.padEnd(18)} AUC ${auc(preds).toFixed(3)}   coefs [${coefs}] (in-sample)`);
  }

  console.log('\n   Spearman ρ(feature, settled Elo gain) on the same slice:');
  const gains = model.map((f) => f.eloGain ?? 0);
  console.log(`     experience count : ${spearman(model.map((f) => f.preFights!), gains).toFixed(3)}`);
  console.log(`     loss count       : ${spearman(model.map((f) => f.preL!), gains).toFixed(3)}`);
  console.log(`     win rate         : ${spearman(model.map((f) => f.preW! / f.preFights!), gains).toFixed(3)}`);
  console.log(`     age at DWCS      : ${spearman(model.map((f) => f.age!), gains).toFixed(3)}`);
}

main();
