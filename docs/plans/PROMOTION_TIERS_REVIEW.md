# PROMOTION TIERS REVIEW — regional-scene strength (queued 2026-08-11)

> **Status: NOT STARTED — next session.** Written after the pre-UFC rating shipped, at the
> user's request, to capture the premise and the evidence already on disk so the next
> session doesn't re-derive them. Companion to `PROMOTION_GRADING_PLAN.md` (the original
> empirical-grading workstream, built 2026-07-03).

## The user's premise

> "Road to UFC should not necessarily be a tier one. It is Asian, and they are generally
> not as strong as some American or Euro regional scenes."

Two distinct claims, and they need separating before anything is tuned:

1. **Road to UFC specifically** should not carry a top-tier multiplier.
2. **Asian regional scenes broadly** are weaker than US/European ones, and the tier
   ladder may not reflect that.

## What is already true (verified 2026-08-11, no action needed)

**Road to UFC is NOT tier 1.** It has no row in `data/sherdog_orgs.csv`, so
`tierMultiplierForOrg()` falls through to the matcher table and lands on the **default
tier4 = 0.35**. The one real danger — a containment match resolving "Road to UFC" → the
key "UFC" → tier1 (1.00) — was caught during the pre-UFC build and is now blocked by an
explicit `ORG_ALIASES` entry plus a unit test in `scripts/preUfcRating.test.ts`. So claim
(1) is already satisfied; the open question is whether 0.35-by-accident should become
0.35-by-decision (an explicit ladder entry), and whether a UFC-run feeder tournament
deserves its own treatment.

## What the existing data says about claim (2) — genuinely supportive

From `data/promotion_grades.csv` (empirical: settled Elo gain of each org's UFC
graduates, EB-shrunk, `relFactor` 1.0 = neutral):

| Org | Tier (static) | Graduates | relFactor |
|---|---|---|---|
| ONE Championship | tier2_5 (0.68) | 9 | **0.9467** ← worst graded org |
| Deep | tier3 (0.55) | 14 | 0.9787 |
| Pancrase | tier3 (0.55) | 32 | 0.9909 |
| Shooto | tier3 (0.55) | 60 | 0.9997 |
| RIZIN | tier2_5 (0.68) | 11 | 1.0140 |
| Brave CF | tier3 (0.55) | 18 | 1.0338 |
| — *US/Euro comparison* — | | | |
| LFA | tier3 (0.55) | 112 | 1.0206 |
| Cage Warriors | tier3 (0.55) | 56 | 1.0295 |

The pattern the user describes is visible: the Japanese lineage (Deep/Pancrase/Shooto) sits
at-or-below neutral while LFA and Cage Warriors sit above, and **ONE Championship is the
single worst-grading promotion in the table while being tiered 0.68 — level with Bellator
and PFL.** Brave CF and RIZIN cut against a blanket "Asia is weak" reading, so the honest
framing is *ONE and the Japanese scene specifically*, not a continent.

**Why the existing grade mechanism doesn't already fix it:** the nudge is bounded ±20% and
blended at `gradeBlendLambda` 0.5, so ONE's effective multiplier is
`0.68 × (1 + 0.5 × (0.9467 − 1)) = 0.662` — a 2.6% correction against what may be a
tier-level error. The static ladder is doing nearly all the work, by design
(hierarchy-preserving), which is correct in general but leaves a genuinely mis-tiered org
mis-tiered.

## Proposed work (next session)

1. **Measure before touching**: extend `gradePromotions.ts` output with a region tag
   (US / Europe / Japan / other-Asia / Brazil) and report graduate counts + shrunk Elo gain
   per region. Is the effect regional, or is it ONE + the Japanese majors specifically?
   n is small per org — say so, and prefer the region aggregate where it's better powered.
2. **The candidate change** is a *static tier* correction (e.g. ONE tier2_5 → tier3), not a
   new mechanism and not a wider grade band. Cheapest possible fix, one config value.
3. **Road to UFC**: give it an explicit ladder entry rather than leaving it on the default —
   deliberate 0.35, or its own key if the region work suggests otherwise.
4. **Gate (pre-register before running, per `modeling-discipline`)**: the pedigree seed is
   bounded ≤25 Elo and tapers out by 6 UFC fights, so any tier change moves very few
   fighters. Required evidence: the region split holds at a defensible n, AND the change
   doesn't degrade the prospect harness (`research/prospects/runProspectBacktest.ts`) or the
   pre-UFC model's held-out AUC (`research/dwcs/calibratePreUfc.ts`, currently 0.691).
   Golden-master movement will be near-zero — that is expected and is NOT evidence of value.
5. **Also re-fit the pre-UFC rating afterward**: `preUfcRating` takes `tierMultiplier` as an
   input feature, so changing the ladder changes its training data. Re-run the calibration
   and update `rankingConfig.preUfcRating` weights + the recorded AUC in the same change.

## Trap to avoid

Do not hand-tune tiers per-org from intuition about "how good that scene looks" — that is
exactly the unfalsifiable move the grading workstream exists to replace. Every tier change
in this review needs a graduate-outcome number attached to it, and orgs with <8 graduates
(`gradeMinGraduates`) should not move at all.
