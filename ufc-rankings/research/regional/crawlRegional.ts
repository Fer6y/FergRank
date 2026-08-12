// research/regional/crawlRegional.ts — build the MODERN regional fight graph.
//
// Seeds from Fight Matrix division rankings (which rank far deeper than any
// promotion's own list, well into fighters who have never been near the UFC),
// then optionally walks ONE hop out to opponents. That hop is the whole point:
// it is what links promotions to each other, which is what makes a
// cross-promotion rating possible at all.
//
// Politeness: every page is fetched once and cached forever, 2.5s between live
// requests, identifying UA. Bounded by --limit so a pilot can prove the
// pipeline before any long crawl is authorised.
//
// Run (pilot):  node_modules/.bin/jiti research/regional/crawlRegional.ts --limit 40
// Run (hop):    ... --limit 40 --hop
// Output: data/regional_fights.csv (one row per bout-side, deduped on write)
import fs from 'fs';
import path from 'path';
import { politeFetch, parseFmProfile, parseFmRanking } from './fightMatrix';

const BASE = 'https://www.fightmatrix.com';
const OUT = path.join(process.cwd(), 'data', 'regional_fights.csv');
const DIVISIONS = [
  'flyweight', 'bantamweight', 'featherweight', 'lightweight',
  'welterweight', 'middleweight', 'light-heavyweight', 'heavyweight',
];

const arg = (f: string, d: number) => {
  const i = process.argv.indexOf(f);
  return i > 0 ? Number(process.argv[i + 1]) || d : d;
};

async function main(): Promise<void> {
  const limit = arg('--limit', 40);
  const hop = process.argv.includes('--hop');
  const pages = arg('--pages', 2);

  // ── seed ──
  const seed = new Map<string, string>(); // fmId → name
  for (const div of DIVISIONS) {
    for (let p = 1; p <= pages; p++) {
      const url = `${BASE}/mma-ranks/${div}/${p > 1 ? `?Page=${p}` : ''}`;
      try {
        for (const f of parseFmRanking(await politeFetch(url))) seed.set(f.fmId, f.name);
      } catch (e) {
        console.error(`[seed] ${div} p${p}: ${(e as Error).message}`);
      }
    }
    console.log(`[seed] after ${div}: ${seed.size} fighters`);
  }

  const queue = [...seed.entries()].slice(0, limit);
  const done = new Set<string>();
  const rows: string[] = [];
  const hopIds = new Map<string, string>();

  const crawl = async (fmId: string, name: string) => {
    if (done.has(fmId)) return;
    done.add(fmId);
    const url = `${BASE}/fighter-profile/${encodeURIComponent(name)}/${fmId}/`;
    let prof;
    try {
      prof = parseFmProfile(await politeFetch(url));
    } catch (e) {
      console.error(`[crawl] ${name}: ${(e as Error).message}`);
      return;
    }
    for (const f of prof.fights) {
      const esc = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
      rows.push(
        [
          fmId, esc(prof.name || name), f.date, esc(f.promotion), esc(f.event),
          f.opponentId, esc(f.opponentName), esc(f.opponentRank), f.result, esc(f.method),
        ].join(',')
      );
      if (f.opponentId && !seed.has(f.opponentId)) hopIds.set(f.opponentId, f.opponentName);
    }
    if (done.size % 10 === 0) console.log(`[crawl] ${done.size} profiles → ${rows.length} fight rows`);
  };

  for (const [id, name] of queue) await crawl(id, name);

  if (hop) {
    const hopQueue = [...hopIds.entries()].slice(0, limit);
    console.log(`[hop] walking ${hopQueue.length} opponents (of ${hopIds.size} discovered)`);
    for (const [id, name] of hopQueue) await crawl(id, name);
  }

  fs.writeFileSync(
    OUT,
    'fmId,name,date,promotion,event,opponentFmId,opponentName,opponentRankAtTime,result,method\n' +
      rows.join('\n') + '\n'
  );
  const promos = new Map<string, number>();
  for (const r of rows) {
    const p = r.split(',')[3];
    promos.set(p, (promos.get(p) ?? 0) + 1);
  }
  console.log(`\n[done] ${done.size} profiles, ${rows.length} fight rows → ${OUT}`);
  console.log(`[done] ${promos.size} distinct promotions; top:`,
    [...promos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}:${v}`).join(' '));
}

main().catch((e) => { console.error(e); process.exit(1); });
