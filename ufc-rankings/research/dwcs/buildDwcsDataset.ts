// ─────────────────────────────────────────────────────────────────────────
//  research/dwcs/buildDwcsDataset.ts — Phase A.1 of docs/plans/DWCS_PLAN.md.
//
//  Builds the two committed DWCS cohort CSVs from sherdog_fights.csv + the
//  engine's own traces (firewalled: reads engine OUTPUT, feeds nothing):
//
//    data/dwcs_bouts.csv    — one row per DWCS bout (~370 after de-duping the
//                             bouts where both corners are on our roster).
//    data/dwcs_fighters.csv — one row per participant (~594), the
//                             survivorship-honest cohort: the ~257 opponents
//                             who never reached the UFC are IN the denominator.
//
//  Operationalizations (fixed in DWCS_PLAN.md before any backtest ran):
//    • DWCS row      := canonicalOrg === "Dana White's Contender Series"
//                       exactly — the loose /Contender/i match that
//                       scripts/sherdog/dwcsCohort.ts used picks up 6 unrelated
//                       regional rows (Contenders East Anglia etc.).
//    • gotContract   := ≥1 traced UFC fight after firstDwcsDate. A
//                       *fought-in-UFC* proxy, not a literal contract record.
//    • reachedTop15  := present (C/1–15) in the CURRENT official snapshot.
//    • eloAt1yr/2yr  := point-in-time rating off the trace (last ratingAfter
//                       before the date) — never the settled rating.
//    • Pre-DWCS record: all sherdog_fights rows dated before firstDwcsDate,
//                       INCLUDING historical-tier orgs (this is a résumé count,
//                       not the pedigree seed, so seedExcludeHistorical does
//                       not apply). Non-roster opponents get records from the
//                       .sherdog_cache profile when present (preDwcsSource=
//                       cache), else denominator-only (preDwcsSource=none —
//                       the coverage probe measured only ~10% cache coverage).
//
//  Refresh: manual re-run before each dwcs_analysis.json export. The Sherdog
//  crawl is dead, so the DWCS bout list is frozen at 2025-10-07; the UFC
//  OUTCOME columns keep moving with the primary data.
//
//  Run: node_modules/.bin/jiti research/dwcs/buildDwcsDataset.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../../src/lib/loadData';
import { buildEloWithTraces, type FightTrace } from '../../src/lib/eloEngine';
import { RANKING_CONFIG } from '../../src/lib/rankingConfig';
import { attributeFeeder, type PreUFCFight } from '../../src/lib/pedigreeSeed';
import { loadPromotionGrades } from '../../src/lib/promotionGrades';
import { fetchOfficialRankings } from '../../src/lib/fetchOfficialRankings';
import { buildNameIndex, resolveNameToId } from '../../src/lib/nameResolver';
import { parseProfile } from '../../scripts/sherdog/parseProfile';

const DWCS_ORG = "Dana White's Contender Series";
const CACHE_DIR = path.join(process.cwd(), 'data', '.sherdog_cache');
const FINISH_RE = /^(KO|TKO|Submission|Technical Submission)/i;

interface SherdogRow {
  ourFighterId: string;
  sherdogId: string;
  fullName: string;
  date: string;
  organisation: string;
  canonicalOrg: string;
  tier: string;
  tierMultiplier: string;
  opponentName: string;
  opponentSherdogId: string;
  result: string; // win | loss | draw | nc
  method: string;
  round: string;
  eventName: string;
}

interface FighterRow {
  sherdogId: string;
  ourId: string;
  name: string;
  appearances: number;
  dwcsRecord: string;
  firstDwcsDate: string;
  bestDwcsResult: 'finishWin' | 'decisionWin' | 'noWin';
  dwcsMethod: string; // compact label of the best DWCS win ("KO R1", "SUB R2", "UD"), '' if no win
  preDwcsWins: number | '';
  preDwcsLosses: number | '';
  preDwcsDraws: number | '';
  preDwcsFinishes: number | ''; // KO/TKO/SUB wins among the pre-DWCS wins
  preDwcsSource: 'crosswalk' | 'cache' | 'none';
  feederOrg: string;
  feederTier: string;
  feederRelFactor: number | '';
  ageAtDwcs: number | '';
  gotContract: 0 | 1;
  ufcFights: number;
  ufcWins: number;
  ufcLosses: number;
  settledEloGain: number | '';
  eloAt1yr: number | '';
  eloAt2yr: number | '';
  reachedTop15: 0 | 1;
}

const cacheFile = (sherdogId: string): string =>
  path.join(CACHE_DIR, `${sherdogId.replace(/[^A-Za-z0-9_-]/g, '_')}.html`);

const r1 = (n: number): number => Math.round(n * 10) / 10;

function ratingAsOf(traces: FightTrace[], isoDate: string): number | null {
  let last: FightTrace | null = null;
  for (const t of traces) {
    if (t.date >= isoDate) break;
    last = t;
  }
  return last ? last.ratingAfter : null;
}

function addYears(iso: string, years: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function ageAt(dobIso: string, atIso: string): number {
  return Math.floor((Date.parse(atIso) - Date.parse(dobIso)) / (365.25 * 86_400_000));
}

async function main(): Promise<void> {
  const csv = fs.readFileSync(path.join(process.cwd(), 'data', 'sherdog_fights.csv'), 'utf8');
  const rows = Papa.parse<SherdogRow>(csv, { header: true, skipEmptyLines: true }).data;

  const dwcs = rows.filter((r) => r.canonicalOrg === DWCS_ORG);
  console.log(`[dwcs] side rows: ${dwcs.length} (expect 379)`);
  const canary = dwcs.filter((r) => /east anglia/i.test(r.canonicalOrg + r.organisation + r.eventName));
  if (canary.length) throw new Error(`canary: ${canary.length} non-DWCS "Contender" rows leaked in`);

  // Roster join: every SUBJECT sherdogId in the file is on our roster.
  const sherdogToOurId = new Map<string, string>();
  const sherdogToName = new Map<string, string>();
  for (const r of rows) {
    if (r.sherdogId && r.ourFighterId) sherdogToOurId.set(r.sherdogId, r.ourFighterId);
    if (r.sherdogId && r.fullName) sherdogToName.set(r.sherdogId, r.fullName);
  }
  const rowsByOurId = new Map<string, SherdogRow[]>();
  for (const r of rows) {
    if (!r.ourFighterId) continue;
    let arr = rowsByOurId.get(r.ourFighterId);
    if (!arr) rowsByOurId.set(r.ourFighterId, (arr = []));
    arr.push(r);
  }

  // Engine output (outcomes only — nothing here feeds back).
  const data = loadAllData();
  const { ratings, history } = buildEloWithTraces(data);
  const tracesAsc = new Map<string, FightTrace[]>();
  for (const [id, traces] of history) {
    tracesAsc.set(id, [...traces].sort((a, b) => (a.date < b.date ? -1 : 1)));
  }

  // Current official top-15 membership (C or 1–15), names resolved to our ids.
  const official = await fetchOfficialRankings();
  const nameIndex = buildNameIndex(data.fighters);
  const rankedIds = new Set<string>();
  for (const list of Object.values(official)) {
    for (const entry of list) {
      const id = resolveNameToId(entry.name, nameIndex, { quiet: true });
      if (id) rankedIds.add(id);
    }
  }
  console.log(`[dwcs] official snapshot: ${rankedIds.size} ranked names resolved`);

  const dob = new Map<string, string>();
  const dobCsv = fs.readFileSync(path.join(process.cwd(), 'data', 'canonical', 'fighter_dob.csv'), 'utf8');
  for (const r of Papa.parse<Record<string, string>>(dobCsv, { header: true, skipEmptyLines: true }).data) {
    if (r.canonical_id && r.dob) dob.set(r.canonical_id, r.dob);
  }

  const grades = loadPromotionGrades();
  const minGrads = RANKING_CONFIG.preUFCPedigree.gradeMinGraduates;

  // ── participants: every sherdogId seen in a DWCS bout, either corner ──
  interface DwcsAppearance {
    date: string;
    result: string; // from THIS participant's perspective
    method: string;
    round: string;
    eventName: string;
  }
  // Sherdog method → compact label ("TKO (Punches)" R1 → "TKO R1",
  // "Decision (Unanimous)" → "UD").
  const compactMethod = (method: string, round: string): string => {
    if (/^KO/i.test(method)) return `KO R${round}`;
    if (/^TKO/i.test(method)) return `TKO R${round}`;
    if (/^(Submission|Technical Submission)/i.test(method)) return `SUB R${round}`;
    if (/unanimous/i.test(method)) return 'UD';
    if (/split/i.test(method)) return 'SD';
    if (/majority/i.test(method)) return 'MD';
    if (/^(Decision|Technical Decision)/i.test(method)) return 'DEC';
    return method;
  };
  const appearances = new Map<string, DwcsAppearance[]>();
  const invert = (res: string): string =>
    res === 'win' ? 'loss' : res === 'loss' ? 'win' : res; // draw/nc symmetric
  for (const r of dwcs) {
    if (r.sherdogId) {
      let a = appearances.get(r.sherdogId);
      if (!a) appearances.set(r.sherdogId, (a = []));
      a.push({ date: r.date, result: r.result, method: r.method, round: r.round, eventName: r.eventName });
    }
    if (r.opponentSherdogId) {
      // Skip if the opponent is a roster subject with their own row for this
      // bout — their subject rows already cover it.
      const oppIsSubject = dwcs.some(
        (o) => o.sherdogId === r.opponentSherdogId && o.opponentSherdogId === r.sherdogId && o.date === r.date
      );
      if (!oppIsSubject) {
        let a = appearances.get(r.opponentSherdogId);
        if (!a) appearances.set(r.opponentSherdogId, (a = []));
        a.push({ date: r.date, result: invert(r.result), method: r.method, round: r.round, eventName: r.eventName });
        if (!sherdogToName.has(r.opponentSherdogId) && r.opponentName) {
          sherdogToName.set(r.opponentSherdogId, r.opponentName);
        }
      }
    }
  }

  let cacheSourced = 0;
  const fighterRows: FighterRow[] = [];
  for (const [sid, apps] of appearances) {
    apps.sort((a, b) => (a.date < b.date ? -1 : 1));
    const firstDwcsDate = apps[0].date;
    const ourId = sherdogToOurId.get(sid) ?? '';

    let w = 0, l = 0, d = 0;
    let best: FighterRow['bestDwcsResult'] = 'noWin';
    let dwcsMethod = '';
    for (const a of apps) {
      if (a.result === 'win') {
        w++;
        if (FINISH_RE.test(a.method)) {
          if (best !== 'finishWin') dwcsMethod = compactMethod(a.method, a.round);
          best = 'finishWin';
        } else if (best !== 'finishWin') {
          if (best !== 'decisionWin') dwcsMethod = compactMethod(a.method, a.round);
          best = 'decisionWin';
        }
      } else if (a.result === 'loss') l++;
      else if (a.result === 'draw') d++;
    }
    const dwcsRecord = d ? `${w}-${l}-${d}` : `${w}-${l}`;

    // Pre-DWCS record + feeder attribution.
    let preW: number | '' = '', preL: number | '' = '', preD: number | '' = '', preF: number | '' = '';
    let source: FighterRow['preDwcsSource'] = 'none';
    let feederOrg = '', feederTier = '';
    let feederRelFactor: number | '' = '';
    let age: number | '' = '';

    if (ourId) {
      source = 'crosswalk';
      const pre = (rowsByOurId.get(ourId) ?? []).filter((r) => r.date && r.date < firstDwcsDate);
      preW = pre.filter((r) => r.result === 'win').length;
      preL = pre.filter((r) => r.result === 'loss').length;
      preD = pre.filter((r) => r.result === 'draw').length;
      preF = pre.filter((r) => r.result === 'win' && FINISH_RE.test(r.method)).length;

      const preFights: PreUFCFight[] = pre.map((r) => ({
        dateMs: Date.parse(r.date),
        canonicalOrg: r.canonicalOrg,
        tier: r.tier,
        mult: parseFloat(r.tierMultiplier) || 0,
        result: r.result as PreUFCFight['result'],
        opponentSherdogId: r.opponentSherdogId || null,
      }));
      const feeder = attributeFeeder(preFights);
      if (feeder) {
        feederOrg = feeder.org;
        feederTier = feeder.tier;
        const g = grades.get(feeder.org);
        if (g && g.graduates >= minGrads) feederRelFactor = g.relFactor;
      }
      const dobIso = dob.get(ourId);
      if (dobIso) age = ageAt(dobIso, firstDwcsDate);
    } else {
      const file = cacheFile(sid);
      if (fs.existsSync(file)) {
        try {
          const prof = parseProfile(fs.readFileSync(file, 'utf8'));
          const pre = prof.fights.filter((f) => f.date && f.date < firstDwcsDate);
          preW = pre.filter((f) => f.result === 'win').length;
          preL = pre.filter((f) => f.result === 'loss').length;
          preD = pre.filter((f) => f.result === 'draw').length;
          preF = pre.filter((f) => f.result === 'win' && FINISH_RE.test(f.method)).length;
          if (prof.birthDate) age = ageAt(prof.birthDate, firstDwcsDate);
          source = 'cache';
          cacheSourced++;
        } catch {
          /* unreadable profile → denominator-only */
        }
      }
    }

    // UFC outcomes (roster only; post-DWCS traces).
    const traces = ourId ? (tracesAsc.get(ourId) ?? []) : [];
    const post = traces.filter((t) => t.date > firstDwcsDate);
    const st = ourId ? ratings.get(ourId) : undefined;
    const at1 = traces.length ? ratingAsOf(traces, addYears(firstDwcsDate, 1)) : null;
    const at2 = traces.length ? ratingAsOf(traces, addYears(firstDwcsDate, 2)) : null;

    fighterRows.push({
      sherdogId: sid,
      ourId,
      name: sherdogToName.get(sid) ?? '',
      appearances: apps.length,
      dwcsRecord,
      firstDwcsDate,
      bestDwcsResult: best,
      dwcsMethod,
      preDwcsWins: preW,
      preDwcsLosses: preL,
      preDwcsDraws: preD,
      preDwcsFinishes: preF,
      preDwcsSource: source,
      feederOrg,
      feederTier,
      feederRelFactor,
      ageAtDwcs: age,
      gotContract: post.length > 0 ? 1 : 0,
      ufcFights: post.length,
      ufcWins: post.filter((t) => t.result === 'W').length,
      ufcLosses: post.filter((t) => t.result === 'L').length,
      settledEloGain: st && st.fights > 0 ? r1(st.rating - RANKING_CONFIG.elo.initialRating) : '',
      eloAt1yr: at1 != null ? r1(at1) : '',
      eloAt2yr: at2 != null ? r1(at2) : '',
      reachedTop15: ourId && rankedIds.has(ourId) ? 1 : 0,
    });
  }
  fighterRows.sort((a, b) => (a.firstDwcsDate < b.firstDwcsDate ? -1 : a.firstDwcsDate > b.firstDwcsDate ? 1 : a.name < b.name ? -1 : 1));

  // ── bouts: de-dupe double-crosswalked bouts on sorted id pair + date ──
  interface BoutRow {
    date: string;
    season: number;
    week: number | '';
    eventName: string;
    sherdogIdA: string;
    sherdogIdB: string;
    ourIdA: string;
    ourIdB: string;
    nameA: string;
    nameB: string;
    winnerSherdogId: string;
    method: string;
    round: string;
  }
  const bouts = new Map<string, BoutRow>();
  let mergedDupes = 0;
  for (const r of dwcs) {
    const [a, b] = [r.sherdogId, r.opponentSherdogId].sort();
    const key = `${a}|${b}|${r.date}`;
    const winner = r.result === 'win' ? r.sherdogId : r.result === 'loss' ? r.opponentSherdogId : '';
    const existing = bouts.get(key);
    if (existing) {
      mergedDupes++;
      // Result symmetry assertion: the two perspectives must agree.
      if (existing.winnerSherdogId !== winner || existing.method !== r.method) {
        throw new Error(`asymmetric duplicate bout ${key}: ${existing.winnerSherdogId}/${existing.method} vs ${winner}/${r.method}`);
      }
      continue;
    }
    bouts.set(key, {
      date: r.date,
      season: parseInt(r.date.slice(0, 4), 10),
      week: (() => {
        // 2017–2018 events are titled "Season 1, Episode 3"; later ones "Week 10".
        const m = r.eventName.match(/(?:week|episode)\s*(\d+)/i);
        return m ? parseInt(m[1], 10) : '';
      })(),
      eventName: r.eventName,
      sherdogIdA: a,
      sherdogIdB: b,
      ourIdA: sherdogToOurId.get(a) ?? '',
      ourIdB: sherdogToOurId.get(b) ?? '',
      nameA: sherdogToName.get(a) ?? '',
      nameB: sherdogToName.get(b) ?? '',
      winnerSherdogId: winner,
      method: r.method,
      round: r.round,
    });
  }
  const boutRows = [...bouts.values()].sort((x, y) => (x.date < y.date ? -1 : 1));

  fs.writeFileSync(path.join(process.cwd(), 'data', 'dwcs_bouts.csv'), Papa.unparse(boutRows) + '\n');
  fs.writeFileSync(path.join(process.cwd(), 'data', 'dwcs_fighters.csv'), Papa.unparse(fighterRows) + '\n');

  // ── report + assertions ──
  const roster = fighterRows.filter((f) => f.ourId);
  const contract = fighterRows.filter((f) => f.gotContract);
  const seasons = new Set(boutRows.map((b) => b.season));
  const res = { win: 0, loss: 0, nc: 0, draw: 0 } as Record<string, number>;
  for (const r of dwcs) res[r.result] = (res[r.result] ?? 0) + 1;

  console.log(`[dwcs] bouts written: ${boutRows.length} (merged ${mergedDupes} double-crosswalked duplicates)`);
  console.log(`[dwcs] participants: ${fighterRows.length} (roster ${roster.length}, cache-sourced ${cacheSourced}, denominator-only ${fighterRows.length - roster.length - cacheSourced})`);
  // 303/66/9/1 re-derived from the raw CSV under the EXACT org match — the
  // loose /Contender/i match reports 309 wins because its 6 false-positive
  // rows are all wins.
  console.log(`[dwcs] subject results: win ${res.win} / loss ${res.loss} / nc ${res.nc} / draw ${res.draw} (expect 303/66/9/1)`);
  console.log(`[dwcs] seasons: ${[...seasons].sort().join(', ')}`);
  console.log(`[dwcs] fought-in-UFC (gotContract): ${contract.length} (${((100 * contract.length) / fighterRows.length).toFixed(1)}%)`);
  console.log(`[dwcs] reachedTop15 (current snapshot): ${fighterRows.filter((f) => f.reachedTop15).length}`);

  if (dwcs.length !== 379) throw new Error(`expected 379 DWCS side rows, got ${dwcs.length}`);
  if (res.win !== 303 || res.loss !== 66 || res.nc !== 9 || res.draw !== 1) {
    throw new Error('subject result distribution drifted from the audited 303/66/9/1');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
