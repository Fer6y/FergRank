// research/regional/refreshProfiles.ts — targeted profile REFRESH for the
// regional graph.
//
// WHY THIS EXISTS. The crawl is deliberately fetch-once-forever at BOTH layers:
// politeFetch caches every URL to disk with no TTL, and crawlDeep skips any
// fmId already present in regional_fights.csv. That is right for a bulk crawl
// and wrong for folding in NEW results — a fighter who fights again (e.g. a
// Contender Series entrant) can never update through crawlDeep alone. This
// script closes that gap for a NAMED set of fighters: evict their cached
// profile HTML, re-fetch live, and REPLACE their rows in regional_fights.csv.
//
// It also re-seeds event discovery for the fighters we DON'T know: a refreshed
// profile's HTML lands in the cache, so a new event it links (the DWCS card)
// becomes discoverable by crawlDeep's eventIdsFromCache on the next run, which
// then harvests and crawls the card's previously-unknown fighters.
//
// Usage:
//   jiti research/regional/refreshProfiles.ts <fmId> [<fmId> ...]
//   jiti research/regional/refreshProfiles.ts --card   ← every dwcs_upcoming.csv
//                                                        name found in the graph
//
// After a refresh that changed rows, run the downstream chain:
//   crawlDeep → rateRegional → arrivalRegional → pitRegional → mergeEspnDob
//   → exportDwcsAnalysis.
import fs from 'fs';
import path from 'path';
import { politeFetch, parseFmProfile } from './fightMatrix';

const BASE = 'https://www.fightmatrix.com';
const CACHE = path.join(process.cwd(), 'research', 'regional', '.cache');
const OUT = path.join(process.cwd(), 'data', 'regional_fights.csv');
const UPCOMING = path.join(process.cwd(), 'data', 'dwcs_upcoming.csv');

const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const normName = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').trim();

interface Row { fmId: string; name: string; raw: string }

function readGraph(): { header: string; rows: Row[] } {
  const lines = fs.readFileSync(OUT, 'utf-8').split('\n');
  const rows: Row[] = [];
  for (const raw of lines.slice(1)) {
    if (!raw) continue;
    const c = raw.split(',');
    rows.push({ fmId: c[0], name: (c[1] ?? '').replace(/^"|"$/g, ''), raw });
  }
  return { header: lines[0], rows };
}

// dwcs_upcoming.csv names → fmIds via the graph (exact normalized-name match;
// an ambiguous name — two fmIds — is SKIPPED, never guessed, same rule as the
// ratings loader).
function cardFmIds(rows: Row[]): string[] {
  const byName = new Map<string, Set<string>>();
  for (const r of rows) {
    const k = normName(r.name);
    if (!byName.has(k)) byName.set(k, new Set());
    byName.get(k)!.add(r.fmId);
  }
  const csv = fs.readFileSync(UPCOMING, 'utf-8').split('\n');
  const head = csv[0].split(',');
  const i1 = head.indexOf('f1_name');
  const i2 = head.indexOf('f2_name');
  const ids: string[] = [];
  for (const ln of csv.slice(1)) {
    if (!ln) continue;
    const c = ln.split(',');
    for (const name of [c[i1], c[i2]]) {
      const hit = byName.get(normName(name ?? ''));
      if (!hit) console.log(`[card] ${name}: not in the graph — needs event-page discovery via crawlDeep`);
      else if (hit.size > 1) console.log(`[card] ${name}: AMBIGUOUS (${[...hit].join(', ')}) — skipped, refresh by explicit fmId`);
      else ids.push([...hit][0]);
    }
  }
  return ids;
}

function evictCache(fmId: string): number {
  let n = 0;
  for (const f of fs.readdirSync(CACHE)) {
    if (f.startsWith('fighter_profile_') && f.endsWith(`_${fmId}.html`)) {
      fs.unlinkSync(path.join(CACHE, f));
      n++;
    }
  }
  return n;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('usage: refreshProfiles.ts <fmId> [...] | --card');
    process.exit(1);
  }
  const graph = readGraph();
  const nameById = new Map(graph.rows.map((r) => [r.fmId, r.name]));
  const ids = args[0] === '--card' ? cardFmIds(graph.rows) : args;

  let changed = false;
  const kept = graph.rows.filter((r) => !ids.includes(r.fmId));
  const fresh: string[] = [];

  for (const fmId of ids) {
    const name = nameById.get(fmId);
    if (!name) { console.log(`[skip] ${fmId}: not in ${path.basename(OUT)} — use crawlDeep for new fighters`); continue; }
    const before = graph.rows.filter((r) => r.fmId === fmId).length;
    evictCache(fmId);
    let prof;
    try {
      prof = parseFmProfile(await politeFetch(`${BASE}/fighter-profile/${encodeURIComponent(name)}/${fmId}/`));
    } catch (e) {
      console.log(`[fail] ${name} (${fmId}): ${(e as Error).message} — old rows kept`);
      kept.push(...graph.rows.filter((r) => r.fmId === fmId));
      continue;
    }
    for (const f of prof.fights) {
      fresh.push([fmId, esc(prof.name || name), f.date, esc(f.promotion), esc(f.event),
        f.opponentId, esc(f.opponentName), esc(f.opponentRank), f.result, esc(f.method)].join(','));
    }
    const delta = prof.fights.length - before;
    if (delta !== 0) changed = true;
    console.log(`[refresh] ${name} (${fmId}): ${before} → ${prof.fights.length} rows${delta ? ` (${delta > 0 ? '+' : ''}${delta})` : ''}`);
  }

  fs.writeFileSync(OUT, [graph.header, ...kept.map((r) => r.raw), ...fresh].join('\n') + '\n');
  console.log(`\n[done] ${ids.length} profiles refreshed; graph ${graph.rows.length} → ${kept.length + fresh.length} rows`);
  console.log(changed
    ? '[next] rows changed — run crawlDeep (event discovery for unknown fighters), then rateRegional → arrivalRegional → pitRegional → mergeEspnDob → exportDwcsAnalysis'
    : '[next] no row-count change — source likely not updated yet; downstream re-run optional');
}

main().catch((e) => { console.error(e); process.exit(1); });
