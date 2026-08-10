// ─────────────────────────────────────────────────────────────────────────
//  scripts/diagChampionCadence.ts — do champions fight less often than
//  everyone else, and is the inactivity regression costing them rank?
//
//  This exists because "the UFC spaces champions out, so the layoff decay
//  unfairly sinks them" is an intuition that recurs and sounds obviously true.
//  It is measurable, and the measurement disagrees. Re-run it before tuning
//  elo.inactivityGraceMonths / inactivityRetentionPerYear / *Steep on a
//  champion-fairness argument.
//
//  Two questions, two sections:
//    1. CADENCE  — inter-fight gap for a champion entering a title defence, vs
//       the challenger, vs every other fight. Champion identity per bout comes
//       from data/title_fights.csv's `champion` column (interim bouts dropped),
//       so this is historical, not just the current board.
//    2. COST     — for each current champion, what the sweep's final regression
//       to "today" actually takes off, and whether the champion floor is doing
//       the work of putting them on top.
//
//  Run: node_modules/.bin/jiti scripts/diagChampionCadence.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../src/lib/loadData';
import { buildEloRatings, getFighterHistory, getElo, regressForInactivity } from '../src/lib/eloEngine';
import { generateDivisionRankings } from '../src/lib/scoringEngine';
import { buildNameIndex, resolveNameToId } from '../src/lib/nameResolver';
import { RANKING_CONFIG } from '../src/lib/rankingConfig';
import { rankingsNow } from '../src/lib/clock';
import { ALL_DIVISIONS } from '../src/lib/types';

const E = RANKING_CONFIG.elo;
const MO = 1000 * 60 * 60 * 24 * 30.44;
const MODERN_FROM = '2019-01-01';

const quantile = (a: number[], p: number): number => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

function line(label: string, a: number[]): void {
  if (!a.length) { console.log(`  ${label.padEnd(36)} n=0`); return; }
  const mean = a.reduce((s, v) => s + v, 0) / a.length;
  console.log(
    `  ${label.padEnd(36)} n=${String(a.length).padStart(5)}  ` +
    `p25=${quantile(a, 0.25).toFixed(1)}  median=${quantile(a, 0.5).toFixed(1)}  ` +
    `p75=${quantile(a, 0.75).toFixed(1)}  p90=${quantile(a, 0.9).toFixed(1)}  mean=${mean.toFixed(1)}`
  );
}

async function main(): Promise<void> {
  const data = loadAllData();
  const eloMap = buildEloRatings(data);
  const nameIndex = buildNameIndex(data.fighters);

  // ── Every fighter's inter-fight gap, keyed by (fighter, fight date).
  const gapBefore = new Map<string, number>();
  for (const f of data.fighters) {
    const asc = [...getFighterHistory(data, f.fighterId)].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < asc.length; i++) {
      const g = (new Date(asc[i].date).getTime() - new Date(asc[i - 1].date).getTime()) / MO;
      gapBefore.set(`${f.fighterId}#${asc[i].date.slice(0, 10)}`, g);
    }
  }

  const titleRows = Papa.parse<Record<string, string>>(
    fs.readFileSync(path.join(process.cwd(), 'data', 'title_fights.csv'), 'utf-8'),
    { header: true, skipEmptyLines: true }
  ).data.filter((r) => r['interim'] !== '1');

  // Mark every (fighter, date) that is a title bout so the "everything else"
  // bucket is genuinely disjoint rather than double-counting title fights.
  const titleKeys = new Set<string>();
  const collect = (who: 'champion' | 'challenger', since: string): number[] => {
    const out: number[] = [];
    for (const r of titleRows) {
      const id = resolveNameToId(r[who], nameIndex, { quiet: true });
      if (!id) continue;
      titleKeys.add(`${id}#${r['date']}`);
      if (r['date'] < since) continue;
      const g = gapBefore.get(`${id}#${r['date']}`);
      if (g != null) out.push(g);
    }
    return out;
  };
  // Two passes: the first fills titleKeys for BOTH roles across all eras, so the
  // "other" bucket below can exclude them regardless of the era filter.
  collect('champion', '9999'); collect('challenger', '9999');

  const other = (since: string): number[] => {
    const out: number[] = [];
    for (const [k, g] of gapBefore) {
      if (titleKeys.has(k)) continue;
      if (k.slice(k.indexOf('#') + 1) < since) continue;
      out.push(g);
    }
    return out;
  };

  for (const [era, since] of [['all eras', '0000'], [`${MODERN_FROM.slice(0, 4)}+`, MODERN_FROM]] as [string, string][]) {
    console.log(`\n=== 1. INTER-FIGHT GAP in months — ${era} ===`);
    const champ = collect('champion', since);
    line('CHAMPION entering a title defence', champ);
    line('CHALLENGER entering a title fight', collect('challenger', since));
    line('every other fight', other(since));

    const pct = (a: number[], lo: number, hi: number) =>
      `${((a.filter((g) => g > lo && g <= hi).length / (a.length || 1)) * 100).toFixed(0)}%`.padStart(4);
    console.log(
      `  → champion gaps vs the decay bands (grace ${E.inactivityGraceMonths}mo, elbow ${E.fullInactivityMonths}mo): ` +
      `free ${pct(champ, -1, E.inactivityGraceMonths)}  ` +
      `gentle ${pct(champ, E.inactivityGraceMonths, E.fullInactivityMonths)}  ` +
      `steep ${pct(champ, E.fullInactivityMonths, 1e9)}`
    );
  }

  // ── 2. What the decay actually costs each current champion, and who needs
  //      the floor. NOTE: a champion below #1 on finalRating is NOT necessarily
  //      floored — the H2H leapfrog reorders without touching finalRating, and
  //      that is an in-cage result, not a safety net. Only the CHAMP FLOOR log
  //      line means the floor did the work.
  console.log('\n=== 2. CURRENT CHAMPIONS: cost of the final regression to today ===\n');
  const now = rankingsNow();
  let material = 0;

  for (const div of ALL_DIVISIONS) {
    const ranked = await generateDivisionRankings(div, data);
    const champ = ranked.fighters.find((f) => f.officialRank === 'C');
    if (!champ) { console.log(`  ${div.padEnd(22)} — no champion resolved`); continue; }

    const st = getElo(eloMap, champ.fighterId);
    const last = getFighterHistory(data, champ.fighterId)[0];
    const idle = last ? (now.getTime() - new Date(last.date).getTime()) / MO : 0;
    const cost = regressForInactivity(st.ratingAtLastFight, idle, E) - st.ratingAtLastFight;
    if (cost <= -10) material++;

    const byRating = [...ranked.fighters].sort((a, b) => b.finalRating - a.finalRating);
    const meritRank = byRating.findIndex((f) => f.fighterId === champ.fighterId) + 1;
    const deficit = meritRank > 1 ? byRating[0].finalRating - champ.finalRating : 0;

    console.log(
      `  ${div.padEnd(22)} ${champ.fullName.padEnd(22)} idle ${idle.toFixed(1).padStart(5)}mo  ` +
      `decay ${cost.toFixed(1).padStart(6)}  shown #${String(champ.rank).padStart(2)}  ` +
      `by rating #${String(meritRank).padStart(2)}` +
      (meritRank > 1
        ? `  (behind ${byRating[0].fullName} by ${deficit.toFixed(1)}; ` +
          `un-decaying the champ ${cost > -deficit ? 'still leaves them short' : 'WOULD flip it'})`
        : '')
    );
  }
  console.log(`\n  Champions losing >10 Elo to inactivity: ${material} / ${ALL_DIVISIONS.length}`);
  console.log('  Grep the run above for "CHAMP FLOOR" — that, not the by-rating column, is the floor doing work.\n');
}

main();
