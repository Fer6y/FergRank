// buildContext: cached Sherdog profiles + verified crosswalk → sherdog_fights.csv
//
// Turns the crawl into the cross-promotion fight layer the ranking engine will
// consume. Three things happen here:
//   1. DEDUP GUARANTEE — every UFC fight is dropped. Our base dataset is
//      UFC-only, so keeping UFC rows from Sherdog would double-count. We drop
//      them and assert none survive.
//   2. ORG → TIER tagging — Sherdog has no promotion column; the org is in the
//      event name ("Bellator 301", "LFA 197"). We classify it to a tier from
//      RANKING_CONFIG.promotionTiers. Unrecognized orgs default to tier4 and
//      are surfaced in sherdog_orgs.csv for you to audit/promote.
//   3. FULL non-UFC history is stored (not pre-debut-filtered). The pre-UFC-only
//      rule is a RANKING-time concern applied by the loader, so the raw file
//      stays useful for research and the prospect tool too.
//
// Run (after the crawl): npx tsx scripts/sherdog/buildContext.ts [--include-review]
import fs from 'fs';
import path from 'path';
import { RANKING_CONFIG } from '../../src/lib/rankingConfig';
import { parseProfile } from './parseProfile';
import type { SherdogFight } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const CACHE_DIR = path.join(DATA_DIR, '.sherdog_cache');
const CROSSWALK = path.join(DATA_DIR, 'sherdog_crosswalk.csv');
const REVIEW = path.join(DATA_DIR, 'sherdog_crosswalk_review.csv');
const OUT_FIGHTS = path.join(DATA_DIR, 'sherdog_fights.csv');
const OUT_ORGS = path.join(DATA_DIR, 'sherdog_orgs.csv');

const TIERS = RANKING_CONFIG.promotionTiers as Record<
  string, { promotions: readonly string[]; multiplier: number }
>;

// Ordered event-name matchers → tier. Tier membership comes from config; the
// match patterns are the event-name spellings Sherdog uses. To add/retier a
// promotion, edit RANKING_CONFIG.promotionTiers (and add a spelling here if the
// event-name differs from the canonical label).
const ORG_MATCHERS: Array<{ canonical: string; tier: string; patterns: string[] }> = [
  { canonical: 'UFC', tier: 'tier1', patterns: ['UFC', 'Ultimate Fighting'] },
  { canonical: "Dana White's Contender Series", tier: 'tier2', patterns: ['Dana White', 'DWCS', 'Contender Series'] },
  { canonical: 'Bellator', tier: 'tier2_5', patterns: ['Bellator'] },
  { canonical: 'ONE Championship', tier: 'tier2_5', patterns: ['ONE ', 'ONE Championship', 'ONE FC', 'ONE on', 'ONE Fight', 'One Championship'] },
  { canonical: 'PFL', tier: 'tier2_5', patterns: ['PFL', 'Professional Fighters League', 'World Series of Fighting', 'WSOF'] },
  { canonical: 'RIZIN', tier: 'tier2_5', patterns: ['RIZIN', 'Rizin'] },
  { canonical: 'Invicta FC', tier: 'tier2_5', patterns: ['Invicta'] },
  { canonical: 'Pride', tier: 'historical', patterns: ['Pride', 'PRIDE'] },
  { canonical: 'Strikeforce', tier: 'historical', patterns: ['Strikeforce'] },
  { canonical: 'WEC', tier: 'historical', patterns: ['World Extreme Cagefighting', 'WEC '] },
  { canonical: 'Cage Warriors', tier: 'tier3', patterns: ['Cage Warriors'] },
  { canonical: 'LFA', tier: 'tier3', patterns: ['LFA', 'Legacy Fighting Alliance', 'Resurrection Fighting', 'Legacy FC'] },
  { canonical: 'KSW', tier: 'tier3', patterns: ['KSW'] },
  { canonical: 'M-1', tier: 'tier3', patterns: ['M-1 '] },
  { canonical: 'Pancrase', tier: 'tier3', patterns: ['Pancrase'] },
  { canonical: 'Shooto', tier: 'tier3', patterns: ['Shooto'] },
  { canonical: 'Deep', tier: 'tier3', patterns: ['Deep '] },
  { canonical: 'Titan FC', tier: 'tier3', patterns: ['Titan'] },
  { canonical: 'CFFC', tier: 'tier3', patterns: ['CFFC', 'Cage Fury'] },
  { canonical: 'MFC', tier: 'tier3', patterns: ['Maximum Fighting'] },
  { canonical: 'Brave CF', tier: 'tier3', patterns: ['Brave CF', 'Brave Combat'] },
  { canonical: 'Jungle Fight', tier: 'tier3', patterns: ['Jungle Fight'] },
  { canonical: 'King of the Cage', tier: 'tier3', patterns: ['KOTC', 'King of the Cage'] },
];

function multiplierFor(tier: string): number {
  return TIERS[tier]?.multiplier ?? TIERS.tier4.multiplier;
}

// Pull a human promotion label from an event name, for the orgs dictionary.
// "Bellator 301" → "Bellator"; "LFA 197 - ..." → "LFA"; "Jungle Fight 107" → "Jungle Fight".
function promotionLabel(eventName: string): string {
  let s = eventName.split(/\s+[-–]\s+/)[0].trim();          // before " - "
  s = s.replace(/\s+\d.*$/, '').trim();                       // drop trailing number/date
  return s || eventName.trim();
}

function classifyOrg(eventName: string): { canonical: string; tier: string; matched: boolean } {
  // Match on the START of the event title — Sherdog names lead with the
  // promotion ("Bellator 300", "Pride 34", "WEC 48"). startsWith avoids the
  // substring false-positives of includes() (e.g. "Alash Pride", "EcoPride",
  // "Extreme Shootout" wrongly matching Pride/Shooto).
  const ev = eventName.trim().toLowerCase();
  for (const m of ORG_MATCHERS) {
    if (m.patterns.some((p) => ev.startsWith(p.toLowerCase()))) {
      return { canonical: m.canonical, tier: m.tier, matched: true };
    }
  }
  // Unknown → tier4 (Regional/Unknown), flagged for review in sherdog_orgs.csv.
  return { canonical: promotionLabel(eventName), tier: 'tier4', matched: false };
}

interface CrosswalkRow { ourFighterId: string; fullName: string; sherdogId: string; }

function readCrosswalk(file: string): CrosswalkRow[] {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf-8').split('\n').slice(1).filter(Boolean);
  const rows: CrosswalkRow[] = [];
  for (const ln of lines) {
    const c = ln.match(/("(?:[^"]|"")*"|[^,]*)/g)?.filter((_, i) => i % 2 === 0) ?? ln.split(',');
    const unq = (v: string) => v.replace(/^"|"$/g, '').replace(/""/g, '"');
    const ourFighterId = unq(c[0] ?? ''); const fullName = unq(c[1] ?? ''); const sherdogId = unq(c[2] ?? '');
    if (ourFighterId && sherdogId) rows.push({ ourFighterId, fullName, sherdogId });
  }
  return rows;
}

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function main() {
  const includeReview = process.argv.includes('--include-review');
  const crosswalk = [
    ...readCrosswalk(CROSSWALK),
    ...(includeReview ? readCrosswalk(REVIEW) : []),
  ];
  if (crosswalk.length === 0) {
    console.error('No crosswalk rows found — run resolveCrosswalk.ts first.');
    process.exit(1);
  }

  const FIGHT_HEAD = 'ourFighterId,sherdogId,fullName,date,organisation,canonicalOrg,tier,tierMultiplier,opponentName,opponentSherdogId,result,method,round,eventName';
  const fightLines: string[] = [FIGHT_HEAD];
  const orgStats = new Map<string, { tier: string; matched: boolean; count: number; sample: string }>();

  let droppedUFC = 0, kept = 0, missingCache = 0, fightersWithHistory = 0, ufcLeaks = 0;

  for (const cw of crosswalk) {
    const file = path.join(CACHE_DIR, `${cw.sherdogId}.html`);
    if (!fs.existsSync(file)) { missingCache++; continue; }
    const prof = parseProfile(fs.readFileSync(file, 'utf-8'));
    let keptForFighter = 0;

    for (const f of prof.fights as SherdogFight[]) {
      const { canonical, tier, matched } = classifyOrg(f.eventName);

      // Org dictionary stats (count every fight, UFC included, for visibility).
      const label = promotionLabel(f.eventName);
      const stat = orgStats.get(label) ?? { tier, matched, count: 0, sample: f.eventName };
      stat.count++; orgStats.set(label, stat);

      // GUARANTEE 1: drop UFC — it duplicates our base dataset.
      if (tier === 'tier1') { droppedUFC++; continue; }
      if (canonical.includes('UFC')) { ufcLeaks++; continue; } // belt-and-suspenders

      fightLines.push([
        cw.ourFighterId, cw.sherdogId, cw.fullName, f.date ?? '',
        label, canonical, tier, String(multiplierFor(tier)),
        f.opponentName, f.opponentId ?? '', f.result, f.method,
        f.round != null ? String(f.round) : '', f.eventName,
      ].map(esc).join(','));
      kept++; keptForFighter++;
    }
    if (keptForFighter > 0) fightersWithHistory++;
  }

  fs.writeFileSync(OUT_FIGHTS, fightLines.join('\n') + '\n', 'utf-8');

  // Orgs dictionary, sorted by frequency; unmatched flagged for audit.
  const orgLines = ['organisation,tier,tierMultiplier,needsReview,fightCount,sampleEvent'];
  const orgsSorted = [...orgStats.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [label, s] of orgsSorted) {
    orgLines.push([label, s.tier, String(multiplierFor(s.tier)), String(!s.matched), String(s.count), s.sample].map(esc).join(','));
  }
  fs.writeFileSync(OUT_ORGS, orgLines.join('\n') + '\n', 'utf-8');

  // ── Summary ──
  const perTier = new Map<string, number>();
  for (const ln of fightLines.slice(1)) {
    const t = ln.split(',')[6]; perTier.set(t, (perTier.get(t) ?? 0) + 1);
  }
  const unmapped = orgsSorted.filter(([, s]) => !s.matched);
  console.log(`crosswalk fighters processed: ${crosswalk.length} (${missingCache} missing cache)`);
  console.log(`fighters with non-UFC history: ${fightersWithHistory}`);
  console.log(`fights: kept ${kept}, dropped UFC ${droppedUFC}` + (ufcLeaks ? `, UFC leaks blocked ${ufcLeaks}` : ''));
  console.log('kept by tier: ' + [...perTier.entries()].sort().map(([t, n]) => `${t}=${n}`).join('  '));
  console.log(`distinct orgs: ${orgStats.size} | UNMAPPED (default tier4, review): ${unmapped.length}`);
  if (unmapped.length) {
    console.log('  top unmapped orgs to audit in sherdog_orgs.csv:');
    for (const [label, s] of unmapped.slice(0, 12)) console.log(`    ${String(s.count).padStart(4)}  ${label}`);
  }
  console.log(`\nwrote ${path.relative(process.cwd(), OUT_FIGHTS)} and ${path.relative(process.cwd(), OUT_ORGS)}`);
}

main();
