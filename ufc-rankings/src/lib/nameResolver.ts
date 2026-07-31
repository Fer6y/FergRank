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
  // Identity merge (fighter_merges.csv) collapsed the "Patricio Pitbull" row
  // into Patricio Freire, so last-name matching fails ("pitbull p" vs "freire p").
  'Patricio Pitbull': 'Patricio Freire',
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

// First + last name tokens, generational suffix dropped, middle names ignored:
// "Jose Miguel Delgado" and "Jose Delgado" both key "jose delgado". Requires the
// FULL first and last name to agree, so it never conflates same-initial fighters
// the way lastFirst can ("Michael Oliveira" ≠ "Maria Oliveira").
function getFirstLastKey(name: string): string | null {
  const stripped = name.replace(/[\s,]+(?:jr|sr|ii|iii|iv|v)\.?$/i, '').trim();
  const parts = normalize(stripped).split(' ');
  if (parts.length < 2) return null;
  return parts[0] + ' ' + parts[parts.length - 1];
}

export function buildNameIndex(fighters: Fighter[]): {
  exact: Map<string, string>;
  normalized: Map<string, string>;
  lastFirst: Map<string, string>;
  firstLast: Map<string, string>;
} {
  const exact = new Map<string, string>();
  const normalized = new Map<string, string>();
  const lastFirst = new Map<string, string>();
  const firstLast = new Map<string, string>();
  const firstLastAmbiguous = new Set<string>();

  for (const f of fighters) {
    exact.set(f.fullName, f.fighterId);
    normalized.set(normalize(f.fullName), f.fighterId);
    lastFirst.set(getLastNameFirstInitial(f.fullName), f.fighterId);
    const flKey = getFirstLastKey(f.fullName);
    if (flKey) {
      // Two roster fighters sharing first+last (differing only by middle name)
      // make the key ambiguous — matching either would be a guess, so drop it.
      if (firstLast.has(flKey)) firstLastAmbiguous.add(flKey);
      else firstLast.set(flKey, f.fighterId);
    }
  }
  for (const key of firstLastAmbiguous) firstLast.delete(key);

  return { exact, normalized, lastFirst, firstLast };
}

export interface ResolveOptions {
  // The last-name + first-initial fallback (step 3) is forgiving enough to
  // conflate siblings and namesakes (e.g. Patricio vs Patricky Freire). That is
  // an acceptable trade for matching ~15 official-ranking names per division,
  // but dangerous for BULK matching thousands of historical rows, where a
  // single collision silently merges two fighters' records. Set false there.
  allowLastFirst?: boolean;
  // Middle-name-tolerant first+last token match ("Jose Miguel Delgado" → our
  // "Jose Delgado"; ambiguous keys pre-dropped at index build). Much stricter
  // than lastFirst, but still opt-in (default false) so enabling it can never
  // silently change existing callers — the scoring path's resolution feeds the
  // official seed, and any new match there would shift the golden master.
  allowFirstLast?: boolean;
  // Suppress the per-name miss warning (bulk callers expect many legit misses).
  quiet?: boolean;
}

export function resolveNameToId(
  apiName: string,
  index: ReturnType<typeof buildNameIndex>,
  opts: ResolveOptions = {}
): string | null {
  const { allowLastFirst = true, allowFirstLast = false, quiet = false } = opts;

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

  // 3. First + last name tokens, middle names ignored (opt-in)
  if (allowFirstLast) {
    const flKey = getFirstLastKey(apiName);
    const flMatch = flKey ? index.firstLast.get(flKey) : undefined;
    if (flMatch) return flMatch;
  }

  // 4. Last name + first initial (forgiving — opt out for bulk matching)
  if (allowLastFirst) {
    const lfMatch = index.lastFirst.get(getLastNameFirstInitial(apiName));
    if (lfMatch) return lfMatch;
  }

  // No match found
  if (!quiet) console.warn(`[nameResolver] Could not resolve: "${apiName}"`);
  return null;
}
