// research/regional/mergeEspnDob.ts — one birthdate file from the two ESPN passes.
//
// TWO INDEPENDENT ACCESS METHODS, ONE CEILING. The name-search pass covered
// 41.2% of the regional pool; enumerating ESPN's entire 38,013-athlete index
// covered 43.9%, and the union is 44.0% — enumeration added just 518 names the
// search missed. Two unrelated approaches converging within 3 points is the
// signal that ~44% is what ESPN HAS, not what we failed to ask for. Further
// effort against this source is wasted; going deeper needs a different one.
//
// SAFETY IS PRESERVED, NOT ASSUMED. The search pass ran three gates
// (uniqueness, token name-match, career plausibility). Enumeration-sourced
// birthdates have had none, so they are gated here before merging:
//   • namesake gate — a name mapping to two different birthdates in the index
//     is dropped, never picked between;
//   • career plausibility — with the fighter's known pro-debut date, debut age
//     must be 16–47, the same guard buildAges.ts uses.
//
// Output: data/regional_dob_merged.csv — the file the loaders should read.
//
// Run: node_modules/.bin/jiti research/regional/mergeEspnDob.ts
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

// TOKEN-SORTED key: order-insensitive on purpose ("Nick Galanti" → "galanti
// nick"), the same trick the BFO odds join uses to catch first/last flips
// between sources. Keys that read "reversed" in the output are this, not a
// bug (audited 2026-08-15: every nameKey = token-sort of its display name,
// zero duplicates). Suffixes stay distinct tokens deliberately — the six
// jr/sr near-pairs in the data are real father/son pairs (Kevin Ferguson =
// Kimbo Slice b.1974 vs Kevin Ferguson Jr. b.1992), so collapsing them
// would invent namesakes.
const T = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');
const readCsv = (p: string) =>
  fs.existsSync(p)
    ? Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8'), { header: true, skipEmptyLines: true }).data
    : [];
const yearsBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / (365.25 * 86_400_000);

function main(): void {
  // Pro-debut dates for the plausibility gate (100% of cached FM profiles).
  const debut = new Map<string, string>();
  for (const r of readCsv(path.join(process.cwd(), 'data', 'regional_profile_meta.csv'))) {
    if (r.name && r.proDebutDate) debut.set(T(r.name), r.proDebutDate);
  }

  const out = new Map<string, { dob: string; source: string; display: string }>();

  // 1. search pass — already gated, trusted as-is.
  for (const r of readCsv(path.join(process.cwd(), 'data', 'regional_dob.csv'))) {
    if (r.status === 'found' && r.dob && r.name) {
      out.set(T(r.name), { dob: r.dob, source: 'search', display: r.name });
    }
  }
  const fromSearch = out.size;

  // 2. enumeration — collapse by name, drop namesakes, then gate.
  const byName = new Map<string, Set<string>>();
  const display = new Map<string, string>();
  for (const r of readCsv(path.join(process.cwd(), 'data', 'espn_mma_athletes.csv'))) {
    if (!r.dob || !r.fullName) continue;
    const k = T(r.fullName);
    if (!k) continue;
    if (!byName.has(k)) byName.set(k, new Set());
    byName.get(k)!.add(r.dob);
    display.set(k, r.fullName);
  }
  let added = 0, namesake = 0, implausible = 0, conflict = 0;
  for (const [k, dobs] of byName) {
    if (dobs.size > 1) { namesake++; continue; }        // never pick between namesakes
    const dob = [...dobs][0];
    const existing = out.get(k);
    if (existing) { if (existing.dob !== dob) conflict++; continue; } // search pass wins
    const d = debut.get(k);
    if (d) {
      const debutAge = yearsBetween(dob, d);
      if (debutAge < 16 || debutAge > 47) { implausible++; continue; }
    }
    out.set(k, { dob, source: 'enumeration', display: display.get(k) ?? k });
    added++;
  }

  const rows = [...out.entries()]
    .map(([k, v]) => ({ nameKey: k, name: v.display, dob: v.dob, source: v.source }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const dest = path.join(process.cwd(), 'data', 'regional_dob_merged.csv');
  fs.writeFileSync(dest, Papa.unparse(rows) + '\n');

  console.log(`[merge] search pass: ${fromSearch} birthdates`);
  console.log(`[merge] enumeration: +${added} new (dropped ${namesake} namesake-ambiguous, ${implausible} implausible-vs-debut, ${conflict} conflicting with the search pass)`);
  console.log(`[merge] TOTAL ${rows.length} → ${dest}`);

  // Coverage against the populations that matter.
  const pool = new Set(readCsv(path.join(process.cwd(), 'data', 'regional_ratings.csv')).map((r) => T(r.name ?? '')));
  const arrivals = new Set(readCsv(path.join(process.cwd(), 'data', 'regional_arrival.csv')).map((r) => T(r.name ?? '')));
  const dwcs = new Set(readCsv(path.join(process.cwd(), 'data', 'dwcs_fighters.csv')).map((r) => T(r.name ?? '')));
  const cov = (s: Set<string>) => {
    const n = [...s].filter((k) => k && out.has(k)).length;
    return `${n}/${s.size} (${((100 * n) / (s.size || 1)).toFixed(1)}%)`;
  };
  console.log(`\n[coverage] rated regional pool : ${cov(pool)}`);
  console.log(`[coverage] UFC arrivals        : ${cov(arrivals)}`);
  console.log(`[coverage] DWCS entrants       : ${cov(dwcs)}`);
}

main();
