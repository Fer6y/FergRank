// research/dwcs/refreshDwcsResults.ts — Fight Matrix as the DWCS RESULTS FEED.
//
// The Sherdog-built cohort dataset froze at 2025-10-07 when that crawl died,
// leaving 2026+ Contender Series seasons invisible (ufcstats has never carried
// DWCS; ufc.com doesn't list it). Fight Matrix does: all nine seasons have
// event pages (83 found via their past-events search), and new weeks appear on
// their weekly issue cadence — a few days' lag, against no feed at all.
//
// What this does:
//   1. Discover DWCS event ids via /past-events-search (queries "Contender",
//      "Dana White") + any DWCS event pages already in the crawl cache.
//   2. politeFetch + parseFmEvent each → data/dwcs_bouts_fm.csv (SIBLING of
//      the frozen dwcs_bouts.csv, never merged into it — the cohort study's
//      audited 303/66/9/1 result split must not silently change).
//   3. CROSS-SOURCE VALIDATION: join FM bouts to the Sherdog-built bouts on
//      date(±1d, token-sorted name pair) and report winner agreement. A feed
//      that disagrees with the audited history doesn't get trusted for the
//      future either.
//
// Refresh: re-run during the season (politeFetch caches; only new weeks fetch).
// Consumers: exportDwcsAnalysis.ts extends its season table from this file for
// seasons past the Sherdog cutoff.
//
// Run: node_modules/.bin/jiti research/dwcs/refreshDwcsResults.ts
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { politeFetch, parseFmEvent } from '../regional/fightMatrix';

const BASE = 'https://www.fightmatrix.com';
const CACHE = path.join(process.cwd(), 'research', 'regional', '.cache');
const OUT = path.join(process.cwd(), 'data', 'dwcs_bouts_fm.csv');
const DWCS_RE = /(dana\s*white|^contender[\s%+]?series|contender[\s%+]series\s*20)/i;

const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');

async function discover(): Promise<Map<string, string>> {
  const ids = new Map<string, string>(); // id → display name
  for (const q of ['Contender', 'Dana White']) {
    try {
      const html = await politeFetch(`${BASE}/past-events-search?txt=${encodeURIComponent(q)}`);
      for (const m of html.matchAll(/href='\/event\/([^/']+)\/(\d+)\/'/g)) {
        const name = decodeURIComponent(m[1]).replace(/\+/g, ' ');
        if (DWCS_RE.test(name) && !/shooto|efc|fcc|nextreme|rumble|hfc|tfn|fight contender|caged.steel/i.test(name)) {
          ids.set(m[2], name);
        }
      }
    } catch (e) {
      console.error(`[discover] "${q}": ${(e as Error).message}`);
    }
  }
  // Cached DWCS event pages from the crawl are free coverage.
  for (const f of fs.readdirSync(CACHE)) {
    const m = f.match(/^event_(.+)_(\d+)\.html$/);
    if (!m) continue;
    const name = decodeURIComponent(m[1].replace(/_20/g, ' ').replace(/_/g, ' '));
    if (DWCS_RE.test(name)) ids.set(m[2], name);
  }
  return ids;
}

async function main(): Promise<void> {
  const ids = await discover();
  console.log(`[dwcs-fm] ${ids.size} DWCS event pages discovered`);

  interface OutRow {
    date: string; season: number; week: string; eventName: string;
    fmIdA: string; nameA: string; fmIdB: string; nameB: string;
    winnerFmId: string; method: string; round: string; division: string;
  }
  const rows: OutRow[] = [];
  for (const [id, name] of ids) {
    let ev;
    try {
      ev = parseFmEvent(await politeFetch(`${BASE}/event/${encodeURIComponent(name)}/${id}/`));
    } catch { continue; }
    if (!ev.date || !ev.bouts.length) continue;
    const week = name.match(/week\s*(\d+)/i)?.[1] ?? '';
    for (const b of ev.bouts) {
      rows.push({
        date: ev.date, season: Number(ev.date.slice(0, 4)), week,
        eventName: ev.title || name,
        fmIdA: b.fmIdA, nameA: b.nameA, fmIdB: b.fmIdB, nameB: b.nameB,
        winnerFmId: b.winner === 'A' ? b.fmIdA : b.winner === 'B' ? b.fmIdB : '',
        method: b.method, round: b.round, division: b.division,
      });
    }
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  fs.writeFileSync(
    OUT,
    'date,season,week,eventName,fmIdA,nameA,fmIdB,nameB,winnerFmId,method,round,division\n' +
      rows.map((r) =>
        [r.date, r.season, r.week, esc(r.eventName), r.fmIdA, esc(r.nameA), r.fmIdB, esc(r.nameB), r.winnerFmId, esc(r.method), r.round, r.division].join(',')
      ).join('\n') + '\n'
  );
  const seasons = new Map<number, number>();
  for (const r of rows) seasons.set(r.season, (seasons.get(r.season) ?? 0) + 1);
  console.log(`[dwcs-fm] wrote ${rows.length} bouts → ${OUT}`);
  console.log('[dwcs-fm] bouts/season:', [...seasons.entries()].sort().map(([s, v]) => `${s}:${v}`).join(' '));

  // ── cross-source validation vs the audited Sherdog-built bouts ──
  const sherPath = path.join(process.cwd(), 'data', 'dwcs_bouts.csv');
  if (fs.existsSync(sherPath)) {
    const sher = Papa.parse<Record<string, string>>(fs.readFileSync(sherPath, 'utf-8'), {
      header: true, skipEmptyLines: true,
    }).data;
    const dayNum = (iso: string) => Math.floor(Date.parse(iso) / 86_400_000);
    const fmByKey = new Map<string, OutRow>();
    for (const r of rows) {
      fmByKey.set(`${[norm(r.nameA), norm(r.nameB)].sort().join('|')}|${dayNum(r.date)}`, r);
    }
    let joined = 0, agree = 0, disagreeList: string[] = [];
    for (const s of sher) {
      if (!s.date || !s.winnerSherdogId) continue;
      const pair = [norm(s.nameA), norm(s.nameB)].sort().join('|');
      let fm: OutRow | undefined;
      for (const tol of [0, 1, -1]) {
        fm = fmByKey.get(`${pair}|${dayNum(s.date) + tol}`);
        if (fm) break;
      }
      if (!fm || !fm.winnerFmId) continue;
      joined++;
      const sherWinner = norm(s.winnerSherdogId === s.sherdogIdA ? s.nameA : s.nameB);
      const fmWinner = norm(fm.winnerFmId === fm.fmIdA ? fm.nameA : fm.nameB);
      if (sherWinner === fmWinner) agree++;
      else disagreeList.push(`${s.date} ${s.nameA} vs ${s.nameB}: sherdog→${sherWinner}, fm→${fmWinner}`);
    }
    console.log(`[validate] ${joined} bouts joined to the audited Sherdog set; winner agreement ${agree}/${joined} (${((100 * agree) / (joined || 1)).toFixed(1)}%)`);
    for (const d of disagreeList.slice(0, 6)) console.log(`  ✗ ${d}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
