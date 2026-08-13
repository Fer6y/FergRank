// research/regional/crawlDeep.ts — the OVERNIGHT deep crawl.
//
// WHY THE FIRST CRAWL MISSED THE POINT. crawlRegional.ts seeded from Fight
// Matrix RANKINGS, which by construction list fighters who are already ranked —
// i.e. the elite tier. Contender Series entrants are unranked regional fighters,
// so they were structurally unreachable: 8 of 10 on this week's card had zero
// bouts in the result, and CFFC showed 184 rows across 182 fighters (each seen
// once, as somebody's opponent, never their own career).
//
// THE FIX: seed from EVENTS, not rankings. An event page lists the whole card,
// so crawling a promotion's events reaches every fighter who competed there
// regardless of rank. 14,205 event pages are already discoverable from the
// existing HTML cache at zero network cost.
//
// ORDER MATTERS — the phases are sequenced so an interrupted run still leaves
// the most valuable data on disk:
//   A. fighters found on DEVELOPMENTAL-promotion event cards  ← the DWCS feeder
//   B. fighters found on any other cached event card
//   C. the opponents discovered by the first crawl (career depth for the rest)
//
// RESUMABLE: rows are appended after every profile and already-crawled fighters
// are skipped on restart, so a 12-hour run can be stopped and resumed freely.
// Every page is cached, so a resume re-fetches nothing.
//
// Run: node_modules/.bin/jiti research/regional/crawlDeep.ts
import fs from 'fs';
import path from 'path';
import { politeFetch, parseFmProfile, parseFmRanking } from './fightMatrix';

const BASE = 'https://www.fightmatrix.com';
const CACHE = path.join(process.cwd(), 'research', 'regional', '.cache');
const OUT = path.join(process.cwd(), 'data', 'regional_fights.csv');
const HEAD = 'fmId,name,date,promotion,event,opponentFmId,opponentName,opponentRankAtTime,result,method';

// Promotions that actually feed the Contender Series / UFC prospect pipeline.
const FEEDER = /^(CFFC|Cage Fury|LFA|Legacy F|Fury FC|Titan|CES|Ohio Combat|OCL|Bellator|PFL|Cage Warriors|Invicta|King of the Cage|RFA|Dana White|Contender|Shooto|Pancrase|Brave|Oktagon|UAE Warriors|BRAVE|Combate|Xtreme|XFC|VFC|Victory|Prospect|APFC|Iron|Valor|Alaska|Hoosier|Caged|Fight Lite|Final Fight|A1|LFC|Bantam)/i;

// Recency cutoff, derived empirically rather than guessed: 81,126 event-id →
// year pairs read out of the cached profiles put 2018 events at a median id of
// 206,222 and a minimum of 174,482 (2016 median 161,270; 2020 median 262,295).
// 174,000 therefore keeps ~2018-onward. A 2009 CFFC card says nothing about
// grading a prospect fighting tonight, and skipping those is the single
// biggest time saving available that does NOT involve raising the request rate.
const MIN_EVENT_ID = 174_000;

const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

function eventIdsFromCache(): { id: string; name: string; feeder: boolean }[] {
  const seen = new Map<string, { id: string; name: string; feeder: boolean }>();
  for (const f of fs.readdirSync(CACHE)) {
    if (!f.endsWith('.html')) continue;
    const h = fs.readFileSync(path.join(CACHE, f), 'utf-8');
    for (const m of h.matchAll(/href='\/event\/([^']+?)\/(\d+)\/'/g)) {
      const name = decodeURIComponent(m[1]).replace(/\+/g, ' ');
      if (Number(m[2]) < MIN_EVENT_ID) continue; // pre-~2018: not the modern scene
      if (!seen.has(m[2])) seen.set(m[2], { id: m[2], name, feeder: FEEDER.test(name) });
    }
  }
  return [...seen.values()];
}

async function main(): Promise<void> {
  // ── resume state ──
  const done = new Set<string>();
  const knownOpponents = new Map<string, string>();
  if (fs.existsSync(OUT)) {
    const lines = fs.readFileSync(OUT, 'utf-8').split('\n').slice(1);
    for (const ln of lines) {
      const c = ln.split(',');
      if (c[0]) done.add(c[0]);
      if (c[5] && c[6]) knownOpponents.set(c[5], c[6].replace(/^"|"$/g, ''));
    }
  } else {
    fs.writeFileSync(OUT, HEAD + '\n');
  }
  console.log(`[resume] ${done.size} profiles already crawled, ${knownOpponents.size} opponents known`);

  const events = eventIdsFromCache();
  const feederEvents = events.filter((e) => e.feeder);
  console.log(`[events] ${events.length} cached event pages (${feederEvents.length} feeder-promotion)`);

  // ── phase A/B: harvest rosters off event cards ──
  const roster = new Map<string, string>();
  const harvest = async (list: typeof events, label: string) => {
    let i = 0;
    for (const e of list) {
      i++;
      try {
        const html = await politeFetch(`${BASE}/event/${encodeURIComponent(e.name)}/${e.id}/`);
        for (const f of parseFmRanking(html)) if (!done.has(f.fmId)) roster.set(f.fmId, f.name);
      } catch { /* skip unreachable event */ }
      if (i % 50 === 0) console.log(`[${label}] ${i}/${list.length} events → ${roster.size} new fighters`);
    }
  };
  await harvest(feederEvents, 'feeder-events');
  console.log(`[phase A] feeder rosters → ${roster.size} fighters to crawl`);

  // ── crawl profiles, appending as we go ──
  const crawl = async (queue: [string, string][], label: string) => {
    let n = 0;
    for (const [fmId, name] of queue) {
      if (done.has(fmId)) continue;
      done.add(fmId);
      n++;
      let prof;
      try {
        prof = parseFmProfile(await politeFetch(`${BASE}/fighter-profile/${encodeURIComponent(name)}/${fmId}/`));
      } catch { continue; }
      const rows = prof.fights.map((f) =>
        [fmId, esc(prof!.name || name), f.date, esc(f.promotion), esc(f.event),
         f.opponentId, esc(f.opponentName), esc(f.opponentRank), f.result, esc(f.method)].join(',')
      );
      if (rows.length) fs.appendFileSync(OUT, rows.join('\n') + '\n');
      for (const f of prof.fights) if (f.opponentId && !done.has(f.opponentId)) knownOpponents.set(f.opponentId, f.opponentName);
      if (n % 25 === 0) console.log(`[${label}] ${n}/${queue.length} profiles crawled`);
    }
  };

  await crawl([...roster.entries()], 'phase-A-profiles');

  // ── phase B: DROPPED ──
  // Non-feeder cached cards are overwhelmingly UFC and major-promotion events
  // whose fighters we already hold, so this was the largest and least valuable
  // phase — hours of harvesting to re-discover known people. Cut deliberately;
  // re-enable only if the rating turns out to need major-promotion depth.
  console.log(`[phase B] skipped — ${events.filter((e) => !e.feeder).length} non-feeder events not crawled (known population)`);

  // ── phase C: career depth for opponents discovered earlier ──
  await crawl([...knownOpponents.entries()].filter(([id]) => !done.has(id)), 'phase-C-opponents');

  const total = fs.readFileSync(OUT, 'utf-8').split('\n').length - 2;
  console.log(`\n[done] ${done.size} profiles crawled, ${total} fight rows in ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
