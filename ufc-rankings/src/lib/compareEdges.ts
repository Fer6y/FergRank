// ── Compare-page Edge Scores ─────────────────────────────────────────────
// Turns the raw head-to-head stat tables into an *interpreted* read: for each
// category (Striking, Grappling, Resume, Current Form, Durability) it decides
// which fighter holds the advantage and HOW MEANINGFUL that advantage is —
// a star rating + plain-English tier + a percentage gap.
//
// Two kinds of number are produced:
//   • an "index" (100 = the fighter's own-division career average) for the
//     categories where a division median exists (Striking / Grappling). This is
//     the OPS+/wRC+ convention: 100 is league-average, higher is better, and it
//     normalises across divisions so a welterweight and a lightweight compare
//     fairly.
//   • an edge magnitude — the relative gap between the two fighters — mapped to
//     stars + a tier label for every category.
//
// Display-only. Nothing here ever touches Elo or the ranking. It reads the same
// display-path analytics the compare page already loads (advancedStats +
// divisionRatioBenchmark), so it can never disagree with the tables above it.

import type { FighterProfile } from './fighterProfile';
import type { PaceWindow, PaceMedians } from './advancedStats';
import { formEloNudge } from './advancedStats';

export type EdgeLeader = 'a' | 'b' | 'even';

export interface CategoryEdge {
  key: string;
  label: string;            // "Striking"
  available: boolean;       // false → not enough data on one side
  leader: EdgeLeader;
  leaderName: string | null;
  edgePct: number;          // relative advantage of the leader over the trailer, %
  stars: number;            // 0–5
  tier: string;             // "Even" | "Slight edge" | … | "Significant edge"
  advantageLabel: string;   // "Strong Advantage" (card wording)
  // The 3-way index (100 = division average). Present only for categories with a
  // division benchmark on both sides; null otherwise (still edged via raw score).
  index: { a: number; b: number } | null;
}

// ── Tiering ────────────────────────────────────────────────────────────────
// A single monotonic ladder shared by every category so a "Strong edge" always
// means the same size of gap regardless of which stat produced it.
interface Tier { min: number; stars: number; tier: string; advantage: string; }
const TIERS: Tier[] = [
  { min: 30, stars: 5, tier: 'Significant edge', advantage: 'Significant Advantage' },
  { min: 18, stars: 4, tier: 'Strong edge', advantage: 'Strong Advantage' },
  { min: 10, stars: 3, tier: 'Moderate edge', advantage: 'Moderate Advantage' },
  { min: 4, stars: 2, tier: 'Slight edge', advantage: 'Slight Advantage' },
  { min: 0, stars: 0, tier: 'Even', advantage: 'Even' },
];

function tierFor(edgePct: number): Tier {
  return TIERS.find((t) => edgePct >= t.min) ?? TIERS[TIERS.length - 1];
}

function lastName(fullName: string): string {
  return fullName.split(' ').slice(-1)[0];
}

// Build a category edge from two positive per-fighter scores (higher = better).
function edgeFromScores(
  key: string,
  label: string,
  scoreA: number | null,
  scoreB: number | null,
  pa: FighterProfile,
  pb: FighterProfile,
  index: { a: number; b: number } | null = null,
): CategoryEdge {
  if (scoreA == null || scoreB == null || scoreA <= 0 || scoreB <= 0) {
    return {
      key, label, available: false, leader: 'even', leaderName: null,
      edgePct: 0, stars: 0, tier: 'Even', advantageLabel: 'Even', index,
    };
  }
  const hi = Math.max(scoreA, scoreB);
  const lo = Math.min(scoreA, scoreB);
  const edgePct = Math.round(((hi - lo) / lo) * 100);
  const t = tierFor(edgePct);
  let leader: EdgeLeader = 'even';
  let leaderName: string | null = null;
  if (t.stars > 0) {
    leader = scoreA > scoreB ? 'a' : 'b';
    leaderName = lastName(leader === 'a' ? pa.fullName : pb.fullName);
  }
  return {
    key, label, available: true, leader, leaderName,
    edgePct, stars: t.stars, tier: t.tier, advantageLabel: t.advantage, index,
  };
}

// ── Career-vs-division indices (Striking / Grappling) ───────────────────────
// A weighted average of per-metric ratios against the division median, ×100.
// Each ratio is 1.0 when the fighter is exactly average, so the blended index
// reads as "100 = division average". Metrics whose median is ~0 are dropped and
// the remaining weights renormalised, so a division that never lands knockdowns
// doesn't blow the ratio up.
interface Ratio { num: number; den: number; weight: number; invert?: boolean; cap?: number; }

function blendIndex(ratios: Ratio[]): number | null {
  let wsum = 0;
  let acc = 0;
  for (const r of ratios) {
    const num = r.invert ? r.den : r.num;
    const den = r.invert ? r.num : r.den;
    // Drop metrics with no meaningful baseline/denominator.
    if (!(den > 0) || !(r.den > 0)) continue;
    let ratio = num / den;
    if (r.cap != null) ratio = Math.min(ratio, r.cap);
    acc += ratio * r.weight;
    wsum += r.weight;
  }
  if (wsum <= 0) return null;
  const idx = (acc / wsum) * 100;
  return Math.round(Math.max(20, Math.min(300, idx)));
}

function strikingIndex(c: PaceWindow, m: PaceMedians): number | null {
  return blendIndex([
    { num: c.landedPer15, den: m.landedPer15, weight: 0.40 },
    { num: c.absorbedPer15, den: m.absorbedPer15, weight: 0.30, invert: true, cap: 3 },
    { num: c.kdPer15, den: m.kdPer15, weight: 0.15, cap: 4 },
    { num: c.sigAccuracy ?? 0, den: m.sigAccuracy ?? 0, weight: 0.15 },
  ]);
}

function grapplingIndex(c: PaceWindow, m: PaceMedians): number | null {
  return blendIndex([
    { num: c.tdPer15, den: m.tdPer15, weight: 0.35, cap: 4 },
    { num: c.ctrlSharePct, den: m.ctrlSharePct, weight: 0.30, cap: 4 },
    { num: c.subAttPer15, den: m.subAttPer15, weight: 0.20, cap: 4 },
    { num: c.tdAbsorbedPer15, den: m.tdAbsorbedPer15, weight: 0.15, invert: true, cap: 3 },
  ]);
}

// ── Per-fighter category scores (used where there is no division index) ──────

// Durability: base 100, docked for how much a fighter gets hit and how often
// they have been finished. Higher = tougher to hurt. Always positive.
function durabilityScore(p: FighterProfile): number | null {
  const d = p.advanced?.durability;
  if (!d) return null;
  const finishedRate = p.fightCount > 0 ? d.timesFinished / p.fightCount : 0;
  const score = 100 - d.strikesAbsorbedPer15 * 0.25 - d.kdAbsorbedPer15 * 10 - finishedRate * 45;
  return Math.max(1, Math.round(score * 10) / 10);
}

// Current form: their recent-vs-career drift (formEloNudge, ±45) recentred to a
// positive 5–95 scale. 50 = holding career level, higher = trending up.
function formScore(p: FighterProfile): number | null {
  if (!p.advanced?.drift) return null;
  return 50 + formEloNudge(p.advanced.drift);
}

// ── Public entry point ──────────────────────────────────────────────────────

export function computeCompareEdges(pa: FighterProfile, pb: FighterProfile): CategoryEdge[] {
  const ca = pa.advanced?.career ?? null;
  const cb = pb.advanced?.career ?? null;
  const mA = pa.divisionBenchmark?.pace ?? null;
  const mB = pb.divisionBenchmark?.pace ?? null;

  // Striking — index vs each fighter's own division, then edged against each
  // other. If a benchmark is missing on either side, fall back to comparing raw
  // career strike differentials (recentred positive) so an edge still resolves.
  const strikeIdxA = ca && mA ? strikingIndex(ca, mA) : null;
  const strikeIdxB = cb && mB ? strikingIndex(cb, mB) : null;
  const striking = strikeIdxA != null && strikeIdxB != null
    ? edgeFromScores('striking', 'Striking', strikeIdxA, strikeIdxB, pa, pb, { a: strikeIdxA, b: strikeIdxB })
    : edgeFromScores('striking', 'Striking',
        ca ? 50 + ca.diffPer15 : null, cb ? 50 + cb.diffPer15 : null, pa, pb);

  const grappleIdxA = ca && mA ? grapplingIndex(ca, mA) : null;
  const grappleIdxB = cb && mB ? grapplingIndex(cb, mB) : null;
  const grappling = grappleIdxA != null && grappleIdxB != null
    ? edgeFromScores('grappling', 'Grappling', grappleIdxA, grappleIdxB, pa, pb, { a: grappleIdxA, b: grappleIdxB })
    : edgeFromScores('grappling', 'Grappling',
        pa.grapple?.percentile ?? null, pb.grapple?.percentile ?? null, pa, pb);

  // Resume = strength of schedule (opponent quality faced). Both must be ranked.
  const resume = edgeFromScores('resume', 'Resume', pa.sos, pb.sos, pa, pb);

  const form = edgeFromScores('form', 'Current Form', formScore(pa), formScore(pb), pa, pb);

  const durability = edgeFromScores('durability', 'Durability', durabilityScore(pa), durabilityScore(pb), pa, pb);

  return [striking, grappling, resume, form, durability];
}
