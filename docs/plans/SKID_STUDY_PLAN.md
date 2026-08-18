# Skidding-fighters win-prob study — pre-registered plan

> Status: **PLAN COMMITTED BEFORE THE INFERENTIAL SCRIPT RUNS** (modeling-discipline).
> Written 2026-08-18, immediately after the market-gap audit
> (`research/backtest/marketGapAudit.ts`, commit 3272b9e) surfaced the trend.

## Motivation (measured, already committed)

From the 2026-08-18 audit of the production win-prob surface vs the de-vigged close
(1,544 odds-matched bouts):

- **Favourite entering on a ≥2-loss streak** (n=147): our worst slice anywhere —
  accuracy **47% vs the market's 66%**, LL gap +0.0901 (t 3.5), bias −14.0pt.
- **Underdog entering on a ≥2-loss streak** (n=275): gap +0.0539 (t 3.4), bias −10.0pt.

## The trap this plan exists to avoid

The two slices point in **opposite directions** if read naively: skidding favourites
*outperform* our number (implying we over-punish skids), while skidding underdogs
*underperform* it (implying we under-punish them). Both slices also carry biases close
to the global −11.9pt, so either could be nothing but the generic information gap
concentrated where disagreements are common. Slice-gazing cannot settle this. The test
must be: **does skid status carry information about the outcome BEYOND the production
model's own probability?** That is an offset-logit regression, orientation-symmetrized,
with the production logit as a fixed offset (coefficient 1, not refit).

## Pre-registered feature definitions (exact, no variants)

All from the Elo trace, strictly pre-bout; draws break a streak.

- `skid` (flag): fighter enters on ≥2 consecutive losses.
- `skidQuality` (skid fighters only, else 0): mean fight-time `opponentRating` across
  the streak's losses, minus 1500, ÷100. "Who were the losses to?"
- `skidFinished` (skid fighters only, else 0): fraction of the streak's losses by
  finish (`/ko|tko|sub/i` on the trace method).

Each enters fav-perspective as (fav value − dog value). Fit is symmetrized (both
orientations, intercept forced ≈0). Exactly four models, nothing else:

- **M0**: offset only (baseline).
- **M1**: + skidDiff.
- **M2**: + skidDiff + skidQualityDiff.
- **M3**: + skidDiff + skidFinishedDiff.

## Pre-registered verdict rule

Temporal split: fit < 2024-01-01, score ≥ 2024-01-01 (same split as the calibration
decomposition). Affected slice = bouts where either side is on a ≥2-loss streak.

- **CONFIRMED** (a ship proposal may be written, own gate, separate change): held-out
  paired Δlogloss vs production on the affected slice with **t ≤ −2**, AND no
  significant harm on unaffected bouts (paired t < +2), AND the coefficient keeps its
  sign when refit on the held-out half alone.
- **DIRECTIONAL**: held-out Δ improves but t ∈ (−2, 0], with coefficient signs agreeing
  across both halves → record, no ship, re-test when another year of odds exists.
- **REFUTED** otherwise → breadcrumb in `rankingConfig`, no change.

Power note, stated in advance: the affected slice on 2024+ is expected at n ≈ 90–120;
if the measured effect needs n ≫ that to resolve at t=2, the honest outcome is
DIRECTIONAL/REFUTED, not a lowered bar.

Any confirmed term would ship **only** as a bounded `winProbModel` overlay logit
(display-only, capped like age/style, never touching `eloEngine.ts` or rankings), with
a removal condition written at birth.

## Double-count audit (why this isn't already priced)

- **Production logit as offset** — metricsBonus, SoS, pedigree, untested hold and the
  age/style overlay are all inside the offset, so any skid coefficient is priced
  *beyond* them by construction.
- **Finish-weighted K** (Elo core) — losses by finish already cost extra rating. M3
  therefore measures *residual* finish-loss information; if M3 confirms with a negative
  sign, the honest note is that the core may over- or under-charge finished losses —
  flagged for a separate core-level study, NOT stacked silently.
- **Win-quality gate** — gains-only; does not touch losses. No overlap.
- **Inactivity regression** — time-keyed, orthogonal to results.
- **`formEloNudge` / `p4pRecentForm`** — neither is in the `predictFight` path
  (compare form meter / P4P sort key only). No interaction with the production meter.

## Deliverables

1. `research/backtest/skidStudy.ts` — descriptive phase (streak lengths, loss quality,
   loss methods, who actually wins) + the four pre-registered fits.
2. Honest results in `docs/CHANGELOG.md` (confirmed, directional, or refuted — with
   the numbers), and a `rankingConfig` breadcrumb if refuted.
