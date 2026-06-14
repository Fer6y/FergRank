> ⚠️ **HISTORICAL — SUPERSEDED. Do not implement from this document.**
> This patch tuned the **v1 additive scoring model** (`RankScore = WinQuality + … − Penalties`).
> That model was validated on real output on 2026-06-12 and failed (unbounded win-quality sum
> rewarded volume of finishes; champions had to be floored into place). It was **replaced by the
> Elo model** (`eloEngine.ts` + rewritten `scoringEngine.ts`). The current algorithm is documented
> in `CLAUDE.md → "THE ALGORITHM (v2 — Elo core)"`. This file is retained only as the record of how
> v1 was tuned and why it was abandoned. The config keys it references (winRatePrior, lossPenaltyMultiplier,
> activityCap, sosSlope, etc.) **no longer exist** in `rankingConfig.ts`.

---

# UFC AI Rankings — Algorithm Patch v1

**Date**: June 10, 2026
**Purpose**: Implement six fixes identified during tuning review. Hand this to Claude Code. All values land in `rankingConfig.ts`; formula changes go in `scoringEngine.ts`. Nothing hardcoded.

After implementing, re-run and print the LW / WW / BW top 40 so we can validate on real numbers. These values are designed to be directionally correct — we tune from the new output, not the old.

---

## Fix 1 — Sort/Display Bug (do this first, it's a bug not a tuning change)

**Symptom**: Displayed rank order does not match the displayed Score column. Examples from current output: LW #3 (75.72) sits above #4 (86.89); BW #1 (94.97) sits above #2 (103.65); WW #2 (86.30) above #3 (90.48).

**Cause**: The array is being sorted on a different value than what's printed, OR the head-to-head pass / floor logic reorders without the displayed score reflecting it.

**Fix**:
- Sort the rankings array on the exact same `RankScore` field that is displayed.
- Apply the head-to-head correction (Step 9) as an explicit reorder of that same array, so printed order == array order at all times.
- Do not keep a separate sort key. Whatever you sort on is what you print.
- Add a guard/assert in the sanity output: verify each fighter's score is >= the next fighter's score, EXCEPT where a head-to-head swap or an official floor (Fix 2) intentionally overrode it. Log any unexplained inversion.

---

## Fix 2 — Champions & Ranked Fighters Sitting Too Low

**Symptom**: Reigning champions are not landing at #1. In current output Makhachev is WW #4, Topuria LW #5, and at BW the reigning champ Petr Yan is #1 by displayed order but his score (94.97) is actually *lower* than #2 Merab (103.65) — so even where the champ shows on top, it's the sort bug doing it, not the scoring. The official-rank signal is far too weak (champ bonus maxes at +20 vs WinQ values of 50–95).

> Current title picture (confirm against whatever the Octagon API returns at runtime — this is just the validation reference as of June 2026): **BW champ = Petr Yan** (beat Merab at UFC 323, Dec 6 2025). **LW champ = Ilia Topuria. WW champ = Islam Makhachev.** Merab is now BW former champ / top contender and should get the #1-contender seed, not the champion seed.

### 2a. First, verify name matching (likely a silent failure)

Before changing weights, confirm the elite names are actually matching the Octagon API and receiving an official bonus at all.

**Step 2a.1** — Add a diagnostic function `auditOfficialMatches()` that, for each division, iterates every fighter in the Octagon API rankings (champ + 1–15) and attempts `resolveNameToId()` against the CSV roster.

**Step 2a.2** — Print a table per division: `officialName | matchedCsvName | fighterId | STATUS`, where STATUS is `MATCHED` or `UNMATCHED`.

**Step 2a.3** — Explicitly assert presence of these names (the ones currently buried): Jack Della Maddalena, Belal Muhammad, Leon Edwards, Merab Dvalishvili, Islam Makhachev, Ilia Topuria, Petr Yan, Shavkat Rakhmonov. Any `UNMATCHED` here is the root cause and must be fixed (add to `KNOWN_NAME_OVERRIDES`) before proceeding.

**Step 2a.4** — Do not move on to 2b until every champion and official #1 in all 12 divisions returns `MATCHED`.

### 2b. Scale the official bonus into WinQ range

**Step 2b.1** — In `rankingConfig.ts`, add `officialBonusScale: 0.6` and remove the old `* 0.4 * 0.5` factor.

**Step 2b.2** — In `scoringEngine.ts` Step 8, change the bonus to:
```
officialBonus = officialSeedScore * officialBonusScale
```

**Step 2b.3** — Confirm the resulting bonuses map to: champ=60, #1=54, #2–3=51, #4–6=46.8, #7–10=42, #11–15=37.2 (these come straight from the existing seed table × 0.6).

**Step 2b.4** — The seed/bonus must read the fighter's CURRENT official rank from the API every run. A fighter who lost the belt (e.g. Merab) automatically drops from the champ seed (100) to whatever contender rank the API now lists him at. Do not hardcode any champion identity anywhere.

### 2c. Add soft safety floors (post-sort guarantee)

**Step 2c.1** — Add config:
```typescript
championFloorRank: 2    // reigning champ (official rank "C") never displays below #2
top5FloorRank: 8        // official top-5 never displays below #8
top15FloorRank: 25      // official top-15 never displays below #25
```

**Step 2c.2** — Implement a `applyOfficialFloors(rankedArray, division)` function that runs AFTER sorting AND after the head-to-head pass (Fix 1). For each floor rule, if a qualifying fighter sits below their floor index, remove them from the array and stable-insert them at the floor index, shifting everyone below down by one.

**Step 2c.3** — Apply floors in this order so the strongest guarantee wins ties: `top15FloorRank` first, then `top5FloorRank`, then `championFloorRank` last.

**Step 2c.4** — Whenever a floor moves a fighter, log it: `FLOOR APPLIED: {name} lifted from #{oldRank} to #{newRank} (rule: {ruleName})`. If floors fire for more than ~1–2 fighters per division, that means 2b isn't landing — stop and re-check name matching (2a).

---

## Fix 3 — De-stack Win Quality (kills runaway scores like Prates 129)

**Symptom**: Four multiplicative terms compound into blowout scores. `totalWinQuality` is already a sum (volume baked in), then divided by win count and re-multiplied by `sqrt(numWins)` — double-counting volume — then multiplied again by win-rate and SoS factors.

**Fix**: Use the summed win value directly as the magnitude. Apply only bounded adjustments after it. Remove `volumeMultiplier` and the `avgQualityPerWin` round-trip entirely.

```
// Per-win values are UNCHANGED — each win still =
//   opponentBaseScore * finishMult * recencyWeight * promotionMult * diminishingWeight
totalWinQuality = sum(winValues)          // this is the magnitude. Do not average-then-re-multiply.

// Win-rate quality factor — now uses the SHRUNK win rate from Fix 4, bounded:
qualityFactor = 0.6 + 0.4 * shrunkWinRate          // range [0.6, 1.0]

// SoS as ONE bounded multiplier, re-anchored lower and clamped (see config):
sosMultiplier = clamp(1 + (SoS - sosAnchor) * sosSlope, sosClampMin, sosClampMax)

// Small-sample safety dampener from Fix 4:
sampleConfidence = min(scoredFights / sampleConfidenceMinFights, 1.0)

adjustedWinQuality = totalWinQuality * qualityFactor * sosMultiplier * sampleConfidence
```

Removed config (no longer used): the `sqrt(numWins)` volume multiplier and the old `winRateFactor = 0.5 + winRate*0.5`.

New / changed config:
```typescript
// SoS amplifier — re-anchored from 70 to 55 (closer to median opponent score),
// and clamped so it nudges rather than swings.
sosAnchor: 55
sosSlope: 0.008
sosClampMin: 0.75
sosClampMax: 1.25
```

Reference points for the new SoS multiplier: SoS 88 → 1.25 (capped), 70 → 1.12, 55 → 1.0, 40 → 0.88.

Volume is still rewarded — it lives in the sum (more quality wins = larger total, with diminishing returns already applied per win). We're just removing the *extra* sqrt term that distorted it.

---

## Fix 4 — Small-Sample Inflation (Salkilld 5-0 at LW #2, the 3-0 guys)

**Symptom**: `winRateFactor = 0.5 + winRate*0.5` gives a 5-0 fighter the same full credit as a 20-3 fighter. No penalty for thin samples.

**Fix**: Two parts — Bayesian shrinkage on win rate (principled), plus a mild dampener for very low fight counts (blunt safety).

### 4a. Shrink win rate toward a prior

```
shrunkWinRate = (wins + winRatePrior * winRatePriorStrength) / (totalFights + winRatePriorStrength)
```

New config:
```typescript
winRatePrior: 0.50          // league-average prior win rate
winRatePriorStrength: 5     // pseudo-fights; how hard small samples regress toward the prior
```

Effect:
- 5-0 → (5 + 2.5)/(5+5) = **0.75** (was treated as 1.0)
- 3-0 → (3 + 2.5)/(3+5) = **0.69**
- 20-3 → (20 + 2.5)/(23+5) = **0.80** (big body of work, approaches true rate)

`shrunkWinRate` feeds `qualityFactor` in Fix 3. Use career W / total fights here (same basis as the computed base score).

### 4b. Mild dampener for tiny scored-fight counts

```
sampleConfidence = min(scoredFights / sampleConfidenceMinFights, 1.0)
```

New config:
```typescript
sampleConfidenceMinFights: 4   // full credit at 4+ scored fights in the window
```

Effect: 3 scored fights → 0.75x, 4+ → 1.0x. Targets the 3-0 crowd without over-suppressing legit prospects (5-0 / 7-0 are handled mainly by shrinkage). Feeds `adjustedWinQuality` in Fix 3.

> Keep `minUFCFights: 3` as the eligibility gate, but these two changes mean a 3-fight fighter has to be genuinely dominant against real opposition to crack the top.

---

## Fix 5 — Losses Barely Register (Kevin Holland 16-12 at WW #7)

**Symptom**: ~20:1 asymmetry between win value and loss penalty. Padded records float up.

**Fix**: Keep the quadratic shape (losing to scrubs should hurt far more than losing to elites), raise the coefficient.

```
qualityGap = max(0, 100 - opponentBaseScore)
lossPenalty += lossPenaltyMultiplier * (qualityGap/100)^2 * 100 * recencyWeight
```

Changed config:
```typescript
lossPenaltyMultiplier: 0.4   // was 0.1
```

New penalty per loss (recency-weighted):
- Lose to elite (gap 10) → ~0.4 (nearly free)
- Lose to contender (gap 30) → ~3.6
- Lose to mid-tier (gap 50) → ~10
- Lose to scrub (gap 70) → ~19.6 (brutal, as it should be)

Do NOT apply the diminishing-returns weight to losses — every loss counts fully (only recency decays it), so padding can't hide a bad loss behind a pile of wins.

---

## Fix 6 — Activity Too Strong & Quality-Blind

**Symptom**: Flat +15 for three fights regardless of opponent. Can be farmed against weak competition; for low-WinQ fighters it doubles their relevant score.

**Fix**: Lower the cap and weight each fight by opponent quality.

```
activityScore = 0
for each fight in last 12 months:
    oppFactor = clamp(opponentBaseScore / activityOppQualityAnchor, activityOppQualityFloor, 1.0)
    activityScore += activityPointsPerFight * oppFactor
activityScore = min(activityScore, activityCap)
```

Changed / new config:
```typescript
activityPointsPerFight: 4         // was 5
activityCap: 10                   // was 15
activityOppQualityAnchor: 60      // opponent base score that earns full activity credit
activityOppQualityFloor: 0.5      // floor multiplier so a fight is never worth zero
```

Effect: a fight vs a 60+ opponent = full 4 pts; vs a 30-rated opponent = 2 pts. Three contender-level fights ≈ cap (10); three cans ≈ 6. Activity farming dies.

### 6b. Activity / inactivity consistency

While here: make sure activity and inactivity both derive from a single `monthsSinceLastFight`. In current output Gaethje shows Activity 0 with Inactivity 0, which is contradictory (0 fights in 12mo implies last fight >12mo, which should trigger inactivity). Whenever `activityScore == 0` due to no fights in the last 12 months, the inactivity branch must engage.

Also soften and cap inactivity so injured elites (e.g. Rakhmonov, ~18mo out) aren't nuked:
```typescript
inactivityPenaltyPerMonth: 1.0    // was 1.5
inactivityPenaltyCap: 18          // new — penalty can't exceed this
```
```
if monthsSinceLastFight > inactivityThresholdMonths:
    inactivityPenalty = min((monthsSinceLastFight - inactivityThresholdMonths) * inactivityPenaltyPerMonth, inactivityPenaltyCap)
```

---

## Full Changed/New Config Block

```typescript
// --- Official rankings ---
officialBonusScale: 0.6,          // CHANGED (was 0.4*0.5 → 0.2 effective)
championFloorRank: 2,             // NEW
top5FloorRank: 8,                 // NEW
top15FloorRank: 25,               // NEW

// --- Win quality / SoS ---
sosAnchor: 55,                    // CHANGED (was 70)
sosSlope: 0.008,                  // NEW (replaces /100*0.4*4)
sosClampMin: 0.75,                // NEW
sosClampMax: 1.25,                // NEW
// REMOVED: sqrt(numWins) volume multiplier, old winRateFactor

// --- Small-sample handling ---
winRatePrior: 0.50,               // NEW
winRatePriorStrength: 5,          // NEW
sampleConfidenceMinFights: 4,     // NEW

// --- Loss penalty ---
lossPenaltyMultiplier: 0.4,       // CHANGED (was 0.1)

// --- Activity ---
activityPointsPerFight: 4,        // CHANGED (was 5)
activityCap: 10,                  // CHANGED (was 15)
activityOppQualityAnchor: 60,     // NEW
activityOppQualityFloor: 0.5,     // NEW

// --- Inactivity ---
inactivityPenaltyPerMonth: 1.0,   // CHANGED (was 1.5)
inactivityPenaltyCap: 18,         // NEW
```

---

## Implementation Order

1. Fix 1 (sort bug) — nothing else is observable until the list is honestly sorted.
2. Fix 2a (name-matching diagnostic) — run it, report any UNMATCHED champs before touching weights.
3. Fix 2b/2c, then 3 and 4 together (they're interlinked: shrunkWinRate and sampleConfidence feed the new win-quality formula).
4. Fix 5 and 6 last (fine-tuning the down-weighting).
5. Re-run and print LW / WW / BW top 40 with the full per-component breakdown (WinQ, Metrics, Activity, LossPen, Inact, SoS, and now show officialBonus and shrunkWinRate too).

## Validation Targets (what "fixed" looks like)

- Reigning champs at or very near #1: **Makhachev (WW), Topuria (LW), Yan (BW)**. Merab should sit at #2-ish BW as the top contender (he's no longer champ), not get champ treatment.
- No 3-0 / 5-0 fighter in a division's top 5 unless their SoS is genuinely high.
- No score 30+ points clear of the field (Prates-style runaway) without elite credentials behind it.
- A sub-.600 record like Kevin Holland (16-12) no longer top 10.
- Displayed Score column strictly descending except where a head-to-head swap or official floor intentionally overrides (and those are logged).
