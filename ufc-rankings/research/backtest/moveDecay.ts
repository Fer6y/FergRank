// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/moveDecay.ts — is the weight-class move decay
//  (`elo.moveDecayPenalty`) worth anything as a PREDICTOR?
//
//  The decay regresses a fighter's rating toward the mean the first time they
//  enter a new division, on the theory that an elite's rating doesn't fully
//  transfer to a new weight. It was set by fiat (0.10) and has never been fit
//  to anything. This scores it the only way that can settle it: re-run the FULL
//  Elo sweep at several penalty values and see which one predicts DIVISION-DEBUT
//  bouts best, against realised results and against the de-vigged BFO close.
//
//  Design notes:
//   • The whole sweep is rebuilt per candidate value, not just the debut bout —
//     changing the penalty changes every downstream rating, and a counterfactual
//     that only patched the one fight would be measuring something else.
//   • Debut identification is engine-INDEPENDENT (it keys on fight order +
//     normalized weight class), so the bout set is identical across arms. Only
//     the ratings move.
//   • Scored on the market favourite, matching the rest of the harness.
//   • The `strong` subset is the bouts where the decay actually bites (≥5 Elo);
//     the full set is dominated by fighters near the mean, for whom a 10%
//     regression is worth ~1 Elo and no model could tell the arms apart.
//
//  Firewall-respecting: lives in research/, reads engine traces + BFO closes,
//  feeds odds to NO rating.
//
//  Run: node_modules/.bin/jiti research/backtest/moveDecay.ts
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../../src/lib/loadData';
import {
  buildEloWithTraces,
  winProbability,
  normalizeWeightClassForMove,
  regressForInactivity,
} from '../../src/lib/eloEngine';
import { effectiveEngine, DEFAULT_FILTERS } from '../../src/lib/filters';
import { buildNameIndex } from '../../src/lib/nameResolver';
import { resolveOddsName } from './pointInTime';
import { devig } from './devig';
import { score, sigmoid, logit, type Prediction } from './metrics';

const CANDIDATES = [0, 0.05, 0.1, 0.15, 0.2];
const BASELINE = 0.1; // the production value — the arm everything is compared against
const STRONG_DECAY_ELO = 5; // |decay cost| at/above which the penalty is materially in play
const DAY_TOL = [0, 1, -1, 2, -2];

const dayNum = (iso: string): number => Math.floor(new Date(iso).getTime() / 86_400_000);
const monthsBetween = (a: Date, b: Date): number =>
  (b.getTime() - a.getTime()) / ((1000 * 60 * 60 * 24 * 365.25) / 12);

/** A division-debut bout, identified once from the production sweep. */
interface Debut {
  fightId: string;
  moverId: string;
  oppId: string;
  date: string;
  moverWon: boolean;
  decayCostElo: number; // negative; how much the production penalty took off the mover
}

interface Scored {
  fightId: string;
  favWon: boolean;
  mktPFav: number;
  strong: boolean;
  /** predicted P(favourite) per candidate penalty value */
  pFav: Map<number, number>;
}

function main(): void {
  const data = loadAllData();
  const nameIndex = buildNameIndex(data.fighters);
  const base = effectiveEngine(DEFAULT_FILTERS);

  // ── 1. Build one sweep per candidate; index ratingBefore by (fighter, fight).
  const arms = new Map<number, Map<string, number>>();
  for (const pen of CANDIDATES) {
    const engine = { ...base, elo: { ...base.elo, moveDecayPenalty: pen }, isDefault: false };
    const { history } = buildEloWithTraces(data, engine);
    const ratingBefore = new Map<string, number>();
    for (const [fid, traces] of history) {
      for (const t of traces) ratingBefore.set(`${fid}#${t.fightId}`, t.ratingBefore);
    }
    arms.set(pen, ratingBefore);
  }

  // ── 2. Identify division debuts off the production sweep.
  const prodEngine = { ...base, elo: { ...base.elo, moveDecayPenalty: BASELINE }, isDefault: false };
  const { history: prodHistory } = buildEloWithTraces(data, prodEngine);
  const debuts: Debut[] = [];
  for (const [fid, traces] of prodHistory) {
    const tr = [...traces].sort((a, b) => a.date.localeCompare(b.date));
    const seen = new Set<string>();
    let lastWC: string | null = null;
    for (let i = 0; i < tr.length; i++) {
      const t = tr[i];
      const wc = normalizeWeightClassForMove(t.weightClass || '');
      const isDebut = !!wc && !!lastWC && wc !== lastWC && !seen.has(wc);
      if (wc) seen.add(wc);
      if (wc) lastWC = wc;
      if (!isDebut || i === 0) continue;

      // How much the production penalty actually cost: rating carried in after
      // inactivity, minus the rating the sweep entered the fight with.
      const prev = tr[i - 1];
      const gap = monthsBetween(new Date(prev.date), new Date(t.date));
      const postInact = gap > 0 ? regressForInactivity(prev.ratingAfter, gap, prodEngine.elo) : prev.ratingAfter;
      debuts.push({
        fightId: t.fightId,
        moverId: fid,
        oppId: t.opponentId,
        date: t.date,
        moverWon: t.result === 'W',
        decayCostElo: t.ratingBefore - postInact,
      });
    }
  }

  // ── 3. Index the closing lines by unordered id pair + day.
  const bfoFp = path.join(process.cwd(), 'data', 'bfo_odds.csv');
  const bfo = Papa.parse<Record<string, string>>(fs.readFileSync(bfoFp, 'utf-8'), {
    header: true,
    skipEmptyLines: true,
  }).data;

  const oddsIdx = new Map<string, { a: string; b: string; oddsA: number; oddsB: number }>();
  let unresolved = 0;
  for (const r of bfo) {
    const c1 = parseFloat(r['close1']);
    const c2 = parseFloat(r['close2']);
    if (!(c1 > 1) || !(c2 > 1)) continue;
    const id1 = resolveOddsName(r['fighter1'], nameIndex);
    const id2 = resolveOddsName(r['fighter2'], nameIndex);
    if (!id1 || !id2) { unresolved++; continue; }
    const [a, b, oa, ob] = id1 < id2 ? [id1, id2, c1, c2] : [id2, id1, c2, c1];
    oddsIdx.set(`${a}#${b}#${dayNum(r['date'])}`, { a, b, oddsA: oa, oddsB: ob });
  }

  // ── 4. Join and score. Seen-set guards the two traces of the same bout when
  //      BOTH fighters are making a division debut (it would double-count).
  const rows: Scored[] = [];
  const seenFight = new Set<string>();
  let noOdds = 0;
  let noRating = 0;

  for (const d of debuts) {
    if (seenFight.has(d.fightId)) continue;
    const [a, b] = d.moverId < d.oppId ? [d.moverId, d.oppId] : [d.oppId, d.moverId];
    const day = dayNum(d.date);
    let hit: { a: string; b: string; oddsA: number; oddsB: number } | undefined;
    for (const off of DAY_TOL) {
      hit = oddsIdx.get(`${a}#${b}#${day + off}`);
      if (hit) break;
    }
    if (!hit) { noOdds++; continue; }
    seenFight.add(d.fightId);

    const favId = hit.oddsA <= hit.oddsB ? hit.a : hit.b;
    const dogId = favId === hit.a ? hit.b : hit.a;
    const favOdds = favId === hit.a ? hit.oddsA : hit.oddsB;
    const dogOdds = favId === hit.a ? hit.oddsB : hit.oddsA;

    const pFav = new Map<number, number>();
    let ok = true;
    for (const pen of CANDIDATES) {
      const idx = arms.get(pen)!;
      const rf = idx.get(`${favId}#${d.fightId}`);
      const rd = idx.get(`${dogId}#${d.fightId}`);
      if (rf == null || rd == null) { ok = false; break; }
      pFav.set(pen, winProbability(rf, rd));
    }
    if (!ok) { noRating++; continue; }

    const favWon = favId === d.moverId ? d.moverWon : !d.moverWon;
    rows.push({
      fightId: d.fightId,
      favWon,
      mktPFav: devig(favOdds, dogOdds, 'shin').pFav,
      strong: Math.abs(d.decayCostElo) >= STRONG_DECAY_ELO,
      pFav,
    });
  }

  // ── 5. Report.
  console.log(`\nDivision-debut bouts found: ${debuts.length}`);
  console.log(`  matched to a BFO close: ${rows.length}  (no odds: ${noOdds}, no rating: ${noRating}, unresolved odds names: ${unresolved})`);
  console.log(`  ...of which the decay cost >= ${STRONG_DECAY_ELO} Elo: ${rows.filter((r) => r.strong).length}\n`);

  const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : '  –   ');

  const report = (label: string, sub: Scored[]): void => {
    if (sub.length < 2) { console.log(`── ${label}: n=${sub.length}, too few to score\n`); return; }
    const mkt = score(sub.map((r) => ({ p: r.mktPFav, won: r.favWon })));
    console.log(`── ${label}  (n = ${sub.length})`);
    console.log(`    ${'penalty'.padEnd(10)}${'logloss'.padEnd(10)}${'brier'.padEnd(10)}${'acc'.padEnd(10)}${'ece'.padEnd(10)}${'ΔLL vs close'.padEnd(14)}paired t vs ${BASELINE}`);

    const perBoutLL = (p: number, won: boolean) => (won ? -Math.log(Math.max(1e-12, p)) : -Math.log(Math.max(1e-12, 1 - p)));
    const baseLL = sub.map((r) => perBoutLL(r.pFav.get(BASELINE)!, r.favWon));

    for (const pen of CANDIDATES) {
      const preds: Prediction[] = sub.map((r) => ({ p: r.pFav.get(pen)!, won: r.favWon }));
      const s = score(preds);
      const diffs = sub.map((r, i) => perBoutLL(r.pFav.get(pen)!, r.favWon) - baseLL[i]);
      const mean = diffs.reduce((a, c) => a + c, 0) / diffs.length;
      const sd = Math.sqrt(diffs.reduce((a, c) => a + (c - mean) ** 2, 0) / Math.max(1, diffs.length - 1));
      const t = sd > 0 ? mean / (sd / Math.sqrt(diffs.length)) : NaN;
      const tag = pen === BASELINE ? ' (production)' : '';
      console.log(
        `    ${String(pen).padEnd(10)}${fmt(s.logLoss).padEnd(10)}${fmt(s.brier).padEnd(10)}` +
        `${fmt(s.accuracy).padEnd(10)}${fmt(s.ece).padEnd(10)}${fmt(s.logLoss - mkt.logLoss).padEnd(14)}` +
        `${pen === BASELINE ? '   —' : `${mean >= 0 ? '+' : ''}${mean.toFixed(4)}  t=${Number.isFinite(t) ? t.toFixed(2) : ' – '}`}${tag}`
      );
    }
    console.log(`    ${'MARKET'.padEnd(10)}${fmt(mkt.logLoss).padEnd(10)}${fmt(mkt.brier).padEnd(10)}${fmt(mkt.accuracy).padEnd(10)}${fmt(mkt.ece).padEnd(10)}`);
    console.log(`    (negative Δ / t = better than production; a t inside ±2 is not a result)\n`);
  };

  report('ALL division-debut bouts with a close', rows);
  report(`Decay materially in play (>= ${STRONG_DECAY_ELO} Elo)`, rows.filter((r) => r.strong));

  // ── Shrinkage control. A bigger penalty pulls every rating toward the mean,
  // which narrows Elo gaps and drags predictions toward 0.5. On an OVER-CONFIDENT
  // model that lowers logloss for free, carrying no information. So refit a single
  // temperature per arm (in-sample, same freedom for every arm) and re-score: if
  // the arms converge once each is optimally calibrated, the raw ranking above was
  // shrinkage, not signal.
  const temperedReport = (label: string, sub: Scored[]): void => {
    if (sub.length < 10) { console.log(`── ${label}: n=${sub.length}, too few to fit a temperature\n`); return; }
    console.log(`── ${label} — after per-arm temperature calibration  (n = ${sub.length})`);
    console.log(`    ${'penalty'.padEnd(10)}${'bestT'.padEnd(10)}${'logloss'.padEnd(10)}vs production`);

    const fitTemp = (pen: number): { T: number; ll: number } => {
      let bestT = 1;
      let bestLL = Infinity;
      for (let T = 0.2; T <= 6.0; T += 0.01) {
        let s = 0;
        for (const r of sub) {
          const p = sigmoid(logit(r.pFav.get(pen)!) / T);
          s += r.favWon ? -Math.log(Math.max(1e-12, p)) : -Math.log(Math.max(1e-12, 1 - p));
        }
        const ll = s / sub.length;
        if (ll < bestLL) { bestLL = ll; bestT = T; }
      }
      return { T: bestT, ll: bestLL };
    };

    const baseCal = fitTemp(BASELINE).ll; // fit first so every row has something to compare against
    for (const pen of CANDIDATES) {
      const { T, ll } = fitTemp(pen);
      console.log(
        `    ${String(pen).padEnd(10)}${T.toFixed(2).padEnd(10)}${ll.toFixed(4).padEnd(10)}` +
        `${pen === BASELINE ? '   — (production)' : `${ll - baseCal >= 0 ? '+' : ''}${(ll - baseCal).toFixed(4)}`}`
      );
    }
    console.log(`    (if these are all within ~0.001, the raw ranking above was shrinkage, not signal)\n`);
  };

  temperedReport('ALL division-debut bouts with a close', rows);

  // Minimum detectable effect: with this n and the observed spread of per-bout
  // logloss differences, how big would a real improvement have to be to show up?
  const strong = rows.filter((r) => r.strong);
  if (strong.length >= 2) {
    const perBoutLL = (p: number, won: boolean) => (won ? -Math.log(Math.max(1e-12, p)) : -Math.log(Math.max(1e-12, 1 - p)));
    const diffs = strong.map((r) => perBoutLL(r.pFav.get(0)!, r.favWon) - perBoutLL(r.pFav.get(BASELINE)!, r.favWon));
    const mean = diffs.reduce((a, c) => a + c, 0) / diffs.length;
    const sd = Math.sqrt(diffs.reduce((a, c) => a + (c - mean) ** 2, 0) / Math.max(1, diffs.length - 1));
    console.log(`── Power check on the strong subset (penalty 0 vs ${BASELINE})`);
    console.log(`    per-bout Δlogloss: mean ${mean.toFixed(4)}, sd ${sd.toFixed(4)}, n ${strong.length}`);
    console.log(`    minimum |Δlogloss| detectable at t=2: ${(2 * sd / Math.sqrt(strong.length)).toFixed(4)}`);
    console.log(`    n needed to resolve the observed effect at t=2: ${mean !== 0 ? Math.ceil((2 * sd / mean) ** 2) : '∞'}\n`);
  }
}

main();
