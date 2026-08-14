// research/regional/explorePace.ts — is ACTIVITY PACE a real prospect signal?
//
// WHY. In the career-stage validation, debut age added exactly +0.000 AUC over
// age (collinear by construction), but PACE — fights per year — moved held-out
// AUC 0.738 → 0.764. That +0.027 beat the +0.02 threshold and failed only on a
// confidence interval spanning zero at 15 positives. It is the single
// unexplained lift in the prospect feature set, so it gets examined properly
// before anyone proposes wiring it into a score.
//
// WHAT PACE MIGHT ACTUALLY BE — the three readings this script separates,
// because they imply completely different things:
//   1. DEVELOPMENT RATE. Fighting often young = more reps, faster learning.
//   2. MATCHMAKER CONFIDENCE. Promotions book fighters they want to build.
//   3. LEVEL ARTIFACT. Low-level circuits run more cards, so a busy record can
//      mean weak opposition rather than a hot prospect. If pace is really this,
//      it should VANISH once opponent quality (regional Elo) is controlled —
//      that is the decisive test below, and the one that would kill it.
//
// Also checked: whether pace is simply re-expressing fight count (already
// inside the pre-UFC model's confidence term), and whether it is monotone or
// has a sweet spot — a fighter taking 6 bouts a year on 5 days' notice is not
// the same prospect as one taking 3 well-prepared ones.
//
// This is EXPLORATORY. Nothing here changes a score; a scored proposal must go
// back through the pre-registered bar in docs/plans/CAREER_STAGE_PLAN.md.
//
// Run: node_modules/.bin/jiti research/regional/explorePace.ts
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { fitLogistic, predictLogistic, auc, spearman, type Prediction } from '../backtest/metrics';

const tokens = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');
const readCsv = (p: string) =>
  fs.existsSync(p)
    ? Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8'), { header: true, skipEmptyLines: true }).data
    : [];
const num = (s: string | undefined) => (s && s.trim() ? Number(s) : null);
const yearsBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / (365.25 * 86_400_000);
const mean = (xs: number[]) => (xs.length ? xs.reduce((t, v) => t + v, 0) / xs.length : NaN);

interface S {
  name: string; season: number; age: number; debutAge: number;
  fights: number; pace: number; winRate: number;
  regionalElo: number | null;   // opponent-quality control
  top15: number; gotContract: number;
}

function bootCi(rows: { p0: number; p1: number; y: boolean }[], n = 500) {
  const base = auc(rows.map((r) => ({ p: r.p1, won: r.y }))) - auc(rows.map((r) => ({ p: r.p0, won: r.y })));
  const ds: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = rows.map(() => rows[Math.floor(Math.random() * rows.length)]);
    const a1 = auc(s.map((r) => ({ p: r.p1, won: r.y })));
    const a0 = auc(s.map((r) => ({ p: r.p0, won: r.y })));
    if (Number.isFinite(a1) && Number.isFinite(a0)) ds.push(a1 - a0);
  }
  ds.sort((a, b) => a - b);
  return { delta: base, lo: ds[Math.floor(n * 0.05)] ?? NaN, hi: ds[Math.floor(n * 0.95)] ?? NaN };
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
  const elo = new Map<string, number>();
  for (const r of readCsv(path.join(process.cwd(), 'data', 'regional_ratings.csv'))) {
    if (r.name && r.rating) elo.set(tokens(r.name), Number(r.rating));
  }

  const subs: S[] = [];
  for (const f of readCsv(path.join(process.cwd(), 'data', 'dwcs_fighters.csv'))) {
    const key = tokens(f.name ?? '');
    const at = f.firstDwcsDate;
    if (!key || !at) continue;
    const d = dob.get(key);
    const pd = debut.get(key);
    if (!d || !pd) continue;
    const w = num(f.preDwcsWins) ?? 0, l = num(f.preDwcsLosses) ?? 0, dr = num(f.preDwcsDraws) ?? 0;
    const fights = w + l + dr;
    const careerYears = yearsBetween(pd, at);
    if (fights < 1 || careerYears < 1) continue;
    const age = yearsBetween(d, at);
    if (age < 16 || age > 50) continue;
    subs.push({
      name: f.name, season: Number(at.slice(0, 4)),
      age, debutAge: yearsBetween(d, pd),
      fights, pace: fights / careerYears, winRate: fights ? w / fights : 0,
      regionalElo: elo.get(key) ?? null,
      top15: f.reachedTop15 === '1' ? 1 : 0,
      gotContract: f.gotContract === '1' ? 1 : 0,
    });
  }
  console.log(`PACE EXPLORATION — ${subs.length} DWCS entrants with age + debut + record`);
  console.log(`(${subs.filter((s) => s.regionalElo != null).length} also carry a regional Elo for the opponent-quality control)\n`);
  if (subs.length < 80) { console.log('too thin — re-run after the DOB harvest completes.'); return; }

  // ── 1. is pace just fight count re-expressed? ──
  console.log('1. IS PACE JUST FIGHT COUNT?');
  console.log(`   ρ(pace, fights)      ${spearman(subs.map((s) => s.pace), subs.map((s) => s.fights)).toFixed(3)}`);
  console.log(`   ρ(pace, age)         ${spearman(subs.map((s) => s.pace), subs.map((s) => s.age)).toFixed(3)}`);
  console.log(`   ρ(pace, win rate)    ${spearman(subs.map((s) => s.pace), subs.map((s) => s.winRate)).toFixed(3)}`);
  console.log(`   ρ(pace, regional Elo) ${(() => { const g = subs.filter((s) => s.regionalElo != null); return spearman(g.map((s) => s.pace), g.map((s) => s.regionalElo!)).toFixed(3); })()}`);
  console.log('   (a high |ρ| with fights or Elo means pace is not carrying its own information)\n');

  // ── 2. monotone, or a sweet spot? ──
  console.log('2. OUTCOME BY PACE BAND (is more always better?)');
  const bands: [string, (p: number) => boolean][] = [
    ['<1.5 /yr', (p) => p < 1.5],
    ['1.5–2.5', (p) => p >= 1.5 && p < 2.5],
    ['2.5–3.5', (p) => p >= 2.5 && p < 3.5],
    ['3.5+', (p) => p >= 3.5],
  ];
  for (const [label, test] of bands) {
    const g = subs.filter((s) => test(s.pace));
    if (g.length < 15) { console.log(`   ${label.padEnd(10)} n=${String(g.length).padStart(3)}  — too thin to read`); continue; }
    console.log(
      `   ${label.padEnd(10)} n=${String(g.length).padStart(3)}  top15 ${(100 * mean(g.map((s) => s.top15))).toFixed(1)}%` +
      `  contract ${(100 * mean(g.map((s) => s.gotContract))).toFixed(0)}%  mean age ${mean(g.map((s) => s.age)).toFixed(1)}` +
      `  mean Elo ${(() => { const e = g.filter((s) => s.regionalElo != null); return e.length ? mean(e.map((s) => s.regionalElo!)).toFixed(0) : '—'; })()}`
    );
  }

  // ── 3. THE DECISIVE TEST: does pace survive an opponent-quality control? ──
  const withElo = subs.filter((s) => s.regionalElo != null);
  console.log(`\n3. DOES PACE SURVIVE CONTROLLING FOR OPPONENT QUALITY? (n=${withElo.length}, temporal split)`);
  const train = withElo.filter((s) => s.season < 2022);
  const test = withElo.filter((s) => s.season >= 2022);
  const pos = test.reduce((t, s) => t + s.top15, 0);
  console.log(`   fit ${train.length} pre-2022 → score ${test.length} from 2022+ (${pos} positives)`);
  if (train.length >= 40 && test.length >= 30 && pos >= 3) {
    const FEATS: [string, (s: S) => number[]][] = [
      ['age + Elo', (s) => [(s.age - 27) / 5, (s.regionalElo! - 1500) / 50]],
      ['age + Elo + pace', (s) => [(s.age - 27) / 5, (s.regionalElo! - 1500) / 50, s.pace / 3]],
    ];
    const y = train.map((s) => s.top15);
    const scored: Record<string, number[]> = {};
    for (const [label, fx] of FEATS) {
      const w = fitLogistic(train.map(fx), y);
      scored[label] = test.map((s) => predictLogistic(w, fx(s)));
      const preds: Prediction[] = test.map((s, i) => ({ p: scored[label][i], won: s.top15 === 1 }));
      console.log(`   ${label.padEnd(18)} held-out AUC ${auc(preds).toFixed(3)}   coef(pace) ${label.includes('pace') ? w[3].toFixed(2) : '—'}`);
    }
    const d = bootCi(test.map((s, i) => ({ p0: scored['age + Elo'][i], p1: scored['age + Elo + pace'][i], y: s.top15 === 1 })));
    console.log(`   ΔAUC from adding pace: ${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(3)}  [${d.lo.toFixed(3)}, ${d.hi.toFixed(3)}]`);
    console.log(`   → ${d.delta >= 0.02 && d.lo > 0 ? 'SURVIVES the control — a genuine candidate' : 'does NOT survive as a scored term on this sample'}`);
  } else {
    console.log('   insufficient held-out sample for the control test.');
  }

  console.log('\nEXPLORATORY ONLY — a scored proposal must clear the pre-registered bar in');
  console.log('docs/plans/CAREER_STAGE_PLAN.md on the committed harness.');
}

main();
