/**
 * buildTitleFights.ts
 *
 * Tags every UFC title fight in our data by intersecting Fights.csv (5-round /
 * interim / championship bouts) with the champion-reign ledger in
 * data/champions.json, then writes a human-readable reference doc
 * (data/TITLE_FIGHTS.md) + a machine-readable tag file (data/title_fights.csv).
 *
 * A title fight = a 5-round bout where a participant is a reigning or interim
 * champion within their (padded) reign window. This catches title-winning
 * fights (winner's reign.start == fight date), defenses (date inside window),
 * and the dethroning fight (loser's window includes the date).
 *
 * It also re-runs the "+300 challenger" odds case study on the PRECISE title
 * set and prints a validation section flagging any reign with zero matched
 * fights (a likely date error or a pre-data reign).
 *
 * Run:  node_modules/.bin/jiti scripts/buildTitleFights.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';

const DATA = join(__dirname, '..', 'data');

// ---------- helpers ----------
const norm = (s: string) =>
  (s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const readCsv = (file: string): Record<string, string>[] =>
  Papa.parse(readFileSync(join(DATA, file), 'utf8'), {
    header: true,
    skipEmptyLines: true,
  }).data as Record<string, string>[];

const day = (d: string) => new Date(d + 'T00:00:00Z').getTime();
const decToAmerican = (d: number) =>
  d >= 2 ? `+${Math.round((d - 1) * 100)}` : `-${Math.round(100 / (d - 1))}`;

// ---------- load ----------
interface Reign {
  champion: string;
  champNorm: string;
  start: string;
  end: string | null;
  interim: boolean;
  note?: string;
  division: string;
  matched: number; // # title fights matched to this reign
}

const ledger = JSON.parse(readFileSync(join(DATA, 'champions.json'), 'utf8'));
const PAD = (ledger._meta?.padDays ?? 21) * 86400_000;

const reigns: Reign[] = [];
for (const [division, arr] of Object.entries(ledger)) {
  if (division === '_meta') continue;
  for (const r of arr as any[]) {
    reigns.push({
      champion: r.champion,
      champNorm: norm(r.champion),
      start: r.start,
      end: r.end,
      interim: !!r.interim,
      note: r.note,
      division,
      matched: 0,
    });
  }
}

// events -> date
const eventDate = new Map<string, string>();
for (const e of readCsv('Events.csv')) eventDate.set(e['Event_Id'], e['Date']);

// odds: index by normalized name-pair -> {fav, dog, favOdds, dogOdds, outcome, event, date}
interface Odds {
  fav: string;
  dog: string;
  favOdds: number;
  dogOdds: number;
  outcome: string;
  event: string;
  date: string;
}
// Keyed by name-pair -> list (a pair can rematch; disambiguate by date at lookup).
const oddsByPair = new Map<string, Odds[]>();
for (const o of readCsv('closing_odds.csv')) {
  const fo = parseFloat(o['favourite_odds']);
  const uo = parseFloat(o['underdog_odds']);
  if (!isFinite(fo) || !isFinite(uo)) continue;
  const key = [norm(o['favourite']), norm(o['underdog'])].sort().join('|');
  const rec: Odds = {
    fav: o['favourite'],
    dog: o['underdog'],
    favOdds: fo,
    dogOdds: uo,
    outcome: o['outcome'],
    event: o['event'],
    date: o['date'],
  };
  (oddsByPair.get(key) ?? oddsByPair.set(key, []).get(key)!).push(rec);
}
// Pick the odds row for this exact bout: nearest date within 45 days (handles rematches).
const lookupOdds = (n1: string, n2: string, date: string): Odds | undefined => {
  const list = oddsByPair.get([n1, n2].sort().join('|'));
  if (!list) return undefined;
  const t = day(date);
  let best: Odds | undefined;
  let bestGap = Infinity;
  for (const o of list) {
    const gap = Math.abs(day(o.date) - t);
    if (gap < bestGap) {
      bestGap = gap;
      best = o;
    }
  }
  return bestGap <= 45 * 86400_000 ? best : undefined;
};

// ---------- tag title fights ----------
interface TitleFight {
  date: string;
  division: string;
  champion: string;
  challenger: string;
  f1: string;
  f2: string;
  method: string;
  result1: string;
  interim: boolean;
  weightClass: string;
  // odds (if matched)
  challengerOdds?: number; // decimal odds on the non-champion
  challengerIsUnderdog?: boolean;
  oddsOutcome?: string;
}

const titleFights: TitleFight[] = [];

// Map a fight's Weight_Class to a ledger division key (strip Interim; catch/open
// weight and 1990s tournament/superfight labels map to null = no division).
const divKeys = new Set(Object.keys(ledger).filter((k) => k !== '_meta'));
const mapDivision = (wc: string): string | null => {
  const cleaned = wc.replace(/^Interim\s+/, '').trim();
  return divKeys.has(cleaned) ? cleaned : null;
};

for (const f of readCsv('Fights.csv')) {
  const tf = f['Time Format'] || '';
  const wc = f['Weight_Class'] || '';
  const five = tf.startsWith('5 Rnd');
  const certain = /Interim|Championship/.test(wc);
  if (!five && !certain) continue;

  const date = eventDate.get(f['Event_Id'] || '');
  if (!date) continue;
  const t = day(date);
  const mapped = mapDivision(wc);

  const n1 = norm(f['Fighter_1']);
  const n2 = norm(f['Fighter_2']);
  const winnerNorm = f['Result_1'] === 'W' ? n1 : f['Result_2'] === 'W' ? n2 : null;

  // All reigns where a participant is champ and the date is inside the padded window.
  const cands = reigns
    .filter((r) => (r.champNorm === n1 || r.champNorm === n2))
    .filter((r) => {
      const lo = day(r.start) - PAD;
      const hi = (r.end ? day(r.end) : Date.now()) + PAD;
      return t >= lo && t <= hi;
    })
    .map((r) => ({
      r,
      participantNorm: r.champNorm,
      divMatch: mapped != null && r.division === mapped,
      established: day(r.start) < t, // held the belt ENTERING this bout
    }));

  if (!cands.length) continue;

  // A bout qualifies as a TITLE fight only if a champion is defending their own
  // division's belt, OR both participants are reigning champions (superfight).
  const divMatched = cands.filter((c) => c.divMatch);
  const distinctChamps = new Set(cands.map((c) => c.participantNorm)).size;
  const bothChamps = distinctChamps >= 2;
  if (!divMatched.length && !bothChamps) continue; // e.g. McGregor's non-title WW bouts vs Diaz

  // Attribution + champion/challenger labels.
  // Defending champion = an established (start < date) reign, preferring the one
  // in this fight's division. Otherwise it's a vacant/crowning bout → winner is champ.
  const pool = divMatched.length ? divMatched : cands;
  const defending =
    pool
      .filter((c) => c.established)
      // undisputed champ outranks interim; otherwise the most recent reign
      .sort(
        (a, b) =>
          Number(a.r.interim) - Number(b.r.interim) || day(b.r.start) - day(a.r.start),
      )[0] || null;

  let hit: Reign;
  let champName: string;
  let challengerName: string;
  if (defending) {
    hit = defending.r;
    champName = defending.participantNorm === n1 ? f['Fighter_1'] : f['Fighter_2'];
    challengerName = defending.participantNorm === n1 ? f['Fighter_2'] : f['Fighter_1'];
  } else {
    // vacant / crowning: credit the winner's reign if present, else first candidate
    const win = pool.find((c) => c.participantNorm === winnerNorm) || pool[0];
    hit = win.r;
    champName = win.participantNorm === n1 ? f['Fighter_1'] : f['Fighter_2'];
    challengerName = win.participantNorm === n1 ? f['Fighter_2'] : f['Fighter_1'];
  }
  hit.matched++;

  // attach odds (date-aware to disambiguate rematches)
  const od = lookupOdds(n1, n2, date);
  let challengerOdds: number | undefined;
  let challengerIsUnderdog: boolean | undefined;
  let oddsOutcome: string | undefined;
  if (od) {
    const challengerIsFav = norm(od.fav) === norm(challengerName);
    challengerOdds = challengerIsFav ? od.favOdds : od.dogOdds;
    challengerIsUnderdog = !challengerIsFav;
    oddsOutcome = od.outcome;
  }

  titleFights.push({
    date,
    division: hit.division,
    champion: champName,
    challenger: challengerName,
    f1: f['Fighter_1'],
    f2: f['Fighter_2'],
    method: f['Method'] || '',
    result1: f['Result_1'] || '',
    interim: hit.interim,
    weightClass: wc,
    challengerOdds,
    challengerIsUnderdog,
    oddsOutcome,
  });
}

titleFights.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

// ---------- case study: +300 challengers ----------
const THRESH = 4.0; // decimal == American +300
const priced = titleFights.filter((tf) => tf.challengerOdds != null);
const plus300 = priced.filter((tf) => (tf.challengerOdds as number) >= THRESH);
const plus300Won = plus300.filter((tf) => tf.oddsOutcome === 'underdog');

// ---------- build the doc ----------
const lines: string[] = [];
const P = (s = '') => lines.push(s);

P('# UFC Title Fights & Champion Reign Ledger');
P('');
P(`_Generated by \`scripts/buildTitleFights.ts\` from \`data/champions.json\` + \`Fights.csv\`._`);
P(`_Champion reigns compiled from UFC title history (knowledge to 2026-01) and validated against our fight data. A "title fight" = a 5-round bout involving a reigning/interim champion within their reign window (±${ledger._meta?.padDays ?? 21}d pad)._`);
P('');
P(`**Title fights identified:** ${titleFights.length}  ·  **with closing odds:** ${priced.length}`);
P('');

// case study box
P('## Case study — challengers priced at +300 or longer');
P('');
P('| Metric | Count |');
P('|---|---|');
P(`| Title fights with closing odds | ${priced.length} |`);
P(`| …challenger at **+300 or longer** (decimal ≥ 4.00) | **${plus300.length}** |`);
P(`| …of those, the +300 challenger **won** | **${plus300Won.length}** |`);
P('');
P('The +300-or-longer challengers (precise title-fight set):');
P('');
P('| Date | Division | Challenger | Odds | Champion | Result |');
P('|---|---|---|---|---|---|');
for (const tf of [...plus300].sort((a, b) => (b.challengerOdds as number) - (a.challengerOdds as number))) {
  const won = tf.oddsOutcome === 'underdog' ? '**WON**' : 'lost';
  P(
    `| ${tf.date} | ${tf.division} | ${tf.challenger} | ${decToAmerican(tf.challengerOdds as number)} | ${tf.champion} | ${won} |`,
  );
}
P('');

// per-division reign timelines
P('## Champion reign timelines');
for (const division of Object.keys(ledger).filter((k) => k !== '_meta')) {
  P('');
  P(`### ${division}`);
  P('');
  P('| Champion | Start | End | Title fights in data | Notes |');
  P('|---|---|---|---|---|');
  for (const r of reigns.filter((r) => r.division === division)) {
    const tag = r.interim ? ' _(interim)_' : '';
    P(
      `| ${r.champion}${tag} | ${r.start} | ${r.end ?? '*current*'} | ${r.matched} | ${r.note ?? ''} |`,
    );
  }
}
P('');

// full title-fight list per division
P('## All identified title fights (chronological, by division)');
for (const division of Object.keys(ledger).filter((k) => k !== '_meta')) {
  const fights = titleFights.filter((t) => t.division === division);
  if (!fights.length) continue;
  P('');
  P(`### ${division} (${fights.length})`);
  P('');
  P('| Date | Bout | Method | Challenger odds |');
  P('|---|---|---|---|');
  for (const tf of fights) {
    const od = tf.challengerOdds
      ? `${decToAmerican(tf.challengerOdds)}${tf.challengerIsUnderdog ? '' : ' (fav)'}`
      : '—';
    const intr = tf.interim ? ' [interim]' : '';
    P(`| ${tf.date} | ${tf.f1} vs ${tf.f2}${intr} | ${tf.method} | ${od} |`);
  }
}
P('');

// validation
P('## Validation — reigns with zero matched fights');
P('');
P('_Expected zeros: a champion who won the belt (that bout is credited to the dethroned champion they beat) and then never defended it before being stripped/vacating — so they hold no defense in the data. An **unexpected** zero (a champion known to have defended) would point to a date error in the ledger. Review these._');
P('');
const zero = reigns.filter((r) => r.matched === 0);
if (!zero.length) P('None — every reign matched at least one title fight in our data. ✅');
else {
  P('| Division | Champion | Start | End | Note |');
  P('|---|---|---|---|---|');
  for (const r of zero)
    P(`| ${r.division} | ${r.champion} | ${r.start} | ${r.end ?? '*current*'} | ${r.note ?? ''} |`);
}
P('');

writeFileSync(join(DATA, 'TITLE_FIGHTS.md'), lines.join('\n'));

// ---------- machine-readable csv ----------
const csvRows = titleFights.map((tf) => ({
  date: tf.date,
  division: tf.division,
  fighter_1: tf.f1,
  fighter_2: tf.f2,
  champion: tf.champion,
  challenger: tf.challenger,
  interim: tf.interim ? 1 : 0,
  method: tf.method,
  result_fighter1: tf.result1,
  challenger_decimal_odds: tf.challengerOdds ?? '',
  challenger_is_underdog: tf.challengerIsUnderdog == null ? '' : tf.challengerIsUnderdog ? 1 : 0,
  odds_outcome: tf.oddsOutcome ?? '',
}));
writeFileSync(join(DATA, 'title_fights.csv'), Papa.unparse(csvRows));

// ---------- console summary ----------
console.log(`Title fights identified: ${titleFights.length}`);
console.log(`  with closing odds:     ${priced.length}`);
console.log(`Challengers at +300 or longer: ${plus300.length}  (won: ${plus300Won.length})`);
console.log(`Reigns with zero matched fights: ${zero.length}`);
if (zero.length)
  for (const r of zero) console.log(`   - ${r.division}: ${r.champion} (${r.start})`);
console.log(`\nWrote data/TITLE_FIGHTS.md and data/title_fights.csv`);
