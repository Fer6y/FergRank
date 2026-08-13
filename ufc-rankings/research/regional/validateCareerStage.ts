// research/regional/validateCareerStage.ts — the pre-registered test for the
// career-stage metric (docs/plans/CAREER_STAGE_PLAN.md).
//
// THE QUESTION. Age already predicts DWCS outcomes (the cohort's single best
// feature, AUC 0.630). Career stage adds *when they started* and *how fast
// they've fought*. Does that carry signal age doesn't already have, or is it
// just age wearing a hat?
//
// THE TEST. Reconstruct each DWCS entrant's arc AT TRYOUT TIME — age from the
// ESPN birthdate, debut age from the Fight Matrix pro-debut date, fight count
// from their pre-DWCS record — then score nested models on reaching the
// current UFC top 15, split TEMPORALLY (fit pre-2022, score 2022+) so the
// comparison is out-of-sample:
//     M0  age only                    ← the incumbent
//     M1  age + debut age
//     M2  age + debut age + pace
// BAR (pre-registered): ΔAUC ≥ +0.02 over M0 with a 90% bootstrap CI excluding
// zero. Clear it and career stage may become a scored term; miss it and the
// metric ships DISPLAY-ONLY, exactly like careerYears does today.
//
// Confound named in advance: debutAge = age − careerYears, so with age already
// in the model M1 is really testing the *career-length* dimension. Reported as
// such rather than dressed up as a new signal.
//
// Run: node_modules/.bin/jiti research/regional/validateCareerStage.ts
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { fitLogistic, predictLogistic, auc, type Prediction } from '../backtest/metrics';
import { careerStage } from '../../src/lib/careerStage';

const tokens = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');

const readCsv = (p: string) =>
  fs.existsSync(p)
    ? Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8'), { header: true, skipEmptyLines: true }).data
    : [];

const num = (s: string | undefined) => (s && s.trim() ? Number(s) : null);

interface Subject {
  name: string;
  season: number;
  age: number;
  debutAge: number;
  careerYears: number;
  fights: number;
  pace: number;
  band: string;
  top15: number;
}

function bootstrapDeltaAuc(
  rows: { p0: number; p1: number; y: boolean }[],
  resamples = 500
): { delta: number; lo: number; hi: number } {
  const base = auc(rows.map((r) => ({ p: r.p1, won: r.y }))) - auc(rows.map((r) => ({ p: r.p0, won: r.y })));
  const ds: number[] = [];
  for (let i = 0; i < resamples; i++) {
    const s = rows.map(() => rows[Math.floor(Math.random() * rows.length)]);
    const a1 = auc(s.map((r) => ({ p: r.p1, won: r.y })));
    const a0 = auc(s.map((r) => ({ p: r.p0, won: r.y })));
    if (Number.isFinite(a1) && Number.isFinite(a0)) ds.push(a1 - a0);
  }
  ds.sort((a, b) => a - b);
  return { delta: base, lo: ds[Math.floor(ds.length * 0.05)] ?? NaN, hi: ds[Math.floor(ds.length * 0.95)] ?? NaN };
}

function main(): void {
  const dob = new Map<string, string>();
  for (const r of readCsv(path.join(process.cwd(), 'data', 'regional_dob.csv'))) {
    if (r.status === 'found' && r.dob && r.name) dob.set(tokens(r.name), r.dob);
  }
  const debut = new Map<string, string>();
  for (const r of readCsv(path.join(process.cwd(), 'data', 'regional_profile_meta.csv'))) {
    if (r.name && r.proDebutDate) debut.set(tokens(r.name), r.proDebutDate);
  }
  console.log(`[inputs] ${dob.size} ESPN birthdates, ${debut.size} pro-debut dates on file`);

  const subjects: Subject[] = [];
  let noDob = 0, noDebut = 0, unclassifiable = 0;
  for (const f of readCsv(path.join(process.cwd(), 'data', 'dwcs_fighters.csv'))) {
    const key = tokens(f.name ?? '');
    const at = f.firstDwcsDate;
    if (!key || !at) continue;
    const d = dob.get(key);
    if (!d) { noDob++; continue; }
    const pd = debut.get(key);
    if (!pd) { noDebut++; continue; }
    const w = num(f.preDwcsWins), l = num(f.preDwcsLosses), dr = num(f.preDwcsDraws);
    const fights = (w ?? 0) + (l ?? 0) + (dr ?? 0);
    const cs = careerStage({ dob: d, proDebutDate: pd, fights, asOf: at, lastFightDate: at });
    if (!cs) { unclassifiable++; continue; }
    subjects.push({
      name: f.name, season: Number(at.slice(0, 4)),
      age: cs.age, debutAge: cs.debutAge, careerYears: cs.careerYears,
      fights, pace: cs.fightsPerYear ?? fights, band: cs.band,
      top15: f.reachedTop15 === '1' ? 1 : 0,
    });
  }
  console.log(`[cohort] ${subjects.length} DWCS entrants with a full arc (dropped: ${noDob} no DOB, ${noDebut} no debut date, ${unclassifiable} inconsistent)`);
  if (subjects.length < 60) {
    console.log('[cohort] too thin to test — re-run once the DOB harvest has covered more of the cohort.');
    return;
  }

  // ── descriptive: outcome by band ──
  console.log('\nTOP-15 RATE BY CAREER STAGE (all entrants with an arc):');
  const bands = [...new Set(subjects.map((s) => s.band))];
  for (const b of bands.sort()) {
    const g = subjects.filter((s) => s.band === b);
    const rate = g.reduce((t, s) => t + s.top15, 0) / g.length;
    console.log(`  ${b.padEnd(14)} n=${String(g.length).padStart(3)}  top15 ${(100 * rate).toFixed(1)}%  mean age ${(g.reduce((t, s) => t + s.age, 0) / g.length).toFixed(1)}  mean debutAge ${(g.reduce((t, s) => t + s.debutAge, 0) / g.length).toFixed(1)}`);
  }

  // ── temporal split ──
  const train = subjects.filter((s) => s.season < 2022);
  const test = subjects.filter((s) => s.season >= 2022);
  console.log(`\nTEMPORAL SPLIT: fit on ${train.length} pre-2022 entrants, score ${test.length} from 2022+`);
  const pos = test.reduce((t, s) => t + s.top15, 0);
  console.log(`  held-out positives: ${pos}${pos < 10 ? '  ⚠ severely underpowered — directional only' : ''}`);
  if (train.length < 40 || test.length < 30 || pos < 3) {
    console.log('  insufficient for a verdict; descriptive table above stands.');
    return;
  }

  const FEATS: [string, (s: Subject) => number[]][] = [
    ['M0 age only', (s) => [(s.age - 27) / 5]],
    ['M1 + debut age', (s) => [(s.age - 27) / 5, (s.debutAge - 24) / 5]],
    ['M2 + pace', (s) => [(s.age - 27) / 5, (s.debutAge - 24) / 5, s.pace / 3]],
  ];
  const y = train.map((s) => s.top15);
  const scored: Record<string, number[]> = {};
  for (const [label, fx] of FEATS) {
    const w = fitLogistic(train.map(fx), y);
    scored[label] = test.map((s) => predictLogistic(w, fx(s)));
    const preds: Prediction[] = test.map((s, i) => ({ p: scored[label][i], won: s.top15 === 1 }));
    console.log(`  ${label.padEnd(16)} held-out AUC ${auc(preds).toFixed(3)}`);
  }

  console.log('\nVERDICT vs the pre-registered bar (ΔAUC ≥ +0.02 over M0, 90% CI excluding 0):');
  for (const label of ['M1 + debut age', 'M2 + pace']) {
    const rows = test.map((s, i) => ({ p0: scored['M0 age only'][i], p1: scored[label][i], y: s.top15 === 1 }));
    const d = bootstrapDeltaAuc(rows);
    const clears = d.delta >= 0.02 && d.lo > 0;
    console.log(`  ${label.padEnd(16)} ΔAUC ${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(3)}  [${d.lo.toFixed(3)}, ${d.hi.toFixed(3)}]  → ${clears ? 'CLEARS' : 'does NOT clear'}`);
  }
  console.log('\n(Miss = the metric ships DISPLAY-ONLY, which is where it lives today.)');
}

main();
