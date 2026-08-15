// preUfcRating — the PRE-UFC rating system, separate from the Elo core.
//
// Answers "how good is this résumé?" for a fighter who has never been in the
// UFC, from the only signals consistently available beforehand: age, record,
// and the promotion they came out of. Finish rate is carried and DISPLAYED as
// a style attribute but deliberately does not move the score (calibration
// showed it collinear with win rate — see rankingConfig.preUfcRating).
//
// ── FIREWALL ────────────────────────────────────────────────────────────────
// Reads no Elo, no rankings, no odds. Feeds nothing: no scoring path imports
// this, and a fighter's pre-UFC score is DISCARDED once they have UFC results
// (the Elo core is strictly better the moment real in-cage data exists). It is
// a scouting board, not a ranking.
//
// Weights are fitted, not chosen — research/dwcs/calibratePreUfc.ts on the
// nine-season cohort, held-out AUC 0.691 vs the UFC's own top 15. Every number
// lives in RANKING_CONFIG.preUfcRating with its provenance.

import { RANKING_CONFIG } from './rankingConfig';

const CFG = RANKING_CONFIG.preUfcRating;

export interface PreUfcInput {
  wins: number | null;
  losses: number | null;
  draws?: number | null;
  finishes?: number | null;  // KO/TKO/SUB wins — displayed, not scored
  age: number | null;
  /** Feeder promotion's static tier multiplier (0 when unknown/unattributed). */
  tierMultiplier?: number | null;
  org?: string | null;
}

export interface PreUfcRating {
  /** 0–100 placement against the Contender Series cohort's own spread. */
  score: number;
  grade: 'A' | 'B' | 'C';
  /** Fine-grained display grade (A+ … C-); same families as `grade`. */
  fineGrade: string;
  /**
   * The fitted logistic's own probability that this résumé reaches the UFC
   * top 15 — sigmoid of the same logit the score maps. Roughly calibrated to
   * the cohort's ~8% base rate; display with a tilde, never as a certainty.
   */
  topFifteenProb: number;
  winRate: number;
  finishRate: number | null; // null when wins unknown/zero — displayed only
  fights: number;
  age: number | null;
  org: string | null;
  /** Per-component contribution in logit units — powers the "why" breakdown. */
  parts: { winRate: number; age: number; promotion: number };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Score a pre-UFC résumé. Returns null when the inputs can't support a score —
 * missing age or record is reported as ungraded, never guessed at.
 */
export function ratePreUfc(input: PreUfcInput): PreUfcRating | null {
  const { wins, losses, age } = input;
  if (wins == null || losses == null || age == null) return null;
  const fights = wins + losses + (input.draws ?? 0);
  if (fights < 1) return null;

  const winRate = wins / fights;
  const tierMult = input.tierMultiplier ?? 0;
  const ageTerm = (CFG.ageAnchor - age) / CFG.ageScale;

  const parts = {
    winRate: CFG.winRateCoef * winRate,
    age: CFG.ageCoef * ageTerm,
    promotion: CFG.tierCoef * tierMult,
  };
  const logit = CFG.intercept + parts.winRate + parts.age + parts.promotion;

  // Map onto 0–100 across the cohort's observed p05→p95 logit spread.
  const span = CFG.displayLogitP95 - CFG.displayLogitP05;
  const score = clamp(((logit - CFG.displayLogitP05) / span) * 100, 0, 100);

  const rounded = Math.round(score);
  return {
    score: rounded,
    // Both grades key off the ROUNDED score so the displayed number, the
    // letter, and the fine letter can never disagree at a band edge.
    grade: rounded >= CFG.gradeA ? 'A' : rounded >= CFG.gradeB ? 'B' : 'C',
    fineGrade: CFG.fineGrades.find((b) => rounded >= b.min)?.grade ?? 'C-',
    topFifteenProb: 1 / (1 + Math.exp(-logit)),
    winRate,
    finishRate: input.finishes != null && wins > 0 ? input.finishes / wins : null,
    fights,
    age,
    org: input.org ?? null,
    parts,
  };
}

/**
 * Plain-English read of what drove the score — the transparency line the
 * scout board shows beneath each fighter. Ordered by contribution magnitude
 * so the biggest driver leads.
 */
export function explainPreUfc(r: PreUfcRating): string {
  const bits: { text: string; weight: number }[] = [];

  bits.push({
    text:
      r.age! < 25 ? `age ${r.age} — prime runway, the strongest single signal in the cohort`
      : r.age! <= 28 ? `age ${r.age} — mid runway`
      : `age ${r.age} — short runway; 29+ entrants rarely become contenders`,
    weight: Math.abs(r.parts.age),
  });

  const pct = Math.round(r.winRate * 100);
  bits.push({
    text:
      r.winRate >= 0.999 ? `undefeated at ${r.fights}-0`
      : `${pct}% win rate over ${r.fights} fights`,
    weight: Math.abs(r.parts.winRate),
  });

  if (r.org) {
    bits.push({
      text:
        r.parts.promotion >= 0.35 ? `out of ${r.org}, a proven feeder`
        : `out of ${r.org}`,
      weight: Math.abs(r.parts.promotion),
    });
  }

  const lead = bits.sort((a, b) => b.weight - a.weight).map((b) => b.text).join(' · ');
  const style =
    r.finishRate == null ? ''
    : r.finishRate >= 0.8 ? ` Finishes ${Math.round(r.finishRate * 100)}% of wins — a finisher's profile (style read; the cohort says it doesn't predict a UFC ceiling once win rate is known).`
    : r.finishRate <= 0.34 ? ` Only ${Math.round(r.finishRate * 100)}% of wins by finish — a decision profile (style read, not scored).`
    : '';
  return lead + (style ? ' ·' + style : '');
}
