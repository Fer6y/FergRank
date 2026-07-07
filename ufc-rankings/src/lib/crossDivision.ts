// ─────────────────────────────────────────────────────────────────────────
//  crossDivision.ts — P4P + specialty leaderboards.
//
//  Elo is one GLOBAL pool (every UFC fight, all divisions), so finalRating is
//  directly comparable across weight classes — that's what makes a principled
//  pound-for-pound list possible without an arbitrary cross-division fudge.
//  Specialty boards are computed from per-fight-normalized career stats over
//  the same already-eligible ranked pool.
// ─────────────────────────────────────────────────────────────────────────

import { getData } from './dataCache';
import { generateDivisionRankings } from './scoringEngine';
import { getFighterHistory, eloToDisplayScore } from './eloEngine';
import { RANKING_CONFIG } from './rankingConfig';
import { ALL_DIVISIONS } from './types';
import type { RankedFighter } from './types';
import type { LoadedData } from './loadData';
import { buildDistinctions, type Distinction } from './distinctions';
import { getFighterMedia } from './fighterMedia';

// Recency-weighted, quality-gated net Elo swing over the recent-form window.
// Each fight's Elo delta is opponent-quality-aware for its SIGN/magnitude, but a
// string of modest wins over mid-tier opposition can still accumulate — so each
// WIN's contribution is additionally gated by the opponent's absolute quality
// (full credit vs an elite, only `qualityFloor` vs a can), mirroring the Elo
// core's winQuality gate. LOSSES keep full weight (losing to a can should still
// hurt). Weighted so the last ~18mo dominate. This measures whether a fighter is
// still beating elites NOW or coasting on a carried-in prime / padding a streak.
// Display-only; used solely to tilt the P4P sort (below).
export function recentFormTilt(data: LoadedData, fighterId: string): number {
  const cfg = RANKING_CONFIG.p4pRecentForm;
  if (!cfg.enabled) return 0;
  const now = Date.now();
  const cutoff = now - cfg.windowYears * 365.25 * 864e5;
  const msPerMonth = (365.25 / 12) * 864e5;
  const qSpan = cfg.qualityFullElo - cfg.qualityLowElo;
  let weighted = 0;
  for (const f of getFighterHistory(data, fighterId)) {
    const t = new Date(f.date).getTime();
    if (!Number.isFinite(t) || t < cutoff) continue;
    const recency = Math.pow(0.5, (now - t) / msPerMonth / cfg.halfLifeMonths);
    let contribution = f.delta;
    if (f.delta > 0) {
      // Gate the GAIN by opponent quality: q=0 at qualityLowElo, 1 at qualityFullElo.
      const q = Math.max(0, Math.min(1, (f.opponentRating - cfg.qualityLowElo) / qSpan));
      contribution *= cfg.qualityFloor + (1 - cfg.qualityFloor) * q;
    }
    weighted += recency * contribution;
  }
  const raw = cfg.lambda * weighted;
  return Math.max(-cfg.cap, Math.min(cfg.cap, raw));
}

export interface PoolFighter extends RankedFighter {
  division: string;
  isChampion: boolean;
}

// P4P is an Elo-POOL board, so it uses the UN-HELD rating: the "untested" hold is
// a within-division ranking device, and double-dinging a shallow-division prospect
// cross-division would be unfair. untestedPenalty is ≤0, so subtracting it ADDS
// the held-back points back.
const unheldRating = (f: RankedFighter): number => f.finalRating - f.untestedPenalty;

const poolCache = new WeakMap<LoadedData, PoolFighter[]>();

// Run all divisions once (default filters), dedup by fighter (a fighter ranked
// in two divisions via an override keeps their higher-rated appearance).
export async function buildRankedPool(): Promise<PoolFighter[]> {
  const data = getData();
  const cached = poolCache.get(data);
  if (cached) return cached;

  const seen = new Map<string, PoolFighter>();
  for (const division of ALL_DIVISIONS) {
    const r = await generateDivisionRankings(division, data);
    for (const f of r.fighters) {
      const prev = seen.get(f.fighterId);
      if (!prev || unheldRating(f) > unheldRating(prev)) {
        seen.set(f.fighterId, { ...f, division, isChampion: f.officialRank === 'C' || f.belt });
      }
    }
  }
  const pool = [...seen.values()];
  poolCache.set(data, pool);
  return pool;
}

export interface P4PEntry {
  rank: number;
  fighterId: string;
  fullName: string;
  nickname: string;
  division: string;
  record: string;
  isChampion: boolean;
  rankScore: number;
  finalRating: number;      // base all-time rating (before the recent-form tilt)
  recentFormTilt: number;   // bounded ± Elo adjustment applied for the P4P sort
  strengthOfSchedule: number;
  distinctions: Distinction[]; // decal badges (display only)
  avatarUrl: string | null;    // head-framed photo for the avatar (display only)
  flag: string | null;         // emoji nationality flag (display only)
}

export async function buildP4P(limit = 30): Promise<P4PEntry[]> {
  const data = getData();
  const pool = await buildRankedPool();
  // Tilt each fighter's rating by their recent form, then sort + score on the
  // tilted rating so the displayed rankScore stays monotonic with the order.
  // P4P-only: the pool's underlying division ratings are untouched.
  return pool
    .map((f) => {
      const tilt = recentFormTilt(data, f.fighterId);
      return { f, tilt, tilted: unheldRating(f) + tilt };
    })
    .sort((a, b) => b.tilted - a.tilted)
    .slice(0, limit)
    .map(({ f, tilt, tilted }, i) => {
      const media = getFighterMedia(f.fighterId);
      return {
        rank: i + 1,
        fighterId: f.fighterId,
        fullName: f.fullName,
        nickname: f.nickname,
        division: f.division,
        record: f.record,
        isChampion: f.isChampion,
        rankScore: eloToDisplayScore(tilted),
        finalRating: unheldRating(f),
        recentFormTilt: tilt,
        strengthOfSchedule: f.strengthOfSchedule,
        distinctions: buildDistinctions({
          fighterName: f.fullName,
          isChampion: f.isChampion,
          history: getFighterHistory(data, f.fighterId),
        }),
        avatarUrl: media?.avatarUrl || null,
        flag: media?.flag || null,
      };
    });
}

// ── Specialty leaderboards ───────────────────────────────────────────────

export interface LeaderEntry {
  fighterId: string;
  fullName: string;
  division: string;
  record: string;
  value: string;   // headline stat, formatted
  score: number;   // sort key
}

export interface Leaderboards {
  finishers: LeaderEntry[];
  knockouts: LeaderEntry[];
  submissions: LeaderEntry[];
  strikers: LeaderEntry[];
  grapplers: LeaderEntry[];
}

const norm01 = (v: number) => (v > 1 ? v / 100 : v);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
// koRate/subRate/finishRate/accuracy are already 0–1 fractions (finishRate can
// tip just over 1.0), so clamp — do NOT apply the >1→/100 percentage heuristic.
const pct = (v: number) => `${Math.round(clamp01(v) * 100)}%`;

export async function buildLeaderboards(limit = 15): Promise<Leaderboards> {
  const data = getData();
  const pool = await buildRankedPool();

  // Enrich each pool fighter with base aggregate stats (career totals →
  // per-fight via fightCount so high-volume fighters aren't unfairly favoured).
  const rows = pool.map((f) => {
    const base = data.fighterMap.get(f.fighterId);
    const fc = Math.max(f.fightCount, 1);
    return {
      f,
      base,
      kdPerFight: (base?.knockdowns ?? 0) / fc,
      tdPerFight: (base?.takedowns ?? 0) / fc,
      subAttPerFight: (base?.subAttempts ?? 0) / fc,
      ctrlPerFight: (base?.controlTime ?? 0) / fc, // seconds
      groundPct: norm01(base?.groundPct ?? 0),
      distancePct: norm01(base?.distancePct ?? 0),
      acc: norm01(base?.sigStrikeAccuracy ?? 0),
    };
  });

  const top = (
    scoreFn: (r: (typeof rows)[number]) => number,
    valueFn: (r: (typeof rows)[number]) => string
  ): LeaderEntry[] =>
    rows
      .map((r) => ({
        fighterId: r.f.fighterId,
        fullName: r.f.fullName,
        division: r.f.division,
        record: r.f.record,
        value: valueFn(r),
        score: scoreFn(r),
      }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

  // Mild sample-size weight so a proven high-rate fighter outranks a 3-fight
  // 100%-er, without overriding the rate (display stays the honest rate).
  const sample = (r: (typeof rows)[number]) => 0.7 + 0.3 * clamp01(r.f.fightCount / 10);

  return {
    finishers: top(
      (r) => r.f.finishRate * sample(r),
      (r) => pct(r.f.finishRate)
    ),
    knockouts: top(
      (r) => (r.f.koRate * 0.7 + clamp01(r.kdPerFight) * 0.3) * sample(r),
      (r) => pct(r.f.koRate)
    ),
    submissions: top(
      (r) => (r.f.subRate * 0.7 + clamp01(r.subAttPerFight / 1.5) * 0.3) * sample(r),
      (r) => pct(r.f.subRate)
    ),
    strikers: top(
      (r) => r.acc * 0.4 + r.distancePct * 0.3 + clamp01(r.kdPerFight) * 0.3,
      (r) => pct(r.acc)
    ),
    grapplers: top(
      (r) => clamp01(r.tdPerFight / 3) * 0.4 + r.groundPct * 0.3 + clamp01(r.ctrlPerFight / 300) * 0.3,
      (r) => `${r.tdPerFight.toFixed(1)} TD/f`
    ),
  };
}
