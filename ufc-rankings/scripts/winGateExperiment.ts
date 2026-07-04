/**
 * WIN-QUALITY GATE experiment (offline, read-only). Sweeps elo.winQualityGate on
 * the uncached buildEloWithTraces path (config restored at end — never the app).
 * For each value reports: pool mean/spread (deflation check), the top-12 by raw
 * Elo, and two watch-sets —
 *   RISERS  (should come DOWN): soft-slate streakers the audit flagged.
 *   CONTROL (should HOLD):      elites who beat quality — must not be punished.
 */
import { loadAllData } from '../src/lib/loadData';
import { buildEloWithTraces } from '../src/lib/eloEngine';
import { RANKING_CONFIG } from '../src/lib/rankingConfig';

const GATES = [0, 0.5, 1.0];
const RISERS = ['Gillian Robertson', 'Joselyne Edwards', 'Navajo Stirling', 'Quillan Salkilld', 'Josh Hokit', 'Ateba Gautier', 'Raul Rosas Jr.'];
const CONTROL = ['Islam Makhachev', 'Merab Dvalishvili', 'Ilia Topuria', 'Khamzat Chimaev', 'Brendan Allen', 'Movsar Evloev', 'Alexander Volkanovski'];

function main() {
  const data = loadAllData();
  const idOf = (n: string) => data.fighters.find((f) => f.fullName === n)?.fighterId;
  const nameOf = new Map(data.fighters.map((f) => [f.fighterId, f.fullName]));
  const minF = RANKING_CONFIG.minUFCFights;
  const mut = RANKING_CONFIG.elo as unknown as { winQualityGate: number };
  const orig = mut.winQualityGate;

  const base: Record<string, number> = {};
  for (const g of GATES) {
    mut.winQualityGate = g;
    const { ratings } = buildEloWithTraces(data);
    const pool: { id: string; r: number }[] = [];
    for (const [id, s] of ratings) {
      if ((data.fighterFights.get(id)?.length ?? 0) >= minF && s.rating > 0) pool.push({ id, r: s.rating });
    }
    pool.sort((a, b) => b.r - a.r);
    const vals = pool.map((p) => p.r);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const q = (p: number) => vals[Math.floor(p * vals.length)];
    const get = (n: string) => { const id = idOf(n); return id ? ratings.get(id)?.rating ?? NaN : NaN; };

    console.log(`\n═══ winQualityGate = ${g}`);
    console.log(`   pool  mean ${mean.toFixed(0)}  best ${vals[0].toFixed(0)}  p95 ${q(0.05).toFixed(0)}  med ${q(0.5).toFixed(0)}  (best−med ${(vals[0] - q(0.5)).toFixed(0)})  N ${vals.length}`);
    const fmt = (n: string) => { const v = get(n); const d = g === 0 ? '' : ` (${v - base[n] >= 0 ? '+' : ''}${(v - base[n]).toFixed(0)})`; if (g === 0) base[n] = v; return `${n.split(' ').slice(-1)[0].padEnd(11)} ${v.toFixed(0)}${d}`; };
    console.log('   RISERS↓ : ' + RISERS.map(fmt).join(' | '));
    console.log('   CONTROL : ' + CONTROL.map(fmt).join(' | '));
    console.log('   top-8 by Elo: ' + pool.slice(0, 8).map((p) => `${(nameOf.get(p.id) ?? '').split(' ').slice(-1)[0]} ${p.r.toFixed(0)}`).join(', '));
  }
  mut.winQualityGate = orig;
}
main();
