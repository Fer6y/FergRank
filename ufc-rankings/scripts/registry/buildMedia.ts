// ─────────────────────────────────────────────────────────────────────────
//  scripts/registry/buildMedia.ts — fighter media + nationality enrichment.
//
//  Joins the canonical registry to Wikidata via the Sherdog fighter ID (P2818)
//  — a precise ID↔ID join, NOT a fuzzy name match — to pull three things every
//  fighter profile / row currently fakes with an initials avatar:
//    • nationality (→ country flag)          [Wikidata P27]
//    • a reusable Commons portrait            [Wikidata P18, CC/PD licensed]
//    • the UFC.com athlete id                 [Wikidata P9722]
//      (lets a later pass fetch UFC.com's standardised headshots keyed by id,
//       with no slug-guessing — see notes at the bottom of this file)
//
//  Build-time only — one network call to the Wikidata SPARQL endpoint, exactly
//  like the Sherdog scrape pipeline. The app never calls Wikidata at runtime.
//
//  Outputs to data/canonical/:  fighter_media.csv, media_coverage.txt
//  Additive — does not touch fighter_registry.csv (buildRegistry.ts owns that).
//
//  Run:  node_modules/.bin/jiti scripts/registry/buildMedia.ts
// ─────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const DATA = path.join(process.cwd(), 'data');
const OUT = path.join(DATA, 'canonical');

type Row = Record<string, string>;
const readCsv = (p: string): Row[] =>
  fs.existsSync(p) ? Papa.parse<Row>(fs.readFileSync(p, 'utf-8'), { header: true, skipEmptyLines: true }).data : [];

const SPARQL = 'https://query.wikidata.org/sparql';
const UA = 'UFergCRankings/1.0 (UFC rankings research; build-time media join)';

// One Wikidata row per (sherdog id). A fighter can carry >1 country (e.g.
// dual nationality / historical states) — we keep the first non-empty.
interface WdEntry { img: string; country: string; ufc: string }

async function fetchWikidata(): Promise<Map<string, WdEntry>> {
  const query = `
    SELECT ?sherdog ?ufc ?img ?countryLabel WHERE {
      ?p wdt:P2818 ?sherdog .
      OPTIONAL { ?p wdt:P9722 ?ufc }
      OPTIONAL { ?p wdt:P18  ?img }
      OPTIONAL {
        ?p wdt:P27 ?c .
        ?c rdfs:label ?countryLabel . FILTER(LANG(?countryLabel)="en")
      }
      ?p rdfs:label ?label . FILTER(LANG(?label)="en")
    }`;
  const url = `${SPARQL}?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'text/csv', 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Wikidata SPARQL ${res.status} ${res.statusText}`);
  const rows = Papa.parse<Row>(await res.text(), { header: true, skipEmptyLines: true }).data;

  const map = new Map<string, WdEntry>();
  for (const r of rows) {
    const sid = (r.sherdog || '').trim();
    if (!sid) continue;
    const cur = map.get(sid) ?? { img: '', country: '', ufc: '' };
    if (!cur.img && r.img) cur.img = r.img.trim();
    if (!cur.country && r.countryLabel) cur.country = r.countryLabel.trim();
    if (!cur.ufc && r.ufc) cur.ufc = r.ufc.trim();
    map.set(sid, cur);
  }
  return map;
}

// Sherdog ids in our crosswalk look like "Chris-Padilla-124527"; Wikidata stores
// the bare numeric id. Join on the numeric tail.
const sherdogNum = (s: string): string | null => {
  const m = /(\d+)$/.exec(s || '');
  return m ? m[1] : null;
};

// Commons FilePath → a width-capped thumbnail the UI can drop straight into an
// <img>. 400px is plenty for a profile portrait and keeps payloads small.
const thumb = (img: string): string =>
  img ? `${img.replace(/^http:/, 'https:')}${img.includes('?') ? '&' : '?'}width=400` : '';

async function main() {
  const registry = readCsv(path.join(OUT, 'fighter_registry.csv'));
  const crosswalk = readCsv(path.join(DATA, 'sherdog_crosswalk.csv'));
  if (!registry.length) throw new Error('fighter_registry.csv not found — run buildRegistry.ts first.');

  // ourFighterId === canonical_id; map canonical id → sherdog numeric id.
  const idToSherdog = new Map<string, string>();
  for (const r of crosswalk) {
    const n = sherdogNum(r.sherdogId);
    if (n) idToSherdog.set(r.ourFighterId, n);
  }

  console.log(`Querying Wikidata (Sherdog ID P2818 → photo/country/UFC id)…`);
  const wd = await fetchWikidata();
  console.log(`  Wikidata fighters with a Sherdog id: ${wd.size}`);

  const out: Row[] = [];
  const byDiv = new Map<string, { total: number; photo: number; flag: number; ufc: number }>();

  for (const f of registry) {
    const div = f.weightClass || 'Unknown';
    const d = byDiv.get(div) ?? { total: 0, photo: 0, flag: 0, ufc: 0 };
    d.total++;

    const sid = idToSherdog.get(f.canonical_id);
    const e = sid ? wd.get(sid) : undefined;
    const photo = e ? thumb(e.img) : '';
    const country = e?.country ?? '';
    const ufc = e?.ufc ?? '';

    if (photo) d.photo++;
    if (country) d.flag++;
    if (ufc) d.ufc++;
    byDiv.set(div, d);

    // Only emit rows that gained at least one field — keep the file lean.
    if (photo || country || ufc) {
      out.push({
        canonical_id: f.canonical_id,
        fullName: f.fullName,
        nationality: country,
        photo_url: photo,
        photo_license: photo ? 'Wikimedia Commons (verify per-file)' : '',
        ufc_id: ufc,
      });
    }
  }

  fs.writeFileSync(path.join(OUT, 'fighter_media.csv'), Papa.unparse(out));

  // ── coverage report ──
  const lines: string[] = [];
  const tot = registry.length;
  const sum = (k: 'photo' | 'flag' | 'ufc') => [...byDiv.values()].reduce((a, b) => a + b[k], 0);
  const pct = (n: number) => `${((100 * n) / tot).toFixed(0)}%`;
  lines.push(`Fighter media coverage — generated ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`Registry fighters: ${tot}`);
  lines.push(`  with Commons photo : ${sum('photo')} (${pct(sum('photo'))})  [licensed, reusable]`);
  lines.push(`  with nationality   : ${sum('flag')} (${pct(sum('flag'))})  [→ flag]`);
  lines.push(`  with UFC.com id    : ${sum('ufc')} (${pct(sum('ufc'))})  [→ UFC headshots, © — see note]`);
  lines.push('');
  lines.push(`${'Division'.padEnd(22)}${'Tot'.padStart(5)}${'Photo'.padStart(8)}${'Flag'.padStart(8)}${'UFCid'.padStart(8)}`);
  for (const [div, d] of [...byDiv.entries()].sort((a, b) => b[1].total - a[1].total)) {
    const cov = (n: number) => `${n}/${d.total}`.padStart(8);
    lines.push(`${div.padEnd(22)}${String(d.total).padStart(5)}${cov(d.photo)}${cov(d.flag)}${cov(d.ufc)}`);
  }
  lines.push('');
  lines.push('NOTE: photo_url points at Wikimedia Commons (CC/PD — safe to redisplay,');
  lines.push('but confirm the licence per file before public launch). ufc_id can drive a');
  lines.push('follow-on pass that pulls UFC.com\'s standardised headshots for broader');
  lines.push('coverage — higher quality but copyrighted, so private-use only.');

  const report = lines.join('\n') + '\n';
  fs.writeFileSync(path.join(OUT, 'media_coverage.txt'), report);
  console.log('\n' + report);
  console.log(`Wrote ${out.length} rows → data/canonical/fighter_media.csv`);
}

main().catch((e) => { console.error(e); process.exit(1); });
