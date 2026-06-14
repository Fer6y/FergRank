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
import { ALL_DIVISIONS } from './types';
import type { RankedFighter } from './types';
import type { LoadedData } from './loadData';

export interface PoolFighter extends RankedFighter {
  division: string;
  isChampion: boolean;
}

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
      if (!prev || f.finalRating > prev.finalRating) {
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
  finalRating: number;
  strengthOfSchedule: number;
}

export async function buildP4P(limit = 30): Promise<P4PEntry[]> {
  const pool = await buildRankedPool();
  return pool
    .slice()
    .sort((a, b) => b.finalRating - a.finalRating)
    .slice(0, limit)
    .map((f, i) => ({
      rank: i + 1,
      fighterId: f.fighterId,
      fullName: f.fullName,
      nickname: f.nickname,
      division: f.division,
      record: f.record,
      isChampion: f.isChampion,
      rankScore: f.rankScore,
      finalRating: f.finalRating,
      strengthOfSchedule: f.strengthOfSchedule,
    }));
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
