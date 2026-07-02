// ─────────────────────────────────────────────────────────────────────────
//  scripts/registry/buildAges.ts — fighter date-of-birth enrichment.
//
//  Age matters in high-end athletics: age curves and drop-offs are core to
//  evaluation and projection, and our primary CSVs carry no DOB at all.
//  This build-time pass fills that gap from two sources, in order:
//
//    1. Wikidata P569 (date of birth), joined via the Sherdog fighter ID
//       (P2818) — the same precise ID↔ID join buildMedia.ts uses. No fuzzy
//       name matching, so namesakes can't cross-contaminate. One SPARQL call.
//       timePrecision is kept: 11 = exact day, 10 = month, 9 = year-only.
//    2. Sherdog profile pages (<span itemprop="birthDate">) — read from the
//       existing scrape cache (data/.sherdog_cache) at zero network cost;
//       with --fetch, politely fetches missing ACTIVE fighters' profiles.
//
//  Every candidate DOB is validated against the fighter's own career: age at
//  UFC debut must be 16–47 and age today under 62, or the row is rejected
//  (wrong-person guard). Output is data/canonical/fighter_dob.csv — loaded at
//  runtime by src/lib/fighterAges.ts, DISPLAY ONLY, never in the scoring path.
//
//  Run:  node_modules/.bin/jiti scripts/registry/buildAges.ts [--fetch]
// ─────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { getData } from '../../src/lib/dataCache';
import { fetchProfile } from '../sherdog/fetchProfile';

const DATA = path.join(process.cwd(), 'data');
const OUT = path.join(DATA, 'canonical');
const CACHE_DIR = path.join(DATA, '.sherdog_cache');

const SPARQL = 'https://query.wikidata.org/sparql';
const UA = 'UFergCRankings/1.0 (UFC rankings research; build-time DOB join)';

const DEBUT_AGE_MIN = 16;
const DEBUT_AGE_MAX = 47;
const LAST_FIGHT_AGE_MAX = 55; // nobody fights in the UFC past this
const NO_SPAN_AGE_MAX = 80;    // fallback sanity when we have no dated fights
const ACTIVE_MONTHS = 36;     // --fetch only bothers with recently active fighters
const FETCH_DELAY_MS = 1300;  // politeness for --fetch
const FETCH_CAP = 300;        // hard bound on network fetches per run

type Row = Record<string, string>;
const readCsv = (p: string): Row[] =>
  fs.existsSync(p) ? Papa.parse<Row>(fs.readFileSync(p, 'utf-8'), { header: true, skipEmptyLines: true }).data : [];

interface DobEntry {
  dob: string;                       // ISO YYYY-MM-DD
  precision: 'day' | 'month' | 'year';
  source: 'wikidata' | 'sherdog';
}

// ── source 1: Wikidata (P2818 → P569 + precision, with English label) ──────
// Every returned entity carries a Sherdog fighter ID, so the pool is
// guaranteed MMA fighters — which is what makes the guarded name-match
// fallback below safe (a namesake tennis player can never appear here).
// NOTE: deliberately NO skos:altLabel subquery — it pushes WDQS past its 60s
// limit (504). Registry aliases (fighter_aliases.csv) cover the alt-name gap.
interface WdDob { dob: string; prec: number; label: string }

async function fetchWikidataDobs(): Promise<Map<string, WdDob>> {
  const query = `
    SELECT ?sherdog ?dob ?prec ?label WHERE {
      ?p wdt:P2818 ?sherdog .
      ?p p:P569/psv:P569 ?dobNode .
      ?dobNode wikibase:timeValue ?dob ; wikibase:timePrecision ?prec .
      OPTIONAL { ?p rdfs:label ?label . FILTER(LANG(?label)="en") }
    }`;
  const url = `${SPARQL}?query=${encodeURIComponent(query)}`;
  // Retry with backoff — WDQS rate-limits bursts (429). Honour Retry-After.
  let res: Response | null = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    res = await fetch(url, { headers: { Accept: 'text/csv', 'User-Agent': UA } });
    if (res.ok) break;
    if (res.status === 429 && attempt < 4) {
      const wait = Math.max(parseInt(res.headers.get('retry-after') || '0', 10), 30 * attempt) * 1000;
      console.log(`  WDQS 429 — backing off ${wait / 1000}s (attempt ${attempt}/4)…`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    throw new Error(`Wikidata SPARQL ${res.status} ${res.statusText}`);
  }
  if (!res?.ok) throw new Error('Wikidata SPARQL failed after retries');
  const rows = Papa.parse<Row>(await res.text(), { header: true, skipEmptyLines: true }).data;

  const map = new Map<string, WdDob>();
  for (const r of rows) {
    const sid = (r.sherdog || '').trim();
    const dob = (r.dob || '').slice(0, 10);
    const prec = parseInt(r.prec || '0', 10);
    if (!sid || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) continue;
    // Keep the highest-precision statement when Wikidata has several.
    const cur = map.get(sid);
    if (!cur || prec > cur.prec) {
      map.set(sid, {
        dob,
        prec,
        label: (r.label || '').trim(),
        altLabels: (r.alts || '').split('|').map((s) => s.trim()).filter(Boolean),
      });
    }
  }
  return map;
}

// Normalized name for the guarded fallback match: lowercase, diacritics and
// punctuation stripped, jr/sr suffixes dropped, no spaces.
function normName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|junior|senior)\.?\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const precLabel = (p: number): DobEntry['precision'] => (p >= 11 ? 'day' : p === 10 ? 'month' : 'year');

// ── source 2: Sherdog profile HTML (cache first, optional fetch) ──────────
function parseSherdogDob(html: string): string | null {
  const m = /itemprop="birthDate">([^<]+)</.exec(html);
  if (!m) return null;
  const d = new Date(m[1].trim());
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function cachedProfileDob(sherdogId: string): string | null {
  const file = path.join(CACHE_DIR, `${sherdogId}.html`);
  if (!fs.existsSync(file)) return null;
  return parseSherdogDob(fs.readFileSync(file, 'utf-8'));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── validation against the fighter's own career ───────────────────────────
interface CareerSpan { first: Date; last: Date }

function yearsBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
}

// The wrong-person guard is the fighter's own career: age at debut and age at
// last fight must be athletically plausible. Age TODAY is deliberately not
// capped — retired legends (Couture, Severn) are legitimately in their 60s.
function validate(dob: string, span: CareerSpan | undefined): string | null {
  const d = new Date(dob + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return 'unparseable';
  if (span) {
    const debutAge = yearsBetween(d, span.first);
    const lastAge = yearsBetween(d, span.last);
    if (debutAge < DEBUT_AGE_MIN || debutAge > DEBUT_AGE_MAX) {
      return `debut age ${debutAge.toFixed(0)} outside ${DEBUT_AGE_MIN}–${DEBUT_AGE_MAX}`;
    }
    if (lastAge > LAST_FIGHT_AGE_MAX) return `last-fight age ${lastAge.toFixed(0)} > ${LAST_FIGHT_AGE_MAX}`;
  } else {
    const ageToday = yearsBetween(d, new Date());
    if (ageToday < DEBUT_AGE_MIN || ageToday > NO_SPAN_AGE_MAX) return `implausible age today (${ageToday.toFixed(0)})`;
  }
  return null;
}

async function main() {
  const doFetch = process.argv.includes('--fetch');
  const registry = readCsv(path.join(OUT, 'fighter_registry.csv'));
  const crosswalk = readCsv(path.join(DATA, 'sherdog_crosswalk.csv'));
  if (!registry.length) throw new Error('fighter_registry.csv not found — run buildRegistry.ts first.');

  // canonical id → full sherdog slug-id + numeric tail (Wikidata stores the number).
  const idToSlug = new Map<string, string>();
  const idToNum = new Map<string, string>();
  for (const r of crosswalk) {
    if (!r.ourFighterId || !r.sherdogId) continue;
    idToSlug.set(r.ourFighterId, r.sherdogId);
    const m = /(\d+)$/.exec(r.sherdogId);
    if (m) idToNum.set(r.ourFighterId, m[1]);
  }

  // Career spans for validation + activity (from the same resolved fight data
  // the app uses — engine OUTPUT, read-only).
  const data = getData();
  const spans = new Map<string, CareerSpan>();
  for (const [fid, fights] of data.fighterFights) {
    const dates = fights.filter((f) => f.eventDate).map((f) => f.eventDate!.getTime());
    if (dates.length) spans.set(fid, { first: new Date(Math.min(...dates)), last: new Date(Math.max(...dates)) });
  }

  console.log('Querying Wikidata (P2818 → P569 date of birth)…');
  const wd = await fetchWikidataDobs();
  console.log(`  Wikidata fighters with a DOB + Sherdog id: ${wd.size}`);

  const entries = new Map<string, DobEntry>();
  const rejects: string[] = [];

  // Pass 1: Wikidata.
  for (const f of registry) {
    const num = idToNum.get(f.canonical_id);
    const hit = num ? wd.get(num) : undefined;
    if (!hit) continue;
    const err = validate(hit.dob, spans.get(f.canonical_id));
    if (err) { rejects.push(`${f.fullName} (wikidata ${hit.dob}): ${err}`); continue; }
    entries.set(f.canonical_id, { dob: hit.dob, precision: precLabel(hit.prec), source: 'wikidata' });
  }
  console.log(`  accepted from Wikidata (ID join): ${entries.size}`);

  // Pass 1b: guarded name match against the SAME Wikidata pool, for registry
  // fighters with no local crosswalk row (the ID join can't reach them even
  // though Wikidata has them — e.g. big names the Sherdog scrape never
  // touched). Guards: the name must be unambiguous on BOTH sides (exactly one
  // Wikidata entity, exactly one registry fighter) and the DOB must pass the
  // career-plausibility validation like everything else.
  const wdByName = new Map<string, WdDob[]>();
  for (const e of wd.values()) {
    for (const raw of [e.label, ...e.altLabels]) {
      const key = normName(raw);
      if (!key) continue;
      const arr = wdByName.get(key) ?? [];
      if (!arr.includes(e)) arr.push(e);
      wdByName.set(key, arr);
    }
  }
  // Name keys per fighter: canonical fullName + curated registry aliases
  // (fighter_aliases.csv — catches "Ian Machado Garry"→"Ian Garry",
  // "King Green"→"Bobby Green", "Dooho Choi"→"Choi Doo-ho", …).
  const aliasRows = readCsv(path.join(OUT, 'fighter_aliases.csv'));
  const keysById = new Map<string, Set<string>>();
  const idsByKey = new Map<string, Set<string>>();
  const addKey = (id: string, raw: string) => {
    const key = normName(raw);
    if (!key) return;
    if (!keysById.has(id)) keysById.set(id, new Set());
    keysById.get(id)!.add(key);
    if (!idsByKey.has(key)) idsByKey.set(key, new Set());
    idsByKey.get(key)!.add(id);
  };
  for (const f of registry) addKey(f.canonical_id, f.fullName);
  for (const a of aliasRows) if (a.canonical_id && a.normalized_name) addKey(a.canonical_id, a.normalized_name);

  let nameMatched = 0, nameAmbiguous = 0;
  for (const f of registry) {
    if (entries.has(f.canonical_id)) continue;
    let hit: WdDob | null = null;
    let ambiguous = false;
    for (const key of keysById.get(f.canonical_id) ?? []) {
      const candidates = wdByName.get(key);
      if (!candidates) continue;
      // Ambiguity guards: same-named Wikidata entities with DIFFERENT DOBs,
      // or a name key shared by more than one registry fighter → skip.
      const dobs = new Set(candidates.map((c) => c.dob));
      if (dobs.size > 1 || (idsByKey.get(key)?.size ?? 0) > 1) { ambiguous = true; continue; }
      if (hit && hit.dob !== candidates[0].dob) { ambiguous = true; hit = null; break; }
      hit = candidates[0];
    }
    if (!hit) { if (ambiguous) nameAmbiguous++; continue; }
    const err = validate(hit.dob, spans.get(f.canonical_id));
    if (err) { rejects.push(`${f.fullName} (wikidata-name ${hit.dob}): ${err}`); continue; }
    entries.set(f.canonical_id, { dob: hit.dob, precision: precLabel(hit.prec), source: 'wikidata' });
    nameMatched++;
  }
  console.log(`  accepted from Wikidata (guarded name/alias match): ${nameMatched} (${nameAmbiguous} skipped as ambiguous)`);

  // Pass 2: Sherdog scrape cache (zero network).
  let fromCache = 0;
  for (const f of registry) {
    if (entries.has(f.canonical_id)) continue;
    const slug = idToSlug.get(f.canonical_id);
    if (!slug) continue;
    const dob = cachedProfileDob(slug);
    if (!dob) continue;
    const err = validate(dob, spans.get(f.canonical_id));
    if (err) { rejects.push(`${f.fullName} (sherdog-cache ${dob}): ${err}`); continue; }
    entries.set(f.canonical_id, { dob, precision: 'day', source: 'sherdog' });
    fromCache++;
  }
  console.log(`  filled from Sherdog cache: ${fromCache}`);

  // Pass 3 (--fetch): politely fetch profiles for recently-active fighters
  // still missing a DOB. Capped; the cache makes re-runs cheap.
  if (doFetch) {
    const cutoff = Date.now() - ACTIVE_MONTHS * 30.44 * 86400_000;
    const targets = registry.filter((f) => {
      if (entries.has(f.canonical_id) || !idToSlug.has(f.canonical_id)) return false;
      const span = spans.get(f.canonical_id);
      return !!span && span.last.getTime() >= cutoff;
    }).slice(0, FETCH_CAP);
    console.log(`  --fetch: ${targets.length} active fighters to try over the network…`);
    let fetched = 0, gained = 0;
    for (const f of targets) {
      const slug = idToSlug.get(f.canonical_id)!;
      try {
        const res = await fetchProfile(slug);
        if (!res.fromCache) { fetched++; await sleep(FETCH_DELAY_MS); }
        const dob = parseSherdogDob(res.html);
        if (!dob) continue;
        const err = validate(dob, spans.get(f.canonical_id));
        if (err) { rejects.push(`${f.fullName} (sherdog-fetch ${dob}): ${err}`); continue; }
        entries.set(f.canonical_id, { dob, precision: 'day', source: 'sherdog' });
        gained++;
      } catch (e) {
        console.log(`    fetch failed for ${slug}: ${e instanceof Error ? e.message : e}`);
      }
    }
    console.log(`  --fetch: ${fetched} network fetches, ${gained} DOBs gained`);
  }

  // ── write output ──
  const out: Row[] = [];
  for (const f of registry) {
    const e = entries.get(f.canonical_id);
    if (!e) continue;
    out.push({
      canonical_id: f.canonical_id,
      fullName: f.fullName,
      dob: e.dob,
      precision: e.precision,
      source: e.source,
    });
  }
  fs.writeFileSync(path.join(OUT, 'fighter_dob.csv'), Papa.unparse(out));

  // ── coverage report (overall + the pools that matter: active + ranked-ish) ──
  const cutoff = Date.now() - ACTIVE_MONTHS * 30.44 * 86400_000;
  const active = registry.filter((f) => (spans.get(f.canonical_id)?.last.getTime() ?? 0) >= cutoff);
  const activeCovered = active.filter((f) => entries.has(f.canonical_id)).length;
  const lines: string[] = [];
  lines.push(`Fighter DOB coverage — generated ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`Registry fighters : ${registry.length}`);
  lines.push(`  with DOB        : ${out.length} (${((100 * out.length) / registry.length).toFixed(0)}%)`);
  lines.push(`  from Wikidata   : ${out.filter((r) => r.source === 'wikidata').length}`);
  lines.push(`  from Sherdog    : ${out.filter((r) => r.source === 'sherdog').length}`);
  lines.push(`Active (fought ≤${ACTIVE_MONTHS}mo): ${active.length}, with DOB ${activeCovered} (${((100 * activeCovered) / Math.max(1, active.length)).toFixed(0)}%)`);
  lines.push(`Rejected by career-plausibility guard: ${rejects.length}`);
  for (const r of rejects.slice(0, 30)) lines.push(`  ✗ ${r}`);
  const report = lines.join('\n') + '\n';
  fs.writeFileSync(path.join(OUT, 'ages_coverage.txt'), report);
  console.log('\n' + report);
  console.log(`Wrote ${out.length} rows → data/canonical/fighter_dob.csv`);
}

main().catch((e) => { console.error(e); process.exit(1); });
