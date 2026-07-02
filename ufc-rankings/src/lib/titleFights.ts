// ─────────────────────────────────────────────────────────────────────────
//  titleFights.ts — "was this fight for a belt?" lookup.
//
//  Reads data/title_fights.csv (produced by scripts/buildTitleFights.ts from
//  the champion-reign ledger in data/champions.json) and answers per fight by
//  normalized name-pair + date. STRICTLY presentation — used to badge title
//  fights in fight histories; never touches the Elo/scoring path.
//
//  The CSV only covers Fights.csv (the ledger build's source), so fights that
//  arrive via the Sherdog recency patch fall back to their weight-class label
//  ("Interim …" / "… Title/Championship") until the next full data refresh.
//
//  Missing file → empty index (nothing gets badged).
// ─────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const FILE = path.join(process.cwd(), 'data', 'title_fights.csv');

// Same normalization as scripts/buildTitleFights.ts so pair keys line up.
const norm = (s: string): string =>
  (s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const pairKey = (a: string, b: string): string => [norm(a), norm(b)].sort().join('|');

// A name pair can rematch (e.g. trilogies) — keep every tagged date.
let index: Map<string, number[]> | null = null;

function load(): Map<string, number[]> {
  if (index) return index;
  const map = new Map<string, number[]>();
  index = map;
  if (!fs.existsSync(FILE)) return map;

  const rows = Papa.parse<Record<string, string>>(fs.readFileSync(FILE, 'utf-8'), {
    header: true,
    skipEmptyLines: true,
  }).data;

  for (const r of rows) {
    const t = new Date((r.date || '') + 'T00:00:00Z').getTime();
    if (!isFinite(t)) continue;
    const key = pairKey(r.fighter_1 || '', r.fighter_2 || '');
    const list = map.get(key);
    if (list) list.push(t);
    else map.set(key, [t]);
  }
  return map;
}

// Ledger dates and fight dates both come from Events.csv, so they match
// exactly — the small window only absorbs source drift (e.g. a patch row
// dated by broadcast day vs. event day).
const DATE_WINDOW_MS = 3 * 86400_000;

export function isTitleFight(
  fighterName: string,
  opponentName: string,
  isoDate: string, // "YYYY-MM-DD" or a full ISO timestamp — only the day matters
  weightClass?: string,
): boolean {
  const dates = load().get(pairKey(fighterName, opponentName));
  if (dates) {
    const t = new Date(isoDate.slice(0, 10) + 'T00:00:00Z').getTime();
    if (isFinite(t) && dates.some((d) => Math.abs(d - t) <= DATE_WINDOW_MS)) return true;
  }
  return weightClass ? /interim|championship|title/i.test(weightClass) : false;
}
