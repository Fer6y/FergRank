// dwcsScout — turns raw Contender Series card data into a scored scouting read.
//
// Thin adapter: parses the hand-maintained snapshot's columns, resolves the
// feeder promotion to its tier multiplier, and hands off to the CALIBRATED
// pre-UFC rating (src/lib/preUfcRating.ts, weights fitted in
// research/dwcs/calibratePreUfc.ts). No scoring logic lives here — that was
// deliberately moved out when the hand-written grade bands were replaced by
// the fitted model.
//
// DISPLAY-ONLY, like everything in the pre-UFC system.

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { RANKING_CONFIG } from './rankingConfig';
import { ratePreUfc, explainPreUfc, type PreUfcRating } from './preUfcRating';
import type { DwcsScoutRaw } from './loadUpcoming';

export interface ScoutRead {
  rating: PreUfcRating | null; // null = not enough verified data to score
  line: string;                // the evidence sentence shown in the UI
}

// Org → tier multiplier, resolved against data/sherdog_orgs.csv — the SAME
// dictionary that tagged the rows the model was calibrated on. Using the
// engine's sparse `orgTierMatchers` here instead would be a train/serve skew:
// CFFC is tier3 (0.55) in the training data but would fall to the 0.35 default
// at runtime, so an identical résumé would score differently in calibration and
// in production. Lazily loaded + cached; missing file degrades to the matcher
// table, then to the default tier.
// Card-listing name → dictionary key. EXPLICIT, not fuzzy: a containment match
// resolved "Road to UFC" to the key "UFC" and handed a regional tournament the
// tier-1 multiplier (1.00), which is exactly the kind of silent absurdity a
// clever matcher produces. Add a line here when a new card names an org the
// dictionary spells differently.
const ORG_ALIASES: Record<string, string> = {
  'cage fury fc': 'cffc',
  'cage fury': 'cffc',
  'road to ufc': 'road to ufc', // NOT "UFC" — a UFC-run regional tournament, not the UFC
  'ohio combat league': 'ocl',
  'fury fc': 'fury fc',
};

let orgTierCache: Map<string, number> | null = null;

function orgTierTable(): Map<string, number> {
  if (orgTierCache) return orgTierCache;
  orgTierCache = new Map();
  try {
    const p = path.join(process.cwd(), 'data', 'sherdog_orgs.csv');
    if (fs.existsSync(p)) {
      const rows = Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8'), {
        header: true,
        skipEmptyLines: true,
      }).data;
      for (const r of rows) {
        const mult = Number(r.tierMultiplier);
        if (r.organisation && Number.isFinite(mult)) {
          orgTierCache.set(r.organisation.trim().toLowerCase(), mult);
        }
      }
    }
  } catch {
    /* fall through to the matcher table */
  }
  return orgTierCache;
}

/**
 * Resolve a promotion name to its static tier multiplier. Unknown-but-named
 * orgs fall to the DEFAULT tier (an unrecognised regional is still a regional);
 * only a genuinely absent promotion scores 0.
 */
export function tierMultiplierForOrg(org: string | null): number {
  const tiers = RANKING_CONFIG.promotionTiers as Record<string, { multiplier: number }>;
  const defaultMult = tiers[RANKING_CONFIG.preUFCPedigree.defaultTier]?.multiplier ?? 0;
  if (!org) return 0; // no provenance on file — no credit, not a default
  const hay = org.trim().toLowerCase();

  const table = orgTierTable();
  const alias = ORG_ALIASES[hay] ?? hay;
  const exact = table.get(alias);
  if (exact != null) return exact;

  for (const m of RANKING_CONFIG.preUFCPedigree.orgTierMatchers) {
    if (m.match.some((pat) => alias.includes(pat.toLowerCase()))) return tiers[m.tier]?.multiplier ?? defaultMult;
  }
  return defaultMult;
}

function parseRecord(record: string | null): { wins: number; losses: number; draws: number } | null {
  const m = record?.match(/^(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?/);
  return m
    ? { wins: parseInt(m[1], 10), losses: parseInt(m[2], 10), draws: m[3] ? parseInt(m[3], 10) : 0 }
    : null;
}

export function scoutDwcsEntrant(raw: DwcsScoutRaw): ScoutRead {
  const rec = parseRecord(raw.record);
  const rating = rec
    ? ratePreUfc({
        wins: rec.wins,
        losses: rec.losses,
        draws: rec.draws,
        finishes: raw.finishes,
        age: raw.age,
        tierMultiplier: tierMultiplierForOrg(raw.org),
        org: raw.org,
      })
    : null;

  if (!rating) {
    // Say WHICH input is missing — an ungraded fighter should be explicable.
    const missing = [!rec && 'record', raw.age == null && 'age'].filter(Boolean).join(' and ');
    return { rating: null, line: `Ungraded — no verified ${missing || 'profile data'}. Never guessed.` };
  }
  return { rating, line: explainPreUfc(rating) };
}
