// buildRecencyFromUfcStats: the ufcstats.com replacement for the (now Cloudflare-
// blocked) Sherdog recency crawl. Discovers the past week's completed UFC cards,
// pulls each event's bouts, resolves fighter NAMES → our ids, and writes the
// forward recency patch (data/recent_ufc_fights.csv) — the SAME schema + merge the
// Sherdog buildRecencyPatch used, so loadData consumes it unchanged.
//
// Event-oriented (one card → all its bouts at once), so no per-profile crawl and
// no id-crosswalk: ufcstats names ARE our dataset's names. Metrics (KD/STR/TD/SUB)
// are parsed but NOT yet written — the patch schema stays result/method/date-only
// for a clean drop-in (wiring metrics into Elo is a separate, golden-master-gated step).
//
// ⚠️  Run by YOU or CI at build time — never the app, never Claude. Flags:
//   --days N     discovery window (default 8)
//   --dry        parse + print rows, write nothing
//   (UFCSTATS_OFFLINE=1 in env → never crawl; only read cached pages — for tests)
import fs from 'fs';
import path from 'path';
import { loadAllData } from '../../src/lib/loadData';
import { getPage, UFCSTATS_BASE } from './fetchUfcStats';
import { parseEventsList, parseEventPage } from './parseUfcStats';
import { splitCsvLine, recencyKey } from '../sherdog/buildRecencyPatch';

const OUT = path.join(process.cwd(), 'data', 'recent_ufc_fights.csv');
const EVENTS_URL = `${UFCSTATS_BASE}/statistics/events/completed`;
// Schema now carries per-fight metrics (ufcstats gives them; the old Sherdog
// patch never did). Old carried-forward rows lack the trailing metric columns —
// they're padded on merge and loadData treats absent metrics as hasMetrics:false.
const METRIC_COLS = 'kd1,kd2,str1,str2,td1,td2,sub1,sub2';
const HEAD = `fighter1_ourId,fighter1_name,fighter2_ourId,fighter2_name,date,result1,result2,method,round,weightClass,eventName,source,${METRIC_COLS}`;
const BASE_COLS = 12; // columns before the metric block

interface Args { days: number; dry: boolean; }
function parseArgs(argv: string[]): Args {
  const a: Args = { days: 8, dry: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--days') a.days = Math.max(1, parseInt(argv[++i] ?? '8', 10) || 8);
    else if (argv[i] === '--dry') a.dry = true;
  }
  return a;
}

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const data = loadAllData();

  // Normalized name → our id (ambiguous names excluded so we never mis-attribute).
  const nameToId = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const f of data.fighterMap.values()) {
    const k = norm(f.fullName);
    if (!k) continue;
    if (nameToId.has(k) && nameToId.get(k) !== f.fighterId) ambiguous.add(k);
    else nameToId.set(k, f.fighterId);
  }
  for (const k of ambiguous) nameToId.delete(k);
  const resolve = (name: string): string | null => nameToId.get(norm(name)) ?? null;

  // Fights.csv is complete up to its newest PRIMARY event; only bouts after that
  // are genuinely new (not already ranked). Recency top-up rows are excluded here.
  let cutoffMs = 0;
  for (const f of data.fights) {
    if (f.source === 'fights' && f.eventDate) cutoffMs = Math.max(cutoffMs, f.eventDate.getTime());
  }
  const today = new Date().toISOString().slice(0, 10);
  const windowStart = new Date(Date.now() - args.days * 86400_000).toISOString().slice(0, 10);

  // 1. Discover recent COMPLETED UFC cards in the window (and newer than Fights.csv).
  const listHtml = await getPage(EVENTS_URL, { force: !process.env.UFCSTATS_OFFLINE });
  const events = parseEventsList(listHtml).filter(
    (e) => e.date && e.date <= today && e.date >= windowStart && new Date(e.date).getTime() > cutoffMs,
  );
  console.log(`[ufcstats] ${events.length} completed UFC card(s) in the last ${args.days}d, newer than Fights.csv:`);
  for (const e of events) console.log(`   • ${e.date}  ${e.name}  [${e.eventId}]`);

  // 2. Pull each card's bouts → recency rows.
  const seen = new Set<string>();
  const rows: string[] = [];
  let emitted = 0, skippedNC = 0, unresolved = 0;
  for (const ev of events) {
    const html = await getPage(`${UFCSTATS_BASE}/event-details/${ev.eventId}`, {
      force: !process.env.UFCSTATS_OFFLINE,
    });
    const bouts = parseEventPage(html);
    for (const b of bouts) {
      if (b.result1 === 'NC') { skippedNC++; continue; } // no Elo effect (draws ARE kept — 0.5 each)
      const id1 = resolve(b.fighter1Name) ?? `us:${b.fighter1UfcId}`;
      const id2 = resolve(b.fighter2Name) ?? `us:${b.fighter2UfcId}`;
      if (id1.startsWith('us:') || id2.startsWith('us:')) unresolved++;
      const key = recencyKey(b.fighter1Name, b.fighter2Name, ev.date!);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push([
        id1, b.fighter1Name, id2, b.fighter2Name, ev.date!,
        b.result1, b.result2, b.method, b.round ? String(b.round) : '',
        b.weightClass, ev.name, 'ufcstats',
        String(b.kd1), String(b.kd2), String(b.str1), String(b.str2),
        String(b.td1), String(b.td2), String(b.sub1), String(b.sub2),
      ].map(esc).join(','));
      emitted++;
    }
  }

  // 3. Accumulate-merge with the previously-committed patch (fresh row wins on a
  //    key collision; older non-rebuilt rows carried forward). Same as Sherdog.
  let carried = 0;
  if (fs.existsSync(OUT)) {
    const width = BASE_COLS + METRIC_COLS.split(',').length; // full schema width
    for (const ln of fs.readFileSync(OUT, 'utf-8').split('\n').slice(1).filter(Boolean)) {
      const c = splitCsvLine(ln);
      if (c.length < 5) continue;
      const key = recencyKey(c[1], c[3], c[4]); // NAMES (c[1]/c[3]), not ids — see recencyKey
      if (seen.has(key)) continue;
      seen.add(key);
      // Pad pre-metrics rows (old Sherdog schema) to the full width so the CSV
      // isn't ragged; the empty metric cells read as hasMetrics:false at load.
      rows.push(c.length < width ? ln + ','.repeat(width - c.length) : ln);
      carried++;
    }
  }

  console.log(`[ufcstats] emitted ${emitted} new bout(s) (${skippedNC} NC skipped, ${unresolved} unresolved-name), carried ${carried}.`);
  if (args.dry) {
    console.log('\n--dry: not writing. New rows:');
    for (const ln of rows.slice(0, emitted)) {
      const c = splitCsvLine(ln);
      console.log(`   ${c[4]}  ${c[1]} ${c[5]} vs ${c[3]}  (${c[7]} R${c[8]}) @ ${c[10]}  [${c[0]} / ${c[2]}]`);
    }
    return;
  }
  fs.writeFileSync(OUT, [HEAD, ...rows].join('\n') + '\n', 'utf-8');
  console.log(`wrote ${path.relative(process.cwd(), OUT)} (${rows.length} rows).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
