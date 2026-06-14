// ─────────────────────────────────────────────────────────────────────────
//  research/bfo/crossValidate.ts — sanity-check the two odds sources agree.
//
//  We now have two independent closing-odds feeds: the consensus set
//  (data/closing_odds.csv, 2014–2023) and BFO (data/bfo_odds.csv, 2021–2026).
//  Where they overlap (2021–2023) they should agree closely — if they do, both
//  are trustworthy; a big gap would flag a parsing or de-vig bug in one.
//
//  Run:  node_modules/.bin/jiti research/bfo/crossValidate.ts
// ─────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { normalize } from '../../src/lib/nameResolver';

const DATA = path.join(process.cwd(), 'data');
type Row = Record<string, string>;
const read = (f: string): Row[] =>
  Papa.parse<Row>(fs.readFileSync(path.join(DATA, f), 'utf-8'), { header: true, skipEmptyLines: true }).data;

const dayNum = (d: string) => Math.floor(new Date(d).getTime() / 86_400_000);
const impliedP1 = (o1: number, o2: number) => (1 / o1) / (1 / o1 + 1 / o2);
const pairKey = (a: string, b: string) => [normalize(a), normalize(b)].sort().join('|');

function main(): void {
  // Consensus index: pairKey → {day, favNorm, favProb}[]
  const consensus = new Map<string, { day: number; favNorm: string; favProb: number }[]>();
  for (const r of read('closing_odds.csv')) {
    const fo = parseFloat(r['favourite_odds']);
    const uo = parseFloat(r['underdog_odds']);
    if (!fo || !uo || !r['date']) continue;
    const key = pairKey(r['favourite'], r['underdog']);
    if (!consensus.has(key)) consensus.set(key, []);
    consensus.get(key)!.push({ day: dayNum(r['date']), favNorm: normalize(r['favourite']), favProb: impliedP1(fo, uo) });
  }

  let matched = 0, sumAbs = 0, within3 = 0, favFlip = 0;
  const worst: { d: number; line: string }[] = [];
  for (const r of read('bfo_odds.csv')) {
    const c1 = parseFloat(r['close1']);
    const c2 = parseFloat(r['close2']);
    const y = (r['date'] || '').slice(0, 4);
    if (!c1 || !c2 || y < '2021' || y > '2023') continue; // overlap window only
    const cands = consensus.get(pairKey(r['fighter1'], r['fighter2']));
    if (!cands) continue;
    const day = dayNum(r['date']);
    const hit = cands.find((c) => Math.abs(c.day - day) <= 3);
    if (!hit) continue;

    matched++;
    const bfoP1 = impliedP1(c1, c2);
    const consP1 = hit.favNorm === normalize(r['fighter1']) ? hit.favProb : 1 - hit.favProb;
    const diff = Math.abs(bfoP1 - consP1);
    sumAbs += diff;
    if (diff <= 0.03) within3++;
    if ((bfoP1 >= 0.5) !== (consP1 >= 0.5)) favFlip++;
    worst.push({ d: diff, line: `${r['date']}  ${r['fighter1']} vs ${r['fighter2']}: BFO ${(bfoP1 * 100).toFixed(0)}% vs consensus ${(consP1 * 100).toFixed(0)}%` });
  }
  worst.sort((a, b) => b.d - a.d);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  BFO ↔ CONSENSUS CROSS-VALIDATION (2021–2023 overlap)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  fights matched in both sources : ${matched}`);
  console.log(`  mean |P(fighter1) difference|  : ${(100 * sumAbs / (matched || 1)).toFixed(2)} pts`);
  console.log(`  within 3 points                : ${(100 * within3 / (matched || 1)).toFixed(1)}%`);
  console.log(`  disagree on who's favourite    : ${favFlip}  (${(100 * favFlip / (matched || 1)).toFixed(1)}%)`);
  console.log('  largest gaps (likely name/date mismatches, not real disagreement):');
  for (const w of worst.slice(0, 6)) console.log(`    ${w.line}`);
}

main();
