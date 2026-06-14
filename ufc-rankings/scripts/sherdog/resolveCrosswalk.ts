// Crosswalk builder: our UFC fighters → Sherdog IDs.
//
// THE HARD PART, done right. Matching on name alone merges siblings/namesakes
// (the Patricio vs Patricky Freire lesson). So a candidate Sherdog profile is
// accepted only with corroborating EVIDENCE — chiefly, does the candidate's
// Sherdog fight list contain the SAME UFC opponents we already have on record
// for this fighter? Two brothers share a last name but not an opponent list.
//
// Network steps (search + profile fetch) run via fetchProfile.ts at build time.
// The scoring core below is pure and self-tested against the saved fixtures.
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { loadAllData, type LoadedData } from '../../src/lib/loadData';
import { parseProfile } from './parseProfile';
import { fetchProfile, fetchSearch } from './fetchProfile';
import type { Fighter } from '../../src/lib/types';
import type { SherdogProfile } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');

export function normalizeName(s: string): string {
  const base = s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip accents (Moicaño → moicano)
    .replace(/[^a-z\s]/g, ' ')         // punctuation → SPACE (Cortes-Acosta aligns)
    .replace(/\s+/g, ' ')
    .trim();
  // Drop generational suffixes that appear inconsistently across sources.
  return base.replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/\s+/g, ' ').trim();
}

// Our fighter's known UFC opponents (corrected-id based), for evidence checks.
export function knownOpponents(fid: string, data: LoadedData): Set<string> {
  const out = new Set<string>();
  for (const f of data.fighterFights.get(fid) ?? []) {
    const opp = f.fighterId1 === fid ? f.fighter2Name : f.fighter1Name;
    if (opp) out.add(normalizeName(opp));
  }
  return out;
}

export type Verdict = 'verified' | 'review' | 'reject';

export interface MatchEvidence {
  nameExact: boolean;
  weightMatch: boolean;
  opponentOverlap: number;   // # of our UFC opponents found in candidate history
  ourOpponentCount: number;
  score: number;             // 0..100 confidence (ranking signal only)
}

// Pure scoring: how well does a Sherdog profile match one of our fighters?
// Does NOT decide the verdict — that needs the whole candidate set (see
// classifyMatch), because uniqueness of the name across candidates matters.
export function scoreCandidate(
  our: Fighter,
  ourOpponents: Set<string>,
  cand: SherdogProfile
): MatchEvidence {
  const nameExact = normalizeName(our.fullName) === normalizeName(cand.name);

  const weightMatch =
    !!cand.weightClass &&
    !!our.weightClass &&
    normalizeName(cand.weightClass) === normalizeName(our.weightClass);

  const candOpponents = new Set(cand.fights.map((f) => normalizeName(f.opponentName)));
  let opponentOverlap = 0;
  for (const o of ourOpponents) if (candOpponents.has(o)) opponentOverlap++;

  // Score = ranking of candidates, not the accept/reject decision.
  let score = 0;
  if (nameExact) score += 25;
  if (weightMatch) score += 15;
  score += Math.min(opponentOverlap, 5) * 14; // up to +70
  return { nameExact, weightMatch, opponentOverlap, ourOpponentCount: ourOpponents.size, score };
}

// Decide the verdict for the BEST candidate, using how many fetched candidates
// share our fighter's exact name (the namesake guard).
//
// Principle: shared opponents are a far stronger identity signal than a name
// string. Three shared opponents in a division is never a coincidence, so it
// verifies even when the name spelling differs (hyphens/accents/nicknames that
// previously caused false rejects). Names only matter to break namesake ties.
export function classifyMatch(ev: MatchEvidence, ctx: { exactNameCount: number }): Verdict {
  const { opponentOverlap: ov, nameExact, weightMatch, ourOpponentCount: oc } = ev;
  const uniqueName = ctx.exactNameCount === 1;

  // 1. Identity-proof: 3+ shared opponents. Name-spelling independent.
  if (ov >= 3) return 'verified';

  // 2. Two shared opponents, confirmed by a majority of our (small) opponent
  //    list, OR by a unique exact name. (A 2/6 partial on a non-unique common
  //    name — e.g. "Daniel Santos" — deliberately does NOT pass.)
  if (ov >= 2 && (ov >= oc * 0.5 || (nameExact && uniqueName))) return 'verified';

  // 3. One shared opponent on a uniquely-named, weight-matching candidate —
  //    typical for fighters with only 1–2 UFC bouts. Unique name blocks the
  //    sibling/namesake trap.
  if (ov >= 1 && nameExact && weightMatch && uniqueName) return 'verified';

  // 4. Debutant (no UFC opponents yet) that is a unique exact name + weight.
  if (oc === 0 && nameExact && weightMatch && uniqueName) return 'verified';

  // 5. Some signal, not conclusive → quick human glance.
  if (ov >= 1 || (nameExact && (weightMatch || oc === 0))) return 'review';

  // 6. No corroboration.
  return 'reject';
}

// Search-results parser → candidate slug-ids.
// Finalized against real cached search pages: the results live in
// `table.new_table.fightfinder_result`. Scoping to that table excludes the
// site-wide sidebar/"featured fighter" links (Pereira, Topuria, …) that
// otherwise get fetched on every single search — a big speed/politeness win.
export function parseSearchResults(html: string): string[] {
  const $ = cheerio.load(html);
  const ids = new Set<string>();
  const collect = (scope: string) => {
    $(`${scope} a[href*="/fighter/"]`).each((_, a) => {
      const m = ($(a).attr('href') ?? '').match(/\/fighter\/([^/?#"]+)/);
      if (m && /-\d+$/.test(m[1])) ids.add(m[1]);
    });
  };
  collect('table.new_table.fightfinder_result');
  // Fallback only if the results table wasn't found (e.g. markup change):
  // a single exact-name hit redirects straight to the profile, no table.
  if (ids.size === 0) {
    const canon = html.match(/"url":"([^"]*\\?\/fighter\\?\/[^"]+)"/);
    if (canon) {
      const m = canon[1].replace(/\\\//g, '/').match(/\/fighter\/([^/?#"]+)/);
      if (m) ids.add(m[1]);
    }
  }
  return [...ids].slice(0, 12);
}

export interface CrosswalkRow {
  ourFighterId: string;
  fullName: string;
  sherdogId: string;
  sherdogUrl: string;
  matchConfidence: number;
  matchMethod: string;
  verified: boolean;
  notes: string;
}

export const CSV_HEAD =
  'ourFighterId,fullName,sherdogId,sherdogUrl,matchConfidence,matchMethod,verified,notes';
export const VERIFIED_CSV = path.join(DATA_DIR, 'sherdog_crosswalk.csv');
export const REVIEW_CSV = path.join(DATA_DIR, 'sherdog_crosswalk_review.csv');

function csvLine(r: CrosswalkRow): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [r.ourFighterId, r.fullName, r.sherdogId, r.sherdogUrl, String(r.matchConfidence),
    r.matchMethod, String(r.verified), r.notes].map(esc).join(',');
}

// Append one row, creating the file with a header if needed.
export function appendRow(file: string, r: CrosswalkRow): void {
  if (!fs.existsSync(file)) fs.writeFileSync(file, CSV_HEAD + '\n', 'utf-8');
  fs.appendFileSync(file, csvLine(r) + '\n', 'utf-8');
}

// Which of our fighters are already recorded (in either output file)? Used to
// resume a crawl without re-doing work or duplicating rows.
function processedIds(): Set<string> {
  const ids = new Set<string>();
  for (const file of [VERIFIED_CSV, REVIEW_CSV]) {
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf-8').split('\n').slice(1);
    for (const ln of lines) {
      const id = ln.split(',')[0]?.trim();
      if (id) ids.add(id);
    }
  }
  return ids;
}

// ── Build driver (network) ────────────────────────────────────────────────
// For each fighter: search → candidate ids → fetch+parse each → score → pick.
// Resumable + crash-safe: skips already-recorded fighters and appends per row,
// so an interrupted run (Ctrl+C / error) loses at most the in-flight fighter.
export async function buildCrosswalk(opts: { limit?: number; offset?: number } = {}): Promise<void> {
  const data = loadAllData();
  const slice = data.fighters.slice(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? data.fighters.length));
  const done = processedIds();
  const todo = slice.filter((f) => !done.has(f.fighterId));

  console.log(`crosswalk: ${slice.length} in range, ${slice.length - todo.length} already done, ${todo.length} to process`);
  let verified = 0, review = 0, n = 0;

  for (const f of todo) {
    const ourOpps = knownOpponents(f.fighterId, data);
    let row: CrosswalkRow;
    try {
      // Search by full name; if Sherdog returns nothing (name-spelling miss,
      // e.g. our "Dooho Choi" vs Sherdog "Doo Ho Choi"), retry by surname.
      let candidateIds = parseSearchResults(await fetchSearch(f.fullName));
      let viaSurname = false;
      if (candidateIds.length === 0) {
        const surname = f.fullName.trim().split(/\s+/).pop() ?? '';
        if (surname.length >= 3) {
          candidateIds = parseSearchResults(await fetchSearch(surname));
          viaSurname = true;
        }
      }

      const scored: { ev: MatchEvidence; prof: SherdogProfile }[] = [];
      for (const cid of candidateIds) {
        const { html } = await fetchProfile(cid);
        const prof = parseProfile(html);
        scored.push({ ev: scoreCandidate(f, ourOpps, prof), prof });
      }

      if (scored.length === 0) {
        row = rowFor(f, null, null, 'reject', 'no candidates (even by surname)');
      } else {
        const exactNameCount = scored.filter((s) => s.ev.nameExact).length;
        // Best = most opponent overlap, then highest score.
        scored.sort((a, b) =>
          b.ev.opponentOverlap - a.ev.opponentOverlap || b.ev.score - a.ev.score);
        const best = scored[0];
        const verdict = classifyMatch(best.ev, { exactNameCount });
        const note =
          `overlap ${best.ev.opponentOverlap}/${best.ev.ourOpponentCount}, ` +
          `name=${best.ev.nameExact}, wt=${best.ev.weightMatch}, ` +
          `exactName=${exactNameCount}/${scored.length}` +
          (viaSurname ? ', viaSurname' : '');
        // Always record the proposed match so review rows are actionable.
        row = rowFor(f, best.prof, best.ev, verdict, note);
      }
    } catch (err) {
      row = rowFor(f, null, null, 'review', `error: ${String(err)}`);
    }

    if (row.verified) { appendRow(VERIFIED_CSV, row); verified++; }
    else { appendRow(REVIEW_CSV, row); review++; }

    if (++n % 25 === 0) console.log(`  …${n}/${todo.length} (${verified} verified, ${review} review)`);
  }

  console.log(`crosswalk done: +${verified} verified, +${review} review this run`);
}

export function rowFor(
  f: Fighter,
  prof: SherdogProfile | null,
  ev: MatchEvidence | null,
  verdict: Verdict,
  notes: string
): CrosswalkRow {
  return {
    ourFighterId: f.fighterId,
    fullName: f.fullName,
    sherdogId: prof?.sherdogId ?? '',
    sherdogUrl: prof?.url ?? '',
    matchConfidence: ev?.score ?? 0,
    matchMethod: verdict,
    verified: verdict === 'verified',
    notes,
  };
}

// CLI: `npx tsx scripts/sherdog/resolveCrosswalk.ts [--limit N] [--offset N]`
// Guard matches ONLY the script entrypoint, not importers like the .test file.
if (process.argv[1] && /resolveCrosswalk\.ts$/.test(process.argv[1])) {
  const arg = (k: string) => {
    const i = process.argv.indexOf(k);
    return i >= 0 ? Number(process.argv[i + 1]) : undefined;
  };
  buildCrosswalk({ limit: arg('--limit'), offset: arg('--offset') }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
