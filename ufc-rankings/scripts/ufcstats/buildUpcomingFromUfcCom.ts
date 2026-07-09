// buildUpcomingFromUfcCom: write data/upcoming_fights.csv from the AUTHORITATIVE
// ufc.com card (correct fight order + main/prelim/early SECTION split), replacing
// buildUpcomingFromUfcStats (announcement-order, no sections). Display-only — feeds
// the /upcoming page, never the Elo. Fighter ids resolved by NAME against our
// roster (suffix-stripped: "Khalil Rountree Jr." → our "Khalil Rountree").
// Unresolved fighters (debutants / regionals) get an empty id → rendered name-only.
//
// Schema (one row per bout): event_id,event_name,event_date,bout_order,section,
//   is_main_event,weight_class,fighter1_ourId,fighter1_name,fighter1_sherdogId,
//   fighter2_ourId,fighter2_name,fighter2_sherdogId,fetched_at
//   — `section` ∈ main|prelim|early; sherdogId columns kept empty for schema
//   continuity with the prior builder. bout_order is 1..N across the whole card
//   (main event = 1); is_main_event = (bout_order === 1).
//
// ⚠️  Run by YOU or CI — never the app, never Claude. Flags: --cards N (default 3),
//     --dry (parse + print, write nothing).
import fs from 'fs';
import path from 'path';
import { loadAllData } from '../../src/lib/loadData';
import { buildNameIndex, resolveNameToId } from '../../src/lib/nameResolver';
import { fetchUpcomingCards, type CardSection } from './fetchUfcCards';

const OUT = path.join(process.cwd(), 'data', 'upcoming_fights.csv');
const HEAD =
  'event_id,event_name,event_date,bout_order,section,is_main_event,weight_class,' +
  'fighter1_ourId,fighter1_name,fighter1_sherdogId,fighter2_ourId,fighter2_name,fighter2_sherdogId,fetched_at';

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// Drop a trailing generational suffix (Jr/Sr/II–V). ufc.com and our roster
// disagree on whether to keep it ("Khalil Rountree Jr." vs "Khalil Rountree"),
// and the disagreement runs both ways, so it's only ever a fallback lookup key.
function stripSuffix(name: string): string {
  return name.replace(/[\s,]+(?:jr|sr|ii|iii|iv|v)\.?$/i, '').trim();
}
const lastName = (name: string) => stripSuffix(name).split(/\s+/).pop() ?? name;

async function main() {
  const argv = process.argv.slice(2);
  const cards = Math.max(1, parseInt(argv[argv.indexOf('--cards') + 1] ?? '3', 10) || 3);
  const dry = argv.includes('--dry');

  const data = loadAllData();
  const index = buildNameIndex([...data.fighterMap.values()]);
  // Standard resolver (exact → normalized → last+initial), retried on the
  // suffix-stripped name since roster/ufc.com disagree on Jr/Sr/II–V. quiet:
  // many legit misses (debutants/regionals not in our roster) render name-only.
  const resolve = (name: string): string =>
    resolveNameToId(name, index, { quiet: true }) ??
    resolveNameToId(stripSuffix(name), index, { quiet: true }) ??
    '';

  const fetched = await fetchUpcomingCards(cards);
  const today = new Date().toISOString().slice(0, 10);

  console.log(`[upcoming] next ${fetched.length} card(s) from ufc.com:`);
  const rows: string[] = [];
  let resolvedCount = 0, total = 0;
  const sectionCounts: Record<CardSection, number> = { main: 0, prelim: 0, early: 0 };

  for (const card of fetched) {
    const me = card.bouts[0];
    // event_name carries the matchup as a " - " subtitle so the client's
    // splitEventName renders a clean title + billing (ufc.com's own page title
    // for Fight Nights is just "UFC Fight Night", no number/matchup).
    const eventName = me
      ? `${card.title} - ${lastName(me.fighter1Name)} vs. ${lastName(me.fighter2Name)}`
      : card.title;
    const date = card.eventDate ?? '';
    console.log(`   • ${date}  ${eventName}  (${card.bouts.length} bouts)`);

    card.bouts.forEach((b, i) => {
      const id1 = resolve(b.fighter1Name), id2 = resolve(b.fighter2Name);
      total += 2; if (id1) resolvedCount++; if (id2) resolvedCount++;
      sectionCounts[b.section]++;
      rows.push([
        card.slug, eventName, date, String(i + 1), b.section, i === 0 ? '1' : '0',
        b.weightClass, id1, b.fighter1Name, '', id2, b.fighter2Name, '', today,
      ].map(esc).join(','));
    });
  }

  console.log(
    `[upcoming] ${rows.length} bouts ` +
    `(${sectionCounts.main} main / ${sectionCounts.prelim} prelim / ${sectionCounts.early} early), ` +
    `${resolvedCount}/${total} fighters resolved to ids.`,
  );
  if (dry) { console.log('--dry: not writing.'); return; }
  fs.writeFileSync(OUT, [HEAD, ...rows].join('\n') + '\n', 'utf-8');
  console.log(`wrote ${path.relative(process.cwd(), OUT)} (${rows.length} bouts).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
