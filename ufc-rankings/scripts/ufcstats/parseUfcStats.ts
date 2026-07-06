// ufcstats.com HTML parsers (the isolation layer — pure functions over saved
// HTML, no network). Built against fixtures in scripts/ufcstats/fixtures/.
//
//   parseEventsList(html)  → the completed-events index → [{ eventId, name, date }]
//   parseEventPage(html)   → one event's card → per-bout results + metrics (TODO)
//
// Kept separate from fetchUfcStats.ts so the parsing is unit-testable without ever
// touching the network (mirrors the Sherdog parseEvent.ts split).
import fs from 'fs';

export interface UfcStatsEvent {
  eventId: string;
  url: string;
  name: string;
  date: string | null; // ISO YYYY-MM-DD
}

const MONTHS: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

// "July 11, 2026" → "2026-07-11" (TZ-safe: no Date parsing, so no midnight-UTC
// day-slip). Returns null if the string isn't a recognizable date.
function toISO(s: string): string | null {
  const m = s.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  if (!m) return null;
  const mo = MONTHS[m[1]];
  if (!mo) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${m[3]}-${pad(mo)}-${pad(parseInt(m[2], 10))}`;
}

// Every event row is an <a href=".../event-details/<id>">Name</a> immediately
// followed by <span class="b-statistics__date">Month DD, YYYY</span>. The first
// row (b-link_style_white + next.png) is the UPCOMING event — parsed like the
// rest; callers filter by date window. Order is newest-first as ufcstats serves it.
export function parseEventsList(html: string): UfcStatsEvent[] {
  const out: UfcStatsEvent[] = [];
  const re =
    /<a href="(https?:\/\/ufcstats\.com\/event-details\/([a-f0-9]+))"[^>]*>\s*([\s\S]*?)<\/a>\s*<span class="b-statistics__date">\s*([\s\S]*?)<\/span>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    out.push({
      url: m[1],
      eventId: m[2],
      name: m[3].replace(/\s+/g, ' ').trim(),
      date: toISO(m[4].replace(/\s+/g, ' ').trim()),
    });
  }
  return out;
}

// ── Event page: one card's bouts, with per-fighter metrics ────────────────────
export interface UfcStatsBout {
  fightId: string | null;
  fighter1Name: string; fighter1UfcId: string;
  fighter2Name: string; fighter2UfcId: string;
  result1: 'W' | 'L' | 'D' | 'NC'; result2: 'W' | 'L' | 'D' | 'NC';
  kd1: number; kd2: number;      // knockdowns
  str1: number; str2: number;    // significant strikes landed
  td1: number; td2: number;      // takedowns
  sub1: number; sub2: number;    // submission attempts
  weightClass: string;
  method: string;                // mapped to the patch codes: KO/TKO, SUB, U-DEC, M-DEC, S-DEC (raw otherwise)
  round: number;
}

// The two <p class="b-fight-details__table-text"> values inside a metric cell
// (fighter1 first, fighter2 second), tags stripped.
function cellTexts(cell: string): string[] {
  const out: string[] = [];
  const re = /b-fight-details__table-text"[^>]*>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cell))) out.push(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  return out;
}
const num = (s: string | undefined): number => (s ? parseInt(s, 10) || 0 : 0);

// ufcstats method label → the recency-patch / eloEngine code.
function mapMethod(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('ko/tko') || m.startsWith('tko') || m.startsWith('ko')) return 'KO/TKO';
  if (m.includes('submission') || m === 'sub') return 'SUB';
  if (m.includes('unanimous')) return 'U-DEC';
  if (m.includes('split')) return 'S-DEC';
  if (m.includes('majority')) return 'M-DEC';
  return raw.trim(); // DQ / Overturned / Could Not Continue — left raw, engine treats as neutral
}

// The result flag (green "win" etc.) is the FIRST-listed fighter's outcome.
function mapResult(flag: string): ['W' | 'L' | 'D' | 'NC', 'W' | 'L' | 'D' | 'NC'] {
  switch (flag.toLowerCase()) {
    case 'win': return ['W', 'L'];
    case 'loss': return ['L', 'W'];
    case 'draw': return ['D', 'D'];
    default: return ['NC', 'NC'];
  }
}

export function parseEventPage(html: string): UfcStatsBout[] {
  const bouts: UfcStatsBout[] = [];
  // Clickable bout rows carry data-link to the fight; the header row does not.
  const rowRe = /<tr class="b-fight-details__table-row[^"]*"[^>]*data-link="([^"]*)"[^>]*>([\s\S]*?)<\/tr>/g;
  let r: RegExpExecArray | null;
  while ((r = rowRe.exec(html))) {
    const dataLink = r[1];
    const row = r[2];
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (cells.length < 9) continue; // not a metrics row

    const flag = row.match(/b-flag__text">(\w+)/)?.[1] ?? '';
    const [result1, result2] = mapResult(flag);

    const fighters = [...cells[1].matchAll(/fighter-details\/([a-f0-9]+)"[^>]*>\s*([^<]+?)\s*<\/a>/g)];
    if (fighters.length < 2) continue;

    const kd = cellTexts(cells[2]);
    const str = cellTexts(cells[3]);
    const td = cellTexts(cells[4]);
    const sub = cellTexts(cells[5]);
    const weightClass = cellTexts(cells[6])[0]?.replace(/\s+/g, ' ').trim() ?? '';
    const method = mapMethod(cellTexts(cells[7])[0] ?? '');
    const round = num(cellTexts(cells[8])[0]);

    bouts.push({
      fightId: dataLink.match(/fight-details\/([a-f0-9]+)/)?.[1] ?? null,
      fighter1UfcId: fighters[0][1], fighter1Name: fighters[0][2],
      fighter2UfcId: fighters[1][1], fighter2Name: fighters[1][2],
      result1, result2,
      kd1: num(kd[0]), kd2: num(kd[1]),
      str1: num(str[0]), str2: num(str[1]),
      td1: num(td[0]), td2: num(td[1]),
      sub1: num(sub[0]), sub2: num(sub[1]),
      weightClass, method, round,
    });
  }
  return bouts;
}

// ── Upcoming event: announced matchups (no results/metrics yet) ───────────────
export interface UpcomingBout {
  fighter1Name: string; fighter1UfcId: string;
  fighter2Name: string; fighter2UfcId: string;
  weightClass: string;
}
export interface UpcomingEvent { name: string; date: string | null; bouts: UpcomingBout[] }

// Ordered longest-first so "Light Heavyweight" wins over "Heavyweight" and the
// women's divisions match before the plain names.
const WEIGHT_RE =
  /(Women's\s+(?:Strawweight|Flyweight|Bantamweight|Featherweight)|Light Heavyweight|Heavyweight|Middleweight|Welterweight|Lightweight|Featherweight|Bantamweight|Flyweight|Strawweight|Catch\s?Weight|Open\s?Weight)/i;

export function parseUpcomingEvent(html: string): UpcomingEvent {
  const name = html.match(/b-content__title-highlight">\s*([\s\S]*?)<\/span>/)?.[1].replace(/\s+/g, ' ').trim() ?? '';
  const dateRaw = html.match(/Date:\s*<\/i>\s*([A-Za-z]+ \d{1,2}, \d{4})/)?.[1] ?? '';
  const date = toISO(dateRaw);

  const bouts: UpcomingBout[] = [];
  const rowRe = /<tr class="b-fight-details__table-row[^"]*"[^>]*data-link="[^"]*"[^>]*>([\s\S]*?)<\/tr>/g;
  let r: RegExpExecArray | null;
  while ((r = rowRe.exec(html))) {
    const row = r[1];
    const fighters = [...row.matchAll(/fighter-details\/([a-f0-9]+)"[^>]*>\s*([^<]+?)\s*<\/a>/g)];
    if (fighters.length < 2) continue;
    bouts.push({
      fighter1UfcId: fighters[0][1], fighter1Name: fighters[0][2],
      fighter2UfcId: fighters[1][1], fighter2Name: fighters[1][2],
      weightClass: row.match(WEIGHT_RE)?.[1].replace(/\s+/g, ' ').trim() ?? '',
    });
  }
  return { name, date, bouts };
}

// ── CLI self-test: parse a saved fixture and print what it found ──────────────
if (process.argv[1] && /parseUfcStats\.ts$/.test(process.argv[1])) {
  const file = process.argv[2] ?? 'scripts/ufcstats/fixtures/events_list_real.html';
  const html = fs.readFileSync(file, 'utf-8');
  if (/b-fight-details__table-row__hover/.test(html) && !/b-flag__text/.test(html)) {
    const ev = parseUpcomingEvent(html);
    console.log(`upcoming: "${ev.name}" (${ev.date}) — ${ev.bouts.length} bout(s):\n`);
    for (const b of ev.bouts) console.log(`  ${b.fighter1Name} vs ${b.fighter2Name} · ${b.weightClass}`);
  } else if (/b-fight-details__table-row__hover/.test(html)) {
    const bouts = parseEventPage(html);
    console.log(`parsed ${bouts.length} bout(s) from ${file}:\n`);
    for (const b of bouts) {
      console.log(
        `  ${b.fighter1Name} ${b.result1} vs ${b.fighter2Name} — ${b.method} R${b.round} · ${b.weightClass} ` +
        `| KD ${b.kd1}-${b.kd2} STR ${b.str1}-${b.str2} TD ${b.td1}-${b.td2} SUB ${b.sub1}-${b.sub2}`
      );
    }
  } else {
    const events = parseEventsList(html);
    console.log(`parsed ${events.length} event(s) from ${file}:\n`);
    for (const e of events.slice(0, 15)) console.log(`  ${e.date ?? '(no date)'}  ${e.name}  [${e.eventId}]`);
    if (events.length > 15) console.log(`  … +${events.length - 15} more`);
  }
}
