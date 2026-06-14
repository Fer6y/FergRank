// ─────────────────────────────────────────────────────────────────────────
//  fighterMedia.ts — presentation media (photo + nationality/flag) per fighter.
//
//  Joins data/canonical/fighter_media.csv (Wikidata: licensed Commons photo +
//  nationality) and data/canonical/ufc_photos.csv (UFC.com headshot/full-body)
//  to one lookup keyed by canonical Fighter_Id. Both files are produced by the
//  build-time scripts scripts/registry/buildMedia.ts + buildUfcPhotos.ts.
//
//  This is STRICTLY presentation — it never touches the Elo/scoring path. It is
//  attached to ranked-fighter payloads at the API boundary (attachMedia) and to
//  the profile assembler, so the algorithm types stay media-free.
//
//  Photo cascade (best head-framing first, maximising coverage ~53%):
//     UFC headshot → licensed Commons portrait → UFC full-body
//  All render with object-fit:cover / position:top so a full-body crop still
//  frames the head. Missing → '' (callers fall back to an initials avatar).
// ─────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const DATA = path.join(process.cwd(), 'data', 'canonical');

export interface FighterMedia {
  avatarUrl: string;    // best head-ish image for circular avatars ('' if none)
  fullBodyUrl: string;  // UFC transparent full-body, for the profile hero ('' if none)
  nationality: string;  // human label, e.g. "Brazil" ('' if unknown)
  flag: string;         // emoji flag derived from nationality ('' if unmapped)
}

// Optional media fields mixed onto any object carrying a `fighterId`.
export interface WithMedia {
  avatarUrl?: string;
  flag?: string;
  nationality?: string;
}

// Wikidata country labels → ISO 3166-1 alpha-2. Covers every nationality present
// in the data (86) plus the most likely synonyms a data refresh might introduce.
const COUNTRY_ISO: Record<string, string> = {
  'United States': 'US', 'United States of America': 'US', Brazil: 'BR', Canada: 'CA',
  'United Kingdom': 'GB', 'English people': 'GB', England: 'GB', Scotland: 'GB', Wales: 'GB',
  Russia: 'RU', Japan: 'JP', Mexico: 'MX', Australia: 'AU', France: 'FR', Sweden: 'SE',
  'Kingdom of Sweden': 'SE', Poland: 'PL', "People's Republic of China": 'CN', China: 'CN',
  'South Korea': 'KR', 'Republic of Korea': 'KR', 'New Zealand': 'NZ',
  'Kingdom of the Netherlands': 'NL', Netherlands: 'NL', Germany: 'DE', Ireland: 'IE',
  Argentina: 'AR', Peru: 'PE', 'South Africa': 'ZA', 'Kingdom of Denmark': 'DK', Denmark: 'DK',
  Spain: 'ES', Cuba: 'CU', Italy: 'IT', Kazakhstan: 'KZ', Georgia: 'GE', Serbia: 'RS',
  Armenia: 'AM', Norway: 'NO', 'Czech Republic': 'CZ', Czechia: 'CZ', Croatia: 'HR',
  Uzbekistan: 'UZ', Austria: 'AT', Finland: 'FI', Turkey: 'TR', Portugal: 'PT', Moldova: 'MD',
  Venezuela: 'VE', Tajikistan: 'TJ', Ukraine: 'UA', Nigeria: 'NG', Israel: 'IL', Bulgaria: 'BG',
  Philippines: 'PH', Tunisia: 'TN', Chile: 'CL', Azerbaijan: 'AZ', Ecuador: 'EC',
  Switzerland: 'CH', Slovakia: 'SK', Romania: 'RO', India: 'IN', Belarus: 'BY', Colombia: 'CO',
  Cameroon: 'CM', Iran: 'IR', Kyrgyzstan: 'KG', Angola: 'AO', Uganda: 'UG', Thailand: 'TH',
  Lithuania: 'LT', Indonesia: 'ID', Iceland: 'IS', Suriname: 'SR', Guyana: 'GY', Ghana: 'GH',
  Mongolia: 'MN', 'Democratic Republic of the Congo': 'CD', Latvia: 'LV', Lebanon: 'LB',
  Greece: 'GR', 'Cape Verde': 'CV', Syria: 'SY', Uruguay: 'UY', Afghanistan: 'AF',
  'Dominican Republic': 'DO', Hungary: 'HU', Belgium: 'BE', Haiti: 'HT', Cyprus: 'CY',
  Singapore: 'SG', Bolivia: 'BO', 'El Salvador': 'SV', Grenada: 'GD', Taiwan: 'TW',
};

function isoToFlag(iso: string): string {
  if (iso.length !== 2) return '';
  const A = 0x1f1e6;
  const base = 'A'.charCodeAt(0);
  return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => A + c.charCodeAt(0) - base));
}

function readCsv(file: string): Record<string, string>[] {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) return [];
  return Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8'), {
    header: true,
    skipEmptyLines: true,
  }).data;
}

let cache: Map<string, FighterMedia> | null = null;

function load(): Map<string, FighterMedia> {
  if (cache) return cache;
  const map = new Map<string, FighterMedia>();

  // Wikidata layer: nationality + licensed Commons portrait.
  for (const r of readCsv('fighter_media.csv')) {
    const id = r.canonical_id;
    if (!id) continue;
    const nationality = r.nationality || '';
    map.set(id, {
      avatarUrl: r.photo_url || '',
      fullBodyUrl: '',
      nationality,
      flag: isoToFlag(COUNTRY_ISO[nationality] || ''),
    });
  }

  // UFC.com layer: headshot (best for circles) + full-body (profile hero).
  for (const r of readCsv('ufc_photos.csv')) {
    const id = r.canonical_id;
    if (!id) continue;
    const cur = map.get(id) ?? { avatarUrl: '', fullBodyUrl: '', nationality: '', flag: '' };
    if (r.full_body_url) cur.fullBodyUrl = r.full_body_url;
    // Prefer a UFC headshot for the circular avatar; else keep the Commons photo;
    // else fall back to the UFC full-body so coverage isn't lost.
    if (r.headshot_url) cur.avatarUrl = r.headshot_url;
    else if (!cur.avatarUrl && r.full_body_url) cur.avatarUrl = r.full_body_url;
    map.set(id, cur);
  }

  cache = map;
  return map;
}

export function getFighterMedia(fighterId: string): FighterMedia | undefined {
  return load().get(fighterId);
}

// Attach media fields to ranked-fighter payloads in place (and return them) at
// the API boundary, so client components receive photos/flags without reading
// the filesystem. No-op for fighters with no media.
export function attachMedia<T extends WithMedia & { fighterId: string }>(fighters: T[]): T[] {
  const media = load();
  for (const f of fighters) {
    const m = media.get(f.fighterId);
    if (m) {
      f.avatarUrl = m.avatarUrl || undefined;
      f.flag = m.flag || undefined;
      f.nationality = m.nationality || undefined;
    }
  }
  return fighters;
}
