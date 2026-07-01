/**
 * ETL Script: Convert Greco1899/scrape_ufc_stats CSVs into our schema.
 *
 * Source files (from scrape_ufc_stats-main/):
 *   - ufc_fight_results.csv  → fight results (W/L, method, round, time)
 *   - ufc_fight_stats.csv    → per-round fighter stats (sig str, TD, ctrl, etc.)
 *   - ufc_event_details.csv  → event dates and locations
 *   - ufc_fighter_tott.csv   → fighter physical details (height, weight, reach, stance)
 *
 * Output files (into ufc-rankings/data/):
 *   - Fights.csv
 *   - Events.csv
 *   - Fighters_Stats.csv
 *   - Fighters.csv
 */

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import crypto from 'crypto';

const SRC_DIR = path.join(process.cwd(), '..', 'scrape_ufc_stats-main');
const OUT_DIR = path.join(process.cwd(), 'data');

function readCSV(filepath: string): Record<string, string>[] {
  const raw = fs.readFileSync(filepath, 'utf-8');
  return Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
  }).data;
}

function hash(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex').slice(0, 16);
}

// Parse "9 of 38" → { landed: 9, attempted: 38 }
function parseOfStat(val: string): { landed: number; attempted: number } {
  if (!val || val === '---') return { landed: 0, attempted: 0 };
  const parts = val.trim().split(' of ');
  return {
    landed: parseInt(parts[0]) || 0,
    attempted: parseInt(parts[1]) || 0,
  };
}

// Parse "1:44" → seconds
function parseCtrlTime(val: string): number {
  if (!val || val === '---' || val === '0') return 0;
  const parts = val.trim().split(':');
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  return parseInt(val) || 0;
}

// Parse date "May 16, 2026" → "2026-05-16"
function parseDate(val: string): string {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

// Normalize weight class: strip "Bout", "UFC", "Title", tournament prefixes
function normalizeWeightClass(wc: string): string {
  const normalized = wc
    .replace(/\s*Bout\s*$/i, '')
    .replace(/^UFC\s+/i, '')
    .replace(/\s+Title$/i, '')
    .replace(/^Ultimate Fighter.*?Tournament\s+/i, '')
    .trim();

  // Map any remaining variants to canonical names
  const CANONICAL: Record<string, string> = {
    'Heavyweight': 'Heavyweight',
    'Light Heavyweight': 'Light Heavyweight',
    'Middleweight': 'Middleweight',
    'Welterweight': 'Welterweight',
    'Lightweight': 'Lightweight',
    'Featherweight': 'Featherweight',
    'Bantamweight': 'Bantamweight',
    'Flyweight': 'Flyweight',
    "Women's Strawweight": "Women's Strawweight",
    "Women's Flyweight": "Women's Flyweight",
    "Women's Bantamweight": "Women's Bantamweight",
    "Women's Featherweight": "Women's Featherweight",
  };

  return CANONICAL[normalized] || normalized;
}

// Parse "W/L" outcome for fighter 1 and 2
function parseOutcome(outcome: string): { result1: string; result2: string } {
  const parts = outcome.split('/');
  const map: Record<string, string> = { 'W': 'W', 'L': 'L', 'D': 'D', 'NC': 'NC' };
  return {
    result1: map[parts[0]?.trim()] || '',
    result2: map[parts[1]?.trim()] || '',
  };
}

// Parse method to our format
function normalizeMethod(method: string): string {
  const m = method.trim();
  if (m.startsWith('KO/TKO')) return 'KO/TKO';
  if (m.startsWith('Submission')) return 'SUB';
  if (m === 'Decision - Unanimous') return 'U-DEC';
  if (m === 'Decision - Majority') return 'M-DEC';
  if (m === 'Decision - Split') return 'S-DEC';
  if (m.startsWith('Could Not Continue')) return 'CNC';
  if (m.startsWith('Overturned')) return 'OVERTURNED';
  if (m.startsWith('DQ')) return 'DQ';
  return m;
}

// ─── MAIN ETL ────────────────────────────────────────────────

console.log('Reading source files...');
const fightResults = readCSV(path.join(SRC_DIR, 'ufc_fight_results.csv'));
const fightStats = readCSV(path.join(SRC_DIR, 'ufc_fight_stats.csv'));
const eventDetails = readCSV(path.join(SRC_DIR, 'ufc_event_details.csv'));
const fighterTott = readCSV(path.join(SRC_DIR, 'ufc_fighter_tott.csv'));

console.log(`  ${fightResults.length} fight results`);
console.log(`  ${fightStats.length} round-by-round stat rows`);
console.log(`  ${eventDetails.length} events`);
console.log(`  ${fighterTott.length} fighters`);

// ─── 1. EVENTS.CSV ──────────────────────────────────────────

console.log('\nBuilding Events.csv...');
const eventsOut: string[][] = [['Event_Id', 'Name', 'Date', 'Location']];
const eventNameToId = new Map<string, string>();

for (const e of eventDetails) {
  const name = e['EVENT']?.trim() || '';
  const eventId = hash(name);
  eventNameToId.set(name, eventId);
  eventsOut.push([eventId, name, parseDate(e['DATE']), e['LOCATION']?.trim() || '']);
}

fs.writeFileSync(path.join(OUT_DIR, 'Events.csv'), Papa.unparse(eventsOut));
console.log(`  Wrote ${eventsOut.length - 1} events`);

// ─── 2. Aggregate per-round stats to per-fight-per-fighter ──

console.log('\nAggregating round stats to per-fight totals...');

// Key: "EVENT|BOUT|FIGHTER" → aggregated stats
interface AggStats {
  kd: number;
  sigStrLanded: number;
  sigStrAttempted: number;
  totalStrLanded: number;
  totalStrAttempted: number;
  tdLanded: number;
  tdAttempted: number;
  subAtt: number;
  rev: number;
  ctrlSec: number;
  headLanded: number;
  headAttempted: number;
  bodyLanded: number;
  bodyAttempted: number;
  legLanded: number;
  legAttempted: number;
  distLanded: number;
  distAttempted: number;
  clinchLanded: number;
  clinchAttempted: number;
  groundLanded: number;
  groundAttempted: number;
}

const fighterFightStats = new Map<string, AggStats>();

for (const row of fightStats) {
  const event = row['EVENT']?.trim() || '';
  const bout = row['BOUT']?.trim() || '';
  const fighter = row['FIGHTER']?.trim() || '';
  const key = `${event}|${bout}|${fighter}`;

  if (!fighterFightStats.has(key)) {
    fighterFightStats.set(key, {
      kd: 0, sigStrLanded: 0, sigStrAttempted: 0, totalStrLanded: 0, totalStrAttempted: 0,
      tdLanded: 0, tdAttempted: 0, subAtt: 0, rev: 0, ctrlSec: 0,
      headLanded: 0, headAttempted: 0, bodyLanded: 0, bodyAttempted: 0,
      legLanded: 0, legAttempted: 0, distLanded: 0, distAttempted: 0,
      clinchLanded: 0, clinchAttempted: 0, groundLanded: 0, groundAttempted: 0,
    });
  }

  const agg = fighterFightStats.get(key)!;
  agg.kd += parseInt(row['KD']) || 0;
  const sigStr = parseOfStat(row['SIG.STR.']);
  agg.sigStrLanded += sigStr.landed;
  agg.sigStrAttempted += sigStr.attempted;
  const totalStr = parseOfStat(row['TOTAL STR.']);
  agg.totalStrLanded += totalStr.landed;
  agg.totalStrAttempted += totalStr.attempted;
  const td = parseOfStat(row['TD']);
  agg.tdLanded += td.landed;
  agg.tdAttempted += td.attempted;
  agg.subAtt += parseInt(row['SUB.ATT']) || 0;
  agg.rev += parseInt(row['REV.']) || 0;
  agg.ctrlSec += parseCtrlTime(row['CTRL']);
  const head = parseOfStat(row['HEAD']);
  agg.headLanded += head.landed;
  agg.headAttempted += head.attempted;
  const body = parseOfStat(row['BODY']);
  agg.bodyLanded += body.landed;
  agg.bodyAttempted += body.attempted;
  const leg = parseOfStat(row['LEG']);
  agg.legLanded += leg.landed;
  agg.legAttempted += leg.attempted;
  const dist = parseOfStat(row['DISTANCE']);
  agg.distLanded += dist.landed;
  agg.distAttempted += dist.attempted;
  const clinch = parseOfStat(row['CLINCH']);
  agg.clinchLanded += clinch.landed;
  agg.clinchAttempted += clinch.attempted;
  const ground = parseOfStat(row['GROUND']);
  agg.groundLanded += ground.landed;
  agg.groundAttempted += ground.attempted;
}

console.log(`  Aggregated stats for ${fighterFightStats.size} fighter-fight combinations`);

// ─── 3. FIGHTS.CSV ──────────────────────────────────────────

console.log('\nBuilding Fights.csv...');
const fightsHeader = [
  'Fight_Id', 'Fighter_Id_1', 'Fighter_Id_2', 'Fighter_1', 'Fighter_2',
  'KD_1', 'KD_2', 'STR_1', 'STR_2', 'TD_1', 'TD_2', 'SUB_1', 'SUB_2',
  'Weight_Class', 'Method', 'Round', 'Fight_Time', 'Event_Id',
  'Result_1', 'Result_2', 'Time Format', 'Referee', 'Method Details',
  'Sig. Str. %_1', 'Sig. Str. %_2', 'Sub. Att_1', 'Sub. Att_2',
  'Rev._1', 'Rev._2', 'Ctrl_1', 'Ctrl_2',
  'Head_%_1', 'Head_%_2', 'Body_%_1', 'Body_%_2', 'Leg_%_1', 'Leg_%_2',
  'Distance_%_1', 'Distance_%_2', 'Clinch_%_1', 'Clinch_%_2',
  'Ground_%_1', 'Ground_%_2',
  'Total Str._%_1', 'Total Str._%_2', 'Sig. Str._%_1', 'Sig. Str._%_2',
];
const fightsOut: string[][] = [fightsHeader];

// Track all fighter names for Fighters_Stats generation
const allFighterNames = new Set<string>();
const fighterWins = new Map<string, number>();
const fighterLosses = new Map<string, number>();
const fighterDraws = new Map<string, number>();
// Track all weight class appearances per fighter with dates for primary division assignment
const fighterWCHistory = new Map<string, { wc: string; date: string }[]>();

function pctSafe(landed: number, attempted: number): number {
  return attempted > 0 ? Math.round((landed / attempted) * 100) / 100 : 0;
}

for (const row of fightResults) {
  const eventName = row['EVENT']?.trim() || '';
  const bout = row['BOUT']?.trim() || '';
  const outcome = row['OUTCOME']?.trim() || '';
  const weightClass = normalizeWeightClass(row['WEIGHTCLASS']?.trim() || '');
  const method = normalizeMethod(row['METHOD']?.trim() || '');
  const methodDetails = row['DETAILS']?.trim() || '';
  const round = row['ROUND']?.trim() || '';
  const time = row['TIME']?.trim() || '';
  const timeFormat = row['TIME FORMAT']?.trim() || '';
  const referee = row['REFEREE']?.trim() || '';

  // Parse fighter names from bout: "Fighter A vs. Fighter B"
  const vsMatch = bout.match(/^(.+?)\s+vs\.\s+(.+)$/);
  if (!vsMatch) continue;
  const fighter1 = vsMatch[1].trim();
  const fighter2 = vsMatch[2].trim();

  const fighterId1 = hash(fighter1);
  const fighterId2 = hash(fighter2);
  const fightId = hash(`${eventName}|${bout}`);
  const eventId = eventNameToId.get(eventName) || hash(eventName);

  const { result1, result2 } = parseOutcome(outcome);

  // Track fighter records
  allFighterNames.add(fighter1);
  allFighterNames.add(fighter2);

  if (result1 === 'W') fighterWins.set(fighter1, (fighterWins.get(fighter1) || 0) + 1);
  if (result1 === 'L') fighterLosses.set(fighter1, (fighterLosses.get(fighter1) || 0) + 1);
  if (result1 === 'D') fighterDraws.set(fighter1, (fighterDraws.get(fighter1) || 0) + 1);
  if (result2 === 'W') fighterWins.set(fighter2, (fighterWins.get(fighter2) || 0) + 1);
  if (result2 === 'L') fighterLosses.set(fighter2, (fighterLosses.get(fighter2) || 0) + 1);
  if (result2 === 'D') fighterDraws.set(fighter2, (fighterDraws.get(fighter2) || 0) + 1);

  // Track most recent weight class per fighter
  const eventDate = (() => {
    const evt = eventDetails.find(e => e['EVENT']?.trim() === eventName);
    return evt ? parseDate(evt['DATE']) : '';
  })();

  // Track weight class history (skip Catch Weight — not a real division)
  if (weightClass !== 'Catch Weight' && weightClass !== 'Open Weight') {
    if (!fighterWCHistory.has(fighter1)) fighterWCHistory.set(fighter1, []);
    fighterWCHistory.get(fighter1)!.push({ wc: weightClass, date: eventDate });
    if (!fighterWCHistory.has(fighter2)) fighterWCHistory.set(fighter2, []);
    fighterWCHistory.get(fighter2)!.push({ wc: weightClass, date: eventDate });
  }

  // Get aggregated stats for each fighter
  const stats1 = fighterFightStats.get(`${eventName}|${bout}|${fighter1}`);
  const stats2 = fighterFightStats.get(`${eventName}|${bout}|${fighter2}`);

  const s1 = stats1 || {} as Partial<AggStats>;
  const s2 = stats2 || {} as Partial<AggStats>;

  fightsOut.push([
    fightId, fighterId1, fighterId2, fighter1, fighter2,
    String(s1.kd || 0), String(s2.kd || 0),
    String(s1.sigStrLanded || 0), String(s2.sigStrLanded || 0),
    String(s1.tdLanded || 0), String(s2.tdLanded || 0),
    String(s1.subAtt || 0), String(s2.subAtt || 0),
    weightClass, method, round, time, eventId,
    result1, result2, timeFormat, referee, methodDetails,
    String(pctSafe(s1.sigStrLanded || 0, s1.sigStrAttempted || 0)),
    String(pctSafe(s2.sigStrLanded || 0, s2.sigStrAttempted || 0)),
    String(s1.subAtt || 0), String(s2.subAtt || 0),
    String(s1.rev || 0), String(s2.rev || 0),
    String(s1.ctrlSec || 0), String(s2.ctrlSec || 0),
    String(pctSafe(s1.headLanded || 0, s1.headAttempted || 0)),
    String(pctSafe(s2.headLanded || 0, s2.headAttempted || 0)),
    String(pctSafe(s1.bodyLanded || 0, s1.bodyAttempted || 0)),
    String(pctSafe(s2.bodyLanded || 0, s2.bodyAttempted || 0)),
    String(pctSafe(s1.legLanded || 0, s1.legAttempted || 0)),
    String(pctSafe(s2.legLanded || 0, s2.legAttempted || 0)),
    String(pctSafe(s1.distLanded || 0, s1.distAttempted || 0)),
    String(pctSafe(s2.distLanded || 0, s2.distAttempted || 0)),
    String(pctSafe(s1.clinchLanded || 0, s1.clinchAttempted || 0)),
    String(pctSafe(s2.clinchLanded || 0, s2.clinchAttempted || 0)),
    String(pctSafe(s1.groundLanded || 0, s1.groundAttempted || 0)),
    String(pctSafe(s2.groundLanded || 0, s2.groundAttempted || 0)),
    String(pctSafe(s1.totalStrLanded || 0, s1.totalStrAttempted || 0)),
    String(pctSafe(s2.totalStrLanded || 0, s2.totalStrAttempted || 0)),
    String(pctSafe(s1.sigStrLanded || 0, s1.sigStrAttempted || 0)),
    String(pctSafe(s2.sigStrLanded || 0, s2.sigStrAttempted || 0)),
  ]);
}

fs.writeFileSync(path.join(OUT_DIR, 'Fights.csv'), Papa.unparse(fightsOut));
console.log(`  Wrote ${fightsOut.length - 1} fights`);

// ─── 4. FIGHTERS_STATS.CSV ──────────────────────────────────

// Determine a fighter's primary weight class:
// 1. Most frequent division in last 2 years
// 2. Fallback: most frequent overall
// 3. Fallback: most recent fight
function getPrimaryWeightClass(history: { wc: string; date: string }[]): string {
  if (history.length === 0) return '';

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 2);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // Try recent fights first
  const recent = history.filter(h => h.date >= cutoffStr);
  const pool = recent.length > 0 ? recent : history;

  // Count frequency
  const counts = new Map<string, number>();
  for (const h of pool) {
    counts.set(h.wc, (counts.get(h.wc) || 0) + 1);
  }

  // Return most frequent
  let best = '';
  let bestCount = 0;
  for (const [wc, count] of counts) {
    if (count > bestCount) {
      best = wc;
      bestCount = count;
    }
  }
  return best;
}

console.log('\nBuilding Fighters_Stats.csv...');

// Build fighter physical data lookup from ufc_fighter_tott.csv
const fighterPhysicals = new Map<string, { height: string; weight: string; reach: string; stance: string }>();
for (const row of fighterTott) {
  const name = row['FIGHTER']?.trim() || '';
  fighterPhysicals.set(name, {
    height: row['HEIGHT']?.trim() || '',
    weight: row['WEIGHT']?.replace('lbs.', '').trim() || '',
    reach: row['REACH']?.replace('"', '').trim() || '',
    stance: row['STANCE']?.trim() || '',
  });
}

const fighterStatsHeader = [
  'Fighter_Id', 'Full Name', 'Nickname', 'Ht.', 'Wt.', 'Stance',
  'W', 'L', 'D', 'Belt', 'Weight_Class', 'Gender',
  'KD', 'Sig. Str. %', 'TD', 'Sub. Att', 'Ctrl',
  'Head_%', 'Body_%', 'Leg_%', 'Distance_%', 'Clinch_%', 'Ground_%',
  'KO Rate', 'SUB Rate', 'DEC Rate', 'Fighting Style',
  'Striker_Membership', 'Wrestler_Membership', 'Hybrid_Membership',
];
const fighterStatsOut: string[][] = [fighterStatsHeader];

// Determine gender from weight class
function getGender(wc: string): string {
  return wc.toLowerCase().includes("women") ? 'Female' : 'Male';
}

for (const name of allFighterNames) {
  const fighterId = hash(name);
  const wins = fighterWins.get(name) || 0;
  const losses = fighterLosses.get(name) || 0;
  const draws = fighterDraws.get(name) || 0;
  // Assign primary weight class: most frequent in last 2 years, fallback to most frequent overall
  const wcHistory = fighterWCHistory.get(name) || [];
  const weightClass = getPrimaryWeightClass(wcHistory);
  const phys = fighterPhysicals.get(name);
  const totalFights = wins + losses + draws;

  // Compute aggregate stats from all fights
  let totalKD = 0, totalSigStrL = 0, totalSigStrA = 0;
  let totalTD = 0, totalSubAtt = 0, totalCtrl = 0;
  let totalHeadL = 0, totalHeadA = 0, totalBodyL = 0, totalBodyA = 0;
  let totalLegL = 0, totalLegA = 0;
  let totalDistL = 0, totalDistA = 0, totalClinchL = 0, totalClinchA = 0;
  let totalGroundL = 0, totalGroundA = 0;
  let koWins = 0, subWins = 0, decWins = 0;

  // Scan fight results for this fighter's win methods
  for (const fr of fightResults) {
    const bout = fr['BOUT']?.trim() || '';
    const vsMatch = bout.match(/^(.+?)\s+vs\.\s+(.+)$/);
    if (!vsMatch) continue;
    const f1 = vsMatch[1].trim();
    const f2 = vsMatch[2].trim();
    const outcome = fr['OUTCOME']?.trim() || '';
    const method = fr['METHOD']?.trim() || '';

    let isWin = false;
    if (f1 === name && outcome.startsWith('W')) isWin = true;
    if (f2 === name && outcome.endsWith('W')) isWin = true;

    if (isWin) {
      if (method.startsWith('KO/TKO')) koWins++;
      else if (method.startsWith('Submission')) subWins++;
      else if (method.startsWith('Decision')) decWins++;
    }
  }

  // Aggregate round stats
  for (const [key, stats] of fighterFightStats) {
    const parts = key.split('|');
    if (parts[2] === name) {
      totalKD += stats.kd;
      totalSigStrL += stats.sigStrLanded;
      totalSigStrA += stats.sigStrAttempted;
      totalTD += stats.tdLanded;
      totalSubAtt += stats.subAtt;
      totalCtrl += stats.ctrlSec;
      totalHeadL += stats.headLanded;
      totalHeadA += stats.headAttempted;
      totalBodyL += stats.bodyLanded;
      totalBodyA += stats.bodyAttempted;
      totalLegL += stats.legLanded;
      totalLegA += stats.legAttempted;
      totalDistL += stats.distLanded;
      totalDistA += stats.distAttempted;
      totalClinchL += stats.clinchLanded;
      totalClinchA += stats.clinchAttempted;
      totalGroundL += stats.groundLanded;
      totalGroundA += stats.groundAttempted;
    }
  }

  const koRate = wins > 0 ? Math.round((koWins / wins) * 100) / 100 : 0;
  const subRate = wins > 0 ? Math.round((subWins / wins) * 100) / 100 : 0;
  const decRate = wins > 0 ? Math.round((decWins / wins) * 100) / 100 : 0;

  fighterStatsOut.push([
    fighterId, name, '', // nickname not available in this dataset
    phys?.height || '', phys?.weight || '', phys?.stance || '',
    String(wins), String(losses), String(draws), 'False',
    weightClass, getGender(weightClass),
    String(totalFights > 0 ? Math.round(totalKD / totalFights * 100) / 100 : 0),
    String(pctSafe(totalSigStrL, totalSigStrA)),
    String(totalFights > 0 ? Math.round(totalTD / totalFights * 100) / 100 : 0),
    String(totalSubAtt),
    String(totalCtrl),
    String(pctSafe(totalHeadL, totalHeadA)),
    String(pctSafe(totalBodyL, totalBodyA)),
    String(pctSafe(totalLegL, totalLegA)),
    String(pctSafe(totalDistL, totalDistA)),
    String(pctSafe(totalClinchL, totalClinchA)),
    String(pctSafe(totalGroundL, totalGroundA)),
    String(koRate), String(subRate), String(decRate),
    '', '0', '0', '0', // style memberships not in this dataset
  ]);
}

fs.writeFileSync(path.join(OUT_DIR, 'Fighters_Stats.csv'), Papa.unparse(fighterStatsOut));
console.log(`  Wrote ${fighterStatsOut.length - 1} fighters`);

// ─── 5. FIGHTERS.CSV (physical details) ─────────────────────

console.log('\nBuilding Fighters.csv...');
const fightersHeader = ['Fighter_Id', 'Full Name', 'Ht.', 'Wt.', 'Reach', 'Stance'];
const fightersOut: string[][] = [fightersHeader];

for (const name of allFighterNames) {
  const phys = fighterPhysicals.get(name);
  fightersOut.push([
    hash(name), name,
    phys?.height || '', phys?.weight || '', phys?.reach || '', phys?.stance || '',
  ]);
}

fs.writeFileSync(path.join(OUT_DIR, 'Fighters.csv'), Papa.unparse(fightersOut));
console.log(`  Wrote ${fightersOut.length - 1} fighters`);

console.log('\n✅ ETL complete! New data files written to data/');
