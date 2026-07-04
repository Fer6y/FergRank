// dwcsCohort.ts — does HOW you won on the Contender Series predict UFC success?
//
// DWCS is a UFC tryout, and the show explicitly rewards FINISHES with on-the-spot
// contracts. So a DWCS finish should be a stronger prospect signal than a DWCS
// decision. This script tests that: it buckets every DWCS graduate by their best
// DWCS outcome (finish win / decision win / no win) and compares their settled
// UFC Elo gain. If finishers clearly out-gain decision-winners, a method-aware
// DWCS "showcase" term is worth building; if not, the schedule signal (B.1)
// already captures what matters and we leave it.
//
// Run: node_modules/.bin/jiti scripts/sherdog/dwcsCohort.ts
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../../src/lib/loadData';
import { buildEloRatings } from '../../src/lib/eloEngine';
import { RANKING_CONFIG } from '../../src/lib/rankingConfig';

const isFinish = (method: string): boolean => /^(KO|TKO|Submission|Technical Submission)/i.test(method.trim());
const isDecision = (method: string): boolean => /^Decision/i.test(method.trim());

interface Cohort { gains: number[] }
function mean(xs: number[]): number { return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : NaN; }
function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function main() {
  const data = loadAllData();
  const ratings = buildEloRatings(data);
  const file = path.join(process.cwd(), 'data', 'sherdog_fights.csv');
  const rows = Papa.parse<Record<string, string>>(fs.readFileSync(file, 'utf-8'), { header: true, skipEmptyLines: true }).data;

  // Per fighter: best DWCS outcome.
  const dwcs = new Map<string, { finishWin: boolean; decisionWin: boolean; anyWin: boolean }>();
  for (const r of rows) {
    const org = (r['canonicalOrg'] || '') + ' ' + (r['organisation'] || '');
    if (!/Contender/i.test(org)) continue;
    const fid = r['ourFighterId']; if (!fid) continue;
    const win = (r['result'] || '').trim().toLowerCase() === 'win';
    const method = r['method'] || '';
    let e = dwcs.get(fid);
    if (!e) { e = { finishWin: false, decisionWin: false, anyWin: false }; dwcs.set(fid, e); }
    if (win) {
      e.anyWin = true;
      if (isFinish(method)) e.finishWin = true;
      else if (isDecision(method)) e.decisionWin = true;
    }
  }

  const finish: Cohort = { gains: [] };
  const decision: Cohort = { gains: [] };
  const noWin: Cohort = { gains: [] };
  let noUFC = 0;
  for (const [fid, e] of dwcs) {
    const st = ratings.get(fid);
    if (!st || st.fights < 1) { noUFC++; continue; }
    const gain = st.rating - RANKING_CONFIG.elo.initialRating;
    if (e.finishWin) finish.gains.push(gain);
    else if (e.decisionWin) decision.gains.push(gain);
    else noWin.gains.push(gain);
  }

  const line = (label: string, c: Cohort) => {
    const n = c.gains.length;
    const won = c.gains.filter((g) => g > 0).length;
    console.log(
      `  ${label.padEnd(22)} n=${String(n).padStart(3)}   meanEloGain ${mean(c.gains).toFixed(1).padStart(6)}   ` +
      `median ${median(c.gains).toFixed(1).padStart(6)}   above-1500 ${(100 * won / (n || 1)).toFixed(0)}%`,
    );
  };

  console.log(`DWCS COHORTS — settled UFC Elo gain by best DWCS outcome  (${dwcs.size} DWCS fighters, ${noUFC} no UFC sample)\n`);
  line('Finish win', finish);
  line('Decision win', decision);
  line('No win (loss/nc)', noWin);
  console.log(`\n  finish − decision gap: ${(mean(finish.gains) - mean(decision.gains)).toFixed(1)} Elo`);
  console.log(`  (positive = DWCS finishers out-perform decision-winners in the UFC → a method-aware term has signal)`);
}

main();
