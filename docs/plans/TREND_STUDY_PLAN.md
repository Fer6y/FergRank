# Pre-registered: the 4–6 fight TREND study (form trajectories in the advanced stats)

Status: **pre-registered 2026-08-27, before any backtest ran.** This file commits the
features, models, split and verdict rules first, per `modeling-discipline` — the same
pattern as `SKID_STUDY_PLAN.md` (which caught the two-slices-point-opposite-ways trap
in advance).

## Motivation (from the 2026-08-27 market-gap audit re-run)

The production model's gap to the de-vigged close is +0.0504 LL/bout (t 6.71, n=1,552).
The structure is an *information* gap, not a scale gap (temperature ≈ 1.0, measured
2026-08-18): the market knows things about *current form trajectory* that a settled Elo
number cannot carry, because Elo scores results, not performances. Two prior findings
point directly at trajectory information:

- The skid study (2026-08-18): loss METHOD carries signal Elo discards (decision-only
  skidders win 51.9% priced at 40.9%). DIRECTIONAL, not shipped — but it proves the
  *how*, not just the *what*, of recent bouts is informative.
- The metrics composite already uses recent per-fight stats, but as a recency-weighted
  LEVEL (how good are the numbers), never as a TRAJECTORY (are they rising or falling).
  A fighter whose strike differential ran +20, +15, +5, −5 over four fights has the same
  level-average as one running −5, +5, +15, +20 with the order flipped — and plausibly a
  very different next result. No mechanism in the engine or overlay reads direction.

**Question**: do per-fighter performance *trends* over the last 4–6 fights carry
information about the next result beyond the production win probability?

## Data & leak discipline

- Sample: every odds-matched bout in `bfo_odds.csv` (the sanctioned join:
  `resolveOddsName` → `buildPointInTimeIndex` → `PitAdjuster` → `predictFight`, exactly
  the `skidStudy.ts` harness). Dedupe by fighter-pair + date (the BFO duplicate-slug bug,
  CHANGELOG 2026-08-21 — `last100.ts` does not dedupe; this study must).
- All features strictly pre-bout: metric fights are `Fights.csv` rows with
  `hasMetrics !== false` and `eventDate <` the bout date; result/method features walk
  the chronological `FightTrace` list, same as `finishSignal.ts`.
- Temporal split at **2024-01-01** (same as the skid study): fit on earlier, score on
  2024+. Held-out refit reported for coefficient-sign stability only.

## Pre-registered features (per fighter, entering the bout)

Window = the fighter's last `min(6, n)` metric fights before the bout; **require ≥ 4**
(else the fighter contributes zeros and the bout is tagged unaffected). Trend = mean of
the newest `floor(w/2)` minus mean of the oldest `floor(w/2)` (middle fight dropped when
w is odd). Scaled by /10 strikes for coefficient legibility.

- **F1 `strDiffTrend`** — trend of per-fight strike differential (landed − absorbed).
  The headline stat of the metrics composite, read as a direction.
- **F2 `absorbedTrend`** — trend of strikes absorbed per fight. Rising absorption =
  defensive decline, the durability precursor the finish study's career rate lags on.
- **F3 `recentFinished`** — count of losses by KO/TKO/SUB in the last 6 *bouts* (trace
  walk, not metric fights). The recency-sharpened chin read; career `finishedRate` is
  already validated for ITD but has no memory ordering.
- **F4 `kdConceded`** — knockdowns conceded across the last 6 metric fights (count).
  Chin wobble that never became a loss is invisible to every result-based mechanism.
- **C1 `oppEloTrend`** (control) — trend of fight-time opponent Elo over the same
  window. Declining output against a rising slate is schedule, not decline; any F1/F2
  verdict must survive this control.

Every model feature enters as **fav-minus-dog difference**, orientation-symmetrized
(each bout contributes both orientations), with the **production logit as a fixed
offset** — the skid-study construction. No slice-gazing verdicts.

## Pre-registered models

- **T1**: strDiffTrendDiff
- **T2**: absorbedTrendDiff
- **T3**: recentFinishedDiff
- **T4**: kdConcededDiff
- **T5**: T1 + oppEloTrendDiff — the schedule control; T1's coefficient must keep sign
  and magnitude within ~2× or F1 is declared a schedule artifact.
- **T6**: F1+F2+F3+F4 jointly (the "trend block").

Informational only (not a ship gate): the same models with the **market logit** as
offset — answers "does the market already price this trend?" A feature that helps over
the production offset but is flat over the market offset is exactly a
get-closer-to-the-line candidate (the stated goal); one that helps over BOTH would be
a value signal (prior: unlikely — the 2026-08-21 result says the market is efficient
against us everywhere we've looked).

## Verdict rule (pre-registered)

Per model, on the 2024+ held-out set, affected bouts (either side has ≥4 metric
fights in window — expected to be most of the sample):

- **CONFIRMED**: paired ΔLL t ≤ −2 vs production on held-out affected bouts AND
  unaffected bouts not degraded (t < +2) AND held-out refit keeps every coefficient
  sign. A confirmed model becomes a candidate for a bounded overlay term — its own
  gated change, with a double-count audit vs the metrics composite (level vs trend)
  and `p4pRecentForm`.
- **DIRECTIONAL**: signs stable across both halves and held-out ΔLL improves, but
  t > −2. Recorded, nothing ships, re-test condition = one more year of odds.
- **FLAT/REFUTED**: otherwise. Recorded in the changelog + a breadcrumb in
  `rankingConfig.winProbModel` so it isn't re-proposed from intuition.

## Part 2 — finish-prop recency (extends `finishSignal.ts`)

The confirmed ITD/KO signals use CAREER rates. Pre-registered question: do
**recent-window rates** (last `min(6, n)` bouts) beat career rates?

Variants, same pool (both corners ≥3 prior UFC fights), same three signal
constructions (both-finishers, finisher-vs-chin, KO-threat):

- A: career rates (the incumbent, AUC .603/.633/.634)
- B: last-6 rates
- C: blend = (career + last-6)/2

**Verdict**: B or C supersedes A only if AUC improves ≥ +0.01 on BOTH the
finisher-vs-chin→ITD and KO-threat→KO constructions with quartile monotonicity
preserved. Otherwise career rates stand and the negative is recorded. Same deliberate
limit as the original study: no ITD prop odds in our data, so this calibrates the
read, and cannot claim +EV against a book's finish price.

## Known traps this plan names in advance

1. **Schedule confound** — falling output may be a rising slate; that is what C1/T5
   exists to catch. A T1 "confirmed" that dies in T5 is an artifact.
2. **Double-count with the metrics composite** — the composite already rewards recent
   LEVEL; a trend term must show it adds beyond the production offset (which contains
   the composite via `PitAdjuster`). The offset construction handles this by design.
3. **Small trend windows are noisy** — a 3-vs-3 mean difference of a high-variance
   stat. The temporal split, not in-sample fit quality, is the arbiter.
4. **Multiple comparisons** — six models, two offsets. Anything at marginal
   significance in exactly one cell is noise until a re-test; only pre-registered
   verdict-rule hits count.
