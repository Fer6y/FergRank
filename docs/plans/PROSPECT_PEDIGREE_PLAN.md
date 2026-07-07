# Prospect & Pre-UFC Pedigree — Implementation Plan

> **Status: COMPLETE (2026-07-03)** — Workstream A built, B.1 built, B.2 deliberately not built
> (gated on B.1 delivering measurable gain; it didn't). See `docs/CHANGELOG.md` 2026-07-03.
> Originally: planning, prepared 2026-07-03 for the next working session.
> **Owner context:** picks up directly from the closing-line backtest below.
> **Scope discipline:** everything here refines the *prior* on thin-sample
> fighters. It must stay bounded and thin-sample-only (tapers out by 6 UFC
> fights, like today's seed). It must never let pre-UFC data outweigh in-cage
> UFC results. Firewall rules from `pedigreeSeed.ts` carry over verbatim.

---

## 1. Why we're doing this (the earned justification)

The `research/backtest/enhancedVsClose.ts` run compared our head-to-head model
against the de-vigged BestFightOdds closing line, leak-free, over recent cards:

| Sample | Full model logloss | Market logloss | logloss gap | Full acc | Market acc | acc gap |
|---|---|---|---|---|---|---|
| ≥6 fights, 60 cards (78 bouts) | 0.650 | 0.621 | +0.029 | 61.5% | 67.9% | **−6.4 pt** |
| ≥3 fights, 60 cards (139 bouts) | 0.643 | 0.605 | +0.038 | 62.6% | 70.5% | **−7.9 pt** |

**The finding:** on probability *quality* (logloss/brier) we're near par with the
close. The distance is in *pick accuracy*, and it **widens when we include
fighters with fewer UFC fights** (−6.4 pt → −7.9 pt). When we add the 3–5-fight
fighters, the market's accuracy goes *up* (67.9% → 70.5%) while ours stays flat.

**The diagnosis (Scott's read, confirmed by the data):** the market's edge is
concentrated on *newcomers*, where our Elo is provisional/thin and the market
prices camp, pedigree, and eye-test info we don't encode. Our model, by
contrast, gets *stronger* the more UFC data it has. So the lever is: **give
thin-sample fighters a better-informed pre-UFC prior** — a real read on the
quality of where they came from and who they beat to get here.

This is exactly the gap pre-UFC pedigree is supposed to fill. Today's seed is a
blunt instrument; this plan makes it sharp.

---

## 2. What exists today (honest baseline)

**Pedigree seed — `src/lib/pedigreeSeed.ts` + `RANKING_CONFIG.preUFCPedigree`:**
- Reads `data/sherdog_fights.csv` (36,963 rows; columns include `ourFighterId`,
  `sherdogId`, `organisation`, `canonicalOrg`, `tier`, `tierMultiplier`,
  `opponentName`, **`opponentSherdogId`**, `result`, `method`, `date`).
- Per fighter: `strength = winRate × confidence × topTierMultiplier`, bounded to
  `maxStrength` (0.75). `confidence = min(fights/5, 1)`. Pre-UFC-debut fights
  only; `historical` orgs (Pride/SF/WEC) excluded from the current-form seed.
- Scoring side: `pedigreeBonus = strength × seedMaxElo(25) × taper`, tapering
  linearly to **zero at 6 UFC fights** (`seedTaperUFCFights`). Golden-master
  blessed, `seedEnabled: true`.

**Promotion tiers — `RANKING_CONFIG.promotionTiers`:** hand-tuned static
multipliers (UFC 1.0, DWCS 0.78, Bellator/ONE/PFL 0.68, Cage Warriors/LFA 0.55,
regional 0.35, Pride/SF/WEC 0.68 historical). `orgTierMatchers` maps org strings
→ tier by substring.

**Prospect surface — `src/lib/prospects.ts` + `/prospects`:** ≤5-fight winning,
active fighters; climb-per-fight, last-2, next fight, age, and a bare pre-UFC
`W-L` record where the seed has ≥3 fights. Display-only.

**Three weaknesses this plan attacks:**
1. **Tier multipliers are guessed, not measured.** No feedback loop from "how
   did fighters out of promotion X *actually* do once they hit the UFC?"
2. **Pedigree ignores WHO you beat.** `winRate × topTierMult` treats 12-0 vs
   cans in a tier-3 org the same as 12-0 against future UFC fighters in the same
   org. There is no pre-UFC strength of schedule — even though
   `opponentSherdogId` is right there to build one.
3. **`topMultiplier` takes only the single best org** — a fighter's bulk record
   in a lesser org is invisible; one one-off fight in a good org inflates them.

---

## 3. Workstream A — Grade the promotions (data-driven)

**Goal:** replace/refine the hand-tuned `promotionTiers.multiplier` with an
*empirical graduation grade* — how well fighters who came up through promotion X
perform once they reach the UFC, controlling for how deep into the UFC they got.

### Design
- **Population:** every fighter with pre-UFC fights in `sherdog_fights.csv` who
  later has ≥N UFC fights in our primary data. Attribute them to their
  **primary feeder promotion** (the org where the plurality of their last K
  pre-UFC fights happened — not just `topMultiplier`).
- **Success metric per graduate:** their *settled* UFC Elo (or peak-in-first-8-
  fights Elo) minus the 1500 baseline. Optionally a binary "reached ranked / won
  ≥2 of first 3." Pick one primary + keep one as a robustness check.
- **Promotion grade:** shrinkage-estimated mean graduate success per org
  (James-Stein / empirical-Bayes toward the global mean so a promotion with 4
  graduates isn't over-trusted). Output a continuous `promotionGrade ∈ [0,1]`
  per org, plus a graduate count and CI for display/trust.
- **Wire-in:** the grade *replaces* the static `tierMultiplier` in the pedigree
  strength calc (or blends: `mult = λ·empiricalGrade + (1−λ)·staticTier`, λ tuned
  by validation). Keep `promotionTiers` as the fallback for orgs with too few
  graduates.

### New artifacts
- `scripts/sherdog/gradePromotions.ts` — build-time; emits
  `data/promotion_grades.csv` (`org,canonicalOrg,graduates,meanEloGain,grade,ci`).
- `src/lib/promotionGrades.ts` — runtime loader (memoized), read by
  `pedigreeSeed.ts`.
- Config: `RANKING_CONFIG.preUFCPedigree.useEmpiricalGrades` (toggle) +
  `gradeBlendLambda`, `gradeMinGraduates`.

### Leakage guard
The grade is computed from *historical* graduates' UFC outcomes. When seeding a
*current* newcomer it's fine (their outcome isn't in the training set yet), but
for the **backtest** the grade must be built only from graduates whose UFC
careers concluded before the as-of date — otherwise we leak. Cleanest: freeze a
grade table as-of each backtest fold, or restrict grading to graduates who
debuted ≥3 years before the evaluation window. **Decide this before wiring to
the seed.**

---

## 4. Workstream B — Deeper pre-UFC strength of schedule

**Goal:** stop treating a pre-UFC record as a win count. Measure *who* they beat.

### Design (staged, cheapest signal first)
1. **UFC-bound-opponent count (cheap, high-signal).** For each pre-UFC fighter,
   count how many of their pre-UFC opponents (`opponentSherdogId`) *themselves*
   reached the UFC, and how those opponents did (their UFC Elo). Beating future
   UFC fighters — especially future *ranked* ones — is the strongest pre-UFC
   signal available. This is a direct join we can build today; no new data.
2. **Pre-UFC Elo sweep (fuller).** Run a *separate, firewalled* Elo pass over the
   entire `sherdog_fights.csv` graph (all orgs, all fighters, chronological) to
   get a pre-UFC rating for every opponent — including those who never reached
   the UFC. Then a fighter's pre-UFC SoS = recency-weighted mean pre-UFC-Elo of
   their opponents. This is a self-contained rating pool that **never touches the
   UFC Elo pool** — it only informs the bounded seed. Anchor the two pools by the
   overlap set (fighters in both) so pre-UFC Elo is on a comparable scale.
- **Blend:** `pedigreeStrength = f(recordQuality, promotionGrade[A], preUFC_SoS[B])`
  — the SoS term is what separates a padded record from a tested one.

### New artifacts
- `scripts/sherdog/buildPreUFCElo.ts` — build-time; emits
  `data/pre_ufc_elo.csv` (`sherdogId,fullName,preUfcElo,fights,lastDate`).
- Extend `pedigreeSeed.ts` `PedigreeInfo` with `preUfcSos`, `ufcBoundBeaten`.
- Config knobs under `preUFCPedigree`: `sosWeight`, `ufcBoundBonus`.

### Display payoff (`/prospects` + profile)
Turn the bare `W-L` into a *scouting read*: "12-2, beat 3 future UFC fighters,
came up through Cage Warriors (grade A−)." This is genuinely differentiating
content and directly serves the app's thesis (transparent, data-driven depth).

---

## 5. Validation — how we'll know it worked

The backtest is the scoreboard. **Success = the newcomer accuracy gap shrinks
without hurting established-fighter scores.**

1. **Primary:** re-run `research/backtest/enhancedVsClose.ts` at `MINFIGHTNO=3`
   before and after. We want the ≥3-fight accuracy gap (−7.9 pt today) to close
   toward the ≥6-fight gap. Slice the sample into 3–5 UFC fights vs 6+ and report
   the delta *within the thin-sample bucket specifically* — that's where any gain
   must show up. (Add a `fightNo`-bucketed breakdown to the script.)
2. **Guard:** `scripts/goldenMaster.ts` must stay green for the established pool
   — the taper means 6+-fight rankings should barely move. Any large shift there
   is a bug (pedigree leaking past the taper).
3. **Ablation:** run seed OFF / record-only / +promotionGrade / +preUFC-SoS as
   four configs through the backtest so we can attribute the gain to each term,
   not just ship a black box.
4. **Leakage audit:** confirm every pre-UFC signal for a backtested bout uses
   only data dated before that bout (mirror the `asOf` discipline already in
   `styleProfile` / `pointInTime.ts`).

---

## 6. Firewall & guardrails (non-negotiable)

- Pre-UFC data **never enters the UFC Elo sweep.** It only feeds the bounded,
  taper-limited `pedigreeBonus`. Two separate rating pools.
- Bounded ≤ `seedMaxElo` (25), below the official-rank seed — pedigree refines
  edge cases, never reorders a division on its own.
- Thin-sample only: full taper-out by `seedTaperUFCFights` (6). A fighter with a
  real UFC sample is judged on the cage, full stop.
- Odds are never read anywhere in this pipeline (research-firewall rule).
- Everything build-time: no runtime scraping. New CSVs are committed artifacts.

---

## 7. Suggested sequence for the session

1. **Recon (30 min):** read `scripts/sherdog/buildContext.ts` (how
   `sherdog_fights.csv` is built + crosswalk quality), spot-check `opponentSherdogId`
   fill rate and how many pre-UFC opponents resolve to `ourFighterId`.
2. **Workstream B.1 first** (cheapest, highest signal): UFC-bound-opponent count.
   Build the join, add `ufcBoundBeaten` to `PedigreeInfo`, eyeball a few known
   prospects (did the numbers pass the smell test?).
3. **Add the backtest bucketing** (3–5 vs 6+ fight slices) so we can measure B.1
   in isolation before building more.
4. **Workstream A** (promotion grades) — build `gradePromotions.ts`, settle the
   leakage-freeze approach, blend into the multiplier.
5. **Workstream B.2** (pre-UFC Elo sweep) only if B.1 + A haven't closed enough
   of the gap — it's the most work for uncertain marginal signal.
6. Golden-master + ablation + re-bless. Update `CLAUDE.md` §5 and `SOURCES.md`.

---

## 8. Open questions to decide together

- **Success metric for promotion grading:** settled Elo gain vs binary "made it"?
  (Lean: continuous Elo gain, shrinkage-estimated — more information, less noise.)
- **Grade → multiplier: replace or blend?** (Lean: blend, λ tuned, so tiny-sample
  orgs fall back to the sane static tier.)
- **Pre-UFC Elo pool scale anchoring** — how to make pre-UFC Elo comparable to
  UFC Elo (overlap-set calibration vs just leaving it relative and z-scoring).
- **Is `sherdog_fights.csv` coverage deep enough**, or do we need a
  crosswalk/scrape extension pass first (`extendCrosswalk.ts`) to resolve more
  pre-UFC opponents to ids? Answer during recon step 1.

---

## Reference — files in play

| File | Role |
|---|---|
| `src/lib/pedigreeSeed.ts` | current seed; extend `PedigreeInfo` + strength calc |
| `src/lib/rankingConfig.ts` → `preUFCPedigree`, `promotionTiers` | all tunables |
| `data/sherdog_fights.csv` | pre-UFC fight graph (has `opponentSherdogId`) |
| `scripts/sherdog/buildContext.ts` | builds the above; where grading hooks in |
| `src/lib/prospects.ts` + `/prospects` | display payoff |
| `research/backtest/enhancedVsClose.ts` | the scoreboard (run at `MINFIGHTNO=3`) |
| `scripts/goldenMaster.ts` | regression guard for the established pool |
