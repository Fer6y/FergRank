// ─────────────────────────────────────────────────────────────────────────
//  research/dwcs/exportDwcsAnalysis.ts — Phase D of docs/plans/DWCS_PLAN.md.
//
//  Aggregates the DWCS cohort study into data/dwcs_analysis.json for the
//  /contender-series page (offline-built → static JSON → ISR page, the same
//  pattern as exportAnalysis.ts → /odds). The odds block is NULLABLE — the
//  page renders without it if the BFO crawl found nothing.
//
//  Cells with n < 25 carry null rates ("insufficient sample" in the UI).
//  Run AFTER buildDwcsDataset.ts (and scrapeDwcs.ts if refreshing odds):
//    node_modules/.bin/jiti research/dwcs/exportDwcsAnalysis.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { devig } from '../backtest/devig';
import { score, type Prediction } from '../backtest/metrics';
import { loadDwcsBouts, joinDwcsOdds } from './joinDwcsOdds';

const MIN_CELL = 25;
const r3 = (x: number): number => Math.round(x * 1000) / 1000;
const r1 = (x: number): number => Math.round(x * 10) / 10;

interface FRow {
  sherdogId: string;
  ourId: string;
  name: string;
  dwcsRecord: string;
  firstDwcsDate: string;
  bestDwcsResult: string;
  dwcsMethod: string;
  preDwcsWins: string;
  preDwcsLosses: string;
  preDwcsDraws: string;
  preDwcsSource: string;
  feederOrg: string;
  feederTier: string;
  ageAtDwcs: string;
  gotContract: string;
  ufcFights: string;
  ufcWins: string;
  ufcLosses: string;
  settledEloGain: string;
  reachedTop15: string;
}

export interface BucketRow {
  label: string;
  n: number;
  top15Rate: number | null;   // null = suppressed (n < MIN_CELL)
  meanEloGain: number | null;
}

const num = (s: string): number | null => (s === '' || s == null ? null : Number(s));
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

function bucketize(rows: FRow[], labelOf: (f: FRow) => string | null, order: string[]): BucketRow[] {
  return order.map((label) => {
    const g = rows.filter((f) => labelOf(f) === label);
    const gains = g.map((f) => num(f.settledEloGain)).filter((v): v is number => v != null);
    return {
      label,
      n: g.length,
      top15Rate: g.length >= MIN_CELL ? r3(mean(g.map((f) => (f.reachedTop15 === '1' ? 1 : 0)))) : null,
      meanEloGain: gains.length >= MIN_CELL ? r1(mean(gains)) : null,
    };
  });
}

function main(): void {
  const fCsv = fs.readFileSync(path.join(process.cwd(), 'data', 'dwcs_fighters.csv'), 'utf8');
  const fighters = Papa.parse<FRow>(fCsv, { header: true, skipEmptyLines: true }).data;
  const bouts = loadDwcsBouts();
  const grads = fighters.filter((f) => f.gotContract === '1');

  // ── season table ────────────────────────────────────────────────────
  const seasons = [...new Set(bouts.map((b) => Number(b.season)))].sort();
  const seasonTable = seasons.map((season) => {
    const sb = bouts.filter((b) => Number(b.season) === season);
    const decided = sb.filter((b) => b.winnerSherdogId);
    const finishes = decided.filter((b) => /^(KO|TKO|Submission|Technical Submission)/i.test(b.method));
    const entrants = fighters.filter((f) => f.firstDwcsDate.startsWith(String(season)));
    return {
      season,
      bouts: sb.length,
      finishRate: decided.length ? r3(finishes.length / decided.length) : null,
      entrants: entrants.length,
      contractRate: entrants.length ? r3(mean(entrants.map((f) => (f.gotContract === '1' ? 1 : 0)))) : null,
      top15: entrants.filter((f) => f.reachedTop15 === '1').length,
    };
  });

  // ── H4: contract rate by DWCS result (full denominator) ─────────────
  const byResult = (['finishWin', 'decisionWin', 'noWin'] as const).map((k) => {
    const g = fighters.filter((f) => f.bestDwcsResult === k);
    return {
      label: k === 'finishWin' ? 'Finish win' : k === 'decisionWin' ? 'Decision win' : 'No DWCS win',
      n: g.length,
      contractRate: g.length >= MIN_CELL ? r3(mean(g.map((f) => (f.gotContract === '1' ? 1 : 0)))) : null,
    };
  });

  // ── record-shape buckets (graduates only) ───────────────────────────
  const preFights = (f: FRow): number | null => {
    const w = num(f.preDwcsWins);
    const l = num(f.preDwcsLosses);
    return w != null && l != null ? w + l + (num(f.preDwcsDraws) ?? 0) : null;
  };
  const recordShape = {
    experience: bucketize(
      grads,
      (f) => {
        const n = preFights(f);
        return n == null ? null : n <= 5 ? '≤5 fights' : n <= 10 ? '6–10 fights' : '11+ fights';
      },
      ['≤5 fights', '6–10 fights', '11+ fights']
    ),
    losses: bucketize(
      grads,
      (f) => {
        const l = num(f.preDwcsLosses);
        return l == null ? null : l === 0 ? 'Undefeated' : l === 1 ? '1 loss' : l === 2 ? '2 losses' : '3+ losses';
      },
      ['Undefeated', '1 loss', '2 losses', '3+ losses']
    ),
    age: bucketize(
      grads,
      (f) => {
        const a = num(f.ageAtDwcs);
        return a == null ? null : a < 25 ? 'Under 25' : a <= 28 ? '25–28' : '29+';
      },
      ['Under 25', '25–28', '29+']
    ),
  };

  // ── feeder promotions (graduates; tier stats + top orgs) ────────────
  const tiers = bucketize(
    grads,
    (f) => (f.feederTier ? f.feederTier : null),
    ['tier2_5', 'tier3', 'tier4']
  );
  const orgCounts = new Map<string, FRow[]>();
  for (const f of grads) {
    if (!f.feederOrg) continue;
    orgCounts.set(f.feederOrg, [...(orgCounts.get(f.feederOrg) ?? []), f]);
  }
  const topOrgs = [...orgCounts.entries()]
    .filter(([, g]) => g.length >= 5)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 12)
    .map(([org, g]) => ({
      org,
      n: g.length,
      top15: g.filter((f) => f.reachedTop15 === '1').length,
    }));

  // ── odds block (nullable) ───────────────────────────────────────────
  let odds: Record<string, unknown> | null = null;
  const { joined } = joinDwcsOdds(bouts);
  if (joined.length >= MIN_CELL) {
    const preds: Prediction[] = [];
    const pFavs: number[] = [];
    for (const j of joined) {
      if (!j.bout.winnerSherdogId) continue;
      const favIsA = j.closeA <= j.closeB;
      const [f, d] = favIsA ? [j.closeA, j.closeB] : [j.closeB, j.closeA];
      const { pFav } = devig(f, d, 'power');
      preds.push({ p: pFav, won: j.bout.winnerSherdogId === (favIsA ? j.bout.sherdogIdA : j.bout.sherdogIdB) });
      pFavs.push(pFav);
    }
    const s = score(preds);
    const dates = joined.map((j) => j.bout.date).sort();
    odds = {
      n: s.n,
      span: `${dates[0]} → ${dates[dates.length - 1]}`,
      accuracy: r3(s.accuracy),
      logLoss: r3(s.logLoss),
      ece: r3(s.ece),
      favWinRate: r3(mean(preds.map((p) => (p.won ? 1 : 0)))),
      meanPFav: r3(mean(pFavs)),
      coveredBouts: joined.length,
      totalBouts: bouts.length,
    };
  }

  // ── graduates currently in the official top 15 ─────────────────────
  const rankedGrads = grads
    .filter((f) => f.reachedTop15 === '1' && f.ourId)
    .sort((a, b) => (num(b.settledEloGain) ?? 0) - (num(a.settledEloGain) ?? 0))
    .map((f) => ({ ourId: f.ourId, name: f.name, dwcsYear: Number(f.firstDwcsDate.slice(0, 4)) }));

  // ── per-fighter chips for /prospects: "DWCS '23 W (KO R1) · came in
  //    13-1 from LFA". method/record/feeder are nullable — render degrades. ──
  const chips: Record<
    string,
    { result: 'W' | 'L' | 'D' | 'NC'; year: number; method: string | null; cameIn: string | null; feederOrg: string | null }
  > = {};
  for (const f of fighters) {
    if (!f.ourId) continue;
    const [w, l, d] = f.dwcsRecord.split('-').map((x) => Number(x) || 0);
    const pw = num(f.preDwcsWins);
    const pl = num(f.preDwcsLosses);
    const pd = num(f.preDwcsDraws) ?? 0;
    chips[f.ourId] = {
      result: w > 0 ? 'W' : l > 0 ? 'L' : d > 0 ? 'D' : 'NC',
      year: Number(f.firstDwcsDate.slice(0, 4)),
      method: f.dwcsMethod || null,
      cameIn: pw != null && pl != null ? (pd ? `${pw}-${pl}-${pd}` : `${pw}-${pl}`) : null,
      feederOrg: f.feederOrg || null,
    };
  }

  const out = {
    summary: {
      generatedAt: new Date().toISOString().slice(0, 10),
      bouts: bouts.length,
      participants: fighters.length,
      graduates: grads.length,
      contractRate: r3(grads.length / fighters.length),
      gradTop15Rate: r3(mean(grads.map((f) => (f.reachedTop15 === '1' ? 1 : 0)))),
      seasons: `${seasons[0]}–${seasons[seasons.length - 1]}`,
    },
    seasonTable,
    byResult,
    recordShape,
    tiers,
    topOrgs,
    odds,
    rankedGrads,
    chips,
  };

  const p = path.join(process.cwd(), 'data', 'dwcs_analysis.json');
  fs.writeFileSync(p, JSON.stringify(out, null, 1));
  console.log(`[dwcs-export] wrote ${p}`);
  console.log(`[dwcs-export] ${fighters.length} participants, ${grads.length} graduates, odds block: ${odds ? `${odds.n} bouts` : 'ABSENT'}`);
  console.log(`[dwcs-export] ${rankedGrads.length} graduates currently in the official top 15, ${Object.keys(chips).length} chips`);
}

main();
