# THE ALGORITHM (v2 — Elo core) — current-state spec

> **Values live in `ufc-rankings/src/lib/rankingConfig.ts` — read them there.** This doc names
> config keys and explains mechanisms; it never inlines numbers (a previous version did, drifted
> out of sync with the code, and caused exactly the misinterpretation it warned against). Every
> weight, multiplier, threshold, and decay rate is imported from that one config — nothing is
> hardcoded in `eloEngine.ts` or `scoringEngine.ts`. How each mechanism got here (diagnoses,
> rejected alternatives, before/after numbers) is in `docs/CHANGELOG.md`.

Two engine files:

- **`src/lib/eloEngine.ts`** — one **Elo rating** per fighter from a single chronological sweep of
  every UFC fight (+ a per-fight trace for profiles). Opponent quality, recency, finishes, and
  weight-class moves all live here. One **global rating pool** (this is what makes P4P valid).
- **`src/lib/scoringEngine.ts`** — turns Elo into a ranked division: eligibility + small
  **bounded** adjustments, then sort and post-sort corrections.

## Score formula & pipeline

```
finalRating = eloRating + metricsBonus + sosNudge + officialBonus + pedigreeBonus − untestedPenalty
rankScore   = map(finalRating → 0–100)   // via elo.displayCurve; monotonic, display only

pipeline: merit sort → head-to-head leapfrog → champion tiebreaker → champion floor
```

`eloRating` dominates; every other term is bounded and deliberately small (caps:
`metricsScaleElo`, `sosAdjustCap`, `officialBonusScaleElo` × `officialRankScores`,
`preUFCPedigree.seedMaxElo`, `untestedHold.maxPenaltyElo`) so they refine ties and edge cases
without overriding who-beat-whom.

**Core principles (why Elo):**

1. **Opponent quality IS the rating.** Beating a high-rated fighter moves your Elo a lot; beating
   a low-rated one barely moves it. Strength of schedule is baked in, not a separate pile of
   points. Going 1-1 against the champ and #1 leaves you rated near them; 2-0 against #14/#15
   barely moves you.
2. **Raw win COUNT never drives magnitude.** A long record of wins over weak opponents accumulates
   almost nothing — by construction, there is no sum over wins anywhere.
3. **Recency dominates.** Newer fights overwrite older ones, and inactivity regresses a rating
   toward the mean. A fighter's 2017 prime does not prop up their 2026 number.

## 1. The Elo core (`eloEngine.ts`)

One chronological pass over all dated, decisive (or drawn) UFC fights (fights with no date are
skipped — they can't be placed on the timeline):

```typescript
expectedA = 1 / (1 + 10^((ratingB - ratingA) / 400))
ratingA  += K * (actualA - expectedA)      // actual = 1 win / 0.5 draw / 0 loss
```

Active mechanisms, each with its config keys and rationale:

- **Finish-weighted K** (`elo.baseK` × `finishMultipliers[method]`) — a KO/TKO or SUB moves
  ratings more than a split decision; folds "finishing matters" into the rating without a separate
  bonus. KO/TKO and SUB are at parity (a submission is as decisive a finish as a KO).
- **Provisional K** (`elo.provisionalFights`, `elo.provisionalKMultiplier`) — a fighter's first N
  fights use a boosted K so newcomers converge quickly and otherwise sit near the initial rating
  (`elo.initialRating`). This is why 3-0 / 5-0 prospects don't rocket past champions.
- **Provisional-finish damp** (`elo.provisionalFinishDamp`) — while provisional, the finish
  multiplier is damped toward 1.0 so it can't compound with the provisional boost: a newcomer
  KO'ing low-rated opponents converges on the RESULT, not the method. Full finish credit resumes
  once established.
- **Win-quality gate** (`elo.winQualityGate`, `winQualityFullElo`, `winQualityLowElo`,
  `winQualityGateFloor`) — points GAINED from a win are scaled by the opponent's ABSOLUTE Elo:
  full credit for a ranked-calibre opponent, a small floor fraction for a weak one. An unbeaten
  streak over soft competition plateaus near that slate's level instead of floating into
  contention. Losses are untouched; keyed on absolute opponent quality (not the gap to you), so a
  champ beating other elites keeps full credit.
- **Inactivity regression, two-slope** (`elo.inactivityRetentionPerYear`,
  `elo.inactivityGraceMonths`, `elo.fullInactivityMonths`, `elo.inactivityRetentionSteep`) —
  between fights (and once more up to "today"), a rating drifts toward the mean:
  `rating = mean + (rating − mean) × retention^yearsOut`, after a short grace. Past the
  `fullInactivityMonths` elbow, the steeper retention applies to the portion of the gap beyond it
  — active/semi-active fighters (champions defend ~10–14 mo apart) never reach the elbow; only the
  truly shelved fade fast. Paired display: an `⏸ INACTIVE` badge (≥18 mo idle in-division,
  `getInactivity()` in `fighterDisplay.ts`) — badge only, never a forced reorder.
- **Recency is continuous, not a wall** (`elo.maxFightAgeYears` is `null`) — recency dominance is
  carried entirely by chronological processing + the inactivity regression, which fades pre-window
  form at every gap along each fighter's own timeline. (The old discrete "boundary discount" drew
  a synchronized league-wide cliff and was retired — see CHANGELOG 2026-07-04.) The user-facing
  **Era filter** is still a hard window (drops older fights) for the historical lens.
- **Weight-class move decay, charged once per division** (`elo.moveDecayPenalty`,
  `EloState.divisionsSeen`) — on a detected division change the rating carries across but
  regresses a fraction toward the mean first: champions who move up arrive near the top but must
  prove the new weight. The tax hits only the FIRST entry into a division — returning to a proven
  weight costs nothing (inactivity regression already covers the gap). Interim/catch/open-weight
  labels are normalized so they don't trigger a bogus move penalty.
- **Display mapping** (`elo.displayCurve`, `elo.winProbDenominator`) — Elo → 0–100 display score
  and Elo-gap → win probability. Both are **anchored to the current rating spread**: if the spread
  is recalibrated (K, gates, decay), re-anchor these (and re-check `officialBonusScaleElo` against
  the gap distribution — `scripts/diagOfficialImpact.ts` prints it).

The sweep also tracks `peakRating` (for "declined vs. ascending" context in the UI).

## 2. Strength of schedule (`sosNudge` + display)

`sosElo` = recency-weighted average opponent Elo over the last `sosWindowYears`. Opponent quality
is `max(fight-time Elo, current Elo)` — an opponent who later proved elite credits the win at
their proven level. Because Elo already rewards a tough schedule, SoS is **not** re-added as a big
term (that would double-count). Three roles:

- a small bounded nudge (`sosAnchorElo`, `sosSlopePerElo`, `sosAdjustCap`) for fighters whose
  schedule is much tougher/softer than their rating yet reflects;
- the **primary tiebreaker** on near-identical ratings;
- a headline displayed stat (0–100 via `sosDisplayCurve`), and raw `sosElo` feeds the
  "why this rank" explainer.

**All-time (career) SoS** (`src/lib/careerSos.ts`, `careerSos` config, DISPLAY ONLY) answers a
different question — "how hard was this career?" rather than "how hard is this fighter's form now".
It is the mean of every opponent's rating **at the time of that fight**, read straight off the Elo
trace's `opponentRating` (no second sweep, no rating math). It differs from `sosElo` on all three
axes so the two can never restate each other: career-wide (no window), un-weighted (no recency
half-life), and strictly fight-time — deliberately **not** `max(fight-time, current)`, because a
résumé stat must report what the fighter walked into on the night, not an opponent's later peak.
Reported as a **percentile** of the all-era pool (fighters with `minFights`+ traced fights) rather
than a 0–100 curve: a career mean compresses hard (p05 1484 → p95 1539, vs the windowed `sosElo`'s
p95 of 1596), so an absolute curve would squash every career into one band — same reasoning as the
grappling ramp. Careers median-dated before `eraCaveatBeforeYear` carry a disclosure flag (ratings
cold-start at 1500, so early-UFC careers compress). Surfaced on the fighter profile only. It feeds
**nothing** — see the removal condition in `rankingConfig.careerSos`.

**`scheduleStrength`** is a separate **display-only** activity-adjusted composite
(`activityGraceMonths`, `activityFullDecayMonths`, `activityFloor`, `activityTargetFightsPerYear`,
`activityCadenceWeight`): schedule quality kept honest by whether it's current. It never enters
`finalRating` — the Elo core already regresses inactive ratings, so folding activity into
`sosNudge` would double-count a layoff.

## 3. Fight-metrics composite (`metricsBonus` — the ranks-16–40 differentiator)

Separates similar fighters by *how* they perform over their last `metricsRecentFights` division
fights (recency-weighted via `recencyHalfLifeMonths`; fights older than `recencyCutoffMonths` are
ignored for metrics/SoS/eligibility). Weights (`metricsWeights`, sum 1.0):
`volumeStrikeDifferential` (the headline — STR landed − absorbed), `strikeAccuracyDifferential`
(balances raw volume), `knockdownRate` (strike finish threat), `takedownDifferential` (grappling
control), `submissionThreat` (grapple finish threat — mirrors `knockdownRate`; closed a
striker/grappler asymmetry). Normalization in `metricsNorm`; scaled by `metricsScaleElo` with a
confidence dampener below `metricsConfidenceMinFights` scored fights.

> Volume leads by design: v1 used accuracy % and ignored the `STR` volume columns entirely, so a
> fighter landing 8-of-10 "beat" one landing 90-of-200.

- **Opponent-quality damper** (`metricsQualityDamp`, `metricsQualityFullElo`,
  `metricsQualityLowElo`, `metricsQualityFloor`) — the composite is opponent-blind, so **positive**
  `metricsBonus` is scaled by a ramp on the fighter's slate quality (`sosElo`): gaudy differentials
  over weak competition earn a floor fraction; dominance over real comp keeps full credit.
  Negative metrics are untouched — a soft performance counts regardless of who you faced. This
  removes the inflation *above* a fighter's Elo, not the Elo itself.

## 4. "Untested" hold (`untestedHold` — ranking-only résumé gate)

An undefeated riser who has beaten nobody ranked shouldn't sit among proven contenders on Elo
alone. A fighter whose best CAREER win (`bestWinElo`, career-wide, `max(fight-time, current)`
opponent quality) falls below `untestedHold.thresholdElo` is held back:
`untestedPenalty = −maxPenaltyElo × shortfall × taper`, with
`shortfall = clamp((thresholdElo − bestWinElo)/rampElo, 0, 1)` and
`taper = clamp(1 − fights/taperFights, 0, 1)`. Beat someone real and the penalty **releases
entirely** — Elo already banked the win, so they jump. Surgical by construction: the release keys
on the career-best win (a faded ex-champ's old quality win still exempts them), and the
fight-count taper makes proven veterans immune. **Never touches Elo.** Folded into `finalRating`
(drives division rank + displayed score), but **P4P subtracts it back out** (`crossDivision.ts`
`unheldRating`) — a shallow-division prospect shouldn't be double-dinged cross-division. Surfaced
in the "why this rank" decomposition as a releasable `Untested` part.

## 5. Official rank seed + champion rules

The committed official-rankings snapshot (see `data/SOURCES.md` §1A) plays two narrow roles in
`scoringEngine.ts` — in v2 it does **not** seed opponent quality (Elo measures that from results):

1. **Division membership** — the authority on which division a fighter is ranked in (handles
   permanent weight moves the UFC has recognized). `divisionOverrides` in the config applies
   manual fixes where the API is stale (title changes, weight moves); re-audit after each card
   with `scripts/sherdog/championAudit.ts`.
2. **A small seed** — `officialBonus = officialRankScores[rank] × officialBonusScaleElo`, bounded
   to a couple of median ranked-pool gaps. **Form-gated** (`officialSeedSuppressLossStreak`): a
   non-champion on a losing streak gets zero seed — the official list is slow to shed fading
   names, and the cage's verdict stands over it. The champion seed is unconditional. Unranked
   fighters get 0. Re-run `scripts/diagOfficialImpact.ts` after any seed tuning.

Post-sort champion rules (contender floors were removed 2026-07-06 — the config's
`top5FloorRank`/`top15FloorRank`/`contenderFloorSuppressLossStreak` keys are dead):

- **Champion floor** (`championFloorRank`) — a reigning champ (official rank "C") never displays
  below this slot. Unconditional. A backstop, not the engine — if the champion floor is doing real
  work in several divisions, the Elo isn't landing; investigate before tuning anything else.
- **Champion tiebreaker** (`championTiebreakerBand`) — a reigning champ sitting directly below a
  non-champion within the band is lifted above them; breaks genuine near-ties at the top without
  boosting a clearly out-rated champ. **Exception by design:** a champ who *lost head-to-head* to
  the fighter directly above them is NOT lifted — the in-cage result stands over the belt.
- Champion identity comes from official rank `"C"` (or `divisionOverrides`), **never** the stale
  `Belt` CSV flag.

## 6. Head-to-head leapfrog (`headToHead`)

A fighter who recently and decisively beat someone ranked above them is lifted to directly above
that opponent — Elo is gap-preserving, so a single decision win narrows the gap without flipping
the order; this enforces the in-cage result. Guard rails keep one result from overriding the
rating wholesale: `recencyMonths` (a stale win can't override years of divergence),
`negateOnLossAfter` (a loss to anyone since cancels it — form already turned), `decisiveOnly`
(split decisions/draws don't qualify), `eloGapCap` (only near-peers), and `leapfrogMaxUnbeaten`
(**anti-vault**: the move is a LOCAL reorder — skipped if it would pass more than N un-beaten
in-between fighters; fighters you've also beaten don't count against the cap).

## 7. Pre-UFC pedigree (`preUFCPedigree` — supplementary seed, ENABLED)

A bounded signal for the quality of a fighter's record in other promotions before the UFC, from
`sherdog_fights.csv` (+ the frozen Kaggle `pro_mma_fights.csv`) via `src/lib/pedigreeSeed.ts` — so
a newcomer arriving from Bellator/ONE/Cage Warriors isn't a blank slate to their thin early-UFC
Elo. `pedigreeBonus = strength × seedMaxElo × taper`, tapering from full at 0 UFC fights to zero
at `seedTaperUFCFights` — once a fighter has a real UFC sample, their own Elo speaks.

Strictly scoped: UFC fights in the source are dropped (duplicate our primary data); only non-UFC
fights *before the UFC debut* count (`onlyBeforeUFCDebut`); weighted by promotion tier
(`promotionTiers`/`orgTierMatchers`; defunct elite orgs like Pride/Strikeforce/WEC excluded from
the seed via `seedExcludeHistorical`); frozen-in-time reference, never current form; the
`seedMaxElo` cap keeps it below even the official seed. **It must never outweigh in-cage UFC
results.**

Refinements on top of the base seed:

- **Feeder attribution + empirical grades** (`useEmpiricalGrades`, `gradeBlendLambda`,
  `gradeMinGraduates`, `gradeShrinkageKappa`, `feederExcludeOrgs`) — each fighter is attributed to
  a primary feeder promotion (plurality of last 5 pre-UFC fights), whose static tier multiplier is
  nudged by a data-driven grade of how its graduates actually did in the UFC (settled Elo gain,
  empirical-Bayes shrunk; built offline by `scripts/sherdog/gradePromotions.ts` →
  `data/promotion_grades.csv`). Hierarchy-preserving: nudges within-tier, never flattens the tier
  prior. DWCS/Contender Series are excluded from feeder identity — a one-fight UFC tryout, not a
  developmental promotion (the DWCS win still counts on the record).
- **Pre-UFC opponent SoS (B.1)** (`useOpponentSos`, `sosWeight`, `sosTermCap`, `sosNormConst`) —
  a pre-UFC WIN over an opponent who themselves reached the UFC adds a bounded term to
  pedigreeStrength, weighted by that opponent's UFC Elo above the mean. Also surfaced as a
  prospect scouting read on `/prospects`. (B.2, a separate pre-UFC Elo sweep, was deliberately not
  built — see `docs/plans/PREUFC_SOS_PLAN.md`.)
- **Prediction-side pedigree prior** (`winProbModel.pedigreeEdgeCoef`) — the ranking seed only
  touches `finalRating`, so `fightPrediction.ts` applies a bounded taper-out pedigree logit to
  newcomer win probabilities. Display-only; never enters the Elo pool.

## 8. Win probability (display-only)

The prediction meters (compare, /upcoming, the Analyst tool) feed **ranked ratings** into the
overlay (2026-07-15): each side's rating is current Elo plus the bounded ranking-layer terms —
metrics, SoS nudge, pedigree seed, untested hold; the official seed is deliberately excluded (a
belt-tracking prior, not a cage signal) — via `predictiveRating()` (`fightPrediction.ts`) →
`predictiveRatingAdjustment()` (`scoringEngine.ts`, sharing the ranking pass's formula block so
the two can't drift). Chosen on evidence: the closing-line bake-off
(`research/backtest/last100.ts`) found Elo → ranked → +overlay improves monotonically, ranked +
overlay beating raw-Elo predictions at t = −3.83 (n=500) and recovering ~47% of the logloss gap
to the de-vigged close. Probability from the rating gap uses `elo.winProbDenominator`, shaded
toward 0.5 for provisional fighters (`elo.winProbShadeFloor`). The bounded context overlay
(`winProbModel`: age edge with saturation, striking/grappling/power style edges, short-notice and
missed-weight flags, all capped by `maxAdjustmentLogit` and shrunk by `overlayShrink`) adjusts it
without ever flipping a clear favourite. `formEloNudge` (compare/upcoming) is a separate
experimental variant shading each side's raw Elo by bounded recent-form drift. None of this feeds
Elo or rankings.

## 9. P4P & leaderboards (`crossDivision.ts`)

P4P is valid because Elo is one global pool. It sorts on `unheldRating` (finalRating with the
untested hold added back). **`p4pRecentForm`** applies a bounded tilt to the P4P sort key ONLY
(`windowYears`, `halfLifeMonths`, `lambda`, `cap`, `qualityFullElo`, `qualityLowElo`,
`qualityFloor`): recency-weighted net Elo swing, each WIN gated by opponent absolute quality
(mirrors the core's win-quality gate) with losses at full weight — so banked prime equity can't
coast at the top, while a hot streak padded on mid-tier opposition doesn't outweigh fewer wins
over elites. Never touches the Elo core, division rankings, or the golden master. Specialty
leaderboards (Finishers/Knockouts/Submissions/Strikers/Grapplers) are sample-weighted over the
same pool.

## 10. Eligibility & divisions

`minUFCFights` to appear at all (excludes cup-of-coffee appearances); `rankingsDepth` per
division. Men: HW, LHW, MW, WW, LW, FW, BW, FLW. Women: Strawweight, Flyweight, Bantamweight,
Featherweight (WFW is a small division — the original spec ranks its top 20 only). Fighters
appearing in multiple weight classes carry ONE Elo across moves (with the move decay); the engine
only *scores* a fighter in the division they're eligible for.

## 11. Tuning guide

Workflow: **change `rankingConfig.ts` → run `scripts/validate.ts` → diff against the last
`validation_elo_*.txt` snapshot → spot-check LW/WW/BW → run the golden master** (and re-bless with
`--update` only when the change is intended). Tune from real output, never in the abstract. Before
adding or tuning any mechanism, run the `modeling-discipline` skill. Every mechanism above is also
guarded at intent level by `npm test` (`scripts/engine.test.ts` for the Elo core,
`scripts/scoring.test.ts` for the ranking layer) — a config tuning change won't fail them, a
behavior change will.

- `metricsScaleElo` — the knob most likely to need adjusting; if metrics override head-to-head
  logic, dial down.
- `elo.baseK` — volatility: higher = more recency-reactive and noisier. Don't raise it without
  re-checking that one upset can't vault a fighter past a proven champion.
- `recencyHalfLifeMonths` — only affects the metrics/SoS sampling windows; the Elo core gets its
  recency from chronological processing + inactivity regression. Tune
  `elo.inactivityRetentionPerYear` (and the steep slope) to make layoffs bite harder/softer.
- Champion placement — push via `officialBonusScaleElo` rather than hard-coding identities;
  `championFloorRank` and `championTiebreakerBand` are the backstops.
- After any seed/floor tuning, re-run `scripts/diagOfficialImpact.ts` (prints who the seed props
  and the ranked-pool gap distribution).

## Config groups (`rankingConfig.ts`)

| Group | Controls |
|-------|----------|
| `elo` | Core rating: K, provisional period + finish damp, win-quality gate, inactivity regression (two-slope), weight-move decay, display curve, win-prob denominator/shade |
| `winProbModel` | Display-only win-prob context overlay (age/style/flags/pedigree logits, caps) |
| `recencyHalfLifeMonths` / `recencyCutoffMonths` | Recency weighting + hard cutoff for the metrics/SoS windows (not the Elo core) |
| `finishMultipliers` | Per-method K scaling (KO/TKO = SUB > decisions) |
| `metricsWeights` / `metricsScaleElo` / `metricsNorm` / `metricsQuality*` | Striking/grappling composite + opponent-quality damper |
| `untestedHold` | Résumé gate: threshold/ramp/cap/taper |
| `sos*` / `activity*` | Bounded SoS nudge + the display-only activity-adjusted scheduleStrength |
| `careerSos` | Display-only all-time (career, fight-time) strength of schedule — feeds nothing |
| `officialBonusScaleElo` / `officialRankScores` / `officialSeedSuppressLossStreak` / `championFloorRank` / `championTiebreakerBand` | Official seed + champion rules |
| `headToHead` | Leapfrog guard rails + anti-vault |
| `p4pRecentForm` | Bounded P4P-only recent-form tilt |
| `minUFCFights` / `rankingsDepth` / `divisionOverrides` | Eligibility, depth, manual division fixes |
| `promotionTiers` / `preUFCPedigree` | Cross-promotion tiering + the pre-UFC pedigree seed |
| `radar` | Profile radar axis normalization (display) |
