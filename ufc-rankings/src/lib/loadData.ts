import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import type { Fighter, Fight, Event } from './types';
import { getRegistry } from './registry';

const DATA_DIR = path.join(process.cwd(), 'data');

function readCSV(filename: string): Record<string, string>[] {
  const filePath = path.join(DATA_DIR, filename);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const result = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false, // we'll parse manually for control
  });
  return result.data;
}

function parseNum(val: string | undefined): number {
  if (!val || val === '' || val === 'None' || val === 'null') return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function parseBool(val: string | undefined): boolean {
  return val?.toLowerCase() === 'true';
}

export function loadFighters(): Fighter[] {
  const rows = readCSV('Fighters_Stats.csv');
  return rows.map((r) => ({
    fighterId: r['Fighter_Id'] || '',
    fullName: r['Full Name'] || '',
    nickname: r['Nickname'] || '',
    height: r['Ht.'] || '',
    weight: parseNum(r['Wt.']),
    stance: r['Stance'] || '',
    wins: parseNum(r['W']),
    losses: parseNum(r['L']),
    draws: parseNum(r['D']),
    belt: parseBool(r['Belt']),
    weightClass: r['Weight_Class'] || '',
    gender: r['Gender'] || '',
    knockdowns: parseNum(r['KD']),
    sigStrikeAccuracy: parseNum(r['Sig. Str. %']),
    headPct: parseNum(r['Head_%']),
    bodyPct: parseNum(r['Body_%']),
    legPct: parseNum(r['Leg_%']),
    distancePct: parseNum(r['Distance_%']),
    clinchPct: parseNum(r['Clinch_%']),
    groundPct: parseNum(r['Ground_%']),
    subAttempts: parseNum(r['Sub. Att']),
    controlTime: parseNum(r['Ctrl']),
    takedowns: parseNum(r['TD']),
    koRate: parseNum(r['KO Rate']),
    subRate: parseNum(r['SUB Rate']),
    decRate: parseNum(r['DEC Rate']),
    fightingStyle: r['Fighting Style'] || '',
    strikerMembership: parseNum(r['Striker_Membership']),
    wrestlerMembership: parseNum(r['Wrestler_Membership']),
    hybridMembership: parseNum(r['Hybrid_Membership']),
  }));
}

export function loadEvents(): Map<string, Event> {
  const rows = readCSV('Events.csv');
  const eventMap = new Map<string, Event>();
  for (const r of rows) {
    const eventId = r['Event_Id'] || '';
    eventMap.set(eventId, {
      eventId,
      name: r['Name'] || '',
      date: r['Date'] || '',
      location: r['Location'] || '',
    });
  }
  return eventMap;
}

export function loadFights(eventMap: Map<string, Event>): Fight[] {
  const rows = readCSV('Fights.csv');
  return rows
    .filter((r) => r['Fight_Id'] && r['Fighter_Id_1'] && r['Fighter_Id_2'])
    .map((r) => {
      const eventId = r['Event_Id'] || '';
      const event = eventMap.get(eventId);
      const dateStr = event?.date || '';
      const eventDate = dateStr ? new Date(dateStr) : null;

      return {
        fightId: r['Fight_Id'] || '',
        fighterId1: r['Fighter_Id_1'] || '',
        fighterId2: r['Fighter_Id_2'] || '',
        fighter1Name: r['Fighter_1'] || '',
        fighter2Name: r['Fighter_2'] || '',
        kd1: parseNum(r['KD_1']),
        kd2: parseNum(r['KD_2']),
        str1: parseNum(r['STR_1']),
        str2: parseNum(r['STR_2']),
        td1: parseNum(r['TD_1']),
        td2: parseNum(r['TD_2']),
        sub1: parseNum(r['SUB_1']),
        sub2: parseNum(r['SUB_2']),
        weightClass: r['Weight_Class'] || '',
        method: r['Method'] || '',
        methodDetails: r['Method Details'] || '',
        round: parseNum(r['Round']),
        fightTime: r['Fight_Time'] || '',
        eventId,
        result1: r['Result_1'] || '',
        result2: r['Result_2'] || '',
        timeFormat: r['Time Format'] || '',
        sigStrPct1: parseNum(r['Sig. Str. %_1']),
        sigStrPct2: parseNum(r['Sig. Str. %_2']),
        ctrl1: parseNum(r['Ctrl_1']),
        ctrl2: parseNum(r['Ctrl_2']),
        eventDate,
        source: 'fights' as const,
        hasMetrics: true,
      };
    });
}

// Recency top-up from Sherdog (data/recent_ufc_fights.csv, optional). These are
// UFC fights newer than anything in Fights.csv, used to keep Elo current. They
// carry NO per-fight metrics (hasMetrics:false) — Elo/result/recency only. The
// file is absent until scripts/sherdog/buildRecencyPatch.ts is run, in which
// case this is a no-op and rankings are unchanged.
export function loadRecentPatch(): Fight[] {
  const filePath = path.join(DATA_DIR, 'recent_ufc_fights.csv');
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  const rows = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  }).data;

  return rows
    .filter((r) => r['fighter1_ourId'] && r['fighter2_ourId'] && r['date'])
    .map((r, i) => {
      const dateStr = r['date'] || '';
      const eventDate = dateStr ? new Date(dateStr) : null;
      const zero = 0;
      return {
        fightId: `sherdog-${i}`,
        fighterId1: r['fighter1_ourId'] || '',
        fighterId2: r['fighter2_ourId'] || '',
        fighter1Name: r['fighter1_name'] || '',
        fighter2Name: r['fighter2_name'] || '',
        kd1: zero, kd2: zero, str1: zero, str2: zero, td1: zero, td2: zero,
        sub1: zero, sub2: zero,
        weightClass: r['weightClass'] || '',
        method: r['method'] || '',
        methodDetails: '',
        round: parseNum(r['round']),
        fightTime: '',
        eventId: '',
        result1: r['result1'] || '',
        result2: r['result2'] || '',
        timeFormat: '',
        sigStrPct1: zero, sigStrPct2: zero, ctrl1: zero, ctrl2: zero,
        eventDate,
        source: 'sherdog' as const,
        hasMetrics: false,
      };
    });
}

// Human-confirmed identity merges: secondary Fighter_Id → primary Fighter_Id.
// Built by scripts/registry/buildRegistry.ts review and recorded in
// data/canonical/fighter_merges.csv. Optional → empty map (no-op) if absent.
// These collapse a fighter split across two ids (e.g. Patricio Pitbull/Freire,
// Kai Kamaka III/Kamaka) so the Elo treats them as one person.
function loadFighterMerges(): Map<string, string> {
  const m = new Map<string, string>();
  const fp = path.join(DATA_DIR, 'canonical', 'fighter_merges.csv');
  if (!fs.existsSync(fp)) return m;
  const rows = Papa.parse<Record<string, string>>(fs.readFileSync(fp, 'utf-8'), {
    header: true,
    skipEmptyLines: true,
  }).data;
  for (const r of rows) if (r['secondary_id'] && r['primary_id']) m.set(r['secondary_id'], r['primary_id']);
  return m;
}

// Normalized name + ordered-pair key for cross-source fight de-duplication.
// Strips accents, generational suffixes (Jr/Sr/II/III/IV) and punctuation so
// "Kai Kamaka III" and "Kai Kamaka" collapse to the same key.
function normName(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}
function pairKey(a: string, b: string): string {
  return [normName(a), normName(b)].sort().join('|');
}

export interface LoadedData {
  fighters: Fighter[];
  fights: Fight[];
  events: Map<string, Event>;
  fighterMap: Map<string, Fighter>;
  fighterFights: Map<string, Fight[]>;
}

export function loadAllData(): LoadedData {
  const events = loadEvents();
  const fighters = loadFighters();
  const fights = loadFights(events);

  // Build fighter lookup by ID
  const fighterMap = new Map<string, Fighter>();
  for (const f of fighters) {
    fighterMap.set(f.fighterId, f);
  }

  // CRITICAL: Fighter_Id columns in Fights.csv are unreliable (~88% mismatch).
  // Build a name→ID map from Fighters_Stats.csv (which has correct IDs),
  // then re-resolve fight participant IDs using the fighter name columns.
  const nameToId = new Map<string, string>();
  for (const f of fighters) {
    nameToId.set(f.fullName, f.fighterId);
  }

  // Re-resolve fighter IDs in every fight via the canonical registry (the single
  // identity source — data/canonical/fighter_aliases.csv), falling back to exact
  // Full-Name lookup if the registry isn't built. Proven byte-identical to the
  // prior exact-name + merge resolution (scripts/registry regression test).
  const registry = getRegistry();
  for (const fight of fights) {
    const r1 = registry.resolve(fight.fighter1Name) ?? nameToId.get(fight.fighter1Name);
    const r2 = registry.resolve(fight.fighter2Name) ?? nameToId.get(fight.fighter2Name);
    if (r1) fight.fighterId1 = r1;
    if (r2) fight.fighterId2 = r2;
  }

  // ── Integrate the Sherdog recency top-up (alignment-guarded) ──────────────
  // Contract: these are UFC fights NEWER than Fights.csv. The upstream builder
  // has historically violated that (stale + duplicate rows), so we enforce it
  // at the load boundary instead of trusting the file:
  //   1. DROP duplicates of a primary fight — same fighter pair (suffix-tolerant
  //      name key) within ±7 days. ID keys are unreliable across sources (the
  //      crosswalk id, the Fights.csv id and the roster id for one fighter can
  //      all differ), so we key on normalized names. Catches double-counts like
  //      Kamaka 2026-04-04 that were inflating the Elo sweep.
  //   2. DROP anything older than the primary cutoff minus a grace window — a
  //      "recency" row dated 2014 is a scrape error, not a gap-fill (this also
  //      sweeps up old duplicates like JDM/Emeev 2022).
  //   3. RESOLVE a surviving `sd:` (unmatched) id by UNIQUE name against the
  //      roster (JDM, Aaron Pico, Junior Tafa…) so the new fight attaches to the
  //      real fighter; genuinely-new regional fighters stay `sd:` (~1500 Elo).
  let latestPrimaryMs = 0;
  const primaryPairDates = new Map<string, number[]>();
  for (const f of fights) {
    if (!f.eventDate) continue;
    const t = f.eventDate.getTime();
    if (t > latestPrimaryMs) latestPrimaryMs = t;
    const k = pairKey(f.fighter1Name, f.fighter2Name);
    const arr = primaryPairDates.get(k);
    if (arr) arr.push(t);
    else primaryPairDates.set(k, [t]);
  }
  const DUP_MS = 7 * 24 * 60 * 60 * 1000;        // ±7 days ⇒ same fight
  const recencyFloorMs = latestPrimaryMs - 60 * 24 * 60 * 60 * 1000; // 60-day gap-fill grace

  // Only resolve an `sd:` id by name when that name is unambiguous in the roster.
  const nameCount = new Map<string, number>();
  for (const f of fighters) nameCount.set(f.fullName, (nameCount.get(f.fullName) || 0) + 1);

  let rcAdded = 0, rcDup = 0, rcStale = 0, rcResolved = 0;
  for (const pf of loadRecentPatch()) {
    if (!pf.eventDate) continue;
    const t = pf.eventDate.getTime();
    if (t < recencyFloorMs) { rcStale++; continue; }
    const dates = primaryPairDates.get(pairKey(pf.fighter1Name, pf.fighter2Name));
    if (dates && dates.some((x) => Math.abs(x - t) <= DUP_MS)) { rcDup++; continue; }
    if (pf.fighterId1.startsWith('sd:') && nameCount.get(pf.fighter1Name) === 1) {
      const id = nameToId.get(pf.fighter1Name);
      if (id) { pf.fighterId1 = id; rcResolved++; }
    }
    if (pf.fighterId2.startsWith('sd:') && nameCount.get(pf.fighter2Name) === 1) {
      const id = nameToId.get(pf.fighter2Name);
      if (id) { pf.fighterId2 = id; rcResolved++; }
    }
    fights.push(pf);
    rcAdded++;
  }
  if (rcAdded || rcDup || rcStale) {
    console.log(
      `[loadData] recency patch: +${rcAdded} added, ${rcDup} duplicate-dropped, ` +
      `${rcStale} stale-dropped, ${rcResolved} ids name-resolved`
    );
  }

  // ── Apply confirmed identity merges (collapse split fighters) ─────────────
  // Remap each duplicate id onto its primary, then drop bouts that become
  // identical (same id-pair + date) — the split also inflated the OPPONENT's
  // record, so this de-duplicates that too. Scoped to merged fighters only.
  const merges = loadFighterMerges();
  const mergedAway = new Set(merges.keys());
  if (merges.size) {
    for (const f of fights) {
      if (merges.has(f.fighterId1)) f.fighterId1 = merges.get(f.fighterId1)!;
      if (merges.has(f.fighterId2)) f.fighterId2 = merges.get(f.fighterId2)!;
    }
    const primaries = new Set(merges.values());
    const seen = new Set<string>();
    const kept: Fight[] = [];
    let dropped = 0;
    for (const f of fights) {
      if (primaries.has(f.fighterId1) || primaries.has(f.fighterId2)) {
        const [a, b] = [f.fighterId1, f.fighterId2].sort();
        const key = `${a}|${b}|${f.eventDate ? f.eventDate.toISOString().slice(0, 10) : f.fightId}`;
        if (seen.has(key)) { dropped++; continue; }
        seen.add(key);
      }
      kept.push(f);
    }
    fights.length = 0;
    fights.push(...kept);
    console.log(`[loadData] identity merges: ${merges.size} ids collapsed, ${dropped} duplicate bouts dropped`);
  }

  // Build fight history per fighter using corrected IDs
  const fighterFights = new Map<string, Fight[]>();
  for (const fight of fights) {
    if (!fighterFights.has(fight.fighterId1)) {
      fighterFights.set(fight.fighterId1, []);
    }
    fighterFights.get(fight.fighterId1)!.push(fight);

    if (!fighterFights.has(fight.fighterId2)) {
      fighterFights.set(fight.fighterId2, []);
    }
    fighterFights.get(fight.fighterId2)!.push(fight);
  }

  // Remove merged-away secondary fighters from the roster + lookup so they never
  // appear as phantom (now fight-less) records.
  for (const sid of mergedAway) { fighterMap.delete(sid); fighterFights.delete(sid); }
  const rosterFighters = mergedAway.size ? fighters.filter((f) => !mergedAway.has(f.fighterId)) : fighters;

  return { fighters: rosterFighters, fights, events, fighterMap, fighterFights };
}
