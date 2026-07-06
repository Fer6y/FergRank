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

// Per-fighter title-fight tally (normalized name → appearances + wins). Built
// from the same CSV in the same pass; display-only, like the pair index.
export interface TitleRecord {
  appearances: number; // total championship bouts the fighter took part in
  wins: number;        // championship bouts won (belt won or defended)
}
let recordIndex: Map<string, TitleRecord> | null = null;

function load(): Map<string, number[]> {
  if (index) return index;
  const map = new Map<string, number[]>();
  const recs = new Map<string, TitleRecord>();
  index = map;
  recordIndex = recs;
  if (!fs.existsSync(FILE)) return map;

  const rows = Papa.parse<Record<string, string>>(fs.readFileSync(FILE, 'utf-8'), {
    header: true,
    skipEmptyLines: true,
  }).data;

  const bump = (name: string, won: boolean) => {
    const key = norm(name);
    if (!key) return;
    const rec = recs.get(key) ?? { appearances: 0, wins: 0 };
    rec.appearances += 1;
    if (won) rec.wins += 1;
    recs.set(key, rec);
  };

  for (const r of rows) {
    const t = new Date((r.date || '') + 'T00:00:00Z').getTime();
    if (!isFinite(t)) continue;
    const key = pairKey(r.fighter_1 || '', r.fighter_2 || '');
    const list = map.get(key);
    if (list) list.push(t);
    else map.set(key, [t]);

    // Per-fighter tally. result_fighter1 is 'W' when fighter_1 won the bout;
    // anything else (L/D/NC) is not a win for fighter_1.
    const f1Won = (r.result_fighter1 || '').trim().toUpperCase() === 'W';
    bump(r.fighter_1 || '', f1Won);
    bump(r.fighter_2 || '', !f1Won && (r.result_fighter1 || '').trim().toUpperCase() === 'L');
  }
  return map;
}

// Career championship tally for a fighter (by name). Zeroes when the fighter has
// no title fights in the ledger. Mostly display (distinction decals), but also
// read by scoringEngine's "untested" hold to exempt title-fight participants
// (contesting a UFC belt is definitional proof of being tested).
export function getTitleRecord(fighterName: string): TitleRecord {
  load();
  return recordIndex!.get(norm(fighterName)) ?? { appearances: 0, wins: 0 };
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
