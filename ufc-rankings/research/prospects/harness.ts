// ─────────────────────────────────────────────────────────────────────────
//  research/prospects/harness.ts — the two-horizon prospect backtest harness.
//
//  The 2026-08-05 prospect-sort backtest (raw Elo vs climb vs shrunk climb)
//  ran from scratchpad scripts that were never committed; only the method
//  survived in docs/CHANGELOG.md. This is the committed rebuild — the durable
//  harness every future prospect-ordering claim must be scored on. Method,
//  cohort rule and targets are pre-registered in docs/plans/DWCS_PLAN.md.
//
//  Cohort at horizon T: fighters with 1..prospects.maxUFCFights traced UFC
//  fights and a winning record as of T, who fought again after T. Ratings are
//  read straight off FightTrace.ratingAfter (point-in-time, no second sweep —
//  the careerSos technique); the settled EloMap.rating is NEVER a predictor.
//
//  Targets:
//    • reachedTop15 (binary, EXTERNAL — the UFC's own current official board,
//      not our engine; Elo-today is autocorrelated with Elo@T and would
//      flatter the incumbent) → AUC.
//    • laterWinRate, netEloAfterT (continuous, internal) → Spearman ρ.
//
//  Known survivorship caveat, inherited from the original design: fighters
//  who never fought again after T are EXCLUDED, which drops some of the
//  clearest failures. Stated in every runner's output header.
// ─────────────────────────────────────────────────────────────────────────
import type { LoadedData } from '../../src/lib/loadData';
import { buildEloWithTraces, type FightTrace } from '../../src/lib/eloEngine';
import { RANKING_CONFIG } from '../../src/lib/rankingConfig';
import { fetchOfficialRankings } from '../../src/lib/fetchOfficialRankings';
import { buildNameIndex, resolveNameToId } from '../../src/lib/nameResolver';
import { auc, spearman, type Prediction } from '../backtest/metrics';

export interface CohortMember {
  fighterId: string;
  name: string;
  eloAtT: number;        // last ratingAfter strictly before T
  fightsAtT: number;     // traced UFC fights before T
  winsAtT: number;
  lossesAtT: number;
  // Outcomes (all from post-T traces / the current official board):
  laterFights: number;
  laterWins: number;
  laterWinRate: number;
  netEloAfterT: number;  // last post-T ratingAfter − eloAtT
  reachedTop15: boolean; // on the CURRENT committed official snapshot
}

let tracesCache: WeakMap<LoadedData, Map<string, FightTrace[]>> | null = null;

function ascTraces(data: LoadedData): Map<string, FightTrace[]> {
  if (!tracesCache) tracesCache = new WeakMap();
  const hit = tracesCache.get(data);
  if (hit) return hit;
  const { history } = buildEloWithTraces(data);
  const out = new Map<string, FightTrace[]>();
  for (const [id, traces] of history) {
    out.set(id, [...traces].sort((a, b) => (a.date < b.date ? -1 : 1)));
  }
  tracesCache.set(data, out);
  return out;
}

/** Our-ids of everyone on the current official board (C or 1–15). */
export async function currentTop15Ids(data: LoadedData): Promise<Set<string>> {
  const official = await fetchOfficialRankings();
  const nameIndex = buildNameIndex(data.fighters);
  const ids = new Set<string>();
  for (const list of Object.values(official)) {
    for (const entry of list) {
      const id = resolveNameToId(entry.name, nameIndex, { quiet: true });
      if (id) ids.add(id);
    }
  }
  return ids;
}

export function buildProspectCohort(
  data: LoadedData,
  asOfIso: string,
  top15Ids: Set<string>
): CohortMember[] {
  const maxFights = RANKING_CONFIG.prospects.maxUFCFights;
  const out: CohortMember[] = [];

  for (const [fighterId, traces] of ascTraces(data)) {
    const pre = traces.filter((t) => t.date < asOfIso);
    if (pre.length < 1 || pre.length > maxFights) continue;
    const winsAtT = pre.filter((t) => t.result === 'W').length;
    const lossesAtT = pre.filter((t) => t.result === 'L').length;
    if (winsAtT <= lossesAtT) continue; // winning record only (a draw is not a win)

    const post = traces.filter((t) => t.date >= asOfIso);
    if (!post.length) continue; // fought again after T (known survivorship cut)

    const laterWins = post.filter((t) => t.result === 'W').length;
    const eloAtT = pre[pre.length - 1].ratingAfter;
    out.push({
      fighterId,
      name: data.fighterMap.get(fighterId)?.fullName ?? fighterId,
      eloAtT,
      fightsAtT: pre.length,
      winsAtT,
      lossesAtT,
      laterFights: post.length,
      laterWins,
      laterWinRate: laterWins / post.length,
      netEloAfterT: post[post.length - 1].ratingAfter - eloAtT,
      reachedTop15: top15Ids.has(fighterId),
    });
  }
  return out;
}

export interface FeatureEvaluation {
  label: string;
  n: number;
  aucTop15: number;
  rhoLaterWinRate: number;
  rhoNetElo: number;
}

/**
 * Score one candidate ordering (higher featureFn = ranked better) against the
 * three pre-registered targets.
 */
export function evaluateFeature(
  cohort: CohortMember[],
  featureFn: (m: CohortMember) => number,
  label: string
): FeatureEvaluation {
  const scored = cohort.map((m) => ({ m, x: featureFn(m) })).filter((s) => Number.isFinite(s.x));
  const preds: Prediction[] = scored.map((s) => ({ p: s.x, won: s.m.reachedTop15 }));
  return {
    label,
    n: scored.length,
    aucTop15: auc(preds),
    rhoLaterWinRate: spearman(scored.map((s) => s.x), scored.map((s) => s.m.laterWinRate)),
    rhoNetElo: spearman(scored.map((s) => s.x), scored.map((s) => s.m.netEloAfterT)),
  };
}

/** 90% bootstrap CI on the ΔAUC between two orderings over the same cohort. */
export function bootstrapDeltaAuc(
  cohort: CohortMember[],
  featureA: (m: CohortMember) => number,
  featureB: (m: CohortMember) => number,
  resamples = 500
): { delta: number; ciLo: number; ciHi: number } {
  const base =
    auc(cohort.map((m) => ({ p: featureA(m), won: m.reachedTop15 }))) -
    auc(cohort.map((m) => ({ p: featureB(m), won: m.reachedTop15 })));
  const deltas: number[] = [];
  for (let i = 0; i < resamples; i++) {
    const sample: CohortMember[] = [];
    for (let j = 0; j < cohort.length; j++) {
      sample.push(cohort[Math.floor(Math.random() * cohort.length)]);
    }
    const a = auc(sample.map((m) => ({ p: featureA(m), won: m.reachedTop15 })));
    const b = auc(sample.map((m) => ({ p: featureB(m), won: m.reachedTop15 })));
    if (Number.isFinite(a) && Number.isFinite(b)) deltas.push(a - b);
  }
  deltas.sort((x, y) => x - y);
  return {
    delta: base,
    ciLo: deltas[Math.floor(deltas.length * 0.05)] ?? NaN,
    ciHi: deltas[Math.floor(deltas.length * 0.95)] ?? NaN,
  };
}
