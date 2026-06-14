import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { RANKING_CONFIG } from './rankingConfig';
import { buildNameIndex, resolveNameToId } from './nameResolver';
import type { LoadedData } from './loadData';
import type {
  PreUFCPedigree,
  PreUFCPedigreeMap,
  PreUFCPromotionRecord,
} from './types';

// ─────────────────────────────────────────────────────────────────────────
//  Pre-UFC pedigree loader
//
//  Reads data/pro_mma_fights.csv (Kaggle/Sherdog, ends Aug 2021) and produces,
//  per fighter ALREADY in our UFC dataset, a bounded summary of how they did in
//  OTHER promotions BEFORE they reached the UFC.
//
//  Three hard guarantees (see the user's constraints):
//   1. NO DUPLICATES — every UFC row in the source is dropped, and our base
//      dataset is UFC-only, so no fight can be counted twice. Enforced here.
//   2. NOT OVEREXAGGERATED — pedigreeStrength is win-rate × sample-confidence ×
//      promotion-tier multiplier, hard-capped at config.maxStrength. The data
//      never flows into the Elo core in this module; it is reference only.
//   3. PRE-UFC ONLY — the 2021-frozen data is used purely as a "before they
//      arrived" gauge: non-UFC fights dated on/after a fighter's UFC debut are
//      ignored (they are not pedigree, and would be stale current-form noise).
// ─────────────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'data');
const CFG = RANKING_CONFIG.preUFCPedigree;

interface RawProFightRow {
  organisation: string;
  date: string;
  fighter1_name: string;
  fighter2_name: string;
  fighter1_result: string;
  fighter2_result: string;
}

function readProFights(filename: string): RawProFightRow[] {
  const filePath = path.join(DATA_DIR, filename);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const result = Papa.parse<RawProFightRow>(raw, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  return result.data;
}

function isExcludedOrg(org: string): boolean {
  return CFG.excludeOrgSubstrings.some((s) => org.includes(s));
}

// Resolve a raw org label to its tier key + multiplier via config.
function resolveTier(org: string): { tier: string; multiplier: number } {
  for (const matcher of CFG.orgTierMatchers) {
    if (matcher.match.some((m) => org.includes(m))) {
      const mult = tierMultiplier(matcher.tier);
      return { tier: matcher.tier, multiplier: mult };
    }
  }
  return { tier: CFG.defaultTier, multiplier: tierMultiplier(CFG.defaultTier) };
}

function tierMultiplier(tierKey: string): number {
  const tiers = RANKING_CONFIG.promotionTiers as Record<
    string,
    { multiplier: number }
  >;
  return tiers[tierKey]?.multiplier ?? 0.35;
}

// "Aug 7, 2021" → Date (local). Returns null if unparseable.
function parseProDate(s: string): Date | null {
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? null : d;
}

// Earliest UFC event date per fighterId, from the already-loaded UFC fights.
function buildUFCDebutMap(data: LoadedData): Map<string, Date> {
  const debut = new Map<string, Date>();
  for (const [fid, fights] of data.fighterFights) {
    let earliest: Date | null = null;
    for (const f of fights) {
      if (f.eventDate && (!earliest || f.eventDate < earliest)) {
        earliest = f.eventDate;
      }
    }
    if (earliest) debut.set(fid, earliest);
  }
  return debut;
}

interface Tally {
  byOrg: Map<string, { wins: number; losses: number; draws: number }>;
}

const RESULT_INDEX: Record<string, 'wins' | 'losses' | 'draws'> = {
  win: 'wins',
  loss: 'losses',
  draw: 'draws',
};

export function loadPreUFCPedigree(data: LoadedData): PreUFCPedigreeMap {
  const out: PreUFCPedigreeMap = new Map();
  if (!CFG.enabled) return out;

  const nameIndex = buildNameIndex(data.fighters);
  const fighterById = data.fighterMap;
  const debutMap = buildUFCDebutMap(data);
  const rows = readProFights(CFG.sourceFile);

  const tallies = new Map<string, Tally>();
  let excludedRows = 0;
  let droppedNotPreDebut = 0;

  for (const r of rows) {
    // GUARANTEE 1: never let a UFC row through — it would duplicate base data.
    if (isExcludedOrg(r.organisation)) {
      excludedRows++;
      continue;
    }

    const fightDate = parseProDate(r.date);

    const participants: Array<[string, string]> = [
      [r.fighter1_name, r.fighter1_result],
      [r.fighter2_name, r.fighter2_result],
    ];

    for (const [name, result] of participants) {
      // Strict matching only: the last-name+first-initial fallback conflates
      // siblings/namesakes (Patricio vs Patricky Freire) and would inflate a
      // fighter's pre-UFC record by absorbing another person's fights.
      const fid = resolveNameToId(name, nameIndex, {
        allowLastFirst: false,
        quiet: true,
      });
      if (!fid) continue; // not in our UFC ranking universe → irrelevant

      // GUARANTEE 3: pre-UFC-debut only.
      if (CFG.onlyBeforeUFCDebut) {
        const debut = debutMap.get(fid);
        if (debut && fightDate && fightDate >= debut) {
          droppedNotPreDebut++;
          continue;
        }
      }

      const bucket = RESULT_INDEX[result.trim().toLowerCase()];
      if (!bucket) continue; // NC / unknown → no credit

      let t = tallies.get(fid);
      if (!t) {
        t = { byOrg: new Map() };
        tallies.set(fid, t);
      }
      let rec = t.byOrg.get(r.organisation);
      if (!rec) {
        rec = { wins: 0, losses: 0, draws: 0 };
        t.byOrg.set(r.organisation, rec);
      }
      rec[bucket]++;
    }
  }

  // Materialize bounded pedigree per fighter.
  for (const [fid, t] of tallies) {
    const fighter = fighterById.get(fid);
    if (!fighter) continue;

    const byPromotion: PreUFCPromotionRecord[] = [];
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let bestTierMultiplier = 0;

    for (const [org, rec] of t.byOrg) {
      const { tier, multiplier } = resolveTier(org);
      byPromotion.push({
        organisation: org,
        tier,
        tierMultiplier: multiplier,
        wins: rec.wins,
        losses: rec.losses,
        draws: rec.draws,
      });
      wins += rec.wins;
      losses += rec.losses;
      draws += rec.draws;
      if (multiplier > bestTierMultiplier) bestTierMultiplier = multiplier;
    }

    const fights = wins + losses + draws;
    const decisive = wins + losses;
    const winRate = decisive > 0 ? wins / decisive : 0;
    const confidence = Math.min(fights / CFG.confidenceFullFights, 1);

    // GUARANTEE 2: bounded, modest. ≤ bestTierMultiplier and ≤ maxStrength.
    const pedigreeStrength = Math.min(
      winRate * confidence * bestTierMultiplier,
      CFG.maxStrength
    );

    byPromotion.sort((a, b) => b.wins + b.losses - (a.wins + a.losses));

    const pedigree: PreUFCPedigree = {
      fighterId: fid,
      fighterName: fighter.fullName,
      fights,
      wins,
      losses,
      draws,
      byPromotion,
      bestTierMultiplier,
      pedigreeStrength,
    };
    out.set(fid, pedigree);
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[preUFCPedigree] ${out.size} fighters | excluded ${excludedRows} UFC rows ` +
        `| dropped ${droppedNotPreDebut} post-debut entries`
    );
  }

  return out;
}
