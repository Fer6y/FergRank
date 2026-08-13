// Display-only loader for the REGIONAL rating (data/regional_ratings.csv,
// built offline by research/regional/rateRegional.ts from the Fight Matrix
// cross-promotion crawl).
//
// FIREWALL: read by the /upcoming DWCS scout band and nothing else. Never
// imported by eloEngine.ts / scoringEngine.ts; a regional rating never touches
// a UFC ranking. Absent file → empty index → the scout band simply shows
// "not in the regional graph".
//
// Deliberately NOT module-cached (the loadOddsAnalysis/loadDwcsAnalysis
// lesson): ISR re-renders in a long-lived process, and a module cache would pin
// the first read until redeploy. Call getRegionalIndex() once per enrich pass
// and share the Map — not once per corner.
//
// Name keying: Fight Matrix ids mean nothing to our data, so the join is by
// normalized display name. 177 of 18,443 rated names are ambiguous duplicates;
// those are DROPPED — attaching the wrong namesake's rating is worse than
// showing none.

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

export interface RegionalRead {
  rating: number;
  percentile: number;   // 0–100 among the rated regional pool
  bouts: number;
  lastFight: string;    // ISO date of latest rated bout
  poolSize: number;     // how many fighters the percentile is against
  // Career stage from the profile's explicit Pro Debut Date (fact, not
  // inference). NOT an age — Fight Matrix carries no birthdate; age still
  // comes only from the hand-verified card snapshot.
  careerYears: number | null;
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

export function getRegionalIndex(): Map<string, RegionalRead> {
  const out = new Map<string, RegionalRead>();
  const p = path.join(process.cwd(), 'data', 'regional_ratings.csv');
  if (!fs.existsSync(p)) return out;
  let rows: Record<string, string>[];
  try {
    rows = Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8'), {
      header: true,
      skipEmptyLines: true,
    }).data;
  } catch {
    return out;
  }
  const ambiguous = new Set<string>();
  const poolSize = rows.length;
  for (const r of rows) {
    const key = norm(r.name ?? '');
    if (!key) continue;
    if (out.has(key)) { ambiguous.add(key); continue; }
    out.set(key, {
      rating: Math.round(Number(r.rating)),
      percentile: Number(r.percentile),
      bouts: Number(r.bouts),
      lastFight: r.lastFight ?? '',
      poolSize,
      careerYears: r.careerYears ? Number(r.careerYears) : null,
    });
  }
  for (const key of ambiguous) out.delete(key);
  return out;
}

export function lookupRegional(index: Map<string, RegionalRead>, name: string): RegionalRead | null {
  return index.get(norm(name)) ?? null;
}
