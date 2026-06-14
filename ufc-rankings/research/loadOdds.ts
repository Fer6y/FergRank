// ─────────────────────────────────────────────────────────────────────────
//  research/loadOdds.ts — read the ingested closing-odds CSV into memory.
//
//  This loader is part of the research zone ONLY. The Elo/scoring engine must
//  never import it (and doesn't). If data/closing_odds.csv is absent this
//  returns [] — exactly like loadRecentPatch() — so nothing breaks; the
//  research scripts just have nothing to analyse until fetchClosingOdds is run.
// ─────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import type { ClosingOdds } from './oddsTypes';

const ODDS_FILE = path.join(process.cwd(), 'data', 'closing_odds.csv');

export function loadClosingOdds(): ClosingOdds[] {
  if (!fs.existsSync(ODDS_FILE)) {
    console.warn(
      `[loadOdds] ${ODDS_FILE} not found — run ` +
        `node_modules/.bin/jiti research/fetchClosingOdds.ts first.`
    );
    return [];
  }

  const raw = fs.readFileSync(ODDS_FILE, 'utf-8');
  const rows = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
  }).data;

  const out: ClosingOdds[] = [];
  for (const r of rows) {
    const favOdds = parseFloat(r['favourite_odds'] ?? '');
    const dogOdds = parseFloat(r['underdog_odds'] ?? '');
    if (!r['favourite'] || !r['underdog'] || !favOdds || !dogOdds) continue;

    const oc = (r['outcome'] ?? '').toLowerCase();
    out.push({
      date: r['date'] ?? '',
      event: r['event'] ?? '',
      favourite: r['favourite'],
      underdog: r['underdog'],
      favouriteOdds: favOdds,
      underdogOdds: dogOdds,
      outcome:
        oc === 'favourite' ? 'favourite' : oc === 'underdog' ? 'underdog' : 'unknown',
    });
  }
  return out;
}
