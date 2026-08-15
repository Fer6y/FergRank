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
  // inference). NOT an age — Fight Matrix carries no birthdate.
  careerYears: number | null;
  debut: string | null;   // ISO pro-debut date, for the career-stage classifier
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
      debut: r.debut || null,
    });
  }
  for (const key of ambiguous) out.delete(key);
  return out;
}

export function lookupRegional(index: Map<string, RegionalRead>, name: string): RegionalRead | null {
  return index.get(norm(name)) ?? null;
}

/**
 * How good a fighter was WHEN THEY ARRIVED — their regional rating snapshotted
 * immediately before their UFC debut (data/regional_arrival.csv, built by
 * research/regional/arrivalRegional.ts).
 *
 * Distinct from the settled rating on purpose: once a prospect starts fighting
 * in the UFC those bouts enter the regional graph, so the settled number stops
 * describing the fighter who walked in. Percentile is against OTHER ARRIVALS,
 * which is the comparison a scout wants.
 *
 * Keyed by OUR fighter id — a real id join, so no namesake risk.
 */
export interface ArrivalRead {
  elo: number;
  percentile: number;   // vs other UFC arrivals
  priorBouts: number;
  ufcDebut: string;
}

export function getArrivalIndex(): Map<string, ArrivalRead> {
  const out = new Map<string, ArrivalRead>();
  const p = path.join(process.cwd(), 'data', 'regional_arrival.csv');
  if (!fs.existsSync(p)) return out;
  try {
    for (const r of Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8'), {
      header: true,
      skipEmptyLines: true,
    }).data) {
      if (!r.ourId) continue;
      out.set(r.ourId, {
        elo: Math.round(Number(r.arrivalElo)),
        percentile: Number(r.arrivalPercentile),
        priorBouts: Number(r.priorBouts),
        ufcDebut: r.ufcDebut ?? '',
      });
    }
  } catch {
    return out;
  }
  return out;
}

/**
 * Verified birthdates from ESPN. Reads the MERGED file — the name-search pass
 * UNION the full 38k-athlete index enumeration (research/regional/
 * mergeEspnDob.ts) — falling back to the search-only file if the merge has not
 * been run. Every row passed a uniqueness, name-match and career-plausibility
 * gate, and the two passes agreed on all 7,544 names they both found, so an
 * absent name here means "we could not confirm it", never a guess.
 *
 * Coverage where it is used: 97.1% of UFC arrivals, 92.4% of DWCS entrants.
 * (43.9% of the full 18k regional pool — that gap is grassroots fighters no
 * surface renders.) Same no-module-cache rule as the ratings index.
 */
export function getDobIndex(): Map<string, string> {
  const out = new Map<string, string>();
  const merged = path.join(process.cwd(), 'data', 'regional_dob_merged.csv');
  const legacy = path.join(process.cwd(), 'data', 'regional_dob.csv');
  const useMerged = fs.existsSync(merged);
  const p = useMerged ? merged : legacy;
  if (!fs.existsSync(p)) return out;
  try {
    for (const r of Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8'), {
      header: true,
      skipEmptyLines: true,
    }).data) {
      // The merged file is pre-gated (no status column); the legacy file keeps
      // every attempt, so only `found` rows are trustworthy there.
      const ok = useMerged ? Boolean(r.dob) : r.status === 'found' && Boolean(r.dob);
      if (ok && r.name) out.set(norm(r.name), r.dob);
    }
  } catch {
    /* absent or malformed → no birthdates, callers degrade */
  }
  return out;
}

export function lookupDob(index: Map<string, string>, name: string): string | null {
  return index.get(norm(name)) ?? null;
}
