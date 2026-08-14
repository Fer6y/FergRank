// research/regional/validateArrivalQuality.ts — the RIGHT target.
//
// THE CORRECTION. Every prospect test in this project so far scored against
// "reached the current UFC top 15" — a five-year projection question. That is
// not what the scout board is for. The product question is much nearer-term:
// HOW GOOD IS THIS FIGHTER AS THEY ARRIVE — at the Contender Series, and
// through their first handful of UFC bouts?
//
// That reframing fixes the statistics as much as the semantics. Top-15 gave 15
// held-out positives and capped every test at "underpowered"; arrival quality
// is measurable on EVERY graduate (~335), because they all have early UFC
// results. So this is both the question we care about and the one the data can
// actually answer.
//
// TARGETS (all near-term, all non-leaky w.r.t. the predictor):
//   • earlyWinRate — win rate over their first UFC bouts
//   • wonFirstUfc  — did they win their UFC debut
//   • eloAt1yr     — our UFC Elo one year after the tryout (point-in-time)
// PREDICTOR: the POINT-IN-TIME regional Elo entering the tryout
// (regional_ratings_pit.csv) — built only from bouts before the DWCS date, so
// none of the outcomes above are inside it.
//
// Run: node_modules/.bin/jiti research/regional/validateArrivalQuality.ts
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { auc, spearman, type Prediction } from '../backtest/metrics';

const tok = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');
const readCsv = (p: string) =>
  fs.existsSync(p)
    ? Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8'), { header: true, skipEmptyLines: true }).data
    : [];
const num = (s: string | undefined) => (s && s.trim() ? Number(s) : null);
const mean = (xs: number[]) => (xs.length ? xs.reduce((t, v) => t + v, 0) / xs.length : NaN);

interface S {
  name: string;
  pitElo: number;
  priorBouts: number;
  age: number | null;
  ufcFights: number;
  earlyWinRate: number;
  wonDebut: boolean | null;
  eloAt1yr: number | null;
}

function main(): void {
  const pit = new Map<string, { elo: number; bouts: number; age: number | null }>();
  for (const r of readCsv(path.join(process.cwd(), 'data', 'regional_ratings_pit.csv'))) {
    if (r.name && r.pitRegionalElo) {
      pit.set(tok(r.name), {
        elo: Number(r.pitRegionalElo),
        bouts: Number(r.priorBouts ?? 0),
        age: num(r.ageAtDwcs),
      });
    }
  }

  const subs: S[] = [];
  for (const f of readCsv(path.join(process.cwd(), 'data', 'dwcs_fighters.csv'))) {
    if (f.gotContract !== '1') continue;           // arrival quality is only defined once they arrive
    const p = pit.get(tok(f.name ?? ''));
    if (!p || p.bouts < 3) continue;               // a PIT rating on <3 bouts is mostly the 1500 prior
    const uf = num(f.ufcFights) ?? 0;
    const uw = num(f.ufcWins) ?? 0;
    if (uf < 1) continue;
    subs.push({
      name: f.name, pitElo: p.elo, priorBouts: p.bouts, age: p.age,
      ufcFights: uf, earlyWinRate: uw / uf,
      wonDebut: null, // debut result not in the cohort file; win rate carries this
      eloAt1yr: num(f.eloAt1yr),
    });
  }

  console.log('ARRIVAL QUALITY — does the regional rating describe how good they are ON ARRIVAL?');
  console.log(`(predictor: point-in-time regional Elo entering the tryout; n=${subs.length} graduates)\n`);
  if (subs.length < 60) { console.log('too thin.'); return; }

  // ── continuous association ──
  console.log('ASSOCIATION with early-UFC outcomes:');
  console.log(`  ρ(PIT regional Elo, UFC win rate)   ${spearman(subs.map((s) => s.pitElo), subs.map((s) => s.earlyWinRate)).toFixed(3)}   n=${subs.length}`);
  const withElo = subs.filter((s) => s.eloAt1yr != null);
  console.log(`  ρ(PIT regional Elo, our Elo @1yr)   ${spearman(withElo.map((s) => s.pitElo), withElo.map((s) => s.eloAt1yr!)).toFixed(3)}   n=${withElo.length}`);
  const withAge = subs.filter((s) => s.age != null);
  console.log(`  ρ(age at tryout, UFC win rate)      ${spearman(withAge.map((s) => s.age!), withAge.map((s) => s.earlyWinRate)).toFixed(3)}   n=${withAge.length}   [the incumbent signal]`);

  // ── banded read: does a better regional rating mean a better UFC start? ──
  console.log('\nEARLY-UFC RECORD BY REGIONAL-RATING BAND (entering the tryout):');
  const sorted = [...subs].sort((a, b) => b.pitElo - a.pitElo);
  const q = Math.floor(sorted.length / 4);
  const bands: [string, S[]][] = [
    ['top quartile', sorted.slice(0, q)],
    ['2nd', sorted.slice(q, 2 * q)],
    ['3rd', sorted.slice(2 * q, 3 * q)],
    ['bottom quartile', sorted.slice(3 * q)],
  ];
  for (const [label, g] of bands) {
    console.log(
      `  ${label.padEnd(16)} n=${String(g.length).padStart(3)}  mean PIT Elo ${mean(g.map((s) => s.pitElo)).toFixed(0)}` +
      `  early UFC win rate ${(100 * mean(g.map((s) => s.earlyWinRate))).toFixed(1)}%` +
      `  mean UFC fights ${mean(g.map((s) => s.ufcFights)).toFixed(1)}`
    );
  }

  // ── binary: beats .500 in the UFC ──
  const preds: Prediction[] = subs.map((s) => ({ p: s.pitElo, won: s.earlyWinRate > 0.5 }));
  const posn = preds.filter((p) => p.won).length;
  console.log(`\nAUC — PIT regional Elo ranking "winning UFC record so far": ${auc(preds).toFixed(3)}  (${posn}/${subs.length} positive)`);
  const agePreds: Prediction[] = withAge.map((s) => ({ p: -s.age!, won: s.earlyWinRate > 0.5 }));
  console.log(`AUC — age (younger better), same target:                    ${auc(agePreds).toFixed(3)}  n=${withAge.length}`);
  console.log('\nNOTE: association, not a held-out forecast — this asks whether the rating');
  console.log('DESCRIBES arriving quality, which is what the scout board claims to do.');
}

main();
