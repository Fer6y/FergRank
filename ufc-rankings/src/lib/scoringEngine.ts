// ─────────────────────────────────────────────────────────────────────────
//  scoringEngine.ts — turns Elo ratings into a ranked division (v2)
//
//  The heavy lifting (opponent quality, recency, finishes, weight-class moves)
//  lives in eloEngine.ts. This file:
//    1. Decides who is eligible for a division (official rank OR fight history).
//    2. Reads each fighter's Elo and layers BOUNDED adjustments:
//         finalRating = elo + metricsBonus + sosNudge + officialBonus
//       Elo dominates; the rest only refine ties and edge cases.
//    3. Sorts, applies a head-to-head correction, then official safety floors.
//
//  Nothing is hardcoded — every weight comes from RANKING_CONFIG.
// ─────────────────────────────────────────────────────────────────────────

import { RANKING_CONFIG } from './rankingConfig';
import { fetchOfficialRankings, getOfficialRankingsForDivision } from './fetchOfficialRankings';
import { buildNameIndex, resolveNameToId } from './nameResolver';
import { buildEloRatings, getElo, eloToDisplayScore, normalizeWeightClassForMove } from './eloEngine';
import { getRegistry } from './registry';
import { effectiveEngine, DEFAULT_FILTERS, type FilterParams, type EffectiveEngine } from './filters';
import { loadPedigreeStrength } from './pedigreeSeed';
import type { Fight, RankedFighter, DivisionRankings } from './types';
import type { LoadedData } from './loadData';

// ─── Helpers ─────────────────────────────────────────────────

function monthsBetween(d1: Date, d2: Date): number {
  return (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

function isBeyondCutoff(fightDate: Date | null, now: Date): boolean {
  if (!fightDate) return true;
  return monthsBetween(fightDate, now) > RANKING_CONFIG.recencyCutoffMonths;
}

// Era filter: only count fights from the chosen start year onward (null = all).
function inEra(fightDate: Date | null, eraStartYear: number | null): boolean {
  if (eraStartYear == null) return true;
  if (!fightDate) return true; // dateless fights are already dropped by isBeyondCutoff
  return fightDate.getFullYear() >= eraStartYear;
}

export function recencyWeight(fightDate: Date | null, now: Date, halfLifeMonths: number): number {
  if (!fightDate) return 0;
  const months = monthsBetween(fightDate, now);
  if (months < 0) return 1; // future-dated data glitch → treat as current
  return Math.pow(0.5, months / halfLifeMonths);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Display-only: how CURRENT a fighter's résumé is, in [0,1]. Blends recency
// (months since last fight, past a grace window) with cadence (fights per year
// over the SoS window). Feeds the schedule-strength display composite ONLY —
// never the rating (the Elo core already handles inactivity via regression).
function scheduleActivityFactor(monthsSinceLastFight: number, fightsInWindow: number): number {
  const {
    activityGraceMonths, activityFullDecayMonths, activityTargetFightsPerYear,
    activityCadenceWeight, sosWindowYears,
  } = RANKING_CONFIG;
  const recency = clamp(
    1 - (monthsSinceLastFight - activityGraceMonths) / (activityFullDecayMonths - activityGraceMonths),
    0, 1,
  );
  const cadence = clamp(fightsInWindow / (sosWindowYears * activityTargetFightsPerYear), 0, 1);
  return (1 - activityCadenceWeight) * recency + activityCadenceWeight * cadence;
}

// A fighter's view of a single fight (self vs opponent), used for metrics.
export interface Perspective {
  isWin: boolean;
  isLoss: boolean;
  opponentId: string;
  strSelf: number;
  strOpp: number;
  sigStrPctSelf: number;
  sigStrPctOpp: number;
  kdSelf: number;
  tdSelf: number;
  tdOpp: number;
}

export function getFighterPerspective(fight: Fight, fighterId: string): Perspective | null {
  if (fight.fighterId1 === fighterId) {
    return {
      isWin: fight.result1 === 'W', isLoss: fight.result1 === 'L',
      opponentId: fight.fighterId2,
      strSelf: fight.str1, strOpp: fight.str2,
      sigStrPctSelf: fight.sigStrPct1, sigStrPctOpp: fight.sigStrPct2,
      kdSelf: fight.kd1, tdSelf: fight.td1, tdOpp: fight.td2,
    };
  }
  if (fight.fighterId2 === fighterId) {
    return {
      isWin: fight.result2 === 'W', isLoss: fight.result2 === 'L',
      opponentId: fight.fighterId1,
      strSelf: fight.str2, strOpp: fight.str1,
      sigStrPctSelf: fight.sigStrPct2, sigStrPctOpp: fight.sigStrPct1,
      kdSelf: fight.kd2, tdSelf: fight.td2, tdOpp: fight.td1,
    };
  }
  return null;
}

// ─── Official safety floors (unchanged behavior) ─────────────

// Count consecutive losses from a fighter's most recent UFC fight backward.
// A win/draw/NC ends the streak. Used to suppress contender floors for fighters
// the cage is telling us are in decline.
function recentLossStreak(fighterId: string, data: LoadedData): number {
  const fights = (data.fighterFights.get(fighterId) || [])
    .filter((f) => f.eventDate)
    .sort((a, b) => b.eventDate!.getTime() - a.eventDate!.getTime());
  let streak = 0;
  for (const f of fights) {
    const result = f.fighterId1 === fighterId ? f.result1 : f.result2;
    if (result === 'L') streak++;
    else break;
  }
  return streak;
}

function applyOfficialFloors(
  rankedFighters: RankedFighter[],
  officialRankMap: Map<string, string>,
  division: string,
  data: LoadedData
): void {
  const tiers = [
    { ranks: ['6','7','8','9','10','11','12','13','14','15'], floor: RANKING_CONFIG.top15FloorRank, name: 'top15FloorRank', contender: true },
    { ranks: ['1','2','3','4','5'], floor: RANKING_CONFIG.top5FloorRank, name: 'top5FloorRank', contender: true },
    { ranks: ['C'], floor: RANKING_CONFIG.championFloorRank, name: 'championFloorRank', contender: false },
  ];

  for (const tier of tiers) {
    for (const fighter of [...rankedFighters]) {
      const officialRank = officialRankMap.get(fighter.fighterId);
      if (!officialRank || !tier.ranks.includes(officialRank)) continue;

      // Contender floors don't protect a fighter on a losing streak — let the
      // Elo drop stand (the champion floor is unconditional).
      if (tier.contender) {
        const streak = recentLossStreak(fighter.fighterId, data);
        if (streak >= RANKING_CONFIG.contenderFloorSuppressLossStreak) {
          console.log(
            `[scoringEngine] FLOOR SUPPRESSED in ${division}: ${fighter.fullName} ` +
            `(UFC #${officialRank}) on a ${streak}-fight skid — ${tier.name} not applied`
          );
          continue;
        }
      }

      const currentIndex = rankedFighters.indexOf(fighter);
      const floorIndex = tier.floor - 1;
      if (currentIndex > floorIndex) {
        const oldRank = currentIndex + 1;
        rankedFighters.splice(currentIndex, 1);
        rankedFighters.splice(floorIndex, 0, fighter);
        console.log(
          `[scoringEngine] FLOOR APPLIED in ${division}: ${fighter.fullName} ` +
          `lifted from #${oldRank} to #${floorIndex + 1} (rule: ${tier.name})`
        );
      }
    }
  }
}

// ─── Main ────────────────────────────────────────────────────

// Memoized entry point: one scoring pass per (data, division, filter
// signature, UTC day). The Elo sweep was already cached, but the scoring layer
// on top (eligibility, SoS/metrics loops, head-to-head) re-ran on every call —
// and every surface fans out over all 12 divisions. The PROMISE is cached so
// concurrent cold requests share one compute; a rejected compute is evicted so
// a transient failure isn't served for the rest of the day. Day in the key
// because the pass bakes in "now" (recency windows, activity, inactivity).
const rankingsCache = new WeakMap<LoadedData, Map<string, Promise<DivisionRankings>>>();
const RANKINGS_CACHE_MAX = 64;

export function generateDivisionRankings(
  division: string,
  data: LoadedData,
  filters: FilterParams = DEFAULT_FILTERS
): Promise<DivisionRankings> {
  // Effective engine from the user filters; neutral filters === RANKING_CONFIG.
  const engine = effectiveEngine(filters);

  let perData = rankingsCache.get(data);
  if (!perData) { perData = new Map(); rankingsCache.set(data, perData); }
  const cacheMap = perData;
  const key = `${division}|${engine.signature}|${new Date().toISOString().slice(0, 10)}`;
  const hit = cacheMap.get(key);
  if (hit) return hit;

  const pending = computeDivisionRankings(division, data, engine).catch((err) => {
    cacheMap.delete(key); // never cache a failure
    throw err;
  });
  if (cacheMap.size >= RANKINGS_CACHE_MAX) cacheMap.delete(cacheMap.keys().next().value as string);
  cacheMap.set(key, pending);
  return pending;
}

async function computeDivisionRankings(
  division: string,
  data: LoadedData,
  engine: EffectiveEngine
): Promise<DivisionRankings> {
  const now = new Date();
  const { fighters, fighterFights } = data;

  const eraStartYear = engine.eraStartYear;
  const halfLife = engine.recencyHalfLifeMonths;

  const elo = buildEloRatings(data, engine);

  // Pre-UFC pedigree seed (Sherdog) — only loaded when the master toggle is on.
  // When off, pedigreeBonus stays 0 everywhere and finalRating is unchanged.
  const pedigree = RANKING_CONFIG.preUFCPedigree.seedEnabled
    ? loadPedigreeStrength(data)
    : null;

  // 1. Official rankings: authority on division membership + the seed/floor.
  const officialSeedMap = new Map<string, number>();   // fighterId → seed score (100/90/…)
  const officialRankMap = new Map<string, string>();   // fighterId → "C"/"1"/…
  const officiallyInDivision = new Set<string>();
  const removedFromDivision = new Set<string>();
  const nameIndex = buildNameIndex(fighters);
  // Resolve official-ranking / override names through the canonical registry
  // first (curated aliases unified across all sources), falling back to the
  // fuzzy resolver. A SUPERSET of the legacy resolution — may seed a few more
  // fighters whose UFC.com spelling the fuzzy matcher missed.
  const registry = getRegistry();
  const resolveOfficial = (name: string): string | null =>
    registry.resolve(name) ?? resolveNameToId(name, nameIndex);

  for (const [name, override] of Object.entries(RANKING_CONFIG.divisionOverrides)) {
    const fighterId = resolveOfficial(name);
    if (!fighterId) continue;
    if (override.division === division) {
      officiallyInDivision.add(fighterId);
      officialSeedMap.set(fighterId, RANKING_CONFIG.officialRankScores[override.rank] || 0);
      officialRankMap.set(fighterId, override.rank);
    }
    if (override.removeFrom === division) removedFromDivision.add(fighterId);
  }

  try {
    const officialRankings = await fetchOfficialRankings();
    const divRankings = getOfficialRankingsForDivision(officialRankings, division);
    for (const ranked of divRankings) {
      const fighterId = resolveOfficial(ranked.name);
      if (!fighterId || removedFromDivision.has(fighterId)) continue;
      if (!officialSeedMap.has(fighterId)) {
        officialSeedMap.set(fighterId, RANKING_CONFIG.officialRankScores[ranked.rank] || 0);
      }
      if (!officialRankMap.has(fighterId)) officialRankMap.set(fighterId, ranked.rank);
      officiallyInDivision.add(fighterId);
    }
  } catch {
    console.warn('[scoringEngine] Could not fetch official rankings, proceeding without seed');
  }

  // A fight's effective division FOR A GIVEN fighter: its normalized weight class,
  // or — for a divisionless bout (catch/open weight) — the fighter's home division.
  // A short-notice or opponent-missed-weight catch-weight fight is NOT a division
  // change, so it still counts toward the division the fighter actually competes in.
  const effectiveDivision = (wc: string, home: string): string =>
    normalizeWeightClassForMove(wc) ?? home;

  // 2. Eligibility — official membership OR fight history says this is the division.
  const eligibleFighters = fighters.filter((f) => {
    if (removedFromDivision.has(f.fighterId)) return false;
    const allFights = fighterFights.get(f.fighterId) || [];
    if (allFights.length < RANKING_CONFIG.minUFCFights) return false;
    if (officiallyInDivision.has(f.fighterId)) return true;
    if (f.weightClass !== division) return false;

    const recentFights = allFights.filter(
      (fight) => !isBeyondCutoff(fight.eventDate, now) && inEra(fight.eventDate, eraStartYear)
    );
    const divFightsInWindow = recentFights.filter((fight) => effectiveDivision(fight.weightClass, division) === division);
    if (divFightsInWindow.length < 2) return false;

    const mostRecent = recentFights
      .filter((x) => x.eventDate)
      .sort((a, b) => b.eventDate!.getTime() - a.eventDate!.getTime())[0];
    if (mostRecent && effectiveDivision(mostRecent.weightClass, division) !== division) return false;
    return true;
  });

  // 3. Score each eligible fighter off their Elo + bounded adjustments.
  const rankedFighters: RankedFighter[] = [];

  for (const fighter of eligibleFighters) {
    const fights = fighterFights.get(fighter.fighterId) || [];
    const eloState = getElo(elo, fighter.fighterId);

    const divFights = fights
      .filter((f) => !isBeyondCutoff(f.eventDate, now) && inEra(f.eventDate, eraStartYear) && effectiveDivision(f.weightClass, division) === division)
      .sort((a, b) => (b.eventDate?.getTime() || 0) - (a.eventDate?.getTime() || 0));

    // ── Strength of schedule: recency-weighted avg opponent Elo in window ──
    let sosWeighted = 0;
    let sosWeightSum = 0;
    const metricSamples: { strDiff: number; accDiff: number; kd: number; tdDiff: number; w: number }[] = [];

    for (const fight of divFights) {
      const persp = getFighterPerspective(fight, fighter.fighterId);
      if (!persp) continue;
      const w = recencyWeight(fight.eventDate, now, halfLife);

      if (fight.eventDate && monthsBetween(fight.eventDate, now) / 12 <= RANKING_CONFIG.sosWindowYears) {
        const oppElo = getElo(elo, persp.opponentId).rating;
        sosWeighted += oppElo * w;
        sosWeightSum += w;
      }

      // Sherdog recency top-up fights carry no per-fight metrics — include them
      // in Elo/SoS/recency (handled elsewhere) but NEVER in the strike/grappling
      // composite, or they'd drag the averages toward zero.
      if (fight.hasMetrics !== false && metricSamples.length < RANKING_CONFIG.metricsRecentFights) {
        metricSamples.push({
          strDiff: persp.strSelf - persp.strOpp,
          accDiff: persp.sigStrPctSelf - persp.sigStrPctOpp,
          kd: persp.kdSelf,
          tdDiff: persp.tdSelf - persp.tdOpp,
          w,
        });
      }
    }

    const sosElo = sosWeightSum > 0 ? sosWeighted / sosWeightSum : RANKING_CONFIG.sosAnchorElo;
    const sosNudge = clamp(
      (sosElo - RANKING_CONFIG.sosAnchorElo) * RANKING_CONFIG.sosSlopePerElo,
      -RANKING_CONFIG.sosAdjustCap,
      RANKING_CONFIG.sosAdjustCap
    );

    // ── Striking/grappling metrics (bounded ± Elo points) ──
    const metricsBonus = computeMetricsBonus(metricSamples, divFights.length);

    // ── Official seed (small; floors are the real backstop) ──
    const officialBonus = (officialSeedMap.get(fighter.fighterId) || 0) * RANKING_CONFIG.officialBonusScaleElo;
    const officialRank = officialRankMap.get(fighter.fighterId) || null;

    // ── Pre-UFC pedigree seed (gated by seedEnabled; thin-sample only) ──
    // Tapers from full at 0 UFC fights to ZERO at seedTaperUFCFights, so a real
    // UFC sample always overrides it. pedigree is null when the toggle is off.
    const pedInfo = pedigree?.get(fighter.fighterId);
    const pedigreeStrength = pedInfo?.strength ?? 0;
    let pedigreeBonus = 0;
    if (pedInfo) {
      const taper = Math.max(0, 1 - fights.length / RANKING_CONFIG.preUFCPedigree.seedTaperUFCFights);
      pedigreeBonus = pedInfo.strength * RANKING_CONFIG.preUFCPedigree.seedMaxElo * taper;
    }

    const finalRating = eloState.rating + metricsBonus + sosNudge + officialBonus + pedigreeBonus;

    const lastDivFightDate = divFights[0]?.eventDate || eloState.lastFightDate;
    const monthsSinceLastFight = lastDivFightDate ? monthsBetween(lastDivFightDate, now) : 999;
    const finishRate = fighter.koRate + fighter.subRate;

    // Schedule-strength display composite: opponent quality discounted by how
    // current the résumé is. Display only — does NOT enter finalRating above.
    const sosQualityScore = eloToDisplayScore(sosElo);
    const scheduleActivity = scheduleActivityFactor(monthsSinceLastFight, divFights.length);
    const scheduleStrength =
      sosQualityScore *
      (RANKING_CONFIG.activityFloor + (1 - RANKING_CONFIG.activityFloor) * scheduleActivity);

    rankedFighters.push({
      rank: 0,
      fighterId: fighter.fighterId,
      fullName: fighter.fullName,
      nickname: fighter.nickname,
      record: `${fighter.wins}-${fighter.losses}-${fighter.draws}`,
      weightClass: fighter.weightClass,
      belt: fighter.belt,
      rankScore: Math.round(eloToDisplayScore(finalRating) * 100) / 100,
      finalRating: Math.round(finalRating * 100) / 100,
      eloRating: Math.round(eloState.rating * 100) / 100,
      eloPeak: Math.round(eloState.peakRating * 100) / 100,
      metricsBonus: Math.round(metricsBonus * 100) / 100,
      sosNudge: Math.round(sosNudge * 100) / 100,
      officialBonus: Math.round(officialBonus * 100) / 100,
      pedigreeBonus: Math.round(pedigreeBonus * 100) / 100,
      pedigreeStrength: Math.round(pedigreeStrength * 1000) / 1000,
      officialRank,
      strengthOfSchedule: Math.round(sosQualityScore * 100) / 100,
      scheduleStrength: Math.round(scheduleStrength * 100) / 100,
      scheduleActivity: Math.round(scheduleActivity * 1000) / 1000,
      sosElo: Math.round(sosElo * 100) / 100,
      monthsSinceLastFight: Math.round(monthsSinceLastFight * 10) / 10,
      recentFightCount: divFights.length,
      sigStrikeAccuracy: fighter.sigStrikeAccuracy,
      koRate: fighter.koRate,
      subRate: fighter.subRate,
      finishRate: Math.round(finishRate * 100) / 100,
      fightCount: fights.length,
    });
  }

  // 4. Sort by final rating; SoS is the tiebreaker.
  rankedFighters.sort((a, b) => {
    if (b.finalRating !== a.finalRating) return b.finalRating - a.finalRating;
    return b.sosElo - a.sosElo;
  });

  // 5. Head-to-head leapfrog: a fighter who recently + decisively beat someone
  //    ranked above them is lifted to directly above that opponent (guard-railed).
  applyHeadToHead(rankedFighters, data, division, now, eraStartYear);

  // 6. Champion tiebreaker: a reigning champ in a near-tie wins the top slot.
  applyChampionTiebreaker(rankedFighters, division);

  // 7. Official safety floors (should rarely fire if Elo is landing).
  applyOfficialFloors(rankedFighters, officialRankMap, division, data);

  // 8. Display-only monotonicity: steps 5–7 reorder the array but never touch
  //    rankScore, so a lifted fighter (especially a champion pinned to the top
  //    of the UI) can show a LOWER score than someone ranked below them. Raise
  //    each displayed score to at least the one beneath it (bottom→top) so the
  //    headline number always agrees with the rank. finalRating / eloRating are
  //    left intact (the true ratings are still shown on profiles / compare).
  for (let i = rankedFighters.length - 2; i >= 0; i--) {
    if (rankedFighters[i].rankScore < rankedFighters[i + 1].rankScore) {
      rankedFighters[i].rankScore = rankedFighters[i + 1].rankScore;
    }
  }
  // A reigning champion is pinned ABOVE the numbered list in the UI regardless of
  // rating, so their displayed score must lead the division — otherwise the champ
  // hero shows a lower score than the #1 contender beneath it (e.g. a belt-holder
  // rated below a contender). The true rating stays in finalRating / eloRating.
  const topScore = rankedFighters[0]?.rankScore ?? 0;
  for (const f of rankedFighters) {
    if (f.officialRank === 'C' && f.rankScore < topScore) f.rankScore = topScore;
  }

  const ranked = rankedFighters
    .slice(0, RANKING_CONFIG.rankingsDepth)
    .map((f, i) => ({ ...f, rank: i + 1 }));

  return {
    division,
    gender: division.startsWith("Women's") ? 'Female' : 'Male',
    fighters: ranked,
    generatedAt: now.toISOString(),
  };
}

// ─── Metrics composite ───────────────────────────────────────

function computeMetricsBonus(
  samples: { strDiff: number; accDiff: number; kd: number; tdDiff: number; w: number }[],
  scoredFightCount: number
): number {
  if (samples.length === 0) return 0;

  let wSum = 0, str = 0, acc = 0, kd = 0, td = 0;
  for (const s of samples) {
    str += s.strDiff * s.w;
    acc += s.accDiff * s.w;
    kd += s.kd * s.w;
    td += s.tdDiff * s.w;
    wSum += s.w;
  }
  if (wSum === 0) return 0;

  const norm = RANKING_CONFIG.metricsNorm;
  const nStr = clamp((str / wSum) / norm.volumeStrikePerFight, -1, 1);
  const nAcc = clamp((acc / wSum) / norm.accuracyEdge, -1, 1);
  const nKd = clamp((kd / wSum) / norm.knockdownsPerFight, 0, 1);
  const nTd = clamp((td / wSum) / norm.takedownsPerFight, -1, 1);

  const wts = RANKING_CONFIG.metricsWeights;
  const composite =
    nStr * wts.volumeStrikeDifferential +
    nAcc * wts.strikeAccuracyDifferential +
    nKd * wts.knockdownRate +
    nTd * wts.takedownDifferential;

  // Dampen for thin samples so a 3-fight fighter's metrics can't swing them.
  const confidence = Math.min(scoredFightCount / RANKING_CONFIG.metricsConfidenceMinFights, 1.0);
  return composite * RANKING_CONFIG.metricsScaleElo * confidence;
}

// ─── Champion tiebreaker ─────────────────────────────────────
// A reigning champion (official rank "C") ranked directly below a non-champion
// whose finalRating is within championTiebreakerBand gets the higher slot.
// Single forward pass, adjacent swaps only — breaks near-ties, never boosts a
// champ past someone clearly ahead.
function applyChampionTiebreaker(rankedFighters: RankedFighter[], division: string): void {
  const band = RANKING_CONFIG.championTiebreakerBand;
  for (let i = 1; i < rankedFighters.length; i++) {
    const champ = rankedFighters[i];
    const above = rankedFighters[i - 1];
    if (champ.officialRank !== 'C' || above.officialRank === 'C') continue;
    const gap = above.finalRating - champ.finalRating;
    if (gap > 0 && gap <= band) {
      rankedFighters[i - 1] = champ;
      rankedFighters[i] = above;
      console.log(
        `[scoringEngine] CHAMP TIEBREAK in ${division}: ${champ.fullName} ` +
        `(${champ.finalRating}) lifted over ${above.fullName} (${above.finalRating}) — gap ${gap.toFixed(2)} ≤ ${band}`
      );
    }
  }
}

// ─── Head-to-head correction ─────────────────────────────────

// A split decision is not a clean enough result to reorder the division.
// (Draws / no-contests never set a winner below, so they're excluded already.)
function isIndecisive(method: string): boolean {
  return /S-DEC/i.test(method);
}

function applyHeadToHead(
  rankedFighters: RankedFighter[],
  data: LoadedData,
  division: string,
  now: Date,
  eraStartYear: number | null
): void {
  const cfg = RANKING_CONFIG.headToHead;

  // In-division fights inside the active window/era, oldest→newest so the LATEST
  // meeting between any pair overwrites earlier ones. Normalize the label so an
  // interim title fight ("Interim Lightweight") counts as the division — without
  // this, title fights (exactly where head-to-head matters most) are skipped.
  const divFights = data.fights
    .filter(
      (f) =>
        // null (catch/open weight) counts toward THIS division; edges still only
        // form between two fighters both ranked here, so this can't leak across.
        (normalizeWeightClassForMove(f.weightClass) ?? division) === division &&
        !isBeyondCutoff(f.eventDate, now) &&
        inEra(f.eventDate, eraStartYear)
    )
    .sort((a, b) => (a.eventDate?.getTime() || 0) - (b.eventDate?.getTime() || 0));

  // Latest qualifying meeting per ordered pair: who won and when.
  type Meeting = { winnerId: string; date: Date };
  const lastMeeting = new Map<string, Meeting>();
  for (const f of divFights) {
    if (!f.eventDate) continue;
    if (cfg.decisiveOnly && isIndecisive(f.method)) continue;
    let winnerId: string | null = null;
    if (f.result1 === 'W') winnerId = f.fighterId1;
    else if (f.result2 === 'W') winnerId = f.fighterId2;
    if (!winnerId) continue;
    const m: Meeting = { winnerId, date: f.eventDate };
    lastMeeting.set(`${f.fighterId1}|${f.fighterId2}`, m);
    lastMeeting.set(`${f.fighterId2}|${f.fighterId1}`, m);
  }

  // Each fighter's LOSSES (opponent + date) across ALL divisions — a form signal
  // used to decide whether a post-H2H loss should negate the leapfrog (see below).
  const lossEvents = new Map<string, { oppId: string; t: number }[]>();
  if (cfg.negateOnLossAfter) {
    const addLoss = (id: string, oppId: string, t: number) => {
      const arr = lossEvents.get(id);
      if (arr) arr.push({ oppId, t });
      else lossEvents.set(id, [{ oppId, t }]);
    };
    for (const f of data.fights) {
      if (!f.eventDate || !inEra(f.eventDate, eraStartYear)) continue;
      const t = f.eventDate.getTime();
      if (f.result1 === 'L') addLoss(f.fighterId1, f.fighterId2, t);
      if (f.result2 === 'L') addLoss(f.fighterId2, f.fighterId1, t);
    }
  }

  // Current (pre-leapfrog) sorted position of each fighter, for rank-aware
  // negation. Stable during edge gathering; we only reorder in the apply loop.
  const rankIndexById = new Map<string, number>();
  rankedFighters.forEach((rf, idx) => rankIndexById.set(rf.fighterId, idx));

  // Gather qualifying leapfrog edges (winner currently ranked BELOW loser),
  // then apply them victim-topmost-first so a winner lands just above the
  // highest-ranked opponent they've earned it against.
  type Edge = { winnerId: string; loserId: string; loserIdx: number; date: Date };
  const edges: Edge[] = [];
  for (let i = 0; i < rankedFighters.length; i++) {
    const loser = rankedFighters[i]; // potential victim (higher rank)
    for (let j = i + 1; j < rankedFighters.length; j++) {
      const winner = rankedFighters[j]; // ranked below the victim
      const meeting = lastMeeting.get(`${winner.fighterId}|${loser.fighterId}`);
      if (!meeting || meeting.winnerId !== winner.fighterId) continue;
      if (monthsBetween(meeting.date, now) > cfg.recencyMonths) continue; // stale win
      if (cfg.negateOnLossAfter) {
        // A post-H2H loss negates the leapfrog ONLY when it signals the winner's
        // form genuinely turned: a rematch loss to this same victim, or a loss to
        // someone NOT clearly better than the victim (ranked at/below them). A loss
        // to a HIGHER-ranked fighter (e.g. losing the title to the champ) does not
        // erase a clean, recent win over a lower-ranked opponent.
        const losses = lossEvents.get(winner.fighterId) ?? [];
        const formTurned = losses.some((L) => {
          if (L.t <= meeting.date.getTime()) return false;  // loss predates the H2H — irrelevant
          if (L.oppId === loser.fighterId) return true;     // lost the rematch to the victim
          const oppIdx = rankIndexById.get(L.oppId);
          if (oppIdx === undefined) return false;           // loss outside this division — ignore
          // Losing to the reigning champ never negates a win over a contender. The
          // champ may sit BELOW the victim here by raw rating (the champ floor that
          // lifts them runs later, step 7), so check the belt explicitly, not order.
          if (rankedFighters[oppIdx].officialRank === 'C') return false;
          return oppIdx >= i;                               // lost to someone at/below the victim
        });
        if (formTurned) continue;
      }
      if (loser.finalRating - winner.finalRating > cfg.eloGapCap) continue; // too far below
      edges.push({ winnerId: winner.fighterId, loserId: loser.fighterId, loserIdx: i, date: meeting.date });
    }
  }
  edges.sort((a, b) => a.loserIdx - b.loserIdx);

  const idxOf = (id: string) => rankedFighters.findIndex((rf) => rf.fighterId === id);
  const moved = new Set<string>(); // each fighter relocates at most once (cycle guard)
  for (const e of edges) {
    if (moved.has(e.winnerId)) continue;
    const wi = idxOf(e.winnerId);
    const li = idxOf(e.loserId);
    if (wi < 0 || li < 0 || wi <= li) continue; // already above the victim
    const [w] = rankedFighters.splice(wi, 1);
    rankedFighters.splice(li, 0, w); // insert directly above the victim
    moved.add(e.winnerId);
    const victim = rankedFighters[li + 1];
    console.log(
      `[scoringEngine] H2H LEAPFROG in ${division}: ${w.fullName} lifted above ` +
      `${victim.fullName} (beat them ${e.date.toISOString().slice(0, 10)}, ` +
      `gap ${(victim.finalRating - w.finalRating).toFixed(1)} Elo)`
    );
  }
}
