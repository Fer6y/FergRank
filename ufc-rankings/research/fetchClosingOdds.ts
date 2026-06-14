// ─────────────────────────────────────────────────────────────────────────
//  research/fetchClosingOdds.ts — ONE-TIME / refresh ingestion of closing odds.
//
//  Downloads a cleaned closing-odds dataset and normalises it into
//  data/closing_odds.csv (the file loadOdds.ts reads). This is the ONLY
//  network call in the research zone — it mirrors the project's "one external
//  source, isolated in one file" rule for the Octagon API.
//
//  Source: jansen88/ufc-data `cleaned_odds.csv` — decimal closing/consensus
//  odds (betmma.tips lineage), ~Nov 2014 → Dec 2023, one row per fight.
//  Schema: date,event,favourite,underdog,favourite_odds,underdog_odds,outcome.
//
//  Run:  node_modules/.bin/jiti research/fetchClosingOdds.ts
// ─────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const SOURCE_URL =
  'https://raw.githubusercontent.com/jansen88/ufc-data/master/data/cleaned_odds.csv';
const OUT = path.join(process.cwd(), 'data', 'closing_odds.csv');

async function main(): Promise<void> {
  console.log(`[fetchClosingOdds] downloading ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching odds source`);
  const text = await res.text();

  const rows = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  }).data;

  // Keep only the columns the research layer uses (drop the scrape timestamp),
  // and drop any row missing a fighter name or a numeric price.
  const cleaned = rows
    .filter(
      (r) =>
        r['favourite'] &&
        r['underdog'] &&
        parseFloat(r['favourite_odds'] ?? '') > 0 &&
        parseFloat(r['underdog_odds'] ?? '') > 0
    )
    .map((r) => ({
      date: r['date'] ?? '',
      event: r['event'] ?? '',
      favourite: r['favourite'],
      underdog: r['underdog'],
      favourite_odds: r['favourite_odds'],
      underdog_odds: r['underdog_odds'],
      outcome: r['outcome'] ?? '',
    }));

  fs.writeFileSync(OUT, Papa.unparse(cleaned));

  const dates = cleaned.map((r) => r.date).filter(Boolean).sort();
  console.log(
    `[fetchClosingOdds] wrote ${cleaned.length} rows → ${OUT}\n` +
      `  span: ${dates[0]} → ${dates[dates.length - 1]}`
  );
}

main().catch((e) => {
  console.error('[fetchClosingOdds] failed:', e);
  process.exit(1);
});
