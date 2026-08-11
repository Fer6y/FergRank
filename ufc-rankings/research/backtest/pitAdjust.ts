// ─────────────────────────────────────────────────────────────────────────
//  research/backtest/pitAdjust.ts — point-in-time ranking-layer adjustment.
//
//  Mirrors scoringEngine.computeDivisionRankings with now = asOf and only
//  pre-asOf fights visible: metricsBonus + sosNudge + pedigreeBonus +
//  untestedPenalty, same formulas and config as production. officialBonus is
//  NOT reconstructible (no historical official-rankings snapshots) and is
//  omitted — bounded ≤ ~10 Elo, currently-ranked names only.
//
//  Opponent quality = max(fight-time rating, the opponent's last ratingAfter
//  BEFORE asOf) — the production max(fight-time, current) rule evaluated at
//  asOf instead of today (no look-ahead).
//
//  Shared by rankedVsClose.ts and last100.ts. Research-zone only.
// ─────────────────────────────────────────────────────────────────────────
import type { LoadedData } from '../../src/lib/loadData';
import type { Fight } from '../../src/lib/types';
import { buildEloWithTraces, normalizeWeightClassForMove, type FightTrace } from '../../src/lib/eloEngine';
import {
  computeMetricsBonus, metricsQualityMultiplier, untestedHoldPenalty,
  getFighterPerspective, recencyWeight,
} from '../../src/lib/scoringEngine';
import { RANKING_CONFIG } from '../../src/lib/rankingConfig';
import { loadPedigreeStrength } from '../../src/lib/pedigreeSeed';

function monthsBetween(d1: Date, d2: Date): number {
  return (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class PitAdjuster {
  private tracesById = new Map<string, FightTrace[]>(); // ascending by date
  private pedigree: ReturnType<typeof loadPedigreeStrength> | null;

  constructor(private data: LoadedData) {
    const { history } = buildEloWithTraces(data);
    for (const [id, traces] of history) {
      this.tracesById.set(
        id,
        [...traces].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      );
    }
    this.pedigree = RANKING_CONFIG.preUFCPedigree.seedEnabled ? loadPedigreeStrength(data) : null;
  }

  // Last ratingAfter strictly before asOf — THE as-of-date rating primitive.
  // Public: the prospect/DWCS backtests read point-in-time ratings through it.
  ratingAsOf(fighterId: string, asOfIso: string): number | null {
    const traces = this.tracesById.get(fighterId);
    if (!traces) return null;
    let last: FightTrace | null = null;
    for (const t of traces) {
      if (t.date >= asOfIso) break;
      last = t;
    }
    return last ? last.ratingAfter : null;
  }

  // Total ranking-layer adjustment for one fighter entering a bout on asOf in
  // `division` (normalized weight class of the bout).
  adjustment(fighterId: string, asOfIso: string, division: string): number {
    const p = this.adjustmentParts(fighterId, asOfIso, division);
    return p.metricsBonus + p.sosNudge + p.pedigreeBonus + p.untestedPenalty;
  }

  // Component breakdown — the prospect sort-key backtest needs the untested
  // hold separable (its "unheld" variant mirrors crossDivision.ts).
  adjustmentParts(
    fighterId: string,
    asOfIso: string,
    division: string
  ): { metricsBonus: number; sosNudge: number; pedigreeBonus: number; untestedPenalty: number } {
    const asOf = new Date(asOfIso);
    const cfg = RANKING_CONFIG;

    const traces = (this.tracesById.get(fighterId) ?? []).filter((t) => t.date < asOfIso);
    const oppQualityByFight = new Map<string, number>();
    let bestWinElo = 0;
    for (const t of traces) {
      const q = Math.max(t.opponentRating, this.ratingAsOf(t.opponentId, asOfIso) ?? t.opponentRating);
      oppQualityByFight.set(t.fightId, q);
      if (t.result === 'W' && q > bestWinElo) bestWinElo = q;
    }
    const preFightCount = traces.length;

    // In-window, in-division pre-asOf fights, newest first (as scoringEngine).
    const divFights = ((this.data.fighterFights.get(fighterId) || []) as Fight[])
      .filter(
        (f) =>
          f.eventDate &&
          f.eventDate.getTime() < asOf.getTime() &&
          monthsBetween(f.eventDate, asOf) <= cfg.recencyCutoffMonths &&
          (normalizeWeightClassForMove(f.weightClass) ?? division) === division
      )
      .sort((a, b) => (b.eventDate?.getTime() || 0) - (a.eventDate?.getTime() || 0));

    let sosWeighted = 0;
    let sosWeightSum = 0;
    const metricSamples: { strDiff: number; accDiff: number; kd: number; tdDiff: number; sub: number; w: number }[] = [];

    for (const fight of divFights) {
      const persp = getFighterPerspective(fight, fighterId);
      if (!persp) continue;
      const w = recencyWeight(fight.eventDate, asOf, cfg.recencyHalfLifeMonths);
      const oppElo = oppQualityByFight.get(fight.fightId);

      if (oppElo != null && fight.eventDate && monthsBetween(fight.eventDate, asOf) / 12 <= cfg.sosWindowYears) {
        sosWeighted += oppElo * w;
        sosWeightSum += w;
      }
      if (fight.hasMetrics !== false && metricSamples.length < cfg.metricsRecentFights) {
        metricSamples.push({
          strDiff: persp.strSelf - persp.strOpp,
          accDiff: persp.sigStrPctSelf - persp.sigStrPctOpp,
          kd: persp.kdSelf,
          tdDiff: persp.tdSelf - persp.tdOpp,
          sub: persp.subSelf,
          w,
        });
      }
    }

    const sosElo = sosWeightSum > 0 ? sosWeighted / sosWeightSum : cfg.sosAnchorElo;
    const sosNudge = clamp(
      (sosElo - cfg.sosAnchorElo) * cfg.sosSlopePerElo,
      -cfg.sosAdjustCap,
      cfg.sosAdjustCap
    );

    let metricsBonus = computeMetricsBonus(metricSamples, divFights.length);
    if (cfg.metricsQualityDamp && metricsBonus > 0) metricsBonus *= metricsQualityMultiplier(sosElo);

    const pedInfo = this.pedigree?.get(fighterId);
    let pedigreeBonus = 0;
    if (pedInfo) {
      const taper = Math.max(0, 1 - preFightCount / cfg.preUFCPedigree.seedTaperUFCFights);
      pedigreeBonus = pedInfo.strength * cfg.preUFCPedigree.seedMaxElo * taper;
    }

    const untestedPenalty = untestedHoldPenalty(bestWinElo, preFightCount);

    return { metricsBonus, sosNudge, pedigreeBonus, untestedPenalty };
  }
}
