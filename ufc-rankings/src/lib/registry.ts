// ─────────────────────────────────────────────────────────────────────────
//  registry.ts — the single fighter-identity resolver.
//
//  Reads the canonical alias table (data/canonical/fighter_aliases.csv, built by
//  scripts/registry/buildRegistry.ts) and resolves ANY name spelling seen across
//  our roster, the odds feeds, the official rankings, Sherdog and BFO to one
//  canonical Fighter_Id. Replaces the scattered name-matching that used to live
//  in five places.
//
//  CERTAINTY GUARANTEE: if a normalized name maps to MORE THAN ONE canonical id
//  (a genuine cross-source namesake), it is treated as UNRESOLVABLE (returns
//  null) rather than guessing — a missed link only loses data, a wrong link
//  steals wins. Merged duplicates are folded in, so a secondary name (e.g.
//  "Patricio Pitbull") resolves to the surviving fighter.
//
//  Optional file: if the registry hasn't been built, resolve() returns null for
//  everything and callers fall back to their own logic — so nothing breaks.
// ─────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { normalize } from './nameResolver';

const ALIAS_FILE = path.join(process.cwd(), 'data', 'canonical', 'fighter_aliases.csv');

export interface Registry {
  resolve(name: string): string | null; // name → canonical id (null if unknown/ambiguous)
  size: number;                          // distinct resolvable names
  ambiguous: number;                     // names dropped for mapping to >1 id
}

let cached: Registry | null = null;

function build(): Registry {
  const map = new Map<string, string>();
  const ambiguous = new Set<string>();
  if (fs.existsSync(ALIAS_FILE)) {
    const rows = Papa.parse<Record<string, string>>(fs.readFileSync(ALIAS_FILE, 'utf-8'), {
      header: true,
      skipEmptyLines: true,
    }).data;
    for (const r of rows) {
      const n = r['normalized_name'];
      const id = r['canonical_id'];
      if (!n || !id) continue;
      const existing = map.get(n);
      if (existing && existing !== id) ambiguous.add(n);
      else map.set(n, id);
    }
    // A name that points at two different fighters is unsafe to resolve → drop it.
    for (const n of ambiguous) map.delete(n);
  }
  return {
    resolve: (name: string) => map.get(normalize(name)) ?? null,
    size: map.size,
    ambiguous: ambiguous.size,
  };
}

// Memoized — the alias table is static per process.
export function getRegistry(): Registry {
  if (!cached) cached = build();
  return cached;
}

// Convenience for the common case.
export function resolveToCanonical(name: string): string | null {
  return getRegistry().resolve(name);
}
