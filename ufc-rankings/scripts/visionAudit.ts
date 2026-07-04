/**
 * VISION AUDIT (offline, read-only) — does each RANKED fighter's placement obey
 * the three core principles in CLAUDE.md?
 *   1. Opponent quality IS the rating (SoS baked in) — a top rank should rest on
 *      a tough recent slate, not a pile of soft wins.
 *   2. Raw win COUNT never drives magnitude.
 *   3. Recency dominates — losses count, layoffs fade.
 *
 * For every top-N fighter per division it prints last-5 record, recent SoS (avg
 * opp Elo of last 5), the quality of who they LOST to, months idle, and flags:
 *   FORM   rank ≤6 but ≤.500-ish recent record (2+ L in last 5)
 *   SOFT   rank ≤8 but recent SoS well below the division's top-12 median
 *          (rank leaning on soft opposition — principle 1/2 stress)
 *   BADLOSS a last-5 loss to an opponent rated well BELOW them (a real red flag —
 *          losing down, not SoS-protected)
 *   STALE  rank ≤8 but idle > 24 months (principle 3 stress; floor may be holding)
 * A fighter with FORM but whose losses were all to HIGHER-rated opponents is
 * SoS-protected (vision-consistent) — noted as "(losses↑)".
 */
import { loadAllData } from '../src/lib/loadData';
import { buildEloRatings, getFighterHistory } from '../src/lib/eloEngine';
import { generateDivisionRankings } from '../src/lib/scoringEngine';
import { ALL_DIVISIONS } from '../src/lib/types';

const TOPN = 12;

async function main() {
  const data = loadAllData();
  const elo = buildEloRatings(data);
  const now = Date.now();
  const monthsSince = (iso: string) => (now - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 30.44);

  for (const div of ALL_DIVISIONS) {
    const r = await generateDivisionRankings(div, data);
    const rows = r.fighters.slice(0, TOPN).map((f) => {
      const own = (elo.get(f.fighterId)?.rating ?? f.eloRating) as number;
      const h = getFighterHistory(data, f.fighterId).slice(0, 5);
      let w = 0, l = 0;
      const lossElos: number[] = [];
      const oppElos: number[] = [];
      for (const x of h) {
        oppElos.push(x.opponentRating);
        if (x.result === 'W') w++;
        else if (x.result === 'L') { l++; lossElos.push(x.opponentRating); }
      }
      const recSoS = oppElos.length ? oppElos.reduce((a, b) => a + b, 0) / oppElos.length : 0;
      const idle = h.length ? monthsSince(h[0].date) : 999;
      // A loss is "down" if the opponent was rated notably below the fighter.
      const badLoss = lossElos.some((e) => e < own - 40);
      const lossesUp = lossElos.length > 0 && lossElos.every((e) => e >= own - 5);
      return { f, own, w, l, recSoS, idle, badLoss, lossesUp, n: h.length };
    });
    const med = [...rows.map((x) => x.recSoS)].sort((a, b) => a - b)[Math.floor(rows.length / 2)];

    console.log(`\n═══ ${div}  (top-12 median recent-SoS ${med.toFixed(0)})`);
    for (const x of rows) {
      const rank = x.f.rank;
      const flags: string[] = [];
      if (rank <= 6 && x.l >= 2) flags.push(x.lossesUp ? 'FORM(losses↑)' : 'FORM');
      if (rank <= 8 && x.recSoS < med - 25) flags.push('SOFT');
      if (x.badLoss) flags.push('BADLOSS');
      if (rank <= 8 && x.idle > 24) flags.push('STALE');
      const champ = x.f.officialRank === 'C' ? '(C)' : '';
      const tag = flags.length ? '  ⚑ ' + flags.join(' ') : '';
      console.log(
        `  #${String(rank).padStart(2)} ${x.f.fullName.padEnd(22)}${champ.padEnd(4)} ` +
        `L5 ${x.w}-${x.l}  recSoS ${x.recSoS.toFixed(0)}  own ${x.own.toFixed(0)}  idle ${x.idle.toFixed(0)}mo${tag}`
      );
    }
  }
}
main().catch(console.error);
