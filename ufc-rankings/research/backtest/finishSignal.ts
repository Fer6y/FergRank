// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/finishSignal.ts — does the "these two will finish it"
//  read actually predict a fight ending inside the distance?
//
//  Every finish/ITD call in the 2026-08-20 card writeup rested on career finish
//  rates + durability, which had NEVER been tested in this repo. This measures
//  it. NOTE the deliberate limit: there are no ITD/method PROP odds in our data,
//  so this can say whether the READ is real, and it CANNOT say whether such a
//  bet is +EV against a bookmaker's ITD price. Those are different claims.
//
//  Leak discipline: signals are point-in-time — each fighter's finish/durability
//  rates are built from their traces STRICTLY BEFORE the bout being predicted,
//  walking the chronological trace list. The settled career finish rate shown on
//  a profile today would contain the outcome.
//
//  Run: node_modules/.bin/jiti research/backtest/finishSignal.ts
// ─────────────────────────────────────────────────────────────────────────
import { loadAllData } from '../../src/lib/loadData';
import { buildEloWithTraces } from '../../src/lib/eloEngine';
import { getUpcomingCards } from '../../src/lib/loadUpcoming';
import { auc } from './metrics';

const MIN_PRIOR = process.env.MINPRIOR ? Number(process.env.MINPRIOR) : 3;

const isFinish = (m: string) => /^(KO\/TKO|TKO|SUB)/i.test(m.trim());
const isKO = (m: string) => /^(KO\/TKO|TKO)/i.test(m.trim());

interface Snap { finishWinRate: number; koWinRate: number; finishedRate: number; n: number }

function main(): void {
  const data = loadAllData();
  const { history } = buildEloWithTraces(data);

  // Per fighter, chronological running tallies -> snapshot BEFORE each bout.
  const before = new Map<string, Map<string, Snap>>(); // fighterId -> fightId -> snapshot
  for (const [fid, traces] of history) {
    const chron = [...traces].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let n = 0, finWins = 0, koWins = 0, finLosses = 0;
    const m = new Map<string, Snap>();
    for (const t of chron) {
      m.set(t.fightId, {
        finishWinRate: n ? finWins / n : 0,
        koWinRate: n ? koWins / n : 0,
        finishedRate: n ? finLosses / n : 0,
        n,
      });
      n++;
      if (t.result === 'W' && isFinish(t.method)) { finWins++; if (isKO(t.method)) koWins++; }
      if (t.result === 'L' && isFinish(t.method)) finLosses++;
    }
    before.set(fid, m);
  }

  // Assemble bouts (dedupe by fightId; need both corners' snapshots).
  interface Row { itd: boolean; ko: boolean; bothFin: number; threat: number; koThreat: number }
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const [fid, traces] of history) {
    for (const t of traces) {
      if (seen.has(t.fightId)) continue;
      const oppMap = before.get(t.opponentId);
      const selfSnap = before.get(fid)?.get(t.fightId);
      const oppSnap = oppMap?.get(t.fightId);
      if (!selfSnap || !oppSnap) continue;
      if (selfSnap.n < MIN_PRIOR || oppSnap.n < MIN_PRIOR) continue;
      seen.add(t.fightId);
      rows.push({
        itd: isFinish(t.method),
        ko: isKO(t.method),
        // "both are finishers"
        bothFin: (selfSnap.finishWinRate + oppSnap.finishWinRate) / 2,
        // "a finisher meets a cracked chin" — best of the two directions
        threat: Math.max(
          selfSnap.finishWinRate * oppSnap.finishedRate,
          oppSnap.finishWinRate * selfSnap.finishedRate,
        ),
        koThreat: Math.max(
          selfSnap.koWinRate * oppSnap.finishedRate,
          oppSnap.koWinRate * selfSnap.finishedRate,
        ),
      });
    }
  }

  const baseItd = rows.filter((r) => r.itd).length / rows.length;
  const baseKo = rows.filter((r) => r.ko).length / rows.length;
  console.log(`\n════ FINISH SIGNAL TEST — n=${rows.length} bouts (both corners ≥${MIN_PRIOR} prior UFC fights) ════`);
  console.log(`base rate: inside the distance ${(baseItd * 100).toFixed(1)}%  ·  KO/TKO ${(baseKo * 100).toFixed(1)}%\n`);

  const report = (
    label: string, get: (r: Row) => number, target: (r: Row) => boolean, base: number,
  ) => {
    const sorted = [...rows].sort((a, b) => get(a) - get(b));
    const q = Math.floor(sorted.length / 4);
    console.log(`── ${label} ──`);
    console.log('  quartile        n     hit rate   vs base');
    for (let i = 0; i < 4; i++) {
      const slice = sorted.slice(i * q, i === 3 ? sorted.length : (i + 1) * q);
      const rate = slice.filter(target).length / slice.length;
      const d = (rate - base) * 100;
      console.log(
        `  Q${i + 1} ${i === 3 ? '(highest)' : '         '} ${String(slice.length).padStart(5)}    ` +
        `${(rate * 100).toFixed(1).padStart(5)}%    ${(d >= 0 ? '+' : '') + d.toFixed(1)}pt`,
      );
    }
    console.log(`  AUC ${auc(rows.map((r) => ({ p: get(r), won: target(r) }))).toFixed(3)}\n`);
  };

  report('BOTH-ARE-FINISHERS → inside the distance', (r) => r.bothFin, (r) => r.itd, baseItd);
  report('FINISHER-vs-CHIN   → inside the distance', (r) => r.threat, (r) => r.itd, baseItd);
  report('KO-THREAT          → KO/TKO specifically', (r) => r.koThreat, (r) => r.ko, baseKo);

  // ── Optional: score an UPCOMING card on the SAME signals ──
  // Same function bodies as above by construction (one definition, no drift).
  const cardDate = process.env.CARD_DATE;
  if (!cardDate) return;

  // Each fighter's rates from their FULL history (all legitimately available
  // before a future bout — no leak for a fight that hasn't happened).
  const now = new Map<string, Snap>();
  for (const [fid, traces] of history) {
    let n = 0, finWins = 0, koWins = 0, finLosses = 0;
    for (const t of traces) {
      n++;
      if (t.result === 'W' && isFinish(t.method)) { finWins++; if (isKO(t.method)) koWins++; }
      if (t.result === 'L' && isFinish(t.method)) finLosses++;
    }
    now.set(fid, {
      finishWinRate: n ? finWins / n : 0, koWinRate: n ? koWins / n : 0,
      finishedRate: n ? finLosses / n : 0, n,
    });
  }

  // Empirical hit rate for a value, from the historical rows around it.
  const bandRate = (
    v: number, get: (r: Row) => number, target: (r: Row) => boolean,
  ): { pct: number; rate: number } => {
    const vals = rows.map(get).sort((a, b) => a - b);
    let below = 0;
    while (below < vals.length && vals[below] < v) below++;
    const pct = below / vals.length;
    // Nearest-500 neighbourhood by signal value → local empirical rate.
    const sorted = [...rows].sort((a, b) => Math.abs(get(a) - v) - Math.abs(get(b) - v));
    const nb = sorted.slice(0, 500);
    return { pct, rate: nb.filter(target).length / nb.length };
  };

  const card = getUpcomingCards().find((c) => c.eventDate === cardDate);
  if (!card) { console.log(`\n(no upcoming card on ${cardDate})`); return; }

  console.log(`\n════ CARD FINISH PROJECTION — ${card.eventName} (${cardDate}) ════`);
  console.log('percentile is vs the historical pool; rate = local empirical hit rate\n');
  const out: { line: string; ko: number }[] = [];
  for (const b of card.bouts) {
    const s1 = b.fighter1Id ? now.get(b.fighter1Id) : undefined;
    const s2 = b.fighter2Id ? now.get(b.fighter2Id) : undefined;
    const label = `${b.fighter1Name} vs ${b.fighter2Name}`;
    if (!s1 || !s2 || s1.n < MIN_PRIOR || s2.n < MIN_PRIOR) {
      out.push({ line: `  ${label.slice(0, 40).padEnd(40)}  — thin/no UFC history, not scored`, ko: -1 });
      continue;
    }
    const threat = Math.max(s1.finishWinRate * s2.finishedRate, s2.finishWinRate * s1.finishedRate);
    const koThreat = Math.max(s1.koWinRate * s2.finishedRate, s2.koWinRate * s1.finishedRate);
    const itd = bandRate(threat, (r) => r.threat, (r) => r.itd);
    const koB = bandRate(koThreat, (r) => r.koThreat, (r) => r.ko);
    out.push({
      ko: koB.rate,
      line:
        `  ${label.slice(0, 40).padEnd(40)}  ITD ${(itd.rate * 100).toFixed(0).padStart(3)}% (p${(itd.pct * 100).toFixed(0).padStart(2)})` +
        `   KO ${(koB.rate * 100).toFixed(0).padStart(3)}% (p${(koB.pct * 100).toFixed(0).padStart(2)})`,
    });
  }
  for (const o of out.sort((a, b) => b.ko - a.ko)) console.log(o.line);
}

main();
