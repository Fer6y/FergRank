// buildProspects: the watchlist of NON-UFC fighters who have shared a cage with
// fighters who made the UFC — and especially those who BEAT them.
//
// Source: data/sherdog_fights.csv. Each row is a crosswalked (UFC-bound) fighter's
// non-UFC fight; its opponent is either another UFC fighter (in the crosswalk) or
// a non-UFC fighter. The latter are prospects. We can't see a prospect's full
// record (we never crawled their profile), but their results AGAINST future-UFC
// fighters are a high-signal proximity/quality measure — exactly the Phase-2
// "who's tearing up the regionals" tool. Pure read; touches no shared files.
//
// Run: npx tsx scripts/sherdog/buildProspects.ts
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const DATA = path.join(process.cwd(), 'data');
const FIGHTS = path.join(DATA, 'sherdog_fights.csv');
const CROSSWALK = path.join(DATA, 'sherdog_crosswalk.csv');
const OUT = path.join(DATA, 'sherdog_prospects.csv');

function crosswalkSherdogIds(): Set<string> {
  const ids = new Set<string>();
  if (!fs.existsSync(CROSSWALK)) return ids;
  for (const ln of fs.readFileSync(CROSSWALK, 'utf-8').split('\n').slice(1)) {
    const c = ln.split(',');
    if (c[2]) ids.add(c[2].trim()); // sherdogId column
  }
  return ids;
}

interface Prospect {
  sherdogId: string;
  name: string;
  beat: number;          // wins over UFC-bound fighters
  lostTo: number;        // losses to UFC-bound fighters
  topMultiplier: number; // best tier they faced these fighters at
  lastDate: string;
  notable: string[];     // "beat X (date)" highlights (wins first)
}

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function main() {
  if (!fs.existsSync(FIGHTS)) {
    console.error('sherdog_fights.csv not found — run buildContext.ts first.');
    process.exit(1);
  }
  const ufc = crosswalkSherdogIds();
  const rows = Papa.parse<Record<string, string>>(fs.readFileSync(FIGHTS, 'utf-8'), {
    header: true, skipEmptyLines: true,
  }).data;

  const map = new Map<string, Prospect>();
  for (const r of rows) {
    const oppId = (r['opponentSherdogId'] || '').trim();
    if (!oppId || ufc.has(oppId)) continue; // blank or a UFC fighter → not a prospect

    // r.result is the UFC-BOUND fighter's result; invert for the prospect.
    const ufcResult = (r['result'] || '').trim().toLowerCase();
    const prospectWon = ufcResult === 'loss';
    const prospectLost = ufcResult === 'win';
    if (!prospectWon && !prospectLost) continue; // draw / nc

    let p = map.get(oppId);
    if (!p) {
      p = { sherdogId: oppId, name: r['opponentName'] || oppId, beat: 0, lostTo: 0, topMultiplier: 0, lastDate: '', notable: [] };
      map.set(oppId, p);
    }
    const date = r['date'] || '';
    const ufcName = r['fullName'] || 'a UFC fighter';
    if (prospectWon) { p.beat++; p.notable.unshift(`beat ${ufcName} (${date})`); }
    else { p.lostTo++; }
    const mult = parseFloat(r['tierMultiplier']) || 0;
    if (mult > p.topMultiplier) p.topMultiplier = mult;
    if (date > p.lastDate) p.lastDate = date;
  }

  // Keep prospects who beat at least one UFC-bound fighter — the watchlist signal.
  const prospects = [...map.values()]
    .filter((p) => p.beat > 0)
    .sort((a, b) => b.beat - a.beat || b.lastDate.localeCompare(a.lastDate));

  const head = 'sherdogId,name,beatUFCBound,lostToUFCBound,topMultiplier,lastDate,notableWins';
  const lines = [head];
  for (const p of prospects) {
    lines.push([
      p.sherdogId, p.name, String(p.beat), String(p.lostTo),
      String(p.topMultiplier), p.lastDate, p.notable.slice(0, 4).join('; '),
    ].map(esc).join(','));
  }
  fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf-8');

  console.log(`prospects (beat ≥1 UFC-bound fighter): ${prospects.length}`);
  console.log(`wrote ${path.relative(process.cwd(), OUT)}\n`);

  const line = (p: Prospect) =>
    `  ${p.name.padEnd(24)} beat ${p.beat}, lost ${p.lostTo}  (best tier x${p.topMultiplier}, last ${p.lastDate})`;

  console.log('all-time (most UFC-bound fighters beaten):');
  for (const p of prospects.slice(0, 8)) console.log(line(p));

  // ACTIVE watchlist — the real prospect-discovery view: still fighting (faced a
  // UFC-bound opponent recently), ranked by how many they've beaten.
  const ACTIVE_SINCE = '2024-06-01';
  const active = prospects.filter((p) => p.lastDate >= ACTIVE_SINCE);
  console.log(`\nactive watchlist (faced a UFC-bound fighter since ${ACTIVE_SINCE}): ${active.length}`);
  for (const p of active.slice(0, 12)) console.log(line(p));
}

main();
