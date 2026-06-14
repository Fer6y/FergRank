import type { Fighter } from './types';

// Known name overrides: UFC.com name → CSV dataset name
export const KNOWN_NAME_OVERRIDES: Record<string, string> = {
  'Elizeu Zaleski dos Santos': 'Elizeu Zaleski dos Santos',
  'Germaine de Randamie': 'Germaine de Randamie',
  'Reinier de Ridder': 'Reinier de Ridder',
  'Marcos Rogerio de Lima': 'Marcos Rogerio de Lima',
  'Montana De La Rosa': 'Montana De La Rosa',
  'Chris de la Rocha': 'Chris de la Rocha',
  'Douglas Silva de Andrade': 'Douglas Silva de Andrade',
  'Ian Machado Garry': 'Ian Garry',
  'Ian Garry': 'Ian Garry',
  'Jan Błachowicz': 'Jan Blachowicz',
};

export function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z\s]/g, '')        // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

function getLastNameFirstInitial(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return normalize(name);
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  return normalize(lastName) + '_' + normalize(firstName).charAt(0);
}

export function buildNameIndex(fighters: Fighter[]): {
  exact: Map<string, string>;
  normalized: Map<string, string>;
  lastFirst: Map<string, string>;
} {
  const exact = new Map<string, string>();
  const normalized = new Map<string, string>();
  const lastFirst = new Map<string, string>();

  for (const f of fighters) {
    exact.set(f.fullName, f.fighterId);
    normalized.set(normalize(f.fullName), f.fighterId);
    lastFirst.set(getLastNameFirstInitial(f.fullName), f.fighterId);
  }

  return { exact, normalized, lastFirst };
}

export interface ResolveOptions {
  // The last-name + first-initial fallback (step 3) is forgiving enough to
  // conflate siblings and namesakes (e.g. Patricio vs Patricky Freire). That is
  // an acceptable trade for matching ~15 official-ranking names per division,
  // but dangerous for BULK matching thousands of historical rows, where a
  // single collision silently merges two fighters' records. Set false there.
  allowLastFirst?: boolean;
  // Suppress the per-name miss warning (bulk callers expect many legit misses).
  quiet?: boolean;
}

export function resolveNameToId(
  apiName: string,
  index: ReturnType<typeof buildNameIndex>,
  opts: ResolveOptions = {}
): string | null {
  const { allowLastFirst = true, quiet = false } = opts;

  // Check overrides first
  const override = KNOWN_NAME_OVERRIDES[apiName];
  if (override) {
    const id = index.exact.get(override);
    if (id) return id;
  }

  // 1. Exact match
  const exactMatch = index.exact.get(apiName);
  if (exactMatch) return exactMatch;

  // 2. Normalized match
  const normalizedMatch = index.normalized.get(normalize(apiName));
  if (normalizedMatch) return normalizedMatch;

  // 3. Last name + first initial (forgiving — opt out for bulk matching)
  if (allowLastFirst) {
    const lfMatch = index.lastFirst.get(getLastNameFirstInitial(apiName));
    if (lfMatch) return lfMatch;
  }

  // No match found
  if (!quiet) console.warn(`[nameResolver] Could not resolve: "${apiName}"`);
  return null;
}
