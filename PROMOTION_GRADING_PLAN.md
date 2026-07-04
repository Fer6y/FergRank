# Workstream A — Empirical Promotion Grading

> **Type:** implementation spec for a fresh agent session.
> **Parent:** `PROSPECT_PEDIGREE_PLAN.md` (motivation + firewall rules).
> **Sibling:** `PREUFC_SOS_PLAN.md` (Workstream B). A and B are independent —
> either can ship first. A grades the *promotion* a fighter came from; B grades
> the *opponents* they beat. Both feed the same bounded `pedigreeStrength`.
> **Prepared:** 2026-07-03.

---

## 0. Cold-start orientation (read these first, in order)

1. `PROSPECT_PEDIGREE_PLAN.md` §1 (why: the closing-line backtest shows our
   accuracy gap vs the market widens on newcomers — pre-UFC signal is the lever).
2. `src/lib/pedigreeSeed.ts` — the current seed you are refining.
3. `src/lib/rankingConfig.ts` → `promotionTiers` (lines ~372) + `preUFCPedigree`
   (lines ~386) — the hand-tuned multipliers this workstream makes data-driven.
4. `scripts/sherdog/buildContext.ts` — how `sherdog_fights.csv` is built and how
   orgs are classified to tiers (the `ORG_MATCHERS` table + `classifyOrg`).
5. `CLAUDE.md` §5 (pre-UFC pedigree) — the guarantees you must not break.

**The firewall (non-negotiable, from `pedigreeSeed.ts`):** pre-UFC data never
enters the UFC Elo sweep; the seed is bounded ≤ `seedMaxElo` (25) and tapers to
zero by `seedTaperUFCFights` (6) UFC fights; no odds are read anywhere; this is
build-time only. Everything below lives *inside* that envelope.

---

## 1. The problem

Today `pedigreeSeed.ts` computes `strength = winRate × confidence × topTierMult`,
where `topTierMult` comes from `RANKING_CONFIG.promotionTiers` — **hand-guessed
multipliers** (Bellator 0.68, Cage Warriors 0.55, DWCS 0.78, regional 0.35, …).
Nobody has ever checked whether fighters *out of Bellator* actually outperform
fighters *out of Cage Warriors* once they reach the UFC. The multipliers are a
prior with no posterior.

**Goal:** produce an *empirical graduation grade* per promotion — how well
fighters who came up through promotion X perform in the UFC — and use it in place
of (or blended with) the static multiplier.

---

## 2. Data available (verified 2026-07-03)

`data/sherdog_fights.csv` — 36,962 non-UFC fight rows, header:
```
ourFighterId,sherdogId,fullName,date,organisation,canonicalOrg,tier,tierMultiplier,opponentName,opponentSherdogId,result,method,round,eventName
```
- **2,220 distinct `ourFighterId`** have non-UFC history — these are our
  graduates (every one has a UFC record in the primary data, since `ourFighterId`
  comes from the crosswalk to `Fighters_Stats.csv`).
- `canonicalOrg` + `tier` are already assigned per row by `buildContext.ts`.
- `sherdog_orgs.csv` is the org→tier dictionary with fight counts (audit here for
  mis-tiered / unmapped promotions).

UFC outcomes come from the engine: `buildEloRatings(data)` → `getElo(map, id)`
gives each graduate's settled Elo; `getFighterHistory(data, id)` gives their
chronological UFC fights (newest first) for "first-N-fights" windows and debut
dates.

---

## 3. Algorithm

### 3.1 Attribute each graduate to a primary feeder promotion
Not `topMultiplier` (one lucky fight in a good org shouldn't define them). Use
the **plurality of their last K=5 pre-UFC fights** (by date) — the org they were
*actually* fighting in right before the UFC called. Ties → higher tier wins.
Drop `historical` orgs (Pride/SF/WEC) as feeders (defunct; `seedExcludeHistorical`
already excludes them from the current-form seed). Record `feederOrg` +
`feederFights` per graduate.

### 3.2 Define graduate success (UFC outcome)
Primary metric: **settled UFC Elo gain** = `getElo(map, id).rating − 1500`,
i.e. how far above the baseline their UFC career landed. Rationale: continuous,
already opponent-quality-adjusted (it *is* Elo), and it's the quantity the seed
ultimately nudges.
Keep a **robustness metric** for the ablation: binary `success = won ≥2 of first
3 UFC fights` (uses `getFighterHistory`). Report both; grade on Elo gain.

### 3.3 Grade each promotion with empirical-Bayes shrinkage
A promotion with 4 graduates must not be trusted like one with 80. For promotion
`p` with graduates `g ∈ p`:
```
rawMean_p   = mean(eloGain_g)
grade_p*    = (n_p · rawMean_p + κ · globalMean) / (n_p + κ)   // shrink to global
```
`κ` (pseudo-count, e.g. 15) is the strength of the shrinkage prior — tune it so a
single-graduate org sits ~at the global mean and an 80-graduate org is ~its raw
mean. Then **squash to a [0,1] multiplier** on the same scale as the existing
tier multipliers (so it's a drop-in): min-max or logistic map the shrunken Elo
gains across promotions into, say, `[0.35, 0.85]` (the current tier range). Emit
the graduate count `n_p` and a bootstrap CI so display/trust can show confidence.

### 3.4 Wire into `pedigreeSeed.ts`
Replace `a.topMult` in the strength calc with the graduate-weighted feeder grade,
**or blend** (safer):
```
mult = λ · empiricalGrade[feederOrg] + (1 − λ) · staticTierMultiplier
```
`λ` tuned by the backtest (§5). Fall back to `staticTierMultiplier` when
`n_p < gradeMinGraduates` (e.g. 8) — too few graduates to trust the empirical
number. Everything downstream (`strength × seedMaxElo × taper`) is unchanged, so
the bound + taper guarantees still hold automatically.

---

## 4. New artifacts

| File | Kind | Responsibility |
|---|---|---|
| `scripts/sherdog/gradePromotions.ts` | build-time script | compute grades, write `promotion_grades.csv`; print a ranked table + graduate counts for eyeballing |
| `data/promotion_grades.csv` | committed artifact | `org,canonicalOrg,tier,graduates,meanEloGain,shrunkEloGain,grade,ciLo,ciHi` |
| `src/lib/promotionGrades.ts` | runtime loader | memoized read of the CSV → `Map<canonicalOrg, {grade, graduates}>`; consumed by `pedigreeSeed.ts` |

**Config additions** under `RANKING_CONFIG.preUFCPedigree`:
```
useEmpiricalGrades: true,      // master toggle (false = pure static tiers, today's behaviour)
gradeBlendLambda: 0.5,         // λ in §3.4 (0 = static only, 1 = empirical only)
gradeMinGraduates: 8,          // below this, fall back to static tier multiplier
gradeShrinkageKappa: 15,       // κ pseudo-count in §3.3
```

---

## 5. Leakage — the one thing that will bite you

The grade is built from graduates' UFC outcomes. Seeding a **live** newcomer is
fine (their outcome isn't in the training set). But the **backtest** predicts
*past* bouts — if the grade for "Cage Warriors" was computed using a graduate
whose UFC career happened *after* the bout being predicted, that's look-ahead
leakage.

Two acceptable fixes (pick one, document it):
- **A. Debut-cutoff freeze (simplest):** grade a promotion using only graduates
  who made their UFC debut ≥3 years before the evaluation window's start. For the
  live table, use everyone. Produce two tables: `promotion_grades.csv` (live) and
  the backtest builds its own as-of table in-memory.
- **B. Per-fold rebuild:** in the backtest, rebuild the grade table per fold from
  graduates with `debutDate < asOf`. More correct, more code.

Mirror the `asOf` discipline already in `pointInTime.ts` / `styleProfile`.

---

## 6. Validation (the scoreboard)

1. **Sanity, pre-backtest:** run `gradePromotions.ts`, read the ranked table. Do
   the grades pass the smell test? (DWCS/Bellator/Cage Warriors/LFA should land
   above pure regional; a shock ordering means a bug in attribution or metric.)
2. **Primary — does the newcomer gap close?** Re-run the sibling backtest at the
   thin-sample gate, before vs after:
   ```
   MINFIGHTNO=3 node_modules/.bin/jiti research/backtest/enhancedVsClose.ts
   ```
   Success = the ≥3-fight accuracy gap to the market (−7.9 pt today) shrinks,
   *specifically within the 3–5 UFC-fight bucket*. **Add a fightNo-bucketed
   breakdown to that script** (3–5 vs 6+) so the gain is attributable — the 6+
   pool should barely move (taper).
3. **Golden master:** `node_modules/.bin/jiti scripts/goldenMaster.ts` must stay
   green for the established pool. A large shift there = pedigree leaking past the
   taper → bug.
4. **Ablation:** run the backtest under `useEmpiricalGrades: false` vs `true`, and
   sweep `gradeBlendLambda ∈ {0, 0.5, 1}` — attribute the gain to the grades, not
   to noise. Keep the λ that wins out-of-sample.
5. Re-bless golden master (`--update`) only after 2–4 pass. Update `CLAUDE.md` §5
   and `data/SOURCES.md`.

---

## 7. Suggested session sequence

1. Recon: read the 5 files in §0; run `gradePromotions`-style ad-hoc counts (how
   many graduates per org? which orgs clear `gradeMinGraduates`?).
2. Build `gradePromotions.ts` → `promotion_grades.csv`; eyeball the table.
3. Build `promotionGrades.ts` loader.
4. Wire the blend into `pedigreeSeed.ts` behind `useEmpiricalGrades`.
5. Add the fightNo-bucket breakdown to `enhancedVsClose.ts`.
6. Backtest + ablation + golden master; tune `λ`, `κ`; re-bless; document.

---

## 8. Acceptance criteria

- `promotion_grades.csv` committed; grades ordered sensibly with graduate counts.
- Seed change is behind `useEmpiricalGrades` and falls back to static tiers below
  `gradeMinGraduates`.
- Backtest at `MINFIGHTNO=3` shows the 3–5-fight bucket accuracy gap narrowing,
  with the 6+ bucket essentially unchanged.
- Golden master green (or intentionally re-blessed with a written rationale).
- No pre-UFC data path touches the UFC Elo sweep or reads odds.

---

## 9. Open questions for the session owner

- **Success metric:** settled Elo gain (lean) vs peak-in-first-8 vs binary
  made-it? Settled Elo double-counts nothing and is already SoS-adjusted.
- **Feeder attribution window K** — last 5 pre-UFC fights? Or all pre-UFC fights
  weighted by recency? (Lean: last 5, plurality, tie→higher tier.)
- **Squash range** — reuse `[0.35, 0.85]` to stay drop-in, or let grades exceed
  the old tier range if a promotion genuinely over-produces? (Lean: keep in-range
  first; widen only if validation asks for it.)
- **Do we retire `promotionTiers` eventually,** or keep it permanently as the
  small-sample fallback? (Lean: keep — it's the sane prior for thin orgs.)
