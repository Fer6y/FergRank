# CAREER_STAGE_PLAN — the prospect runway metric (queued 2026-08-12)

> Status: **NOT STARTED — next session.** Written at the user's request after the regional
> Elo + Fight Matrix results feed shipped. Companion memories: `regional-elo-shipped`,
> `prospect-system-next-direction`.

## The ask

A **career-stage metric** for prospects combining (1) when their pro debut was, (2) how many
fights they've had, and (3) **chronological age** — because "all the metrics could be the
same but a 23-year-old is very different from a 36-year-old with the same amount of fights."

## What already exists (don't rebuild)

- `data/regional_profile_meta.csv` — explicit **proDebutDate for 100% of 11,466 crawled
  profiles** (verified against known debuts; 0 debut-after-observed conflicts) + proRecord.
  `regional_ratings.csv` carries `careerYears` (debut → last fight) per rated fighter.
- The DWCS cohort study's measured age bands (<25 / 25–28 / 29+ → 16% / 12% / 5% top-15)
  and the runway verdict line already on the scout band (≥85th pct only).
- Fight Matrix has **no DOB** (Combat Age is their wear metric — never treat as age).

## The DOB source, FOUND AND VERIFIED (2026-08-12)

**ESPN's open core API.** No auth, JSON, 38,013 MMA athletes — including pure regional
fighters:

- Record: `sports.core.api.espn.com/v2/sports/mma/athletes/{id}` → `dateOfBirth`,
  citizenship, height/weight. Verified: **Bilal Hasan (id 5264405) → 2001-07-16**, exactly
  matching the hand-verified age 25.
- Name search: `site.web.api.espn.com/apis/search/v2?query=<name>` returns MMA-typed
  athlete hits (disambiguated from other sports by `s:3301`).

### Harvest plan (next session)

1. `research/regional/fetchEspnDob.ts` — polite (~2 req/fighter: search + record), cached,
   resumable, same UA/contact discipline as the FM crawl. Target order: (a) current + past
   DWCS entrants, (b) the rated regional pool by rating desc. ~18k fighters ≈ overnight.
2. **Career-plausibility gate per DOB** (the `buildAges.ts` guard): debut age 16–47,
   last-fight age ≤ 55 — catches namesake collisions, which name-search WILL produce.
   Ambiguous search hits (multiple MMA athletes, same name) → skip, never guess.
3. Cross-validate coverage + agreement against `fighter_dob.csv` for the UFC-crossover
   subset before trusting the regional-only rows.

## The metric (pre-register before building)

`careerStage` from (age, careerYears, fights) — likely as display bands, NOT a scoring
term until validated: e.g. debuted-young/fast-riser vs late-starter vs long-career-vet.
**Validation bar (pre-registered):** any scored use must beat the existing age-only bands
at predicting `reachedTop15` on the DWCS cohort harness (`research/prospects/harness.ts`
+ `phaseEGate.ts` pattern, ΔAUC ≥ +0.02 both horizons, CI excluding 0) — otherwise it
ships as display context only, like careerYears today. Confound to check explicitly:
debut age = age − careerYears; with age in the model, careerStage adds only the
experience-rate dimension — don't double-count fights (already in `confidenceFullFights`).

## Also queued (unchanged)

Promotion-tier review (`PROMOTION_TIERS_REVIEW.md`) — the regional Elo's promotion table
(`data/promotion_strength.csv`) is new evidence for it. Shade-floor re-sweep ~2027-08.
