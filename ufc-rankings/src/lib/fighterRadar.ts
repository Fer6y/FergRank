// ─────────────────────────────────────────────────────────────────────────
//  fighterRadar.ts — the 5-axis profile radar (DISPLAY ONLY)
//
//  Rebuilt (2026-06-14) so the radar reflects fighting STYLE, not a single raw
//  career percentage per axis. It reuses the exact per-fight, recency-weighted
//  signals the ranking metrics use (getFighterPerspective + recencyWeight) over
//  a fighter's recent division fights:
//
//    STRIKE  = output volume + KO/knockdown power + accuracy + output edge
//    GRAPPLE = takedown differential + control time + ground share
//    FINISH  = career finish rate + recent knockdown threat
//    ACTIVE  = recency of last fight
//    OPP Q   = strength of schedule (opponent Elo)
//
//  Every weight/norm lives in RANKING_CONFIG.radar — nothing is hardcoded here.
//  This NEVER feeds finalRating; it only changes what the radar draws.
// ─────────────────────────────────────────────────────────────────────────

import { RANKING_CONFIG } from './rankingConfig';
import { getFighterPerspective, recencyWeight } from './scoringEngine';
import type { LoadedData } from './loadData';

export interface RadarAxes {
  strike: number;
  grappling: number;
  finishing: number;
  activity: number;
  oppQuality: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
// Map a signed ratio in [-1, 1] onto [0, 1] (0 → 0.5 = league average).
const signedTo01 = (v: number) => (clamp(v, -1, 1) + 1) / 2;
// Some CSV percentage columns are 0–1, some 0–100 — normalize defensively.
const norm01 = (v: number) => (v > 1 ? v / 100 : v);

export interface RadarContext {
  sos: number | null;           // 0–100 strength of schedule (null if unranked)
  eloDisplay: number;           // 0–100 fallback for OPP Q when SoS is absent
  monthsSinceLastFight: number;
  careerFinishRate: number;     // koRate + subRate (0–1)
  // Career fallbacks used only when the fighter has no per-fight metric sample.
  careerSigAccuracy: number;
  careerGroundPct: number;
}

/**
 * Compute the five radar axes (each 0–1) for a fighter, recency-weighted over
 * their recent division fights. Falls back to career aggregates only when no
 * per-fight metric data exists (e.g. a fighter known solely from Sherdog
 * recency rows, which carry no per-fight metrics).
 */
export function computeRadarAxes(
  data: LoadedData,
  fighterId: string,
  division: string | null,
  ctx: RadarContext
): RadarAxes {
  const cfg = RANKING_CONFIG.radar;
  const norm = RANKING_CONFIG.metricsNorm;
  const now = new Date();
  const halfLife = RANKING_CONFIG.recencyHalfLifeMonths;

  // Recent fights with real per-fight metrics, most recent first. When a
  // division is known, restrict to it (matches how the ranking metrics sample);
  // otherwise sample across the fighter's whole record.
  const fights = (data.fighterFights.get(fighterId) || [])
    .filter(
      (f) =>
        f.eventDate &&
        f.hasMetrics !== false &&
        (!division || f.weightClass === division)
    )
    .sort((a, b) => b.eventDate!.getTime() - a.eventDate!.getTime())
    .slice(0, cfg.recentFights);

  let wSum = 0;
  let vol = 0;      // strikes landed
  let volDiff = 0;  // landed − absorbed
  let acc = 0;      // sig-strike accuracy (0–1)
  let kd = 0;       // knockdowns
  let tdDiff = 0;   // takedowns landed − absorbed
  let ctrl = 0;     // control seconds

  for (const f of fights) {
    const p = getFighterPerspective(f, fighterId);
    if (!p) continue;
    const w = recencyWeight(f.eventDate, now, halfLife);
    const ctrlSelf = f.fighterId1 === fighterId ? f.ctrl1 : f.ctrl2;
    vol += p.strSelf * w;
    volDiff += (p.strSelf - p.strOpp) * w;
    acc += norm01(p.sigStrPctSelf) * w;
    kd += p.kdSelf * w;
    tdDiff += (p.tdSelf - p.tdOpp) * w;
    ctrl += (ctrlSelf || 0) * w;
    wSum += w;
  }

  // OPP Q: schedule strength, the one axis that doesn't come from per-fight form.
  const oppQuality = clamp01((ctx.sos ?? ctx.eloDisplay) / 100);
  // ACTIVE: 0 months out → 1, activityFullMonths out → 0.
  const activity = clamp01(1 - ctx.monthsSinceLastFight / cfg.activityFullMonths);

  // No per-fight metric sample → fall back to career aggregates so the radar is
  // never blank. Striking from accuracy + KO rate; grappling from ground share.
  if (wSum === 0) {
    return {
      strike: clamp01(
        0.6 * clamp01(norm01(ctx.careerSigAccuracy) / cfg.accuracyFull) +
          0.4 * clamp01(ctx.careerFinishRate)
      ),
      grappling: clamp01(norm01(ctx.careerGroundPct)),
      finishing: clamp01(ctx.careerFinishRate),
      activity,
      oppQuality,
    };
  }

  const avgVol = vol / wSum;
  const avgVolDiff = volDiff / wSum;
  const avgAcc = acc / wSum;
  const avgKd = kd / wSum;
  const avgTdDiff = tdDiff / wSum;
  const avgCtrl = ctrl / wSum;

  // Per-axis normalized components (each 0–1).
  const nVolume = clamp01(avgVol / cfg.volumeStrikePerFightFull);
  const nVolDiff = signedTo01(avgVolDiff / norm.volumeStrikePerFight);
  const nAccuracy = clamp01(avgAcc / cfg.accuracyFull);
  const nPower = clamp01(avgKd / norm.knockdownsPerFight);
  const nTdDiff = signedTo01(avgTdDiff / norm.takedownsPerFight);
  const nControl = clamp01(avgCtrl / cfg.controlSecondsFull);
  const nGround = clamp01(norm01(ctx.careerGroundPct));

  const sw = cfg.strikeWeights;
  const strike = clamp01(
    sw.volume * nVolume +
      sw.power * nPower +
      sw.accuracy * nAccuracy +
      sw.differential * nVolDiff
  );

  const gw = cfg.grappleWeights;
  const grappling = clamp01(
    gw.takedownDiff * nTdDiff + gw.control * nControl + gw.groundShare * nGround
  );

  const fw = cfg.finishWeights;
  const finishing = clamp01(
    fw.careerFinishRate * clamp01(ctx.careerFinishRate) + fw.recentKnockdown * nPower
  );

  return { strike, grappling, finishing, activity, oppQuality };
}
