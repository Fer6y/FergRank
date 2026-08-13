// research/regional/rateRegional.ts — THE REGIONAL RATING.
//
// One chronological Elo over the modern regional fight graph, so a prospect can
// be judged on WHO THEY BEAT rather than on a promotion's hand-assigned tier.
// This is the thing the promotion ladder could never be: validated inside the
// prospect world, on regional fights, with no UFC outcome anywhere in it.
//
// DESIGN NOTES (each one is a decision, not a default):
//  • Promotion CANONICALISATION first. The raw crawl yields 3,455 distinct
//    "promotions" because "UFC", "UFC Fight Night" and "UFC 328 Chimaev vs.
//    Strickland" are separate strings. Left alone, one promotion fragments into
//    dozens and the cross-promotion linkage — the whole point — is diluted.
//  • EXPERIENCE, not age. The user asked for an age curve; the crawl does not
//    carry birthdates, so inventing one would be fabrication. What the graph
//    DOES support is career stage: years since a fighter's first observed pro
//    bout. It is reported per fighter and used for the provisional-K schedule,
//    and the honest gap is flagged rather than papered over.
//  • RECORD AT TIME OF FIGHTING is intrinsic here: Elo updates chronologically,
//    so every result is priced against what the opponent was worth THAT NIGHT,
//    not what they became. Fight Matrix's own historical rank is carried in the
//    data as a cross-check but is deliberately NOT an input — importing another
//    system's rating would make ours a derivative of theirs.
//  • VALIDATION is walk-forward: every bout is predicted from ratings held
//    strictly before it. A rating that cannot beat a coin flip on held-out
//    regional fights is not worth shipping, whatever the table looks like.
//
// FIREWALL: research zone. Reads the crawl CSV, writes a CSV + console. Feeds
// no Elo, no ranking, no page.
//
// Run: node_modules/.bin/jiti research/regional/rateRegional.ts
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { score, type Prediction } from '../backtest/metrics';

const K_BASE = 24;
const K_PROV = 40;          // first few bouts move faster — same logic as the UFC engine
const PROV_FIGHTS = 4;
const INIT = 1500;
const BURN_IN = '2018-01-01';
const MIN_RATED = 3;

interface Row {
  fmId: string; name: string; date: string; promotion: string; event: string;
  opponentFmId: string; opponentName: string; opponentRankAtTime: string;
  result: string; method: string;
}

// Fold event-name variants into one promotion key. Order matters — first match
// wins, so specific patterns precede generic ones. Verified against the actual
// key fragmentation in the crawled table (PFL vs "Professional Fighters
// League", HTML-entity "DW&#39;s Contender Series", ACB→ACA rename, Fight
// Nights / FNG / AMC lineage). NOT folded on purpose: "BYE" is Berkut Young
// Eagles — ACA's development league, real fights, its own scene.
const CANON: [RegExp, string][] = [
  [/^(road to ufc)/i, 'Road to UFC'],           // before /^ufc/ — a regional tournament, not the UFC
  [/^ufc/i, 'UFC'],
  [/^(dana white|dw'?s contender|contender)/i, "Dana White's Contender Series"],
  [/^(cffc|cage fury)/i, 'CFFC'],
  [/^(lfa|legacy f|resurrection f|rfa)/i, 'LFA'],
  [/^fury/i, 'Fury FC'],
  [/^(bellator|bfc\b)/i, 'Bellator'],
  [/^(pfl|professional fighters league|world series of fighting|wsof)/i, 'PFL'],
  [/^cage warriors/i, 'Cage Warriors'],
  [/^(one championship|one fc|one:|one \d)/i, 'ONE'],
  [/^rizin/i, 'RIZIN'],
  [/^ksw/i, 'KSW'],
  [/^m-1/i, 'M-1'],
  [/^(shooto)/i, 'Shooto'],
  [/^pancrase/i, 'Pancrase'],
  [/^deep/i, 'DEEP'],
  [/^titan/i, 'Titan FC'],
  [/^invicta/i, 'Invicta FC'],
  [/^(king of the cage|kotc)/i, 'King of the Cage'],
  [/^(ces\b|classic entertainment)/i, 'CES'],
  [/^(oktagon)/i, 'Oktagon'],
  [/^(brave)/i, 'Brave CF'],
  [/^(uae warriors)/i, 'UAE Warriors'],
  [/^(aca\b|acb\b|absolute championship)/i, 'ACA'],  // ACB renamed to ACA in 2018
  [/^(russian cagefighting|rcc\b)/i, 'RCC'],
  [/^(amc fight nights|amc\b|fight nights|fng\b)/i, 'Fight Nights'], // FNG → AMC Fight Nights lineage
];
const decodeEntities = (s: string) =>
  s.replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
export function canonPromotion(p: string): string {
  const s = decodeEntities(p.trim());
  for (const [re, name] of CANON) if (re.test(s)) return name;
  return s.replace(/\s+\d+.*$/, '').trim() || 'Unknown';
}

const yearsBetween = (a: string, b: string) =>
  (Date.parse(b) - Date.parse(a)) / (365.25 * 86_400_000);

function main(): void {
  const raw = Papa.parse<Row>(
    fs.readFileSync(path.join(process.cwd(), 'data', 'regional_fights.csv'), 'utf-8'),
    { header: true, skipEmptyLines: true }
  ).data;

  // ── de-duplicate into bouts (both corners crawled ⇒ the bout appears twice) ──
  const bouts = new Map<string, { date: string; promo: string; a: string; b: string; sa: number }>();
  const nameOf = new Map<string, string>();
  for (const r of raw) {
    if (!r.fmId || !r.opponentFmId || !r.date || !/^\d{4}-/.test(r.date)) continue;
    const sa = r.result === 'W' ? 1 : r.result === 'L' ? 0 : r.result === 'D' ? 0.5 : -1;
    if (sa < 0) continue; // NC carries no rating information
    nameOf.set(r.fmId, r.name);
    nameOf.set(r.opponentFmId, r.opponentName);
    const [x, y] = [r.fmId, r.opponentFmId].sort();
    const key = `${x}|${y}|${r.date}`;
    if (bouts.has(key)) continue;
    bouts.set(key, { date: r.date, promo: canonPromotion(r.promotion), a: r.fmId, b: r.opponentFmId, sa });
  }
  const ordered = [...bouts.values()].sort((p, q) => (p.date < q.date ? -1 : p.date > q.date ? 1 : 0));

  // ── chronological sweep + walk-forward scoring ──
  const rating = new Map<string, number>();
  const n = new Map<string, number>();
  const debut = new Map<string, string>();
  const last = new Map<string, string>();
  const get = (id: string) => rating.get(id) ?? INIT;
  const preds: Prediction[] = [];

  for (const b of ordered) {
    const ra = get(b.a);
    const rb = get(b.b);
    const na = n.get(b.a) ?? 0;
    const nb = n.get(b.b) ?? 0;
    if (b.date >= BURN_IN && na >= MIN_RATED && nb >= MIN_RATED && b.sa !== 0.5) {
      preds.push({ p: 1 / (1 + 10 ** ((rb - ra) / 400)), won: b.sa === 1 });
    }
    const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
    rating.set(b.a, ra + (na < PROV_FIGHTS ? K_PROV : K_BASE) * (b.sa - ea));
    rating.set(b.b, rb + (nb < PROV_FIGHTS ? K_PROV : K_BASE) * ((1 - b.sa) - (1 - ea)));
    n.set(b.a, na + 1);
    n.set(b.b, nb + 1);
    for (const id of [b.a, b.b]) {
      if (!debut.has(id)) debut.set(id, b.date);
      last.set(id, b.date);
    }
  }

  const s = score(preds);
  console.log(`REGIONAL RATING — ${ordered.length} de-duplicated pro bouts, ${rating.size} fighters\n`);
  console.log(`WALK-FORWARD VALIDATION (${s.n} bouts from ${BURN_IN}, both sides ${MIN_RATED}+ fights):`);
  console.log(`  accuracy ${(100 * s.accuracy).toFixed(1)}%   logloss ${s.logLoss.toFixed(4)}   ECE ${s.ece.toFixed(3)}`);
  console.log(`  coin flip  50.0%              0.6931`);
  console.log(`  → every bout scored from ratings held strictly BEFORE it.\n`);

  // ── promotion strength, now from a dense modern graph ──
  const byPromo = new Map<string, number[]>();
  for (const b of ordered) {
    if (b.date < BURN_IN) continue;
    for (const id of [b.a, b.b]) {
      if ((n.get(id) ?? 0) < MIN_RATED) continue;
      byPromo.set(b.promo, [...(byPromo.get(b.promo) ?? []), get(id)]);
    }
  }
  const mean = (xs: number[]) => xs.reduce((t, v) => t + v, 0) / (xs.length || 1);
  const promoRows = [...byPromo.entries()]
    .filter(([, v]) => v.length >= 40)
    .map(([promo, v]) => ({ promo, n: v.length, mean: mean(v) }))
    .sort((x, y) => y.mean - x.mean);
  console.log(`PROMOTION STRENGTH (mean rating of participants, ${BURN_IN}+, 40+ appearances):`);
  for (const p of promoRows.slice(0, 25)) {
    console.log(`  ${p.promo.slice(0, 28).padEnd(28)} ${p.mean.toFixed(0).padStart(5)}   n=${p.n}`);
  }

  // ── this week's Contender Series card ──
  const byName = new Map<string, string>();
  for (const [id, nm] of nameOf) byName.set(nm.trim().toLowerCase(), id);
  const card = ['Bilal Hasan', 'Mridul Saikia', 'Anthony Wint', 'Matt Adams', 'Abe Alsaghir',
    'Fabricio Escarrega', 'Jon Kunneman', 'Joe Kropschot', 'Ananias Mulumba', 'Tom Pagliarulo'];
  const all = [...rating.entries()].filter(([id]) => (n.get(id) ?? 0) >= MIN_RATED).map(([, v]) => v).sort((a, b) => a - b);
  const pct = (v: number) => (100 * all.filter((x) => x < v).length) / (all.length || 1);
  console.log(`\nTHIS WEEK'S CONTENDER SERIES CARD (percentile among ${all.length} rated regional fighters):`);
  for (const nm of card) {
    const id = byName.get(nm.toLowerCase());
    const cnt = id ? n.get(id) ?? 0 : 0;
    if (!id || cnt < MIN_RATED) { console.log(`  ${nm.padEnd(20)} — not ratable (${cnt} bouts in graph)`); continue; }
    const exp = yearsBetween(debut.get(id)!, last.get(id)!);
    console.log(`  ${nm.padEnd(20)} ${get(id).toFixed(0).padStart(5)}  p${pct(get(id)).toFixed(0).padStart(3)}  ${cnt} bouts  ${exp.toFixed(1)}y career`);
  }

  const out = path.join(process.cwd(), 'data', 'regional_ratings.csv');
  fs.writeFileSync(out, Papa.unparse(
    [...rating.entries()]
      .filter(([id]) => (n.get(id) ?? 0) >= MIN_RATED)
      .sort((a, b) => b[1] - a[1])
      .map(([id, v]) => ({
        fmId: id, name: decodeEntities(nameOf.get(id) ?? ''), rating: v.toFixed(1),
        percentile: pct(v).toFixed(1),
        bouts: n.get(id), debut: debut.get(id), lastFight: last.get(id),
        careerYears: yearsBetween(debut.get(id)!, last.get(id)!).toFixed(1),
      }))
  ) + '\n');
  console.log(`\nwrote ${out}`);
  console.log('NOTE: age is NOT in this rating — the crawl carries no birthdates, so career');
  console.log('length is used as the experience proxy. Capturing DOB is a follow-up.');
}

main();
