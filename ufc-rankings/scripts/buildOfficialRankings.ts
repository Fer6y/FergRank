// buildOfficialRankings: fetch the current UFC rankings from the live Octagon API
// and write them to a COMMITTED SNAPSHOT (data/official_rankings.csv).
//
// This pins the "UFC Rank" the app displays to versioned, git-visible,
// hand-overridable data instead of an uncontrolled live third-party fetch at
// request time — which was the source of the staleness. The app's runtime reader
// (src/lib/fetchOfficialRankings.ts) prefers this file; the live fetch is only a
// fallback for a fresh checkout that hasn't generated the snapshot yet.
//
// Refreshed by the weekly ingest (see scripts/sherdog/weeklyUpdate.ts) and
// runnable on demand from ufc-rankings/:
//   node_modules/.bin/jiti scripts/buildOfficialRankings.ts
//
// A flat (no-change) git diff on the output file after a run means Octagon itself
// hasn't updated its rankings — so the diff on this file IS the staleness detector
// the live fetch never gave us.
import fs from 'fs';
import path from 'path';
import { fetchLiveOfficialRankings } from '../src/lib/fetchOfficialRankings';

const OUT = path.join(process.cwd(), 'data', 'official_rankings.csv');
const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

async function main() {
  const rankings = await fetchLiveOfficialRankings();
  const divisions = Object.keys(rankings);

  // Never overwrite a good snapshot with nothing. If Octagon is down or returns
  // an empty payload, keep the last-known-good committed file — this is exactly
  // the outage the snapshot exists to survive.
  if (divisions.length === 0) {
    console.error('✗ Octagon returned no divisions — keeping existing snapshot, not overwriting.');
    process.exit(1);
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

main();
