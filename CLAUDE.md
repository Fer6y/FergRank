# UFC AI Rankings — Project Brain

## Vision

Build an AI-powered UFC fighter ranking system that ranks the **top 40 fighters per weight class** — not just the official top 15. The goal is to outperform the UFC's own upcoming Meta/AI-powered rankings by being more transparent, more data-driven, and deeper in the division. Rankings are built purely on in-cage performance: no media votes, no popularity, no promotional bias.

This is a **Next.js web app** that runs in the browser. It ingests historical UFC fight data, runs a scoring algorithm per division, and displays ranked fighter cards with scores and stat breakdowns.

---

## Current Build Status (2026-06-13)

The core product and the first discovery/personalization layers are **built and running** (Phases 1–2, 4, and most of 5). What exists today:

| Area | Status | Notes |
|------|--------|-------|
| Elo engine + scoring | ✅ | v2 Elo core; one global rating pool; per-fight trace for profiles |
| Homepage rankings | ✅ | Editorial redesign: Oswald banners, champion hero, dense rows, **trend-vs-UFC chips**, semantic stat colours |
| Fighter profile `/fighter/[id]` | ✅ | Hero (incl. last-5 pips + span timeline via shared `FormPips`), **"why this rank"** decomposition (leads the page), 5-axis radar, fight history with per-fight Elo deltas, snapshot |
| ⌘K fighter search | ✅ | `/api/search` + command palette |
| Live filter bar (Phase 4) | ✅ | Era / Finish / Recency / Activity sliders **re-run the real algorithm** server-side; neutral = house algorithm |
| P4P (Phase 5) | ✅ | Cross-division, valid because Elo is one global pool |
| Leaderboards (Phase 5) | ✅ | Finishers / Knockouts / Submissions / Strikers / Grapplers (sample-weighted) |
| Compare (Phase 2) | ✅ | Two fighters side-by-side, winner-highlighted stats + radars |
| Data-source alignment | ✅ | Recency patch is contract-guarded at load (de-dup + stale-drop + id-resolve) |
| Fighter photos + flags | ✅ | Build-time media pipeline (Wikidata + UFC.com) → registry; rendered with initials fallback |
| Upcoming cards `/upcoming` | ✅ | Redesigned 2026-07-02: date-first event tabs, main-event hero + dense prelim rows, **last-5 form pips (gold underline = title fight**, via `titleFights.ts` ← `data/title_fights.csv`; shared `FormPips` component with a light span timeline — newest-fight year → 5th-fight year — as an activity read), **win-probability spine**, main-event **tale-of-the-tape** (reach ← `fighterPhysical.ts`, activity-adjusted `scheduleStrength`, finish rate; links to `/compare`); per-fighter next-fight attached at API boundary. Display-only — never touches scoring |
| Advanced analytics (profile) | ✅ | `advancedStats.ts` (2026-07-01): ONE unified band below the profile grid — cautious **macro TREND READ** (opposition/mileage-aware; UFC tenure = aging proxy, no DOB in data), **form timeline chart**, **landed:absorbed ratio vs division ranked-pool median**, per-15 pace rates, durability, finish anatomy. Display-only; ranking-input signals badged |
| Form-adjusted win % | ✅ | Compare + Upcoming: validated pure-Elo probability headline + experimental variant shading each side's Elo by bounded (±45) recent-form drift (`formEloNudge`) |
| Division depth heatmap | ✅ | Homepage: per-division top-40 Elo heat strips on one global scale; hover = fighter, click = division |
| Prospect watch `/prospects` | ✅ | Provisional-window (≤5 fights) risers: climb rate, last-2, booked next fight, pre-UFC record, age (colour-coded runway) |
| Fighter ages | ✅ | `buildAges.ts` (2026-07-02): Wikidata P569 via Sherdog-ID join + guarded alias match + Sherdog-profile fill, career-validated. 89% registry / ~96% ranked. Weekly-refreshed; display + trend-read only (`fighterAges.ts`). See `data/SOURCES.md` §6 |
| Ask the Analyst `/api/chat` | ✅ | Built 2026-07-02 (phase 1 of `AGENT_PLAN.md`): streaming chat panel on `/upcoming`; `claude-sonnet-5` starts with zero fight facts and grounds every claim via tools over the display path (`src/lib/agent/`). Needs `ANTHROPIC_API_KEY` in `.env.local` (graceful 503 without). Web search / odds discourse = **phase 2, not built**. See `data/SOURCES.md` §7 |

**Not yet built / known gaps:** community layer (Phase 3, Supabase), rank-history sparkline on the profile (the form timeline charts *output*, not rank), and all-time snapshots. Pre-UFC pedigree seed is still toggled **off** for scoring (the prospects page reads it for display only). The old "no strike-absorption data" blocker was wrong — `STR_1/2` covers both corners; the profile durability panel now shows absorption.

**Fighter photos + country flags are now BUILT** (2026-06-14): a build-time media pipeline joins Wikidata (nationality → flag, licensed Commons portrait) and UFC.com (standardised photos, name-derived slugs) to the registry by `canonical_id`. Display only — attached at the API boundary (`src/lib/fighterMedia.ts`), never in the scoring path. Combined ~63% photo / ~65% flag coverage (higher for ranked fighters); initials avatar is the fallback. See `data/SOURCES.md` §5.

> Dev server: `npm run dev` inside `ufc-rankings/` (Turbopack). Verify changes against running output, not just types.

---

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack). ⚠️ Breaking changes vs older Next — `params`/`searchParams` are **Promises** (await them); read `node_modules/next/dist/docs/` before writing route/page code (see `ufc-rankings/AGENTS.md`).
- **Language**: TypeScript
- **Data**: Local CSV files (loaded once per process, memoized in `src/lib/dataCache.ts`)
- **Styling**: Tailwind CSS v4 (CSS-variable theme in `globals.css`)
- **Fonts**: Geist Sans (body) + Geist Mono (numbers) + **Oswald** (`--font-display`, editorial banners/rank numerals) — all via `next/font/google`
- **Charts/Viz**: hand-rolled inline **SVG** (radar, score bars). Recharts is NOT installed — don't add it without reason.
- **CSV Parsing**: PapaParse
- **Package Manager**: npm

> **Design system**: the full UI/UX direction (editorial-bold, type, page-by-page layout, locked decisions) lives in `DESIGN_VISION.md` at the repo root. **Data provenance** lives in `ufc-rankings/data/SOURCES.md`. Read those two for UI and data questions respectively.

---

## Project Structure

```
UFergCRankings/                ← repo root
├── CLAUDE.md                  ← project brain (this file)
├── DESIGN_VISION.md           ← UI/UX design system + locked decisions (read for UI work)
├── ALGORITHM_PATCH.md         ← HISTORICAL: the v1 additive-model tuning patch (superseded by Elo)
├── SHERDOG_BACKFILL_PLAN.md   ← multi-org Sherdog scrape pipeline plan
└── ufc-rankings/              ← the Next.js app
    ├── AGENTS.md              ← "this is NOT the Next.js you know" — read the docs first
    ├── validation_baseline_2026-06-12.txt ← snapshot of the broken v1 run (kept as evidence)
    ├── validation_elo_2026-06-12.txt      ← snapshot of the first v2 Elo run
    ├── validation_elo_2026-06-13.txt      ← v2 Elo run before the recency de-dup fix (evidence)
    ├── validation_elo_2026-06-13_postdedup.txt ← CURRENT reference (after recency-patch de-dup;
    │                                          names 100% resolved, floors 6→1, champions on top)
    ├── data/
    │   ├── SOURCES.md             ← DATA PROVENANCE + alignment rules (read for data work)
    │   ├── Fighters_Stats.csv     ← PRIMARY fighter stats + weight class + style (~2,600)
    │   ├── Fights.csv             ← PRIMARY fight-by-fight results + metrics (~8,700, to 2026-05-16)
    │   ├── Events.csv             ← event dates, joined for recency (773, to 2026-05-16)
    │   ├── Fighters.csv           ← physical attributes (reach, height, stance)
    │   ├── recent_ufc_fights.csv  ← ACTIVE Sherdog recency top-up (loaded, contract-guarded)
    │   ├── sherdog_*.csv          ← Sherdog scrape outputs (fights/orgs/prospects/crosswalk)
    │   ├── canonical/             ← identity registry + media + ages: fighter_registry.csv, fighter_media.csv (Wikidata), ufc_photos.csv (UFC.com), fighter_dob.csv (ages)
    │   ├── pro_mma_fights.csv     ← pre-UFC pedigree (Kaggle/Sherdog ~2021); seed DISABLED
    │   └── raw_*.csv              ← supplementary fallbacks (mostly unused at runtime)
    ├── scripts/
    │   ├── validate.ts            ← name-match audit + LW/WW/BW top-40 breakdown (run after algo changes)
    │   ├── sanityCheck.ts         ← quick single-division print
    │   ├── registry/              ← canonical identity + media + ages: buildRegistry.ts, buildMedia.ts (Wikidata), buildUfcPhotos.ts (UFC.com), buildAges.ts (DOB)
    │   └── sherdog/               ← build-time scrape pipeline (fetchProfile, buildRecencyPatch, championAudit…)
    └── src/
        ├── app/
        │   ├── page.tsx           ← homepage: division tabs + filter bar + top-40 list
        │   ├── fighter/[id]/      ← fighter profile (why-this-rank, radar, history, deltas)
        │   ├── p4p/               ← cross-division pound-for-pound
        │   ├── leaderboards/      ← Finishers/Knockouts/Submissions/Strikers/Grapplers
        │   ├── compare/           ← two-fighter side-by-side
        │   ├── upcoming/          ← announced cards, bout by bout (event tabs, win-prob strips, analyst chat)
        │   ├── prospects/         ← prospect watch: provisional-window risers + context
        │   └── api/
        │       ├── rankings/      ← runs the scoring engine (accepts live filter params)
        │       ├── fighter/[id]/  ← single-fighter profile payload
        │       ├── upcoming/      ← enriched upcoming cards (thin wrapper over lib/upcomingEnrich)
        │       ├── chat/          ← "Ask the Analyst" streaming agent loop (Anthropic API, tool-grounded)
        │       └── search/        ← fighter name search (thin wrapper over lib/searchFighters)
        ├── lib/
        │   ├── dataCache.ts           ← memoized single CSV load shared app-wide
        │   ├── loadData.ts            ← CSV ingestion, name-based fight-ID re-resolution, recency-patch guard
        │   ├── eloEngine.ts           ← THE CORE: chronological Elo sweep → one rating per fighter (+ per-fight trace)
        │   ├── scoringEngine.ts       ← eligibility + bounded adjustments on top of Elo → ranked division
        │   ├── filters.ts             ← live user filters → effective engine (era/finish/recency/activity)
        │   ├── crossDivision.ts       ← P4P + specialty leaderboards (global Elo pool)
        │   ├── fighterProfile.ts      ← assembles the profile payload (rank + decomposition + radar + history)
        │   ├── fighterDisplay.ts      ← presentation helpers (trend chip, why-this-rank, highlights)
        │   ├── fighterMedia.ts        ← photo + nationality/flag lookup (Wikidata + UFC.com), attached at API boundary; display only
        │   ├── loadUpcoming.ts        ← scheduled bouts (upcoming_fights.csv): per-fighter next fight + full card list; display only
        │   ├── upcomingEnrich.ts      ← bout enrichment (ranks/last-5/win-prob), shared by /api/upcoming + agent get_card
        │   ├── searchFighters.ts      ← fuzzy name search, shared by /api/search + agent search_fighter
        │   ├── agent/                 ← "Ask the Analyst": tools.ts (5 grounding tools over the display path) + systemPrompt.ts (frozen persona)
        │   ├── advancedStats.ts       ← deep analytics: per-15 pace, form timeline, durability, finish anatomy, formEloNudge; display only
        │   ├── fighterAges.ts         ← DOB/age lookup (fighter_dob.csv); display + trend-read context only
        │   ├── titleFights.ts         ← "was this fight for a belt?" lookup (title_fights.csv); display only
        │   ├── fighterPhysical.ts     ← reach lookup (Fighters.csv), attached at API boundary; display only
        │   ├── prospects.ts           ← prospect watchlist builder (provisional-window risers); display only
        │   ├── divisions.ts           ← shared division short codes
        │   ├── pedigreeSeed.ts        ← pre-UFC pedigree loader (disabled by default)
        │   ├── fetchOfficialRankings.ts ← Octagon API client (runtime external call #1; #2 is the Anthropic API in /api/chat)
        │   ├── nameResolver.ts        ← fuzzy UFC.com-name → CSV-id matching
        │   ├── auditOfficialMatches.ts ← diagnostic: which official names resolve
        │   ├── rankingConfig.ts       ← ALL tunables (single source of truth)
        │   └── types.ts               ← TypeScript interfaces
        └── components/
            ├── SiteHeader.tsx     ← top nav (Rankings/P4P/Leaderboards/Compare + ⌘K search)
            ├── AnalystChat.tsx    ← "Ask the Analyst" chat panel on /upcoming (streams /api/chat, shows tool activity)
            ├── SearchTrigger.tsx  ← ⌘K command-palette fighter search
            ├── DivisionSelector.tsx ← Men/Women toggle + division tabs
            ├── FilterBar.tsx      ← live era/finish/recency/activity sliders
            ├── RankingTable.tsx   ← main list: champion hero + dense contender rows
            ├── ChampionHero.tsx   ← pinned champion card ("C", gold)
            ├── FighterCard.tsx    ← dense contender row (rank, trend chip, stats, score)
            ├── FighterAvatar.tsx  ← photo avatar w/ initials-behind fallback (rows, hero, profile)
            ├── ProfileRadar.tsx   ← 5-axis SVG radar
            ├── FormTimeline.tsx   ← per-fight output chart (landed/15 dots + rolling trend), pure SVG
            ├── AdvancedAnalytics.tsx ← profile FORM & OUTPUT + DURABILITY & FINISHES sections
            ├── DepthHeatmap.tsx   ← homepage division-depth heat strips (global Elo scale)
            ├── ComparePicker.tsx  ← inline mini-search for the compare page
            └── ScoreBar.tsx       ← visual score bar
```

---

## Data Schema (What We Have)

### `Fighters_Stats.csv` — 2,602 fighters (PRIMARY)
Key columns:
- `Fighter_Id`, `Full Name`, `Nickname`
- `Weight_Class`, `Gender`
- `W`, `L`, `D` (record)
- `Sig. Str. %` — significant strike accuracy
- `Head_%`, `Body_%`, `Leg_%` — strike distribution
- `Distance_%`, `Clinch_%`, `Ground_%` — fight location distribution
- `Ctrl` — control time (seconds aggregate)
- `KD` — knockdowns
- `TD` — takedowns
- `Sub. Att` — submission attempts
- `KO Rate`, `SUB Rate`, `DEC Rate`
- `Fighting Style`, `Striker_Membership`, `Wrestler_Membership`, `Hybrid_Membership`
- `Belt` — current champion flag

### `Fights.csv` — ~8,700 fights (PRIMARY, dated to 2026-05-16)
Key columns:
- `Fight_Id`, `Fighter_Id_1`, `Fighter_Id_2`
- `Fighter_1`, `Fighter_2`
- `Result_1`, `Result_2` — W/L/D/NC per fighter
- `Method` — KO/TKO, SUB, U-DEC, M-DEC, S-DEC
- `Method Details` — e.g. "KO/TKO Punches", "Submission Rear Naked Choke"
- `Round`, `Fight_Time`, `Time Format`
- `Weight_Class`
- `Ctrl_1`, `Ctrl_2` — control time in seconds per fighter per fight
- `Sig. Str. %_1`, `Sig. Str. %_2` — sig strike accuracy per fight
- `KD_1`, `KD_2` — knockdowns per fight
- `TD_1`, `TD_2` — takedowns per fight
- `Event_Id`

### `Events.csv` — 773 events
- `Event_Id`, `Name`, `Date` (YYYY-MM-DD), `Location`
- Date range: **1994-03-11 to 2026-05-16**

### `Fighters.csv` — ~4,400 fighters
- Physical attributes: `Ht.`, `Wt.`, `Reach`, `Stance`
- Use for fighter profile pages

### `recent_ufc_fights.csv` — Sherdog recency top-up (ACTIVE)
- UFC fights **newer than `Fights.csv`**, to keep Elo current between data refreshes.
- Loaded by `loadData.ts` but **contract-guarded** (de-dup + stale-drop + `sd:`-id name-resolution). See `data/SOURCES.md` §4. No per-fight metrics — Elo/result/recency only.

> ℹ️ **Nationality/flags + photos** are not in the primary CSVs — they come from a separate build-time media pipeline (Wikidata + UFC.com) in `data/canonical/fighter_media.csv` + `ufc_photos.csv`, joined by `canonical_id`. See `data/SOURCES.md` §5.

---

## Weight Classes to Rank

### Men's Divisions
1. Heavyweight (HW)
2. Light Heavyweight (LHW)
3. Middleweight (MW)
4. Welterweight (WW)
5. Lightweight (LW)
6. Featherweight (FW)
7. Bantamweight (BW)
8. Flyweight (FLW)

### Women's Divisions
9. Women's Strawweight (WSW)
10. Women's Flyweight (WFW)
11. Women's Bantamweight (WBW)
12. Women's Featherweight (WFW) — small division, rank top 20 only

> **Filter rule**: Only rank fighters with **3+ UFC fights** to exclude cup-of-coffee appearances from polluting the rankings.

---

## THE ALGORITHM (v2 — Elo core)

> **History**: v1 was an additive sum (`WinQuality + FinishBonus + … − Penalties`). It was built, tuned through six patches (see `ALGORITHM_PATCH.md`, now historical), and **validated on real output on 2026-06-12** — where it failed badly. Its win-quality term was an unbounded sum that rewarded *volume of recent finishes*, so a 7-1 finisher (Carlos Prates) scored 322 — triple the champions — while a division-changing champ (Makhachev) scored 16 and had to be dragged to the top by safety floors. That run (`ufc-rankings/validation_baseline_2026-06-12.txt`) is the evidence that killed the additive model. v2 replaces it with Elo.

The engine has two files:
- **`src/lib/eloEngine.ts`** — computes one **Elo rating** per fighter from a single chronological sweep of every UFC fight. This is the core: opponent quality, recency, finishes, and weight-class moves all live here.
- **`src/lib/scoringEngine.ts`** — turns Elo into a ranked division by layering small **bounded** adjustments on top, then sorting and applying head-to-head + official-floor corrections.

### Score Formula

```
finalRating = eloRating + metricsBonus + sosNudge + officialBonus
rankScore   = map(finalRating → 0–100)   // linear, clamped, monotonic — display only
```

`eloRating` (≈1300–1850) dominates. `metricsBonus` (±30), `sosNudge` (±30), and `officialBonus` (0–50) are deliberately small so they refine ties and edge cases without overriding who-beat-whom. (Exact magnitudes live in `rankingConfig.ts` — these are approximate.)

> **Core principles (why Elo):**
> 1. **Opponent quality IS the rating.** Beating a high-rated fighter moves your Elo a lot; beating a low-rated one barely moves it. Strength of schedule is therefore *baked in*, not a separate pile of points. Going 1-1 against the champ and #1 leaves you rated near them; going 2-0 against #14/#15 barely moves you.
> 2. **Raw win COUNT never drives magnitude.** A long record of wins over weak opponents accumulates almost nothing. This is by construction — there is no sum over wins anywhere.
> 3. **Recency dominates.** Newer fights overwrite older ones, and inactivity regresses a rating toward the mean. A fighter's 2017 prime does not prop up their 2026 number.

---

### 1. The Elo core (`eloEngine.ts`)

One chronological pass over all dated, decisive (or drawn) UFC fights. For each fight:

```typescript
expectedA = 1 / (1 + 10^((ratingB - ratingA) / 400))
ratingA  += K * (actualA - expectedA)      // actual = 1 win / 0.5 draw / 0 loss
```

- **Finish-weighted K** — `K = baseK (24) × finishMultiplier`. A KO/TKO (1.4) moves ratings more than a split decision (0.8). This folds "finishing matters" into the rating without a separate bonus and without the deferred margin-of-victory complexity.
- **Provisional K** — a fighter's first 5 fights use `K × 1.5` so newcomers converge quickly and otherwise sit near the 1500 mean. This is why 3-0 / 5-0 prospects no longer rocket past champions.
- **Inactivity regression** — between fights (and once more up to "today"), a rating drifts toward the mean: `rating = 1500 + (rating − 1500) × 0.92^yearsOut`, after a **12-month grace** (`inactivityGraceMonths`). The 12-month window is deliberate: a normal elite cadence (champions defend ~1–2×/yr, often 10–14 months apart) is treated as fully current and pays NO activity penalty, so a fighter going 3 fights/2yr isn't dinged vs one going 4–6/2yr. Past a year the 0.92 slope still fades a genuinely inactive veteran.
- **Current-form boundary discount** — the full history is swept (so opponent quality/SoS stays calibrated and the rating spread is preserved), but the **first time a fighter competes inside the last `maxFightAgeYears` (5yr)** their carried-in rating is regressed **once** toward the mean by `boundaryRegressionToMean` (0.5 = halve the above-mean part). This heavily discounts a distant-past prime so it can't prop up today's number, *without* the spread-destroying full reset of a hard cutoff (a reset would reward fight VOLUME as everyone re-climbs from 1500 — the opposite of SoS-first). The user-facing **Era filter overrides** this: an explicit era is a hard window (drops older fights) for the historical lens.
- **Weight-class move decay** — on a detected division change the rating carries across but regresses 10% toward the mean first (`× 0.90`). Champions who move up (Makhachev, Topuria) arrive near the top but must prove the new weight. Interim/catch/open-weight labels are normalized so they don't trigger a bogus move penalty.

The result is one rating per fighter, regressed to the present day. `peakRating` is also tracked (useful for "declined vs. ascending" context in the UI).

---

### 2. Strength of Schedule (`sosNudge` + display)

```typescript
sosElo   = recency-weighted average opponent Elo over the last 3 years
sosNudge = clamp((sosElo − 1500) × 0.05, −30, +30)   // bounded Elo points
```

Because Elo already rewards a tough schedule, SoS is **not** re-added as a big term — that would double-count. It serves three roles: a small nudge for fighters whose schedule is much tougher/softer than their rating yet reflects, the **primary tiebreaker** on equal ratings, and a **headline displayed stat** (shown 0–100). The raw `sosElo` is retained for the "why this rank" explainer.

---

### 3. Fight Metrics Composite (`metricsBonus`, the ranks-16–40 differentiator)

Separates similar fighters by *how* they perform, over their last 5 division fights (recency-weighted). **Primary signal is volume strike differential** (strikes landed − absorbed, from `STR_1/STR_2`), balanced by accuracy and grappling. Weights sum to 1.0:

```typescript
metricsBonus = (
  volumeStrikeDifferential   * 0.40 +   // STR landed − absorbed (headline)
  strikeAccuracyDifferential * 0.20 +   // Sig. Str. % edge (balances raw volume)
  knockdownRate              * 0.20 +   // KDs per fight
  takedownDifferential       * 0.20     // TDs landed − absorbed
) * metricsScaleElo (30)   // × confidence dampener if < 5 scored fights
```

> **v1 bug this fixes**: the old engine used sig-strike *accuracy %* differential and ignored the `STR` volume columns entirely — so a fighter landing 8-of-10 "beat" one landing 90-of-200. v2 uses landed-strike **volume** as the headline, with accuracy only as a balancer.

---

### 4. Official rank seed (`officialBonus`) + safety floors

The internal official-rankings route supplies each fighter's current UFC rank. With Elo doing the work, this is a small seed (`seedScore × 0.5` Elo points; champ +50) plus post-sort **safety floors** (a UFC-ranked fighter never *displays* below a guaranteed slot: champ ≥ #2, top-5 ≥ #8, top-15 ≥ #25).

> **Health check**: floors are a backstop, not the engine. If floors fire for more than ~1–2 fighters in a division, the Elo isn't landing — investigate before tuning anything else. (On the 2026-06-13 v2 run: BW 0 floors, LW 2, WW 5 — down from 5/6/9 under v1. WW runs higher because the Makhachev division-override creates two "C" champs there.)

---

### 5. Pre-UFC pedigree (supplementary seed — in progress)

A bounded signal describing the quality of a fighter's record in **other promotions before they reached the UFC**, sourced from `data/pro_mma_fights.csv` / `sherdog_fights.csv` (Kaggle/Sherdog) via `src/lib/pedigreeSeed.ts`. It exists so a newcomer arriving from Bellator/ONE/Cage Warriors isn't treated as a blank slate by their thin early-UFC Elo. **Currently toggled OFF** (`RANKING_CONFIG.preUFCPedigree.seedEnabled = false`) — contributes 0 to `finalRating` until enabled.

Strictly scoped: UFC fights in that file are dropped (they duplicate our primary data), only non-UFC fights *before the UFC debut* count, it is weighted by the promotion-tier multiplier, and it is **frozen-in-time reference data, never current form**. It must never outweigh in-cage UFC results. See `RANKING_CONFIG.preUFCPedigree` and the `PreUFCPedigree` types. (Wiring this into `finalRating` as a seed step is the active follow-on; the Elo core does not depend on it.)

---

## UI Design Vision

> **Full design system → `DESIGN_VISION.md` (repo root).** It holds the editorial-bold direction, the locked decisions, and page-by-page layout. Summary below; that file is the source of truth for UI work.

**Design thesis**: the hero stat of the whole app is the **delta between our rank and the UFC's official rank** — make it visible everywhere (the trend chip). Tone is *editorial sports authority* (ESPN/The Athletic meets a Bloomberg terminal), not fantasy-app gamification.

**Locked decisions (2026-06-13):**
- **Type**: Oswald display (banners + rank numerals) · Geist Sans body · Geist Mono numbers.
- **Homepage**: full-width single column → division tabs + Men/Women toggle → **top filter bar** → champion hero (`C`, gold, pinned above) → **pure dense rows** 1..N, each with a trend-vs-UFC chip.
- **Profile** leads with **"why this rank"** (plain-English + score decomposition), then radar → fight history (per-fight Elo deltas) → snapshot → community stub.
- **Champion identity** comes from official rank `"C"`, NOT the stale `belt` CSV flag.
- **Colour**: dark grey canvas `#13131a`, UFC red `#D20A0A` (scarce — champ/top-5), champion gold `#d4a843`. Semantic stat colours: red=striking/finishing, blue=grappling/SoS, green=accuracy.

**Imagery**: fighter photos + country flags are **live** (built 2026-06-14) — real photos (Wikidata Commons + UFC.com) and emoji flags via the `FighterAvatar` component, with an initials avatar as the fallback where no media exists (~63% photo / ~65% flag coverage).

---

## Build Order — all ✅ complete

1. ✅ **Data layer** — `loadData.ts`: load + join CSVs, name-resolve fight IDs, recency-patch guard. (`pedigreeSeed.ts` loads the disabled pre-UFC pedigree.)
2. ✅ **Elo engine** — `eloEngine.ts`: chronological sweep → one rating per fighter, plus per-fight trace + filter-aware caching.
3. ✅ **Scoring engine** — `scoringEngine.ts`: eligibility + bounded adjustments → ranked array per division (filter-parameterized).
4. ✅ **Validation** — `scripts/validate.ts`: name-match audit + LW/WW/BW top-40 breakdown. Run via `node_modules/.bin/jiti scripts/validate.ts` (needs network for Octagon). **Re-run + diff after any algo/data change.** Current reference: `validation_elo_2026-06-13_postdedup.txt`.
5. ✅ **API routes** — `/api/rankings` (+live filters), `/api/fighter/[id]`, `/api/search`.
6. ✅ **Rankings homepage** — division tabs + filter bar + champion hero + dense rows + trend chips.
7. ✅ **Fighter profile page** — why-this-rank, radar, fight history with Elo deltas.
8. ✅ **Discovery** — ⌘K search, P4P, leaderboards, compare. Real photos/flags now wired (build-time media pipeline). **Polish remaining**: rank-history sparkline, community layer.

---

## Algorithm Tuning Notes

- **Tune from real output, never in the abstract.** The workflow is: change a value in `rankingConfig.ts` → run `scripts/validate.ts` → diff against the last saved snapshot (`ufc-rankings/validation_elo_*.txt`) → spot-check that LW/WW/BW still make sense. `validation_elo_2026-06-13_postdedup.txt` is the current reference (names 100% resolved, only 1 floor fired across LW/WW/BW).
- **`metricsScaleElo` (30)** is the knob most likely to need adjusting. At 40 it occasionally swung a fighter ~±28 Elo points (e.g. King Green) and out-weighed who-beat-whom; lowered to 30 on 2026-06-13. If metrics still override head-to-head logic, keep dialing down.
- **`elo.baseK` (24)** controls volatility. Higher = ratings swing more per fight (more recency-reactive, noisier); lower = stickier, more conservative. Don't raise it without re-checking that one upset can't vault a fighter past a proven champion.
- **`recencyHalfLifeMonths` (15)** only affects the metrics/SoS sampling windows now — the Elo core gets its recency from chronological processing + inactivity regression. Tune `elo.inactivityRetentionPerYear` (0.92) instead to make layoffs bite harder/softer.
- **Champion placement**: two mechanisms keep reigning champs (official rank "C") on top — `championFloorRank` (2) guarantees no champ displays below #2, and `championTiebreakerBand` (8) lifts a champ over a non-champion they're within 8 Elo points of (this is what puts undefeated champ Topuria at LW #1). To push champs harder still, raise `officialBonusScaleElo` rather than hard-coding identities. **Exception by design**: a champ who *lost head-to-head* to the fighter directly above them is NOT lifted (e.g. Yan over Merab at BW — Yan beat Merab, so the in-cage result stands over the belt).

---

---

## Tunable Config System (Dev-Facing)

All algorithm weights live in a single config file: `src/lib/rankingConfig.ts`. This is the **only file a developer needs to touch** to tune the algorithm. Nothing is hardcoded in `eloEngine.ts` or `scoringEngine.ts` — every weight, multiplier, threshold, and decay rate is imported from this config.

> **Do not duplicate the config values here.** This doc used to inline the whole object and it drifted out of sync with the code, causing exactly the misinterpretation this section warns against. `rankingConfig.ts` is the single source of truth — read it directly. Its header comment explains the v2 model; each value is commented inline.

The config is organized into these groups (see the file for current values):

| Group | Controls |
|-------|----------|
| `elo` | Core rating: `baseK`, provisional period, inactivity regression, weight-class move decay, Elo→0–100 display mapping |
| `recencyHalfLifeMonths` / `recencyCutoffMonths` | Recency weighting + hard cutoff for the **metrics/SoS windows** (not the Elo core) |
| `finishMultipliers` | Scale the Elo K-factor per result method (KO/TKO 1.4 → S-DEC 0.8) |
| `metricsWeights` / `metricsScaleElo` / `metricsNorm` | Striking/grappling composite (volume-strike-differential led) |
| `sosAnchorElo` / `sosSlopePerElo` / `sosAdjustCap` | Bounded strength-of-schedule nudge |
| `officialBonusScaleElo` / `officialRankScores` / `*FloorRank` | Official-rank seed + post-sort safety floors |
| `minUFCFights` / `rankingsDepth` / `divisionOverrides` | Eligibility, depth, manual division fixes |
| `promotionTiers` / `preUFCPedigree` | Cross-promotion tiering + the pre-UFC pedigree seed (supplementary) |

**Rules for Claude Code**: Always import from `rankingConfig.ts`. Never hardcode a number in `eloEngine.ts` or `scoringEngine.ts`. If a new tunable is added, add it to the config first, then reference it.

This file is **never exposed to users**. It is a developer tool only.

---

## App Model — Courtside Architecture

Rankings are the **product**. Community is the **personality layer** on top. These two zones must stay architecturally separate — the algorithm is never influenced by community input.

### Two Zones Per Fighter Profile

**Data Zone** (algorithm-generated, read-only for users)
- RankScore breakdown — "Why this rank" in plain English
- Fight history with per-fight scores
- Stat radar chart
- Rank history timeline
- Head-to-head comparison tool

**Community Zone** (user-contributed, moderated)
- Comments and fight breakdowns
- Upvoted notable win callouts
- Prediction threads when a fight is announced (scored after the fight)
- Community confidence vote: Overranked / About Right / Underranked (displayed alongside algorithmic rank, never replacing it)

### Database Requirements (when Supabase is added)
- `users` — auth, username, avatar
- `comments` — fighter_id, user_id, body, upvotes, timestamp
- `confidence_votes` — fighter_id, user_id, vote (over/right/under)
- `predictions` — fight_id, user_id, predicted_winner, correct bool scored post-fight

---

## Rendering Strategy — ISR (Incremental Static Regeneration)

**Recommendation: ISR with 24-hour revalidation.** This is the right call for this app.

Do NOT use fully static (`getStaticProps` with no revalidation) — rankings would only update on redeploy.
Do NOT use fully dynamic (server-side on every request) — the scoring engine is CPU-heavy and would be slow.

**ISR gives you both**: pages are pre-rendered and served instantly like static, but Next.js automatically regenerates them in the background every 24 hours. When you update the CSVs or official rankings refresh, the app catches up within a day without a redeploy.

```typescript
// In each rankings page
export const revalidate = 86400 // 24 hours in seconds
```

The Octagon API fetch is cached at the same interval — one external call per day max.

**If you need to force a refresh** (e.g. after a big fight card updates rankings), Next.js supports on-demand revalidation via a webhook. Claude Code should stub this out as a protected API route:

```
/api/revalidate?secret=YOUR_SECRET  ← call this to force rankings refresh
```

---

### Phase 1 — Core Rankings ✅ DONE
Ranking integrity is the entire product. Everything else is secondary.
- ✅ Top 40 per division, algorithm-generated
- ✅ Division tabs + Men/Women toggle
- ✅ Fighter profile: data zone (why-this-rank, radar, fight history)
- ✅ "Why this rank" plain-English explainer
- ⬜ Rank history timeline (sparkline) — deferred

### Phase 2 — Discovery & Depth (partial)
- ✅ **Head-to-head comparison** (`/compare`) — two fighters, side-by-side
- ✅ **Prospect watchlist** (`/prospects`, 2026-07-01) — ≤5-fight fighters with winning records: Elo climb rate, last-2, next fight, pre-UFC pedigree context (display-only read of `pedigreeSeed`)
- ✅ **Division heatmap** (homepage, 2026-07-01) — top-40 core-Elo heat strips per division, one global colour scale (`DepthHeatmap`, fed by `/api/dashboard`)
- ⬜ **"Slept on" tag** — needs community scores

### Phase 3 — Community Layer ⬜ NOT STARTED
- User auth (Supabase + Clerk), comments, confidence votes (Overranked/About Right/Underranked), prediction threads. Must stay architecturally separate from the algorithm.

### Phase 4 — User-Facing Filter System ✅ DONE
The four sliders **re-run the real algorithm** server-side (`filters.ts` → effective engine; neutral = house algorithm). Era / Finish weight / Recency weight / Activity weight.

### Phase 5 — Specialty Leaderboards (mostly done)
- ✅ **P4P** — cross-division (one global Elo pool makes this valid)
- ✅ **Strikers / Grapplers / Submission aces / Finishers / Knockouts** (`/leaderboards`, sample-weighted)
- ✅ **Durability (was "Iron Chin")** — absorption IS derivable (`STR_1/2` both corners); shipped as the profile durability panel (2026-07-01) rather than a leaderboard
- ⬜ **All-time rankings** — algorithm on historical snapshots (2010/2015/2018/2020)

### Phase 6 — Broader Data (in progress)
- ⚙️ Sherdog scrape pipeline built (`scripts/sherdog/`, `SHERDOG_BACKFILL_PLAN.md`); recency top-up active.
- ⬜ Activate Tier 2–4 promotion multipliers / pre-UFC pedigree seed (wired, toggled off).
- ⬜ Promotion sub-ranking for new UFC entrants.

---

## UI Design Direction — DECIDED (see `DESIGN_VISION.md`)

The dedicated design pass happened (2026-06-13). Decisions are locked and implemented; `DESIGN_VISION.md` is the full system. Summary:

**Decided & built:**
- Dark grey canvas `#13131a` (not pure black); UFC red `#D20A0A` used sparingly; champion gold `#d4a843`.
- Typography: **Oswald** display + **Geist Sans** body + **Geist Mono** numbers.
- Layout: **pure dense rows** (not cards), champion hero pinned above, **top filter bar** (not a left rail).
- Semantic stat colours (red striking / blue grappling / green accuracy); trend-vs-UFC chip on every row.
- Mobile responsive from the start.

**Still open (parked in `DESIGN_VISION.md` §9):** how loud the red gets, trend-chip wording, real photo/flag source, dense-table view scope.

---

## What We Are NOT Doing

- No web scraping at **runtime** (Sherdog scraping is a build-time pipeline only; data is static CSV in the app)
- No external API calls **except** the Octagon official-rankings fetch (cached 24h, graceful fallback) and the Anthropic API behind `/api/chat` (Ask the Analyst; rate-limited, graceful 503 without a key)
- No user accounts or persistence (yet — Phase 3)
- No betting odds integration (yet)
- Not ranking fighters outside their primary weight class

---

## Official Rankings Source — Octagon API

Official UFC rankings are fetched from **Octagon API**, a free open-source MMA API that scrapes UFC.com and returns structured JSON.

**Endpoint**: `https://api.octagon-api.com/rankings`

### Architecture (as built)

```
src/lib/fetchOfficialRankings.ts   ← isolated fetch + 24h in-module cache + normalize. The ONE place to change if the source breaks.
```

The scoring engine calls `fetchOfficialRankings()` directly; the fetch is memoized in-module for 24h, so a separate `/api/official-rankings` route was unnecessary. If Octagon changes or goes down, one file swap fixes everything and the app degrades to pure-Elo. (The expected JSON shape evolved from the doc below into an array of division objects — see the actual parser in `fetchOfficialRankings.ts`.)

### Expected JSON Structure from Octagon API

```json
{
  "Lightweight": [
    { "rank": "C", "name": "Islam Makhachev", "record": "26-1-0" },
    { "rank": "1", "name": "Charles Oliveira", "record": "34-10-0" },
    { "rank": "2", "name": "Arman Tsarukyan", "record": "22-3-0" }
  ],
  "Welterweight": [
    { "rank": "C", "name": "Jack Della Maddalena", "record": "17-2-0" },
    { "rank": "1", "name": "Shavkat Rakhmonov", "record": "19-0-0" }
  ]
}
```

Division keys are title-cased strings matching UFC's naming. Champion is `rank: "C"`. Ranks are strings `"1"` through `"15"`.

---

### Name Matching — Fighter ID Resolution

**This is a known problem.** The Octagon API returns fighter names as strings scraped from UFC.com. Our CSV dataset uses its own name format. These will not always match exactly and must be reconciled with a fuzzy match function.

**Build a `resolveNameToId()` function in `src/lib/nameResolver.ts`** that:
1. Tries exact match first
2. Falls back to normalized match (lowercase, strip accents, strip punctuation)
3. Falls back to last-name + first-initial match
4. If still no match, logs a warning and returns null (fighter gets no seed score, falls back to computed win rate only)

**Known name pattern mismatches to handle explicitly** — these are the 29 fighters in the dataset flagged as likely to cause issues:

```typescript
// Fighters with particles (de, da, do, van, von, dos, etc.)
// These may be capitalized differently or dropped entirely on UFC.com
const KNOWN_NAME_OVERRIDES: Record<string, string> = {
  // UFC.com name → CSV dataset name (add to this as mismatches are discovered)
  "Elizeu Zaleski dos Santos": "Elizeu Zaleski dos Santos",
  "Germaine de Randamie": "Germaine de Randamie",
  "Reinier de Ridder": "Reinier de Ridder",
  "Marcos Rogerio de Lima": "Marcos Rogerio de Lima",
  "Montana De La Rosa": "Montana De La Rosa",
  "Chris de la Rocha": "Chris de la Rocha",
  "Douglas Silva de Andrade": "Douglas Silva de Andrade",
}
```

**Other common UFC.com name quirks to handle in normalization:**
- Accented characters stripped: `Renato Moicano` vs `Renato Moicaño`
- Hyphenated names: `Ian Machado Garry` vs `Ian Garry`
- Nicknames embedded: some UFC.com profiles include nickname in the name field
- Middle names sometimes included, sometimes not

**Full flagged fighter list from dataset scan** (29 fighters with particles or 4+ word names that need normalization):
`Da'Mon Blackshear, Henrique da Silva, Ariane da Silva, Alex Da Silva, Yorgan De Castro, Geraldo de Freitas, Philip De Fries, Chris de la Rocha, Montana De La Rosa, Mark De La Rosa, Mike de la Torre, Rodrigo de Lima, Edilberto de Oliveira, Jorge de Oliveira, Isabela de Padua, Gloria de Paula, Germaine de Randamie, Reinier de Ridder, Tiago dos Santos e Silva, Carls John De Tomas, Da Woon Jung, Marcos Rogerio de Lima, Douglas Silva de Andrade, Joshua Van, Mike van Arsdale, Matt Van Buren, Ron van Clief, Jason Von Flue, Elizeu Zaleski dos Santos`

---

### How It Feeds the Algorithm (v2)

In v2 the official rank does **not** seed opponent quality — Elo already measures that from results. Instead the official rank plays two narrow roles in `scoringEngine.ts`:

1. **Division membership** — the authority on which division a fighter is ranked in (handles permanent weight moves the UFC has recognized).
2. **A small seed + safety floor** — `officialBonus = officialRankScores[rank] × officialBonusScaleElo` (champ 100 × 0.5 = +50 Elo points), plus the post-sort floor guarantees. This keeps a reigning/returning champ from sinking on a thin recent Elo sample without letting the official list override the data wholesale.

```typescript
// in rankingConfig.ts
officialBonusScaleElo: 0.5,   // seedScore → Elo points
championFloorRank: 2, top5FloorRank: 8, top15FloorRank: 25,
```

### Official Rank → Seed Score Mapping

| UFC Rank | Seed Score | → Elo bonus (×0.5) |
|----------|-----------|--------------------|
| Champion | 100 | +50 |
| #1 | 90 | +45 |
| #2–3 | 85 | +42.5 |
| #4–6 | 78 | +39 |
| #7–10 | 70 | +35 |
| #11–15 | 62 | +31 |
| Unranked | — | 0 (pure Elo + metrics + SoS) |

---

## Strength of Schedule

Every fighter gets a **Strength of Schedule (SoS)** score — the recency-weighted average of their opponents' **Elo ratings** over the 3-year window (`sosElo`). It is:

- **Displayed** on every fighter card (shown 0–100 via the same Elo→display mapping)
- The **primary tiebreaker** when two fighters have near-identical final ratings
- A small bounded **nudge** to the final rating (`sosNudge`, ±30 Elo pts) for schedules far above/below the fighter's own rating
- A key stat in the "Why this rank" explainer

> Note: because Elo already rewards beating strong opponents, SoS is intentionally *not* a large additive term — that would double-count. The nudge only catches cases where the schedule and the rating disagree.

**`scheduleStrength` — the activity-adjusted DISPLAY composite (2026-07-02).** Alongside the pure-quality `strengthOfSchedule`, the engine emits a **display-only** `scheduleStrength = qualityScore × dampener`, where `dampener = activityFloor + (1−activityFloor)·activity` and `activity = 0.7·recency + 0.3·cadence` (recency from `monthsSinceLastFight` past a 12-mo grace; cadence from fights-in-window vs. a 2/yr target). This is what the `/upcoming` tale-of-the-tape shows: "how good was your schedule, kept honest by whether it's current." It **never enters `finalRating`** — the Elo core already regresses inactive ratings, so folding activity into `sosNudge` would double-count a layoff. Tunables live under the SoS block in `rankingConfig.ts` (`activity*`); the raw quality stays available (tooltip + `strengthOfSchedule`). Display-only, like everything on the upcoming page.

---

## Notes

- `Fights.csv` has the richest per-fight metric data — primary source for the metrics composite. `STR_1`/`STR_2` are landed-strike **counts** (the volume signal); `Sig. Str. %_1/2` are accuracy decimals.
- `Fighters_Stats.csv` has aggregate career stats + weight class assignment — use this to assign fighters to divisions.
- **`Fighter_Id` columns in `Fights.csv` are unreliable (~88% mismatch).** `loadData.ts` re-resolves participant IDs by joining on fighter **name** against `Fighters_Stats.csv`. Do not trust the raw fight ID columns.
- `Events.csv` provides dates — always join on `Event_Id`. The Elo engine **skips fights with no date** (can't place them on the timeline).
- Some fighters appear in multiple weight classes — Elo carries one rating across moves with a decay penalty; the engine only *scores* a fighter within the division they're eligible for.
- Control time (`Ctrl_1`, `Ctrl_2`) is in **seconds**. (Not currently used by the v2 metrics composite — volume/accuracy/KD/TD are.)
- The Octagon API fetch is the only external **runtime** network call in the app — keep it that way. (Sherdog scraping is build-time only.)
- **Recency patch** (`recent_ufc_fights.csv`) is integrated in `loadData.ts` with three guards — stale-drop, duplicate-drop (suffix-tolerant name-pair within ±7 days), and `sd:`-id name-resolution. This fixed silent Elo double-counting. Full provenance + rules in `data/SOURCES.md`.
- **Data freshness drifts**: when the CSVs are refreshed, update the counts in this doc and `data/SOURCES.md`, and **regenerate the validation snapshot**.
