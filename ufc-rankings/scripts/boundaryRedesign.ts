/**
 * BOUNDARY REDESIGN PROBE (offline, read-only) — does removing the discrete
 * 5yr boundary cliff in favour of a CONTINUOUS inactivity decay keep recency
 * dominant WITHOUT floating aged/idle veterans to the top?
 *
 * For each candidate config it rebuilds Elo on the uncached buildEloWithTraces
 * path (temporarily mutating RANKING_CONFIG.elo, restored at the end — never the
 * app) and reports:
 *   • rating SPREAD (best / p95 / median / min of the eligible pool)
 *   • log-loss-optimal win-prob DENOMINATOR (symmetric, point-in-time) — so we
 *     can re-anchor winProbDenominator in the same pass
 *   • TOP-15 P4P with each fighter's UFC debut year + last-fight year + years
 *     idle → the "do old vets float?" acceptance check the user asked for.
 *
 * Cliff-free is guaranteed for every boundary-off variant (no synchronized wall);
 * this run is purely about ranking QUALITY at each decay rate.
 */
import { loadAllData } from '../src/lib/loadData';
import { buildEloWithTraces, type FightTrace } from '../src/lib/eloEngine';
import { RANKING_CONFIG } from '../src/lib/rankingConfig';
import type { LoadedData } from '../src/lib/loadData';

interface Cfg { label: string; maxFightAgeYears: number | null; boundary: number; grace: number; retention: number; }

const CONFIGS: Cfg[] = [
  { label: 'PROD (boundary β=0.5, grace12, ret.92)', maxFightAgeYears: 5, boundary: 0.5, grace: 12, retention: 0.92 },
  { label: 'A0 remove-only (no boundary, grace12, ret.92)', maxFightAgeYears: null, boundary: 0.5, grace: 12, retention: 0.92 },
  { label: 'A1 continuous gentle (grace6, ret.90)', maxFightAgeYears: null, boundary: 0.5, grace: 6, retention: 0.90 },
  { label: 'A2 continuous mid   (grace3, ret.88)', maxFightAgeYears: null, boundary: 0.5, grace: 3, retention: 0.88 },
  { label: 'A3 continuous steep (grace0, ret.86)', maxFightAgeYears: null, boundary: 0.5, grace: 0, retention: 0.86 },
  { label: 'A4 continuous steep (grace0, ret.83)', maxFightAgeYears: null, boundary: 0.5, grace: 0, retention: 0.83 },
];

function logistic(gap: number, D: number) { return 1 / (1 + Math.pow(10, gap / D)); }

function buildSamples(data: LoadedData, history: Map<string, FightTrace[]>) {
  const s: { g: number; o: number }[] = [];
  for (const f of data.fights) {
    const dec = (f.result1 === 'W' && f.result2 === 'L') || (f.result1 === 'L' && f.result2 === 'W');
    if (!dec) continue;
    const t = history.get(f.fighterId1)?.find((x) => x.fightId === f.fightId);
    if (!t || t.ratingBefore <= 0 || t.opponentRating <= 0) continue;
    const won = f.result1 === 'W' ? 1 : 0;
    s.push({ g: t.opponentRating - t.ratingBefore, o: won });
    s.push({ g: t.ratingBefore - t.opponentRating, o: 1 - won });
  }
  return s;
}
function fitD(s: { g: number; o: number }[]) {
  let best = { D: 100, ll: Infinity };
  for (let D = 100; D <= 700; D += 5) {
    let ll = 0;
    for (const x of s) { const p = Math.min(1 - 1e-9, Math.max(1e-9, logistic(x.g, D))); ll += -(x.o * Math.log(p) + (1 - x.o) * Math.log(1 - p)); }
    ll /= s.length; if (ll < best.ll) best = { D, ll };
  }
  return best.D;
}

function main() {
  const data = loadAllData();
  const nameOf = new Map(data.fighters.map((f) => [f.fighterId, f.fullName]));
  const minF = RANKING_CONFIG.minUFCFights;
  const nowY = new Date().getFullYear();

  const mut = RANKING_CONFIG.elo as unknown as { maxFightAgeYears: number | null; boundaryRegressionToMean: number; inactivityGraceMonths: number; inactivityRetentionPerYear: number };
  const orig = { m: mut.maxFightAgeYears, b: mut.boundaryRegressionToMean, g: mut.inactivityGraceMonths, r: mut.inactivityRetentionPerYear };

  for (const c of CONFIGS) {
    mut.maxFightAgeYears = c.maxFightAgeYears;
    mut.boundaryRegressionToMean = c.boundary;
    mut.inactivityGraceMonths = c.grace;
    mut.inactivityRetentionPerYear = c.retention;

    const { ratings, history } = buildEloWithTraces(data);
    const pool: { id: string; r: number; debut: number; last: number }[] = [];
    for (const [id, s] of ratings) {
      const h = history.get(id);
      const n = data.fighterFights.get(id)?.length ?? 0;
      if (!h || h.length === 0 || n < minF || s.rating <= 0) continue;
      pool.push({ id, r: s.rating, debut: +h[0].date.slice(0, 4), last: +h[h.length - 1].date.slice(0, 4) });
    }
    pool.sort((a, b) => b.r - a.r);
    const vals = pool.map((p) => p.r);
    const q = (p: number) => vals[Math.floor(p * vals.length)];
    const D = fitD(buildSamples(data, history));

    console.log(`\n═══ ${c.label}`);
    console.log(`   spread  best ${vals[0].toFixed(0)} / p95 ${q(0.05).toFixed(0)} / med ${q(0.5).toFixed(0)} / min ${vals[vals.length - 1].toFixed(0)}   (best−med ${(vals[0] - q(0.5)).toFixed(0)})   refit D=${D}`);
    console.log(`   TOP-15 P4P  (★=idle >2yr, ⚑=debut >8yr ago)`);
    for (const p of pool.slice(0, 15)) {
      const idle = nowY - p.last, ten = nowY - p.debut;
      const flag = (idle > 2 ? '★' : ' ') + (ten > 8 ? '⚑' : ' ');
      console.log(`     ${flag} ${p.r.toFixed(0).padStart(4)}  ${(nameOf.get(p.id) ?? p.id).padEnd(24)} debut ${p.debut}  last ${p.last}${idle > 2 ? `  (${idle}y idle)` : ''}`);
    }
  }

  mut.maxFightAgeYears = orig.m; mut.boundaryRegressionToMean = orig.b; mut.inactivityGraceMonths = orig.g; mut.inactivityRetentionPerYear = orig.r;
}
main();
