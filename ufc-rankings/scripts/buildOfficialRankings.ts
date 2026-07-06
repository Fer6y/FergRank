// buildOfficialRankings: fetch the current UFC rankings and write them to a
// COMMITTED SNAPSHOT (data/official_rankings.csv).
//
// PRIMARY SOURCE: ufc.com/rankings directly (scripts/ufcstats/fetchUfcRankings.ts).
// The Octagon API we used before (api.octagon-api.com) lagged ufc.com by
// days/weeks — it kept returning old champions, which forced hand-maintenance via
// the overrides file. ufc.com serves the live board as parseable server-rendered
// HTML, so we read it straight. Octagon stays as an automatic FALLBACK if the
// ufc.com parse ever comes back empty (e.g. a page restructure).
//
// This pins the "UFC Rank" the app displays to versioned, git-visible,
// hand-overridable data instead of an uncontrolled live fetch at request time.
// The app's runtime reader (src/lib/fetchOfficialRankings.ts) prefers this file.
//
// Refreshed by the weekly ingest (see scripts/sherdog/weeklyUpdate.ts) and
// runnable on demand from ufc-rankings/:
//   node_modules/.bin/jiti scripts/buildOfficialRankings.ts
//
// A flat (no-change) git diff on the output file after a run means the UFC board
// itself hasn't changed — so the diff on this file IS the staleness detector.
import fs from 'fs';
import path from 'path';
import { fetchUfcComRankings } from './ufcstats/fetchUfcRankings';
import { fetchLiveOfficialRankings } from '../src/lib/fetchOfficialRankings';

const OUT = path.join(process.cwd(), 'data', 'official_rankings.csv');
const OVERRIDES = path.join(process.cwd(), 'data', 'official_rankings_overrides.csv');
const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// Rank slot order (champion first, then contenders). Overrides + leftovers fill
// these in order.
const RANK_ORDER = ['C', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];

interface RankEntry { rank: string; name: string; record?: string }
interface Override { division: string; rank: string; name: string }

// Manual corrections applied ON TOP of the Octagon fetch, so a hand-fix survives
// the weekly refresh (Octagon is sometimes stale — e.g. it kept listing the old
// LHW champion). Format: `division,rank,name` (header + # comments allowed).
function loadOverrides(): Override[] {
  if (!fs.existsSync(OVERRIDES)) return [];
  const out: Override[] = [];
  for (const raw of fs.readFileSync(OVERRIDES, 'utf-8').split('\n')) {
    const ln = raw.trim();
    if (!ln || ln.startsWith('#') || /^division\s*,/i.test(ln)) continue;
    const i1 = ln.indexOf(','), i2 = ln.indexOf(',', i1 + 1);
    if (i1 < 0 || i2 < 0) continue;
    const division = ln.slice(0, i1).trim().replace(/^"|"$/g, '');
    const rank = ln.slice(i1 + 1, i2).trim().replace(/^"|"$/g, '');
    const name = ln.slice(i2 + 1).trim().replace(/^"|"$/g, '');
    if (division && rank && name) out.push({ division, rank, name });
  }
  return out;
}

// For each overridden division: pin the named fighters at their given ranks, then
// backfill the remaining slots with the division's OTHER Octagon fighters in order
// (so pinning Ulberg→C bumps everyone below down one, no duplicates).
function applyOverrides(rankings: Record<string, RankEntry[]>, overrides: Override[]): number {
  const byDiv = new Map<string, Override[]>();
  for (const o of overrides) (byDiv.get(o.division) ?? byDiv.set(o.division, []).get(o.division)!).push(o);
  for (const [division, list] of byDiv) {
    const base = rankings[division] ?? [];
    const ovByRank = new Map(list.map((o) => [o.rank, o.name]));
    const pinned = new Set(list.map((o) => o.name));
    const recordOf = new Map(base.map((r) => [r.name, r.record ?? '']));
    const leftovers = base.filter((r) => !pinned.has(r.name));
    const result: RankEntry[] = [];
    let li = 0;
    for (const rk of RANK_ORDER) {
      if (ovByRank.has(rk)) {
        const name = ovByRank.get(rk)!;
        result.push({ rank: rk, name, record: recordOf.get(name) ?? '' });
      } else if (li < leftovers.length) {
        result.push({ rank: rk, name: leftovers[li].name, record: leftovers[li].record ?? '' });
        li++;
      }
    }
    rankings[division] = result;
  }
  return byDiv.size;
}

async function main() {
  // Primary: ufc.com/rankings. Fallback: Octagon API (only if ufc.com parses empty).
  let rankings = await fetchUfcComRankings();
  let source = 'ufc.com';
  if (Object.keys(rankings).length === 0) {
    console.warn('⚠ ufc.com returned no divisions — falling back to Octagon API.');
    rankings = await fetchLiveOfficialRankings();
    source = 'octagon';
  }
  const divisions = Object.keys(rankings);

  // Never overwrite a good snapshot with nothing. If BOTH sources are down or
  // return empty, keep the last-known-good committed file — this is exactly the
  // outage the snapshot exists to survive.
  if (divisions.length === 0) {
    console.error('✗ Both ufc.com and Octagon returned no divisions — keeping existing snapshot, not overwriting.');
    process.exit(1);
  }
  console.log(`source: ${source}`);

  // Apply manual overrides on top of the live fetch (survives the weekly refresh).
  const overrides = loadOverrides();
  if (overrides.length) {
    const n = applyOverrides(rankings, overrides);
    console.log(`applied ${overrides.length} override(s) across ${n} division(s) from ${path.basename(OVERRIDES)}`);
  }

  const lines = ['division,rank,name,record'];
  let rows = 0;
  for (const division of divisions) {
    for (const r of rankings[division]) {
      lines.push([division, r.rank, r.name, r.record ?? ''].map(esc).join(','));
      rows++;
    }
  }
  fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf-8');
  console.log(`wrote ${path.relative(process.cwd(), OUT)} — ${divisions.length} divisions, ${rows} ranked slots`);
}

// Offline self-test: verify applyOverrides pins + backfills without an Octagon
// fetch. Run: node_modules/.bin/jiti scripts/buildOfficialRankings.ts --selftest
if (process.argv.includes('--selftest')) {
  const mock: Record<string, RankEntry[]> = {
    'Light Heavyweight': [
      { rank: 'C', name: 'Magomed Ankalaev' }, { rank: '1', name: 'Alex Pereira' },
      { rank: '2', name: 'Jiří Procházka' }, { rank: '3', name: 'Carlos Ulberg' },
      { rank: '4', name: 'Khalil Rountree Jr.' },
    ],
  };
  applyOverrides(mock, loadOverrides());
  console.log(mock['Light Heavyweight'].map((r) => `${r.rank}:${r.name}`).join('  '));
} else {
  main();
}
