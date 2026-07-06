// buildUpcomingFromUfcStats: the ufcstats replacement for the (Sherdog-blocked)
// buildUpcoming. Fetches the next N upcoming UFC cards + their announced bouts and
// writes data/upcoming_fights.csv (display-only — feeds the /upcoming page, never
// the Elo). Same schema loadUpcoming.ts already reads; fighter ids resolved by NAME
// (ufcstats names ARE our names). Unresolved fighters (debutants) get an empty id —
// loadUpcoming renders them name-only, no link.
//
// ⚠️  Run by YOU or CI — never the app, never Claude. Flags: --cards N (default 3),
//     --dry. (UFCSTATS_OFFLINE=1 → cache only, for tests.)
import fs from 'fs';
import path from 'path';
import { loadAllData } from '../../src/lib/loadData';
import { getPage, UFCSTATS_BASE } from './fetchUfcStats';
import { parseEventsList, parseUpcomingEvent } from './parseUfcStats';

const OUT = path.join(process.cwd(), 'data', 'upcoming_fights.csv');
const LIST_URL = `${UFCSTATS_BASE}/statistics/events/upcoming`;
const HEAD =
  'event_id,event_name,event_date,bout_order,is_main_event,weight_class,' +
  'fighter1_ourId,fighter1_name,fighter1_sherdogId,fighter2_ourId,fighter2_name,fighter2_sherdogId,fetched_at';

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function main() {
  const argv = process.argv.slice(2);
  const cards = Math.max(1, parseInt(argv[argv.indexOf('--cards') + 1] ?? '3', 10) || 3);
  const dry = argv.includes('--dry');
  const force = !process.env.UFCSTATS_OFFLINE;
  const data = loadAllData();

  // Normalized name → our id (ambiguous names excluded so we never mis-link).
  const nameToId = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const f of data.fighterMap.values()) {
    const k = norm(f.fullName);
    if (!k) continue;
    if (nameToId.has(k) && nameToId.get(k) !== f.fighterId) ambiguous.add(k);
    else nameToId.set(k, f.fighterId);
  }
  for (const k of ambiguous) nameToId.delete(k);
  const resolve = (name: string): string => nameToId.get(norm(name)) ?? '';

  const today = new Date().toISOString().slice(0, 10);
  const listHtml = await getPage(LIST_URL, { force });
  const upcoming = parseEventsList(listHtml)
    .filter((e) => e.date && e.date >= today)
    .sort((a, b) => (a.date! < b.date! ? -1 : 1))
    .slice(0, cards);

  console.log(`[upcoming] next ${upcoming.length} card(s):`);
  const rows: string[] = [];
  const fetchedAt = today;
  let resolvedCount = 0, total = 0;
  for (const ev of upcoming) {
    const html = await getPage(`${UFCSTATS_BASE}/event-details/${ev.eventId}`, { force });
    const parsed = parseUpcomingEvent(html);
    console.log(`   • ${ev.date}  ${parsed.name || ev.name}  (${parsed.bouts.length} bouts)`);
    parsed.bouts.forEach((b, i) => {
      const id1 = resolve(b.fighter1Name), id2 = resolve(b.fighter2Name);
      total += 2; if (id1) resolvedCount++; if (id2) resolvedCount++;
      rows.push([
        ev.eventId, parsed.name || ev.name, ev.date ?? '', String(i + 1), i === 0 ? '1' : '0',
        b.weightClass, id1, b.fighter1Name, '', id2, b.fighter2Name, '', fetchedAt,
      ].map(esc).join(','));
    });
  }

  console.log(`[upcoming] ${rows.length} bouts, ${resolvedCount}/${total} fighters resolved to ids.`);
  if (dry) { console.log('--dry: not writing.'); return; }
  fs.writeFileSync(OUT, [HEAD, ...rows].join('\n') + '\n', 'utf-8');
  console.log(`wrote ${path.relative(process.cwd(), OUT)} (${rows.length} bouts).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
