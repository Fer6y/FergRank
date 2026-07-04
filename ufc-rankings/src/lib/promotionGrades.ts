// promotionGrades.ts — runtime loader for the empirical promotion grades
// (Workstream A). Reads data/promotion_grades.csv, produced offline by
// scripts/sherdog/gradePromotions.ts, and exposes a memoized lookup keyed by
// canonicalOrg. Consumed by pedigreeSeed.ts to blend a data-driven "how well do
// this promotion's graduates do in the UFC?" grade into the pedigree multiplier.
//
// Graceful: if the file is absent (grades never built), returns an empty map and
// the seed falls back to the static promotionTiers multiplier — identical to
// pre-grading behaviour. Display/scoring only; never touches the Elo pool.
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { RANKING_CONFIG } from './rankingConfig';

export interface PromotionGrade {
  canonicalOrg: string;
  tier: string;
  graduates: number;      // number of UFC graduates the grade was built from
  meanEloGain: number;    // raw mean settled-Elo gain of graduates (Elo pts above 1500)
  shrunkEloGain: number;  // empirical-Bayes shrunk mean
  relFactor: number;      // HIERARCHY-PRESERVING relative factor (1.0 = neutral) applied to the static tier multiplier
  ciLo: number;
  ciHi: number;
}

let cache: Map<string, PromotionGrade> | null = null;

export function loadPromotionGrades(): Map<string, PromotionGrade> {
  if (cache) return cache;
  cache = new Map();
  const file = path.join(process.cwd(), 'data', RANKING_CONFIG.preUFCPedigree.gradeSourceFile);
  if (!fs.existsSync(file)) return cache;

  const rows = Papa.parse<Record<string, string>>(fs.readFileSync(file, 'utf-8'), {
    header: true,
    skipEmptyLines: true,
  }).data;

  for (const r of rows) {
    const org = (r['canonicalOrg'] || '').trim();
    if (!org) continue;
    cache.set(org, {
      canonicalOrg: org,
      tier: (r['tier'] || '').trim(),
      graduates: parseInt(r['graduates'], 10) || 0,
      meanEloGain: parseFloat(r['meanEloGain']) || 0,
      shrunkEloGain: parseFloat(r['shrunkEloGain']) || 0,
      relFactor: parseFloat(r['relFactor']) || 1,
      ciLo: parseFloat(r['ciLo']) || 0,
      ciHi: parseFloat(r['ciHi']) || 0,
    });
  }
  return cache;
}
