// extendCrosswalk: Phase 2 of the weekly auto-ingest pipeline.
//
// After fetchEvent (Phase 1) caches the past week's card pages + force-refreshes
// the roster's profiles, some fighters on that card may not be in the crosswalk
// yet (e.g. someone in our Fighters_Stats.csv who the original crawl never
// covered). This step maps those NEW Sherdog ids to OUR fighter ids so
// buildRecencyPatch can attribute their new bouts correctly.
//
// OFFLINE BY DESIGN: it reads ONLY cached pages (event__*.html + the roster's
// profile html) + our CSVs. No network — Phase 1 already did the fetching. A
// roster fighter whose profile isn't cached is skipped with a warning (means
// Phase 1 didn't run / failed for them).
//
// REVERSE MATCH: resolveCrosswalk goes our-fighter → search → sherdog candidates.
// Here we already HAVE the sherdog profile (from the card), so we go the other
// way — find which of OUR fighters it is — reusing the SAME tested evidence core
// (scoreCandidate / classifyMatch: shared-opponents over name strings, namesake-
// guarded). True debutants absent from Fighters_Stats.csv can't be mapped (no
// ourId) and are reported as needing a primary-data refresh.
//
// Usage:
//   npx tsx scripts/sherdog/extendCrosswalk.ts            # all cached event cards
//   npx tsx scripts/sherdog/extendCrosswalk.ts --event UFC-328-..-111957
//   npx tsx scripts/sherdog/extendCrosswalk.ts --dry      # report, write nothing
import fs from 'fs';
import path from 'path';
import { loadAllData, type LoadedData } from '../../src/lib/loadData';
import { parseProfile } from './parseProfile';
import { parseEventCard } from './parseEvent';
import {
  scoreCandidate, classifyMatch, normalizeName, rowFor, appendRow,
  knownOpponents, VERIFIED_CSV, REVIEW_CSV,
  type Verdict, type MatchEvidence,
} from './resolveCrosswalk';
import type { Fighter } from '../../src/lib/types';
import type { SherdogProfile } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const CACHE_DIR = path.join(DATA_DIR, '.sherdog_cache');

// ── Pure reverse-match core (unit-tested) ────────────────────────────────────

export interface ReverseMatch {
  best: { fighter: Fighter; ev: MatchEvidence } | null;
  verdict: Verdict;
  exactNameCount: number;   // # candidates whose name exactly matches the profile
}

// Given a Sherdog profile and a set of OUR candidate fighters, decide which (if
// any) of ours it is. `opponentsOf` yields a fighter's normalized UFC opponents.
// Mirrors resolveCrosswalk's driver: rank by opponent overlap then score, then
// classify with the namesake guard. Pure — no I/O — so tests can drive it.
export function reverseMatchProfile(
  prof: SherdogProfile,
  candidates: Fighter[],
  opponentsOf: (fighterId: string) => Set<string>
): ReverseMatch {
  if (candidates.length === 0) return { best: null, verdict: 'reject', exactNameCount: 0 };

  const scored = candidates.map((fighter) => ({
    fighter,
    ev: scoreCandidate(fighter, opponentsOf(fighter.fighterId), prof),
  }));
  const exactNameCount = scored.filter((s) => s.ev.nameExact).length;
  scored.sort((a, b) => b.ev.opponentOverlap - a.ev.opponentOverlap || b.ev.score - a.ev.score);
  const best = scored[0];
  const verdict = classifyMatch(best.ev, { exactNameCount });
  return { best, verdict, exactNameCount };
}

// ── Offline driver ───────────────────────────────────────────────────────────

interface Args { event: string | null; dry: boolean; }
function parseArgs(argv: string[]): Args {
  const args: Args = { event: null, dry: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--event') args.event = argv[++i] ?? null;
    else if (argv[i] === '--dry') args.dry = true;
  }
  return args;
}

// Sherdog ids already mapped (in either crosswalk file), so we skip them.
function mappedSherdogIds(): Set<string> {
  const ids = new Set<string>();
  for (const file of [VERIFIED_CSV, REVIEW_CSV]) {
    if (!fs.existsSync(file)) continue;
    for (const ln of fs.readFileSync(file, 'utf-8').split('\n').slice(1)) {
      const sid = ln.split(',')[2]?.trim(); // sherdogId column
      if (sid) ids.add(sid);
    }
  }
  return ids;
}

// Roster of Sherdog fighter ids from cached event card(s).
function rosterFromCache(eventFilter: string | null): string[] {
  if (!fs.existsSync(CACHE_DIR)) return [];
  const files = fs.readdirSync(CACHE_DIR).filter((f) =>
    eventFilter ? f === `event__${eventFilter}.html` : /^event__.*\.html$/.test(f));
  const ids = new Set<string>();
  for (const f of files) {
    const card = parseEventCard(fs.readFileSync(path.join(CACHE_DIR, f), 'utf-8'));
    for (const id of card.fighterIds) ids.add(id);
  }
  return [...ids];
}

// Candidate OUR fighters for a profile: exact normalized-name first; if none,
// fall back to surname so accent/hyphen/nickname spelling drift still resolves
// (opponent overlap then verifies identity, name-spelling independent).
function candidatesFor(prof: SherdogProfile, byName: Map<string, Fighter[]>, bySurname: Map<string, Fighter[]>): Fighter[] {
  const norm = normalizeName(prof.name);
  const exact = byName.get(norm);
  if (exact && exact.length) return exact;
  const surname = norm.split(' ').pop() ?? '';
  return (surname.length >= 3 ? bySurname.get(surname) : undefined) ?? [];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const data: LoadedData = loadAllData();

  // Index our fighters for reverse lookup.
  const byName = new Map<string, Fighter[]>();
  const bySurname = new Map<string, Fighter[]>();
  for (const f of data.fighters) {
    const norm = normalizeName(f.fullName);
    (byName.get(norm) ?? byName.set(norm, []).get(norm)!).push(f);
    const surname = norm.split(' ').pop() ?? '';
    if (surname.length >= 3) (bySurname.get(surname) ?? bySurname.set(surname, []).get(surname)!).push(f);
  }

  const roster = rosterFromCache(args.event);
  const already = mappedSherdogIds();
  const todo = roster.filter((sid) => !already.has(sid));
  console.log(
    `[extendCrosswalk] roster ${roster.length} fighter(s) from cached card(s), ` +
    `${roster.length - todo.length} already mapped, ${todo.length} to resolve`
  );

  let verified = 0, review = 0, unmatched = 0, noProfile = 0;
  for (const sid of todo) {
    const profFile = path.join(CACHE_DIR, `${sid.replace(/[^A-Za-z0-9_-]/g, '_')}.html`);
    if (!fs.existsSync(profFile)) {
      noProfile++;
      console.warn(`[extendCrosswalk] no cached profile for ${sid} — run fetchEvent first; skipping`);
      continue;
    }
    const prof = parseProfile(fs.readFileSync(profFile, 'utf-8'));
    const candidates = candidatesFor(prof, byName, bySurname);
    const { best, verdict, exactNameCount } = reverseMatchProfile(
      prof, candidates, (fid) => knownOpponents(fid, data));

    if (!best || verdict === 'reject') {
      unmatched++;
      console.log(
        `[extendCrosswalk] UNMATCHED: ${prof.name} [${sid}] — ` +
        (candidates.length === 0
          ? 'no fighter of that name in our data (likely a post-cutoff debutant → needs Fighters_Stats.csv refresh)'
          : `best candidate rejected (${candidates.length} considered)`)
      );
      continue;
    }

    const note =
      `[reverse] overlap ${best.ev.opponentOverlap}/${best.ev.ourOpponentCount}, ` +
      `name=${best.ev.nameExact}, wt=${best.ev.weightMatch}, exactName=${exactNameCount}/${candidates.length}`;
    const row = rowFor(best.fighter, prof, best.ev, verdict, note);
    const target = verdict === 'verified' ? 'VERIFIED' : 'review';
    console.log(`[extendCrosswalk] ${target}: ${best.fighter.fullName} ↔ ${prof.name} [${sid}] (${note})`);

    if (!args.dry) appendRow(verdict === 'verified' ? VERIFIED_CSV : REVIEW_CSV, row);
    if (verdict === 'verified') verified++; else review++;
  }

  console.log(
    `[extendCrosswalk] done${args.dry ? ' (dry)' : ''}: ` +
    `+${verified} verified, +${review} review, ${unmatched} unmatched, ${noProfile} missing-profile`
  );
  if (unmatched > 0)
    console.log('[extendCrosswalk] unmatched fighters need a Fighters_Stats.csv refresh before they can rank.');
}

// Only run as a script entrypoint, not when imported by the test.
if (process.argv[1] && /extendCrosswalk\.ts$/.test(process.argv[1])) {
  main();
}
