# DWCS_PLAN — Contender Series analysis + prospect backtests

> Status: **ACTIVE** (2026-08-11). Pre-registration document: the hypotheses and success
> bars below were committed BEFORE any backtest in Phase B/C ran, per the
> `modeling-discipline` skill. Results land in `docs/CHANGELOG.md` (positive or negative);
> this file is the record of what was promised in advance.

## What this builds

A firewalled DWCS research layer + product surface. DWCS is a one-fight UFC tryout, not a
promotion (`feederExcludeOrgs` already strips it from feeder identity), so everything here
reads engine *output* (FightTraces, settled Elo) and frozen CSVs — nothing feeds
`eloEngine.ts`/`scoringEngine.ts`. Delete `research/` and rankings stay byte-identical.

- **Phase 0** — shared infra: `auc` + `spearman` in `research/backtest/metrics.ts`;
  `PitAdjuster.ratingAsOf` made public; this doc.
- **Phase A** — cohort dataset: `research/dwcs/buildDwcsDataset.ts` →
  `data/dwcs_bouts.csv` (one row per bout, ~370 after dedupe) + `data/dwcs_fighters.csv`
  (one row per participant, ~590 — the survivorship-honest denominator including the ~263
  opponents who never reached the UFC). Supersedes and deletes
  `scripts/sherdog/dwcsCohort.ts` (loose `/Contender/i` regex bug + settled-rating leak).
- **Phase B** — prospect-outcome backtests, committed to `research/prospects/` +
  `research/dwcs/` (the 2026-08-05 harness was scratchpad-only; this rebuild is the
  committed version).
- **Phase C** — DWCS closing odds: BFO probe → crawl → `data/bfo_dwcs_odds.csv` (sibling
  file, never merged into `bfo_odds.csv`) → market calibration + graduate-predictive test.
  Market-only by design: DWCS bouts have no point-in-time Elo, so there is no model side.
- **Phase D** — `/contender-series` page from offline-built `data/dwcs_analysis.json`
  (the `/odds` pattern) + a DWCS chip on `/prospects` cards.
- **Phase E** — at most ONE model change, only if a finding clears the bar below.

## Operationalizations (fixed before running)

- **DWCS row** := `sherdog_fights.csv` row with `canonicalOrg === "Dana White's Contender
  Series"` exactly (379 rows; the loose regex adds 6 false positives).
- **gotContract** := has ≥1 traced UFC fight dated after `firstDwcsDate`. A
  *fought-in-UFC* proxy — misses contract winners who never fought; named accordingly.
- **reachedTop15** := present (rank 1–15 or "C") in the current committed
  `official_rankings.csv` snapshot. No historical rank timeline exists; a graduate who
  was ranked and fell off scores 0. Documented limitation.
- **Point-in-time rating** := last `FightTrace.ratingAfter` strictly before T
  (`PitAdjuster.ratingAsOf`). Settled `EloMap.rating` is never a predictor.
- **Prospect cohort at T** := fighters with 1..5 traced UFC fights and a winning record
  as of T who fought again after T. Horizons T = 2023-08-05 and 2024-08-05 (matching the
  2026-08-05 backtest: n≈112 / 118; raw-Elo AUC 0.716 / 0.744 on reachedTop15).
- **Record-shape buckets** (DWCS entrants): experience ≤5 / 6–10 / 11+ pre-DWCS fights;
  losses 0 / 1 / 2 / 3+; age at DWCS <25 / 25–28 / 29+. Cells with n<25 are reported as
  "insufficient sample", never as a point estimate.
- **Two outcome layers, separate denominators**: contract layer (all ~590 participants) vs
  UFC-success layer (graduates only, n≈330). Never mixed in one table.

## Pre-registered hypotheses (Phase B/C)

- **H1** — pre-DWCS experience count predicts UFC success beyond pre-UFC win rate
  (a 13-4 record carries information the 0.765 win rate alone doesn't).
- **H2** — loss count is NOT negatively predictive once opponent quality is controlled:
  13-4-style veterans do at least as well as 4-0 unbeatens.
- **H3** — age at DWCS dominates record shape as a predictor.
- **H4** — a DWCS loss implies a near-zero contract rate (descriptive; expected huge).
- **H5** — DWCS finish-vs-decision adds nothing (retest of the 2026-07-03 0.9-Elo null,
  now without the regex bug or settled-rating leak).
- **H6 (Phase C)** — the DWCS closing line adds predictive value on `reachedTop15` beyond
  the pedigree features (pre-DWCS record, feeder tier/grade, age).

## Pre-registered bar for a model change (Phase E)

A candidate clears ONLY if all three hold:

1. On the committed Phase-B harness it improves `reachedTop15` AUC by **≥ +0.02 at BOTH
   horizons** over the incumbent predictor — raw Elo (0.716 / 0.744) for Elo-visible
   cohorts; the Phase-B pedigree-logistic baseline for pre-UFC-only features — with a 90%
   bootstrap CI on ΔAUC excluding 0.
2. Effect direction is stable across both horizons AND the DWCS/non-DWCS split.
3. It survives the `modeling-discipline` review, explicitly checking double-counts:
   pre-UFC win rate and opponent quality are already inside `pedigreeStrength`
   (`winRate × confidence × mult` + the B.1 SoS term); experience count is partially
   inside `confidenceFullFights`.

**Candidates, priority order — nothing else may be proposed from this work:**
1. Record-shape term in `pedigreeStrength` (experience-aware confidence or a bounded
   loss-count modifier) — new keys under `rankingConfig.preUFCPedigree` only.
2. DWCS-passage adjustment — lowest prior; the finish/decision null stands until H5 says
   otherwise.
3. Retune of `promotionTiers.tier2` / `seedMaxElo` if the cohort evidence says the 0.78
   DWCS weighting is miscalibrated.

If nothing clears (the likely outcome): a dated negative-result CHANGELOG entry with the
exact AUCs + a breadcrumb comment in `rankingConfig.preUFCPedigree`, same convention as
the refuted climb-rate sort.

## Addendum (2026-08-11, pre-registered before running): /prospects sort-key test

Structural observation, not an anecdote: `/prospects` sorts on raw `elo`, so
`pedigreeBonus` — the term built for thin-UFC-sample fighters and live for exactly the
≤5-fight population — never reaches the ordering. Candidates, no new mechanism or knob:
**ranked** = elo@T + PIT metrics/SoS/pedigree/untested (production composite,
`PitAdjuster.adjustmentParts`), and **unheld** = ranked − untestedPenalty (mirroring
`crossDivision.ts`). **Bar**: the swap ships only if ΔAUC vs elo@T ≥ **+0.01 at BOTH
horizons** with the 90% bootstrap CI excluding 0 at both, and neither Spearman target
degrades. Half the Phase-E magnitude on purpose — every term is already validated
elsewhere and nothing is added to the model; the CI condition carries the rigor. Miss →
negative result logged, raw Elo stays. Removal condition if shipped: revert on any
future-horizon re-run where the ranked key loses to raw Elo.

## Data limits (stated up front)

- Sherdog crawl is dead → `sherdog_fights.csv` is frozen at 2025-10-07; DWCS seasons
  2026+ are invisible until a new source exists. Outcome columns (UFC record, Elo, top-15)
  keep moving — refresh = manual builder re-run before each JSON export.
- Non-crosswalked DWCS opponents' pre-DWCS records come from `.sherdog_cache/` profile
  HTMLs only (coverage measured by `research/dwcs/coverageProbe.ts`); missing = reported
  as missing, never imputed.
- BFO DWCS odds coverage unknown until the probe runs; pre-2021 BFO page formats
  historically failed to parse. The odds section of the page is nullable.
