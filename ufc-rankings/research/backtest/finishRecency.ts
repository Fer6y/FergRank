// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/finishRecency.ts — Part 2 of the pre-registered trend
//  study (docs/plans/TREND_STUDY_PLAN.md, commit f648ca5): do RECENT-WINDOW
//  finish/durability rates (last min(6,n) bouts) beat the CAREER rates the
//  2026-08-21 finishSignal study validated?
//
//  Same pool, same three signal constructions, same point-in-time discipline
//  as finishSignal.ts. Variants: A career (incumbent) · B last-6 · C blend.
//  Verdict (pre-registered): B or C supersedes A only if AUC ≥ +0.01 better
//  on BOTH finisher-vs-chin→ITD and KO-threat→KO, with quartile monotonicity
//  preserved. Same deliberate limit: no ITD prop odds held, so this calibrates
//  the read and cannot claim +EV against a book's finish price.
//
//  Run: node_modules/.bin/jiti research/backtest/finishRecency.ts
// ─────────────────────────────────────────────────────────────────────────
import { loadAllData } from '../../src/lib/loadData';
import { buildEloWithTraces } from '../../src/lib/eloEngine';
import { auc } from './metrics';

const MIN_PRIOR = 3;
const RECENT = 6;

const isFinish = (m: string) => /^(KO\/TKO|TKO|SUB)/i.test(m.trim());
const isKO = (m: string) => /^(KO\/TKO|TKO)/i.test(m.trim());

interface Snap {
  n: number;
  car: { finWin: number; koWin: number; finished: number };
  rec: { finWin: number; koWin: number; finished: number };
}

function main(): void {
  const data = loadAllData();
  const { history } = buildEloWithTraces(data);

  // Per fighter: snapshot BEFORE each bout — career rates + last-min(6,n) rates.
  const before = new Map<string, Map<string, Snap>>();
  for (const [fid, traces] of history) {
    const chron = [...traces].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const m = new Map<string, Snap>();
    for (let i = 0; i < chron.length; i++) {
      const prior = chron.slice(0, i);
      const rate = (list: typeof prior) => {
        const n = list.length;
        if (!n) return { finWin: 0, koWin: 0, finished: 0 };
        return {
          finWin: list.filter((t) => t.result === 'W' && isFinish(t.method)).length / n,
          koWin: list.filter((t) => t.result === 'W' && isKO(t.method)).length / n,
          finished: list.filter((t) => t.result === 'L' && isFinish(t.method)).length / n,
        };
      };
      m.set(chron[i].fightId, { n: prior.length, car: rate(prior), rec: rate(prior.slice(-RECENT)) });
    }
    before.set(fid, m);
  }

  interface Row { itd: boolean; ko: boolean; a: Snap; b: Snap }
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const [fid, traces] of history) {
    for (const t of traces) {
      if (seen.has(t.fightId)) continue;
      const s = before.get(fid)?.get(t.fightId);
      const o = before.get(t.opponentId)?.get(t.fightId);
      if (!s || !o || s.n < MIN_PRIOR || o.n < MIN_PRIOR) continue;
      seen.add(t.fightId);
      rows.push({ itd: isFinish(t.method), ko: isKO(t.method), a: s, b: o });
    }
  }

  const baseItd = rows.filter((r) => r.itd).length / rows.length;
  const baseKo = rows.filter((r) => r.ko).length / rows.length;
  console.log(`\n════ FINISH-RECENCY TEST — n=${rows.length} bouts (both ≥${MIN_PRIOR} prior) ════`);
  console.log(`base: ITD ${(100 * baseItd).toFixed(1)}% · KO ${(100 * baseKo).toFixed(1)}%\n`);

  type Rates = Snap['car'];
  const variants: { name: string; of: (s: Snap) => Rates }[] = [
    { name: 'A career (incumbent)', of: (s) => s.car },
    { name: 'B last-6', of: (s) => s.rec },
    {
      name: 'C blend (A+B)/2',
      of: (s) => ({
        finWin: (s.car.finWin + s.rec.finWin) / 2,
        koWin: (s.car.koWin + s.rec.koWin) / 2,
        finished: (s.car.finished + s.rec.finished) / 2,
      }),
    },
  ];

  const constructions: { name: string; sig: (x: Rates, y: Rates) => number; target: (r: Row) => boolean; base: number }[] = [
    { name: 'both-finishers → ITD', sig: (x, y) => (x.finWin + y.finWin) / 2, target: (r) => r.itd, base: baseItd },
    { name: 'finisher-vs-chin → ITD', sig: (x, y) => Math.max(x.finWin * y.finished, y.finWin * x.finished), target: (r) => r.itd, base: baseItd },
    { name: 'KO-threat → KO', sig: (x, y) => Math.max(x.koWin * y.finished, y.koWin * x.finished), target: (r) => r.ko, base: baseKo },
  ];

  for (const c of constructions) {
    console.log(`── ${c.name} ──`);
    for (const v of variants) {
      const get = (r: Row) => c.sig(v.of(r.a), v.of(r.b));
      const a = auc(rows.map((r) => ({ p: get(r), won: c.target(r) })));
      // quartile rates for monotonicity
      const sorted = [...rows].sort((x, y) => get(x) - get(y));
      const q = Math.floor(sorted.length / 4);
      const qr: number[] = [];
      for (let i = 0; i < 4; i++) {
        const sl = sorted.slice(i * q, i === 3 ? sorted.length : (i + 1) * q);
        qr.push(sl.filter(c.target).length / sl.length);
      }
      const mono = qr[0] <= qr[1] && qr[1] <= qr[2] && qr[2] <= qr[3];
      console.log(
        `  ${v.name.padEnd(22)} AUC ${a.toFixed(3)}  quartiles ${qr.map((x) => (100 * x).toFixed(1)).join(' → ')}%  ${mono ? 'monotone' : 'NOT monotone'}`
      );
    }
    console.log('');
  }

  console.log('VERDICT RULE (pre-registered): B or C supersedes A only if AUC ≥ +0.010 better on BOTH finisher-vs-chin→ITD and KO-threat→KO with quartile monotonicity preserved.');
}

main();
