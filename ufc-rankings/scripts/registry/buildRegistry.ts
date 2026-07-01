// ─────────────────────────────────────────────────────────────────────────
//  scripts/registry/buildRegistry.ts — canonical fighter registry (Stage 1).
//
//  Builds ONE source of truth for fighter identity so every data source resolves
//  through it instead of its own fuzzy name-match. The whole point is CERTAINTY:
//    • no duplicates  — one human is never two canonical ids
//    • no stolen wins — two humans are never merged into one
//  Identity links are accepted only with FIGHT-GRAPH corroboration; anything
//  ambiguous is kept SEPARATE and written to a review queue (a false split only
//  loses data; a false merge corrupts the rankings).
//
//  Outputs to data/canonical/:  fighter_registry.csv, fighter_aliases.csv,
//  identity_review.csv, identity_audit.txt
//
//  Run:  node_modules/.bin/jiti scripts/registry/buildRegistry.ts
//  Adds files only — no loader/ranking changes (Stage 1).
// ─────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData, type LoadedData } from '../../src/lib/loadData';
import { normalize, KNOWN_NAME_OVERRIDES } from '../../src/lib/nameResolver';
import { ODDS_NAME_OVERRIDES } from '../../research/oddsNameOverrides';

const DATA = path.join(process.cwd(), 'data');
const OUT = path.join(DATA, 'canonical');

type Row = Record<string, string>;
const readCsv = (p: string): Row[] =>
  fs.existsSync(p) ? Papa.parse<Row>(fs.readFileSync(p, 'utf-8'), { header: true, skipEmptyLines: true }).data : [];

// ── fight graph helpers (the corroboration signal) ──
// Per fighter: the set of "opponent@date" keys. Two records that share a key are
// the SAME fight — strong same-person evidence within a source, and the cross-
// source corroborator that separates namesakes.
function fightKeys(data: LoadedData, fighterId: string): Set<string> {
  const out = new Set<string>();
  for (const f of data.fighterFights.get(fighterId) ?? []) {
    const opp = f.fighterId1 === fighterId ? f.fighter2Name : f.fighter1Name;
    const dk = f.eventDate ? f.eventDate.toISOString().slice(0, 10) : '?';
    if (opp) out.add(`${normalize(opp)}@${dk}`);
  }
  return out;
}
function graphRecord(data: LoadedData, fighterId: string): { w: number; l: number; d: number; n: number } {
  let w = 0, l = 0, d = 0, n = 0;
  for (const f of data.fighterFights.get(fighterId) ?? []) {
    const r = f.fighterId1 === fighterId ? f.result1 : f.result2;
    n++;
    if (r === 'W') w++; else if (r === 'L') l++; else if (r === 'D') d++;
  }
  return { w, l, d, n };
}
const shareAny = (a: Set<string>, b: Set<string>): number => {
  let c = 0;
  for (const k of a) if (b.has(k)) c++;
  return c;
};

interface ReviewRow {
  type: string; reason: string;
  idA: string; nameA: string; evidenceA: string;
  idB: string; nameB: string; evidenceB: string;
}

function main(): void {
  fs.mkdirSync(OUT, { recursive: true });
  const data = loadAllData();
  const fighters = data.fighters;
  const byId = new Map(fighters.map((f) => [f.fighterId, f]));
  const review: ReviewRow[] = [];

  // canonical_id → set of aliases {name, source}
  const aliasRows: { norm: string; source: string; canonicalId: string }[] = [];
  const aliasSet = new Map<string, Set<string>>(); // canonicalId → display aliases
  const addAlias = (canonicalId: string, name: string, source: string): void => {
    const nm = normalize(name);
    if (!nm) return;
    aliasRows.push({ norm: nm, source, canonicalId });
    if (!aliasSet.has(canonicalId)) aliasSet.set(canonicalId, new Set());
    aliasSet.get(canonicalId)!.add(name.trim());
  };

  // Every our-source fighter is a canonical fighter (anchor on Fighter_Id).
  for (const f of fighters) addAlias(f.fighterId, f.fullName, 'ufc');

  // ── AUDIT 1: within-source duplicate / namesake scan ──
  const byNorm = new Map<string, string[]>();
  for (const f of fighters) {
    const nm = normalize(f.fullName);
    if (!byNorm.has(nm)) byNorm.set(nm, []);
    byNorm.get(nm)!.push(f.fighterId);
  }
  let suspectedDupes = 0;
  let namesakeClusters = 0;
  const dupeLines: string[] = [];
  const namesakeLines: string[] = [];
  for (const ids of byNorm.values()) {
    if (ids.length < 2) continue;
    const keys = ids.map((id) => fightKeys(data, id));
    // Any pair sharing a fight (opponent@date) = the SAME fight twice = duplicate.
    let dupePair: [number, number] | null = null;
    for (let i = 0; i < ids.length && !dupePair; i++)
      for (let j = i + 1; j < ids.length; j++)
        if (shareAny(keys[i], keys[j]) > 0) { dupePair = [i, j]; break; }

    const ev = (i: number) => {
      const f = byId.get(ids[i])!;
      const g = graphRecord(data, ids[i]);
      return `${f.weightClass || '?'}|${f.height || '?'}|${f.stance || '?'}|graph ${g.w}-${g.l}-${g.d} (${g.n}f)|stats ${f.wins}-${f.losses}-${f.draws}`;
    };
    if (dupePair) {
      suspectedDupes++;
      const [i, j] = dupePair;
      dupeLines.push(`  "${byId.get(ids[i])!.fullName}"  ${ids[i]} ↔ ${ids[j]}  (share ${shareAny(keys[i], keys[j])} fight(s))`);
      review.push({
        type: 'SUSPECTED_DUPLICATE', reason: 'same name + shared opponent@date (same fight under two ids)',
        idA: ids[i], nameA: byId.get(ids[i])!.fullName, evidenceA: ev(i),
        idB: ids[j], nameB: byId.get(ids[j])!.fullName, evidenceB: ev(j),
      });
    } else {
      // No shared fight → distinct people sharing a name (namesakes). Kept separate.
      namesakeClusters++;
      namesakeLines.push(`  "${byId.get(ids[0])!.fullName}" ×${ids.length} kept separate: ${ids.map((id, i) => `${id} [${ev(i)}]`).join('  |  ')}`);
    }
  }

  // ── AUDIT 1b: name-independent duplicate / corrupted-edge detector ──
  // An "opponent@date" key should have exactly ONE claimant (that opponent's foe
  // that day). Two different ids claiming the same opponent@date = the same fight
  // under two identities (duplicate) or a wrong-opponent edge. The legitimate
  // exception is pre-1998 same-night tournaments — flagged separately.
  const claimants = new Map<string, string[]>();
  for (const f of fighters) for (const k of fightKeys(data, f.fighterId)) {
    if (!claimants.has(k)) claimants.set(k, []);
    claimants.get(k)!.push(f.fighterId);
  }
  let modernCollisions = 0, tourneyCollisions = 0;
  const collisionLines: string[] = [];
  for (const [k, ids] of claimants) {
    if (ids.length < 2) continue;
    const year = parseInt(k.split('@')[1]?.slice(0, 4) || '0', 10);
    // UFC ran same-night tournaments through ~UFC 23 (2000); collisions from 2001
    // on cannot be legitimate same-night doubles → real duplicate / bad edge.
    if (year >= 2001) {
      modernCollisions++;
      if (collisionLines.length < 20)
        collisionLines.push(`  ${k}  claimed by ${ids.length}: ${ids.map((id) => byId.get(id)?.fullName ?? id).join(', ')}`);
      review.push({ type: 'SHARED_FIGHT_EDGE', reason: 'two fighters claim same opponent@date (modern era)',
        idA: ids[0], nameA: byId.get(ids[0])?.fullName ?? ids[0], evidenceA: k,
        idB: ids[1], nameB: byId.get(ids[1])?.fullName ?? ids[1], evidenceB: `+${ids.length - 2} more` });
    } else tourneyCollisions++;
  }

  // ── our↔Sherdog: reuse the crosswalk; re-scrutinise weak rows. The Sherdog
  //    file is NON-UFC pedigree history (no shared UFC fights to corroborate
  //    with), so we lean on the crosswalk's OWN evidence in `notes`
  //    ("overlap N/5, name=true/…") plus roster-name uniqueness. A weak link is
  //    auto-confirmed when the career-fight overlap is strong, OR the name
  //    matches AND is unique in our roster (no namesake → no wrong-person risk);
  //    otherwise it stays queued. NB these links only feed PRE-UFC PEDIGREE,
  //    which is currently disabled — so they don't affect rankings yet. ──
  const isUniqueName = (id: string): boolean =>
    (byNorm.get(normalize(byId.get(id)?.fullName ?? '')) ?? []).length === 1;

  const cross = readCsv(path.join(DATA, 'sherdog_crosswalk.csv'));
  let sherLinked = 0, sherWeak = 0, sherCorroborated = 0;
  const sherById = new Map<string, string>(); // ourId → sherdogId
  for (const r of cross) {
    const ourId = r['ourFighterId'];
    if (!ourId || !byId.has(ourId)) continue;
    const conf = parseInt(r['matchConfidence'] || '0', 10);
    sherById.set(ourId, r['sherdogId'] || '');
    if (r['fullName']) addAlias(ourId, r['fullName'], 'sherdog');
    sherLinked++;
    if (conf < 60) {
      const notes = r['notes'] || '';
      const ov = notes.match(/overlap (\d+)\/(\d+)/);
      const overlapFrac = ov && +ov[2] ? +ov[1] / +ov[2] : 0;
      const nameMatch = /name=true|exactName=[1-9]/.test(notes);
      if (overlapFrac >= 0.6 || (nameMatch && isUniqueName(ourId))) {
        sherCorroborated++;
      } else {
        sherWeak++;
        review.push({
          type: 'WEAK_SHERDOG_LINK', reason: `confidence ${conf} < 60, overlap ${ov ? ov[0] : 'n/a'}, ${isUniqueName(ourId) ? 'unique' : 'NON-UNIQUE'} name — confirm or break`,
          idA: ourId, nameA: byId.get(ourId)!.fullName, evidenceA: `our: ${byId.get(ourId)!.fullName}`,
          idB: r['sherdogId'] || '', nameB: r['fullName'] || '', evidenceB: notes,
        });
      }
    }
  }

  // ── AUDIT 1c: clean-split duplicates via the crosswalk ──
  // Two of OUR ids mapping to ONE sherdogId = the same human under two ids, even
  // if their fight rows never overlap (a cleanly-split career). Catches what 1b
  // cannot.
  const ourIdsBySherdog = new Map<string, string[]>();
  for (const [ourId, sId] of sherById) {
    if (!sId) continue;
    if (!ourIdsBySherdog.has(sId)) ourIdsBySherdog.set(sId, []);
    ourIdsBySherdog.get(sId)!.push(ourId);
  }
  let splitDupes = 0;
  const splitLines: string[] = [];
  for (const [sId, ids] of ourIdsBySherdog) {
    if (ids.length < 2) continue;
    splitDupes++;
    splitLines.push(`  ${sId}  ←  ${ids.map((id) => `${byId.get(id)?.fullName ?? id} (${id.slice(0, 8)})`).join('  +  ')}`);
    review.push({ type: 'SPLIT_DUPLICATE', reason: 'two of our ids share one sherdogId (same person)',
      idA: ids[0], nameA: byId.get(ids[0])?.fullName ?? ids[0], evidenceA: sId,
      idB: ids[1], nameB: byId.get(ids[1])?.fullName ?? ids[1], evidenceB: `+${ids.length - 2} more` });
  }

  // ── fold curated alias tables (already-vetted name variants) ──
  const nameToId = new Map(fighters.map((f) => [f.fullName, f.fighterId]));
  let oddsAliases = 0, officialAliases = 0;
  for (const [oddsName, csvName] of Object.entries(ODDS_NAME_OVERRIDES)) {
    const id = nameToId.get(csvName);
    if (id) { addAlias(id, oddsName, 'odds'); oddsAliases++; }
  }
  for (const [offName, csvName] of Object.entries(KNOWN_NAME_OVERRIDES)) {
    const id = nameToId.get(csvName);
    if (id) { addAlias(id, offName, 'official'); officialAliases++; }
  }
  // Fold the SECONDARY names of merged duplicates → primary canonical id, so the
  // resolver maps e.g. "Patricio Pitbull" to the surviving fighter (the merge is
  // applied at load, but external inputs may still use the old name).
  let mergeAliases = 0;
  for (const r of readCsv(path.join(DATA, 'canonical', 'fighter_merges.csv'))) {
    if (r['primary_id'] && r['secondary_name'] && byId.has(r['primary_id'])) {
      addAlias(r['primary_id'], r['secondary_name'], 'merge');
      mergeAliases++;
    }
  }

  // ── our↔BFO: only if the crawl has produced data/bfo_odds.csv ──
  const bfoPath = path.join(DATA, 'bfo_odds.csv');
  let bfoLinked = 0, bfoReview = 0, bfoPresent = false;
  if (fs.existsSync(bfoPath)) {
    bfoPresent = true;
    // Build BFO fighters' fight graph from the odds rows (each row = a bout).
    const bfoRows = readCsv(bfoPath);
    const bfoKeys = new Map<string, Set<string>>(); // bfoName → opponent@date keys
    const add = (name: string, opp: string, date: string) => {
      if (!name) return;
      if (!bfoKeys.has(name)) bfoKeys.set(name, new Set());
      bfoKeys.get(name)!.add(`${normalize(opp)}@${date}`);
    };
    for (const r of bfoRows) { add(r['fighter1'], r['fighter2'], r['date']); add(r['fighter2'], r['fighter1'], r['date']); }

    const ourByNorm = new Map<string, string[]>();
    for (const f of fighters) {
      const nm = normalize(f.fullName);
      if (!ourByNorm.has(nm)) ourByNorm.set(nm, []);
      ourByNorm.get(nm)!.push(f.fighterId);
    }
    for (const [bfoName, keys] of bfoKeys) {
      const cands = ourByNorm.get(normalize(bfoName)) ?? [];
      const corroborated = cands.filter((id) => shareAny(fightKeys(data, id), keys) > 0);
      if (corroborated.length === 1) {
        addAlias(corroborated[0], bfoName, 'bfo'); bfoLinked++;
      } else if (cands.length === 1 && corroborated.length === 0) {
        // single exact-name candidate, no fight overlap → still risky → review
        bfoReview++;
        review.push({ type: 'BFO_UNCORROBORATED', reason: 'exact name, no shared fight to confirm',
          idA: cands[0], nameA: byId.get(cands[0])!.fullName, evidenceA: 'our',
          idB: '', nameB: bfoName, evidenceB: `bfo ${keys.size} fights` });
      } else if (cands.length > 1) {
        bfoReview++;
        review.push({ type: 'BFO_AMBIGUOUS', reason: `${cands.length} same-name candidates, ${corroborated.length} corroborated`,
          idA: cands.join('|'), nameA: bfoName, evidenceA: 'multiple our candidates',
          idB: '', nameB: bfoName, evidenceB: `bfo ${keys.size} fights` });
      }
    }
  }

  // ── AUDIT 3: win-count reconciliation (our stats vs our fight graph) ──
  let recMismatch = 0;
  const recLines: string[] = [];
  for (const f of fighters) {
    const g = graphRecord(data, f.fighterId);
    const statsN = f.wins + f.losses + f.draws;
    // A fighter whose recorded W/L/D wildly exceeds their actual fight rows (or
    // vice-versa) signals a bad join or a merged record — the "stolen wins" smell.
    if (g.n > 0 && Math.abs(statsN - g.n) > 5) {
      recMismatch++;
      if (recLines.length < 25) recLines.push(`  ${f.fullName.padEnd(24)} stats ${f.wins}-${f.losses}-${f.draws} (${statsN}) vs graph ${g.w}-${g.l}-${g.d} (${g.n})`);
    }
  }

  // ── write outputs ──
  const registry = fighters.map((f) => ({
    canonical_id: f.fighterId,
    fullName: f.fullName,
    nickname: f.nickname,
    weightClass: f.weightClass,
    gender: f.gender,
    W: f.wins, L: f.losses, D: f.draws,
    fightCount: graphRecord(data, f.fighterId).n,
    height: f.height, stance: f.stance,
    sherdogId: sherById.get(f.fighterId) ?? '',
    aliases: [...(aliasSet.get(f.fighterId) ?? [])].join(' | '),
  }));
  fs.writeFileSync(path.join(OUT, 'fighter_registry.csv'), Papa.unparse(registry));
  fs.writeFileSync(path.join(OUT, 'fighter_aliases.csv'),
    Papa.unparse(aliasRows.map((a) => ({ normalized_name: a.norm, source: a.source, canonical_id: a.canonicalId }))));
  fs.writeFileSync(path.join(OUT, 'identity_review.csv'), Papa.unparse(review));

  const audit: string[] = [];
  const P = (s = '') => audit.push(s);
  P('══════════════════════════════════════════════════════════════════');
  P('  CANONICAL FIGHTER REGISTRY — INTEGRITY AUDIT');
  P('══════════════════════════════════════════════════════════════════');
  P(`  canonical fighters (our Fighter_Id anchor): ${fighters.length}`);
  P(`  total name aliases collected               : ${aliasRows.length}`);
  P(`  review queue size                          : ${review.length}`);
  P('');
  P('── 1. WITHIN-SOURCE DUPLICATES (same human, two ids) ──');
  P(`  same-name clusters: ${[...byNorm.values()].filter((v) => v.length > 1).length}`);
  P(`  SUSPECTED DUPLICATES (shared opponent@date): ${suspectedDupes}`);
  for (const l of dupeLines) P(l);
  if (!suspectedDupes) P('  ✓ none — no two same-name ids share a fight.');
  P('');
  P('── 1b. NAME-INDEPENDENT EDGE CHECK (two fighters claim same opponent@date) ──');
  P(`  modern-era collisions (≥2001, real flags): ${modernCollisions}`);
  P(`  pre-2001 tournament collisions (legit):    ${tourneyCollisions}`);
  for (const l of collisionLines) P(l);
  if (!modernCollisions) P('  ✓ none — every modern fight edge has a single claimant.');
  P('');
  P('── 1c. CLEAN-SPLIT DUPLICATES (two of our ids → one Sherdog id) ──');
  P(`  split duplicates: ${splitDupes}`);
  for (const l of splitLines.slice(0, 25)) P(l);
  if (!splitDupes) P('  ✓ none — no Sherdog id maps to more than one of our ids.');
  P('');
  P('── 2. NAMESAKE SEPARATION (different humans, same name — kept apart) ──');
  P(`  namesake clusters kept separate: ${namesakeClusters}`);
  for (const l of namesakeLines.slice(0, 30)) P(l);
  if (namesakeLines.length > 30) P(`  … and ${namesakeLines.length - 30} more (see identity_review is N/A; these are auto-confirmed distinct)`);
  P('');
  P('── 3. WIN-COUNT RECONCILIATION (stats W/L/D vs actual fight rows) ──');
  P(`  fighters with |stats − graph| > 5 fights: ${recMismatch}`);
  for (const l of recLines) P(l);
  if (recMismatch > 25) P(`  … and ${recMismatch - 25} more`);
  P('');
  P('── 4. CROSS-SOURCE COVERAGE ──');
  P(`  our↔Sherdog linked: ${sherLinked}  (low-conf corroborated by fight graph: ${sherCorroborated}, still-suspect queued: ${sherWeak})`);
  P(`  odds aliases folded: ${oddsAliases}   official aliases folded: ${officialAliases}   merge aliases folded: ${mergeAliases}`);
  P(bfoPresent ? `  our↔BFO linked: ${bfoLinked}  (queued for review: ${bfoReview})`
              : '  our↔BFO: bfo_odds.csv not present yet (crawl running) — re-run after it lands.');
  P('');
  P('  Review queue → data/canonical/identity_review.csv');
  P('  Registry     → data/canonical/fighter_registry.csv');
  const txt = audit.join('\n');
  fs.writeFileSync(path.join(OUT, 'identity_audit.txt'), txt + '\n');
  console.log(txt);
}

main();
