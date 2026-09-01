# Market-Gap Sweep — pre-registered plan (2026-09-01)

**Question:** can any untested, display-only signal move the production win probability
(ranked ratings + overlay, `predictFight`) closer to the de-vigged closing line — beyond
what the model already prices? Goal stated by the user: "get as close to the market as you
can." Honest prior from the 2026-08-18 audit: the gap is mostly information/ordering
(temperature ≈ 1.0, market right ~2:1 on disagreements), and 61% of it sits on newcomer
bouts. Everything here is research-zone; odds feed no rating; nothing touches Elo/scoring.

## Scope

- Pool: all BFO odds-matched decisive bouts (`data/bfo_odds.csv`, 2021+ — the parseable
  span), pair+date-deduped (the trendStudy dedupe — older harnesses double-count the
  duplicate-slug cards). The full 8.8k-fight DB has no odds before 2021; the market
  comparison is bounded by odds coverage and we say so rather than pretend otherwise.
- Harness: the skidStudy/trendStudy construction, exactly — PIT ratings
  (`buildPointInTimeIndex` + `PitAdjuster` + `predictFight`), Shin de-vig,
  orientation-symmetrized logistic with the **production logit as fixed offset**, plus the
  market-offset fit as an informational arm. Fit < 2024-01-01, score 2024-01-01+.
  No variants, no post-hoc feature edits.

## Baseline (Phase 1)

Re-run `marketGapAudit.ts` + `last100.ts` (NBOUTS=500) unmodified to establish today's
gap on current data. These numbers are the before-picture every candidate is judged
against.

## Candidates (Phase 2 — one agent each, all features strictly pre-bout)

- **T1 REACH**: reach differential (inches, `Fighters.csv`; bouts with either side
  missing are excluded from the affected set). Elo has no anthropometry; the market does.
- **T2 STANCE**: southpaw-vs-orthodox matchup flag (southpaw side +1, symmetric). Same
  source; missing stance ⇒ unaffected.
- **T3 CHIN/POWER (moneyline)**: career times-finished rate and finish-win rate
  differentials off `FightTrace`, strictly prior bouts, ≥3 priors both sides — the
  finishSignal construction pointed at the MONEYLINE (it was only ever validated for
  ITD/KO props). Double-count audit owed vs the disabled `powerEdgeCoef` and the
  unshipped recentFinished/M3 (career-level vs last-6 — the finishRecency result says
  career is the stronger form of this signal).
- **T4 COMMON OPPONENTS**: net record vs shared opponents in prior bouts (A beat X,
  B lost to X ⇒ +1 to A; sum, capped). The folk handicapping signal Elo only carries
  transitively.
- **T5 FIVE-ROUND/TITLE**: title-bout flag (`title_fights.csv`) interacted with the
  champion side — does the champion in a 5-round title fight outperform the Elo-gap
  price? Championship rounds + champ experience are not in any current term.
- **T6 RETUNE (skill step 3 — retune before add)**: two-half sweep of
  `elo.winProbDenominator` ∈ {120,130,140,150,160} and `overlayShrink` ∈
  {0.45,0.65,0.85,1.0}: choose on <2024, confirm on 2024+ (shadeFloorTest pattern).
  No new mechanism — the two knobs that already own scale and overlay amplitude.

## Verdict rule (pre-registered, same as skid/trend)

Production-offset arm only. **CONFIRMED** iff ALL of: held-out (2024+) affected-slice
paired ΔLL t ≤ −2; unaffected slice t < +2; held-out refit keeps every coefficient sign.
T6 instead: the chosen knob value must win in BOTH halves (monotone/consistent), else
stays put. Anything less: DIRECTIONAL or FLAT — recorded in the changelog + config
breadcrumb, nothing ships. Explicitly out of scope: re-testing recentFinished/skid-M3
(their pre-registered re-test condition — another year of odds — is not met), and any
blend of market odds into the model (defeats the comparison and the firewall's spirit).

## Ship rule

A CONFIRMED candidate ships only as a bounded overlay term inside
`winProbModel.maxAdjustmentLogit`, with: a double-count audit sentence per existing
mechanism touching the same quantity, unit tests, golden master byte-identical
(display-only by construction), and a removal condition written at birth.

## Phase 3 — adversarial verification

Any candidate at held-out |t| ≥ 1.5 gets an independent verifier agent: hand-trace one
concrete bout end-to-end (feature value, offset, refit prob), check for settled-vs-PIT
leaks, confirm the dedupe, and attempt to refute the construction before anything is
believed.
