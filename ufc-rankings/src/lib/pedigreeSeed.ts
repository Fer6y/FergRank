// Pre-UFC pedigree seed (Sherdog-sourced, scoring side).
//
// Reads data/sherdog_fights.csv (built by scripts/sherdog/buildContext.ts) and
// produces one bounded pedigreeStrength per fighter, describing how good their
// record was in OTHER promotions BEFORE they reached the UFC. The scoring engine
// turns this into a small, thin-sample-only Elo nudge (see RANKING_CONFIG
// .preUFCPedigree.seed*). Everything here is gated by `seedEnabled` upstream.
//
// The competition-LEVEL multiplier now comes from the fighter's FEEDER promotion
// (plurality of their last ~5 pre-UFC fights), optionally blended with a
// data-driven empirical grade for that promotion (Workstream A — see
// scripts/sherdog/gradePromotions.ts + promotionGrades.ts). Falls back to the
// static promotionTiers multiplier when grades are absent/disabled.
//
// Guarantees carried over: pre-UFC-debut fights only; `historical` orgs
// (Pride/Strikeforce/WEC) excluded from current-form; strength is bounded.
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { RANKING_CONFIG } from './rankingConfig';
import type { LoadedData } from './loadData';
import { loadPromotionGrades } from './promotionGrades';
import { buildEloRatings } from './eloEngine';

const CFG = RANKING_CONFIG.preUFCPedigree;

export interface PedigreeInfo {
  strength: number;      // bounded [0, maxStrength] — winRate × confidence × mult (+ SoS term)
  wins: number;
  losses: number;
  fights: number;
  topMultiplier: number; // best tier multiplier the fighter competed at pre-UFC (reference)
  feederOrg: string | null;  // primary feeder promotion (plurality of last ~5 pre-UFC fights)
  feederMult: number;    // the multiplier actually applied (static or grade-blended)
  ufcBoundBeaten: number;   // # pre-UFC WINS over opponents who themselves reached the UFC
  ufcBoundQuality: number;  // Σ (beaten UFC-bound opponent's UFC Elo − 1500), positives only
  bestScalpId: string | null; // ourFighterId of the highest-rated future-UFC fighter they beat pre-UFC
}

// One pre-UFC-debut, non-historical fight from a fighter's Sherdog record.
export interface PreUFCFight {
  dateMs: number;         // NaN when the Sherdog row had no parseable date
  canonicalOrg: string;
  tier: string;
  mult: number;           // static tier multiplier for that org
  result: string;         // 'win' | 'loss' | 'draw' | other
  opponentSherdogId: string; // Sherdog id of the opponent (≈100% filled) — the SoS join key
}

// Collected pre-UFC layer: per-fighter fight lists + the subject sherdogId→ourId
// map (the join that turns opponentSherdogId into a UFC fighter we can rate).
export interface PreUFCData {
  perFighter: Map<string, PreUFCFight[]>;
  sherdogToOurId: Map<string, string>;
}

export interface FeederAttribution {
  org: string;
  tier: string;
  staticMult: number;     // static promotionTiers multiplier for the feeder org
  feederFights: number;   // how many of the sampled window were in this org
}

const FEEDER_WINDOW = 5;  // attribute to the plurality of the LAST 5 pre-UFC fights

// Is this org a UFC tryout/showcase (e.g. DWCS) rather than a developmental
// feeder? Such orgs are skipped when deciding where a fighter "came up".
function isTryoutOrg(canonicalOrg: string): boolean {
  const o = canonicalOrg.toLowerCase();
  return CFG.feederExcludeOrgs.some((p) => o.includes(p.toLowerCase()));
}

// Per-fighter pre-UFC fight lists (pre-debut, historical excluded per config)
// plus the subject sherdogId→ourId map. Shared by the seed and gradePromotions.ts
// so attribution is identical.
export function collectPreUFCFights(data: LoadedData): PreUFCData {
  const perFighter = new Map<string, PreUFCFight[]>();
  const sherdogToOurId = new Map<string, string>();
  const file = path.join(process.cwd(), 'data', CFG.seedSourceFile);
  if (!fs.existsSync(file)) return { perFighter, sherdogToOurId };

  // Each fighter's UFC debut (earliest dated fight we have on them).
  const debut = new Map<string, number>();
  for (const [fid, fights] of data.fighterFights) {
    let min = Infinity;
    for (const f of fights) if (f.eventDate) min = Math.min(min, f.eventDate.getTime());
    if (min < Infinity) debut.set(fid, min);
  }

  const rows = Papa.parse<Record<string, string>>(fs.readFileSync(file, 'utf-8'), {
    header: true,
    skipEmptyLines: true,
  }).data;

  for (const r of rows) {
    const fid = r['ourFighterId'];
    if (!fid) continue;
    // Subject identity map is built from EVERY row (independent of the pre-debut /
    // historical filters below) so any crosswalked opponent resolves.
    const sd = (r['sherdogId'] || '').trim();
    if (sd) sherdogToOurId.set(sd, fid);

    if (CFG.seedExcludeHistorical && r['tier'] === 'historical') continue;

    const dt = r['date'] ? new Date(r['date']).getTime() : NaN;
    // Pre-UFC-debut only (rows with no parseable date are kept, like before).
    if (CFG.onlyBeforeUFCDebut) {
      const db = debut.get(fid);
      if (db && !Number.isNaN(dt) && dt >= db) continue;
    }

    let arr = perFighter.get(fid);
    if (!arr) { arr = []; perFighter.set(fid, arr); }
    arr.push({
      dateMs: dt,
      canonicalOrg: (r['canonicalOrg'] || r['organisation'] || '').trim(),
      tier: (r['tier'] || '').trim(),
      mult: parseFloat(r['tierMultiplier']) || 0,
      result: (r['result'] || '').trim().toLowerCase(),
      opponentSherdogId: (r['opponentSherdogId'] || '').trim(),
    });
  }
  return { perFighter, sherdogToOurId };
}

// Attribute a fighter to their primary FEEDER promotion: the plurality org over
// their last FEEDER_WINDOW pre-UFC fights (most recent before the UFC called).
// Ties break toward the higher static multiplier. Undated rows sort oldest.
export function attributeFeeder(fights: PreUFCFight[]): FeederAttribution | null {
  if (!fights.length) return null;
  // Drop UFC-tryout orgs (DWCS) BEFORE windowing, so the window reflects the
  // fighter's real developmental run, not the doorway that sits right before the
  // UFC. A fighter whose only pre-UFC fights are tryouts has no feeder → null.
  const developmental = fights.filter((f) => f.canonicalOrg && !isTryoutOrg(f.canonicalOrg));
  if (!developmental.length) return null;
  const sorted = developmental.sort((a, b) => {
    const da = Number.isNaN(a.dateMs) ? -Infinity : a.dateMs;
    const db = Number.isNaN(b.dateMs) ? -Infinity : b.dateMs;
    return db - da; // newest first
  });
  const window = sorted.slice(0, FEEDER_WINDOW);
  const byOrg = new Map<string, { count: number; mult: number; tier: string }>();
  for (const f of window) {
    if (!f.canonicalOrg) continue;
    const e = byOrg.get(f.canonicalOrg);
    if (e) e.count++;
    else byOrg.set(f.canonicalOrg, { count: 1, mult: f.mult, tier: f.tier });
  }
  if (byOrg.size === 0) return null;
  let best: FeederAttribution | null = null;
  for (const [org, e] of byOrg) {
    if (!best || e.count > best.feederFights || (e.count === best.feederFights && e.mult > best.staticMult)) {
      best = { org, tier: e.tier, staticMult: e.mult, feederFights: e.count };
    }
  }
  return best;
}

// Resolve the competition-level multiplier for a feeder: nudge the static tier
// multiplier by the empirical promotion factor when we have a trustworthy one.
// The factor is HIERARCHY-PRESERVING (centred at 1.0) — it only shifts a
// promotion up/down around its tier, never replaces the tier level (a Bellator
// bout stays tougher than a regional bout). gradeBlendLambda dials the nudge
// intensity: 0 = pure static tier, 1 = the full empirical factor.
function resolveMultiplier(
  feeder: FeederAttribution,
  grades: ReturnType<typeof loadPromotionGrades> | null,
): number {
  const staticMult = feeder.staticMult;
  if (!grades) return staticMult;
  const g = grades.get(feeder.org);
  if (!g || g.graduates < CFG.gradeMinGraduates) return staticMult;
  const eff = 1 + CFG.gradeBlendLambda * (g.relFactor - 1);
  return staticMult * eff;
}

const strengthCache = new WeakMap<LoadedData, Map<string, PedigreeInfo>>();

export function loadPedigreeStrength(data: LoadedData): Map<string, PedigreeInfo> {
  const cached = strengthCache.get(data);
  if (cached) return cached;

  const out = new Map<string, PedigreeInfo>();
  const { perFighter, sherdogToOurId } = collectPreUFCFights(data);
  const grades = CFG.useEmpiricalGrades ? loadPromotionGrades() : null;
  // Opponent UFC Elo for the SoS join (memoized per data → cache hit if already
  // built by the scoring engine). Only loaded when the SoS term is enabled.
  const ratings = CFG.useOpponentSos ? buildEloRatings(data) : null;

  for (const [fid, fights] of perFighter) {
    let w = 0, l = 0, d = 0, topMult = 0;
    let ufcBoundBeaten = 0, ufcBoundQuality = 0;
    let bestScalpId: string | null = null, bestScalpElo = -Infinity;
    for (const f of fights) {
      const win = f.result === 'win';
      if (win) w++;
      else if (f.result === 'loss') l++;
      else if (f.result === 'draw') d++;
      else continue; // nc / unknown → no record credit
      if (f.mult > topMult) topMult = f.mult;

      // SoS: did this WIN come over an opponent who reached the UFC? Weight by
      // how good that opponent became (UFC Elo above the mean, positives only).
      if (win && ratings && f.opponentSherdogId) {
        const oppUfcId = sherdogToOurId.get(f.opponentSherdogId);
        if (oppUfcId && oppUfcId !== fid) {
          const st = ratings.get(oppUfcId);
          if (st && st.fights >= 1) {
            ufcBoundBeaten++;
            ufcBoundQuality += Math.max(0, st.rating - RANKING_CONFIG.elo.initialRating);
            if (st.rating > bestScalpElo) { bestScalpElo = st.rating; bestScalpId = oppUfcId; }
          }
        }
      }
    }
    const total = w + l + d;
    const decisive = w + l;
    const winRate = decisive > 0 ? w / decisive : 0;
    const confidence = Math.min(total / CFG.confidenceFullFights, 1);

    const feeder = attributeFeeder(fights);
    const mult = feeder ? resolveMultiplier(feeder, grades) : 0;
    const base = winRate * confidence * mult;

    // Bounded SoS term on top of the record-quality base. Scaled by confidence
    // so a one-fight sample can't spike it. Whole thing still clamped to
    // maxStrength, preserving the ≤seedMaxElo guarantee downstream.
    let sosTerm = 0;
    if (CFG.useOpponentSos) {
      sosTerm = Math.min(CFG.sosTermCap, ufcBoundQuality / CFG.sosNormConst) * confidence;
    }
    const strength = Math.min(base + CFG.sosWeight * sosTerm, CFG.maxStrength);

    out.set(fid, {
      strength, wins: w, losses: l, fights: total, topMultiplier: topMult,
      feederOrg: feeder?.org ?? null, feederMult: mult,
      ufcBoundBeaten, ufcBoundQuality: Math.round(ufcBoundQuality), bestScalpId,
    });
  }

  strengthCache.set(data, out);
  return out;
}
