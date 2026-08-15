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
import {
  getRegionalIndex, lookupRegional, getDobIndex, lookupDob,
  getArrivalDistribution, arrivalPercentileOf, type RegionalRead,
} from './loadRegionalRatings';
import { careerStage } from './careerStage';

export interface ScoutRead {
  rating: PreUfcRating | null; // null = not enough verified data to score
  line: string;                // the evidence sentence shown in the UI
  // Cross-promotion regional Elo (loadRegionalRatings), attached at the enrich
  // layer where the fighter's name is known. Null = not in the regional graph —
  // rendered as exactly that, never guessed.
  regional?: import('./loadRegionalRatings').RegionalRead | null;
  // CURRENT-FORM grade: the regional rating placed against the distribution of
  // ratings fighters carried into their UFC debuts (rankingConfig.scoutFormGrade).
  // The band LEADS with this — "who is he now" — with the ceiling forecast
  // demoted to a secondary line. Null whenever `regional` is null: no graph
  // presence, no grade, never guessed.
  form?: { grade: string; arrivalPct: number } | null;
  // Career arc from a VERIFIED birthdate + pro-debut date (careerStage.ts).
  // Null when either fact is unconfirmed — never inferred from the card's
  // hand-entered age. Display-only: the pre-registered test (2026-08-12) found
  // debut age adds nothing over age alone, so this never enters a score.
  stage?: import('./careerStage').CareerStage | null;
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

/**
 * Shared lookup context for the FULL scout read (regional form grade + career
 * stage). Build ONCE per render pass — the ratings CSV is ~1MB — and hand to
 * every fullScoutRead call. Used by /upcoming's enrich pass and the
 * /contender-series card breakdowns so the two surfaces cannot disagree.
 */
export interface ScoutContext {
  regionalIndex: Map<string, RegionalRead>;
  dobIndex: Map<string, string>;
  arrivalDist: number[];
}

export function buildScoutContext(): ScoutContext {
  return {
    regionalIndex: getRegionalIndex(),
    dobIndex: getDobIndex(),
    arrivalDist: getArrivalDistribution(),
  };
}

/**
 * The complete scout read for one corner: pre-UFC rating + regional read +
 * CURRENT-FORM grade (rating vs the UFC-arrival distribution) + career stage.
 * Form and stage are null whenever their verified inputs are absent — stated,
 * never guessed.
 */
export function fullScoutRead(ctx: ScoutContext, raw: DwcsScoutRaw, name: string): ScoutRead {
  const read = scoutDwcsEntrant(raw);
  const regional = lookupRegional(ctx.regionalIndex, name);
  const arrivalPct =
    regional && ctx.arrivalDist.length ? arrivalPercentileOf(ctx.arrivalDist, regional.rating) : null;
  const form =
    arrivalPct != null
      ? {
          grade: RANKING_CONFIG.scoutFormGrade.cuts.find((c) => arrivalPct >= c.min)?.grade ?? 'C',
          arrivalPct: Math.round(arrivalPct),
        }
      : null;
  const dob = lookupDob(ctx.dobIndex, name);
  // Career stage needs BOTH verified facts; the card's hand-entered age is
  // never substituted for a birthdate.
  const stage =
    dob && regional?.debut
      ? careerStage({
          dob,
          proDebutDate: regional.debut,
          fights: regional.bouts,
          lastFightDate: regional.lastFight || undefined,
        })
      : null;
  return { ...read, regional, form, stage };
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
