// buildRecencyPatch: pull the NEW UFC fights Sherdog knows about but our
// primary Fights.csv doesn't yet, so the Elo ratings stay current ahead of the
// data refresh. See SHERDOG_BACKFILL_PLAN.md.
//
// SAFE-BY-CONSTRUCTION design (why this can't cross-contaminate):
//   • Per fighter, we keep ONLY Sherdog UFC fights dated AFTER their most recent
//     fight already in Fights.csv. No date overlap ⇒ the Elo sweep can't double-
//     count, and we never overwrite/re-judge a fight the primary source has.
//   • Output fights are Elo-only (result + method + date + opponent). They carry
//     NO per-fight metrics, and the loader flags them hasMetrics=false so the
//     striking/grappling composite ignores them.
//   • Each unique bout is emitted once (deduped across both fighters' profiles).
//
// Run (after the crawl): npx tsx scripts/sherdog/buildRecencyPatch.ts
import fs from 'fs';
import path from 'path';
import { loadAllData } from '../../src/lib/loadData';
import { parseProfile } from './parseProfile';
import { mapMethod } from './methodMap';
import type { SherdogFight } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const CACHE_DIR = path.join(DATA_DIR, '.sherdog_cache');
const CROSSWALK = path.join(DATA_DIR, 'sherdog_crosswalk.csv');
const OUT = path.join(DATA_DIR, 'recent_ufc_fights.csv');

function isUFCEvent(eventName: string): boolean {
  return /^UFC\b/i.test(eventName.trim()) || eventName.includes('Ultimate Fighting');
}

function sherdogResultToCode(r: SherdogFight['result']): 'W' | 'L' | 'D' | null {
  if (r === 'win') return 'W';
  if (r === 'loss') return 'L';
  if (r === 'draw') return 'D';
  return null; // nc → no Elo effect
}

interface CrosswalkRow { ourId: string; sherdogId: string; }

function readVerifiedCrosswalk(): CrosswalkRow[] {
  if (!fs.existsSync(CROSSWALK)) return [];
  const lines = fs.readFileSync(CROSSWALK, 'utf-8').split('\n').slice(1).filter(Boolean);
  const rows: CrosswalkRow[] = [];
  for (const ln of lines) {
    const c = ln.split(',');
    const ourId = (c[0] ?? '').trim();
    const sherdogId = (c[2] ?? '').trim();
    if (ourId && sherdogId) rows.push({ ourId, sherdogId });
  }
  return rows;
}

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// Quote-aware CSV line splitter (event names can contain commas/colons). Used to
// read back the previously-committed patch for the accumulate-merge below.
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// Bout identity key — order-independent pair + date. Matches the in-run dedup so
// a freshly-built row supersedes the same bout carried from the previous file.
export function recencyKey(f1: string, f2: string, date: string): string {
  return [f1, f2].sort().join('|') + '|' + date;
}

function main() {
  const data = loadAllData();
  const crosswalk = readVerifiedCrosswalk();
  if (crosswalk.length === 0) {
    console.error('No verified crosswalk — run resolveCrosswalk.ts first.');
    process.exit(1);
  }

  // sherdogId → our fighter (id + canonical name + division), for opponent resolution.
  const bySherdog = new Map<string, { ourId: string; name: string; division: string }>();
  for (const cw of crosswalk) {
    const f = data.fighterMap.get(cw.ourId);
    if (f) bySherdog.set(cw.sherdogId, { ourId: cw.ourId, name: f.fullName, division: f.weightClass });
  }

  // Each fighter's most recent fight date already in Fights.csv.
  const latestKnown = new Map<string, number>();
  for (const [fid, fights] of data.fighterFights) {
    let max = 0;
    for (const f of fights) if (f.eventDate && f.eventDate.getTime() > max) max = f.eventDate.getTime();
    latestKnown.set(fid, max);
  }

  const HEAD = 'fighter1_ourId,fighter1_name,fighter2_ourId,fighter2_name,date,result1,result2,method,round,weightClass,eventName,source';
  const lines = [HEAD];
  const seen = new Set<string>();
  let scanned = 0, emitted = 0, oppUnresolved = 0;

  for (const cw of crosswalk) {
    const me = bySherdog.get(cw.sherdogId);
    if (!me) continue;
    const file = path.join(CACHE_DIR, `${cw.sherdogId}.html`);
    if (!fs.existsSync(file)) continue;
    const prof = parseProfile(fs.readFileSync(file, 'utf-8'));
    const myLatest = latestKnown.get(me.ourId) ?? 0;

    for (const fight of prof.fights as SherdogFight[]) {
      if (!isUFCEvent(fight.eventName)) continue;          // UFC recency only
      if (!fight.date) continue;
      const t = new Date(fight.date).getTime();
      if (!(t > myLatest)) continue;                        // strictly newer than what we have
      scanned++;

      const code = sherdogResultToCode(fight.result);
      if (!code) continue;                                  // NC → skip

      // Resolve opponent: prefer crosswalk by Sherdog id; else keep as unknown
      // (stable synthetic id so repeat opponents accumulate their own Elo).
      const oppCw = fight.opponentId ? bySherdog.get(fight.opponentId) : undefined;
      const oppOurId = oppCw?.ourId ?? (fight.opponentId ? `sd:${fight.opponentId}` : `sd:${fight.opponentName}`);
      const oppName = oppCw?.name ?? fight.opponentName;
      if (!oppCw) oppUnresolved++;

      // Dedup: same bout pulled from both fighters' profiles → emit once.
      const key = recencyKey(me.ourId, oppOurId, fight.date);
      if (seen.has(key)) continue;
      seen.add(key);

      const result1 = code;
      const result2 = code === 'W' ? 'L' : code === 'L' ? 'W' : 'D';

      lines.push([
        me.ourId, me.name, oppOurId, oppName, fight.date,
        result1, result2, mapMethod(fight.method).method,
        fight.round != null ? String(fight.round) : '',
        me.division, fight.eventName, 'sherdog',
      ].map(esc).join(','));
      emitted++;
    }
  }

  // ── Accumulate-merge with the previously-committed patch ────────────────
  // The patch is an ACCUMULATING file, not a from-scratch dump. In CI the cache
  // only holds THIS week's roster (the full 597MB cache never ships to CI), so
  // regenerating from cache alone would drop every prior week. Carry forward any
  // existing rows whose bout we didn't just rebuild (a fresh row always wins on a
  // key collision). Rows that become stale once Fights.csv catches up are dropped
  // at LOAD time by loadData's stale-guard, so the file stays correct unpruned.
  let carried = 0;
  if (fs.existsSync(OUT)) {
    const prev = fs.readFileSync(OUT, 'utf-8').split('\n').slice(1).filter(Boolean);
    for (const ln of prev) {
      const cols = splitCsvLine(ln);
      if (cols.length < 5) continue;
      const key = recencyKey(cols[0], cols[2], cols[4]); // f1ourId, f2ourId, date
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(ln);
      carried++;
    }
  }

  fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf-8');
  console.log(`recency patch: ${crosswalk.length} crosswalk fighters scanned`);
  console.log(`  new post-Fights.csv UFC bouts found: ${scanned}, unique emitted: ${emitted}`);
  console.log(`  carried forward from previous patch: ${carried} (total ${emitted + carried})`);
  console.log(`  opponents not in crosswalk (synthetic id, baseline Elo): ${oppUnresolved}`);
  console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
  if (emitted > 0) {
    console.log('\nsample:');
    for (const ln of lines.slice(1, 9)) {
      const c = ln.split(',');
      console.log(`  ${c[4]}  ${c[1]} ${c[5]} vs ${c[3]}  (${c[7]}) @ ${c[10]}`);
    }
  }
}

// Only run when invoked directly — NOT when imported (e.g. by tests for the
// exported helpers), which would otherwise rewrite the CSV as a side effect.
if (process.argv[1] && /buildRecencyPatch\.ts$/.test(process.argv[1])) main();
