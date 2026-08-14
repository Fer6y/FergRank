// research/regional/pitRegional.ts — POINT-IN-TIME regional Elo.
//
// WHY THIS EXISTS. The settled regional rating cannot be used to predict UFC
// outcomes: the regional graph contains UFC fights and the sweep runs to today,
// so the rating already contains the result. Measured 2026-08-12 — DWCS
// entrants who reached the UFC top 15 carry 8.1 post-DWCS UFC bouts inside
// their rating vs 2.9 for those who didn't, which is why a naive test returned
// a fantastical held-out AUC of 0.879 against age's 0.734.
//
// The honest question is what a scout could have known ON THE NIGHT: a
// fighter's regional rating built ONLY from bouts strictly before their tryout.
// The sweep is already chronological, so this is a pure read — snapshot each
// fighter's rating as the sweep passes their cutoff date. Same discipline as
// FightTrace.ratingBefore / PitAdjuster.ratingAsOf in the UFC backtests.
//
// Emits data/regional_ratings_pit.csv (DWCS entrants: rating entering the
// tryout) and runs the corrected predictive test against an age baseline on a
// temporal split. Nothing here changes a score; a scored proposal must clear
// the pre-registered bar in docs/plans/CAREER_STAGE_PLAN.md.
//
// Run: node_modules/.bin/jiti research/regional/pitRegional.ts
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { fitLogistic, predictLogistic, auc, type Prediction } from '../backtest/metrics';

const K_BASE = 24, K_PROV = 40, PROV_FIGHTS = 4, INIT = 1500;
const MIN_PRIOR_BOUTS = 3; // below this a PIT rating is mostly the 1500 prior

const tok = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');
const readCsv = (p: string) =>
  fs.existsSync(p)
    ? Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8'), { header: true, skipEmptyLines: true }).data
    : [];
const yb = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / (365.25 * 86_400_000);

function main(): void {
  // ── cutoffs: for each DWCS entrant, the date of their first tryout ──
  const cutoff = new Map<string, { date: string; top15: number; name: string }>();
  for (const f of readCsv(path.join(process.cwd(), 'data', 'dwcs_fighters.csv'))) {
    const k = tok(f.name ?? '');
    if (k && f.firstDwcsDate) cutoff.set(k, { date: f.firstDwcsDate, top15: f.reachedTop15 === '1' ? 1 : 0, name: f.name });
  }

  // ── de-duplicate bouts (same construction as rateRegional) ──
  const bouts = new Map<string, { date: string; a: string; b: string; sa: number }>();
  const nameOf = new Map<string, string>();
  for (const r of readCsv(path.join(process.cwd(), 'data', 'regional_fights.csv'))) {
    if (!r.fmId || !r.opponentFmId || !r.date || !/^\d{4}-/.test(r.date)) continue;
    const sa = r.result === 'W' ? 1 : r.result === 'L' ? 0 : r.result === 'D' ? 0.5 : -1;
    if (sa < 0) continue;
    nameOf.set(r.fmId, r.name);
    nameOf.set(r.opponentFmId, r.opponentName);
    const [x, y] = [r.fmId, r.opponentFmId].sort();
    const key = `${x}|${y}|${r.date}`;
    if (!bouts.has(key)) bouts.set(key, { date: r.date, a: r.fmId, b: r.opponentFmId, sa });
  }
  const ordered = [...bouts.values()].sort((p, q) => (p.date < q.date ? -1 : p.date > q.date ? 1 : 0));

  // ── chronological sweep, snapshotting at each fighter's cutoff ──
  const rating = new Map<string, number>();
  const n = new Map<string, number>();
  const snap = new Map<string, { elo: number; bouts: number }>(); // fmId → rating entering their tryout
  const get = (id: string) => rating.get(id) ?? INIT;

  // fmId → cutoff date (resolve by name, since DWCS data is name-keyed)
  const cutoffById = new Map<string, string>();
  for (const [id, nm] of nameOf) {
    const c = cutoff.get(tok(nm ?? ''));
    if (c) cutoffById.set(id, c.date);
  }

  for (const b of ordered) {
    // Snapshot BEFORE processing any bout at or after the cutoff — so the
    // recorded rating reflects strictly earlier fights.
    for (const id of [b.a, b.b]) {
      const cd = cutoffById.get(id);
      if (cd && !snap.has(id) && b.date >= cd) snap.set(id, { elo: get(id), bouts: n.get(id) ?? 0 });
    }
    const ra = get(b.a), rb = get(b.b);
    const na = n.get(b.a) ?? 0, nb = n.get(b.b) ?? 0;
    const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
    rating.set(b.a, ra + (na < PROV_FIGHTS ? K_PROV : K_BASE) * (b.sa - ea));
    rating.set(b.b, rb + (nb < PROV_FIGHTS ? K_PROV : K_BASE) * ((1 - b.sa) - (1 - ea)));
    n.set(b.a, na + 1);
    n.set(b.b, nb + 1);
  }
  // Fighters whose entire career precedes their cutoff never triggered the
  // snapshot above; their final rating IS their pre-cutoff rating.
  for (const [id, cd] of cutoffById) {
    if (!snap.has(id) && rating.has(id)) snap.set(id, { elo: get(id), bouts: n.get(id) ?? 0 });
    void cd;
  }

  // ── assemble subjects ──
  const dob = new Map<string, string>();
  for (const r of readCsv(path.join(process.cwd(), 'data', 'regional_dob.csv'))) {
    if (r.status === 'found' && r.dob && r.name) dob.set(tok(r.name), r.dob);
  }
  interface S { name: string; season: number; age: number | null; pitElo: number; priorBouts: number; top15: number }
  const subs: S[] = [];
  const rows: Record<string, string | number>[] = [];
  for (const [id, s] of snap) {
    const k = tok(nameOf.get(id) ?? '');
    const c = cutoff.get(k);
    if (!c) continue;
    const d = dob.get(k);
    const age = d ? yb(d, c.date) : null;
    rows.push({
      fmId: id, name: nameOf.get(id) ?? '', dwcsDate: c.date,
      pitRegionalElo: s.elo.toFixed(1), priorBouts: s.bouts,
      ageAtDwcs: age != null ? age.toFixed(1) : '', reachedTop15: c.top15,
    });
    if (s.bouts >= MIN_PRIOR_BOUTS) {
      subs.push({ name: c.name, season: Number(c.date.slice(0, 4)), age, pitElo: s.elo, priorBouts: s.bouts, top15: c.top15 });
    }
  }
  const out = path.join(process.cwd(), 'data', 'regional_ratings_pit.csv');
  fs.writeFileSync(out, Papa.unparse(rows) + '\n');
  console.log(`POINT-IN-TIME REGIONAL ELO — ${ordered.length} bouts swept, ${rows.length} DWCS entrants snapshotted`);
  console.log(`wrote ${out}`);
  console.log(`${subs.length} have ${MIN_PRIOR_BOUTS}+ prior bouts (a PIT rating below that is mostly the 1500 prior)\n`);

  // ── the corrected test ──
  const withAge = subs.filter((s) => s.age != null);
  const train = withAge.filter((s) => s.season < 2022);
  const test = withAge.filter((s) => s.season >= 2022);
  const pos = test.reduce((t, s) => t + s.top15, 0);
  console.log(`CORRECTED TEST (no leak): fit ${train.length} pre-2022, score ${test.length} from 2022+, ${pos} positives`);
  if (train.length < 40 || test.length < 30 || pos < 3) { console.log('  insufficient sample.'); return; }

  const FEATS: [string, (s: S) => number[]][] = [
    ['age only', (s) => [(s.age! - 27) / 5]],
    ['PIT regional Elo only', (s) => [(s.pitElo - 1500) / 50]],
    ['age + PIT Elo', (s) => [(s.age! - 27) / 5, (s.pitElo - 1500) / 50]],
  ];
  const y = train.map((s) => s.top15);
  for (const [label, fx] of FEATS) {
    const w = fitLogistic(train.map(fx), y);
    const preds: Prediction[] = test.map((s) => ({ p: predictLogistic(w, fx(s)), won: s.top15 === 1 }));
    console.log(`  ${label.padEnd(22)} held-out AUC ${auc(preds).toFixed(3)}`);
  }
  console.log(`\n  For contrast, the LEAKED settled-rating version scored 0.879 — the gap between`);
  console.log(`  that and the number above is exactly how much of it was hindsight.`);
}

main();
