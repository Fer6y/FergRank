# UFC AI Rankings — Project Brain

## Vision

Build an AI-powered UFC fighter ranking system that ranks the **top 40 fighters per weight class** — not just the official top 15. The goal is to outperform the UFC's own upcoming Meta/AI-powered rankings by being more transparent, more data-driven, and deeper in the division. Rankings are built purely on in-cage performance: no media votes, no popularity, no promotional bias.

This is a **Next.js web app** that runs in the browser. It ingests historical UFC fight data, runs a scoring algorithm per division, and displays ranked fighter cards with scores and stat breakdowns.

---

## Current Build Status (2026-07-05)

The core product and the first discovery/personalization layers are **built and running** (Phases 1–2, 4, and most of 5). What exists today:

| Area | Status | Notes |
|------|--------|-------|
| Elo engine + scoring | ✅ | v2 Elo core; one global rating pool; per-fight trace for profiles |
| Homepage rankings | ✅ | Editorial redesign: Oswald banners, champion hero, dense rows, **trend-vs-UFC chips**, semantic stat colours |
| Fighter profile `/fighter/[id]` | ✅ | **Reorganized 2026-07-03** — analytics-dashboard-led (`AdvancedAnalytics.tsx` renders 3 stacked cards): Hero → **top box** (brief personalised one-line "why this rank" from `why.headline` — **composed from two independently-seeded halves for near-unique output**: a form LEAD (champ/skid/streak/quality/layoff/steady) + an identity COLOR clause (fighting style, **signature win** = best recent scalp `bestWin` (distinct from `mover` = biggest rating swing), finish tendency, schedule difficulty); each half is a full sentence, data-missing variants are dropped, streak-finish counts are streak-scoped. Verified 26/26 unique across WW+LW — + ELO/PEAK anchors) → **Block A** Gauntlet (2026-07-04: TRUE calendar x-axis — fixed 7yr window anchored to today so idleness shows as blank space, scrollable left for longer careers; gold ⚑ weight-class-move flags) + trend read + strike-ratio panel \| fight history (deltas + differential strips) → **Block B** full-width: strength-of-schedule strip on top, then pace split into **STRIKING \| GRAPPLING** two-column tables (CAREER vs DIV MED + trend arrow) → **Block C** de-emphasized radar + durability + finish anatomy ("RADAR REWORK PENDING", dashed/low-opacity until the radar is fixed) → **"why this rank"** decomposition + snapshot below the dashboard. Unranked/no-charted fighters get a simpler fallback grid |
| ⌘K fighter search | ✅ | `/api/search` + command palette |
| Live filter bar (Phase 4) | ✅ | Era / Finish / Recency / Activity sliders **re-run the real algorithm** server-side; neutral = house algorithm |
| P4P (Phase 5) | ✅ | Cross-division, valid because Elo is one global pool |
| Leaderboards (Phase 5) | ✅ | Finishers / Knockouts / Submissions / Strikers / Grapplers (sample-weighted) |
| Compare (Phase 2) | ✅ | Two fighters side-by-side, winner-highlighted stats + radars + **grappling-proficiency ramp** (shared grey→blue track, a needle per corner ranked vs own-division 3+-fight pool — `GrappleRamp`/`grappleGradient.ts`) |
| Grappling proficiency ramp | ✅ | 2026-07-03: grey `#4a4a52` → blue `#4a9eff` SEQUENTIAL magnitude encoding of `RadarAxes.grappling`, ranked as a **division percentile** (own-division 3+-fight pool) so the crowded mid-division spreads while the genuine elite tail honestly stays bunched. Rendered as a full-gradient **track + needle** (`GrappleRamp`) so even one fighter shows the whole ramp, not a flat fill. On the **profile** (top of analytics Block B — under the Gauntlet, above the strength-of-schedule strip + striking/grappling pace tables; fallback profiles show it under the radar) + **/compare** (both corners on one track — grappler-vs-striker at a glance). Display-only, never touches Elo. PaceRow grapple-row tinting deliberately deferred (would clash with the existing red/green/gold `standoutOf` colouring) |
| Data-source alignment | ✅ | Recency patch is contract-guarded at load (de-dup + stale-drop + id-resolve) |
| Fighter photos + flags | ✅ | Build-time media pipeline (Wikidata + UFC.com) → registry; rendered with initials fallback |
| Upcoming cards `/upcoming` | ✅ | Redesigned 2026-07-02: date-first event tabs, main-event hero + dense prelim rows, **last-5 form pips (gold underline = title fight**, via `titleFights.ts` ← `data/title_fights.csv`; shared `FormPips` component with a light span timeline — newest-fight year → 5th-fight year — as an activity read), **win-probability spine**, main-event **tale-of-the-tape** (reach ← `fighterPhysical.ts`, activity-adjusted `scheduleStrength`, finish rate; links to `/compare`); per-fighter next-fight attached at API boundary. Display-only — never touches scoring |
| Advanced analytics (profile) | ✅ | `advancedStats.ts` (2026-07-01): ONE unified band below the profile grid — cautious **macro TREND READ** (opposition/mileage-aware; UFC tenure = aging proxy, no DOB in data), the **per-fight strike-dominance strips** (landed/absorbed per-15 beside each bout in the fight-history list — this is where the old form-timeline `timeline` data lives now; the standalone form-timeline line chart was retired in favour of the Gauntlet), **landed:absorbed ratio vs division ranked-pool median**, per-15 pace rates, durability, finish anatomy. Display-only; ranking-input signals badged. **Schedule-context strip (2026-07-02)** sits above the PACE grid (`buildScheduleContext` → `ScheduleContextStrip`): makes the raw Last-5 drift opponent-aware — recent-window mean opp Elo vs career (was it a step up?), opponent style mix (striker/grappler, heuristic from each opp's own pace), and an **opponent-adjusted absorption** read (absorbed/15 ÷ what those opponents normally land) in an ⓘ popover with a per-fight breakdown. Ratio panel window aligned to the pace grid (Last 5). **Pace rows highlight significant standouts vs DIV MED** (`standoutOf` in `AdvancedAnalytics.tsx`): a ratio-based flag colours the CAREER value + a `×`/`%↓` badge (gold = elite, green = strength, red = gap) and gives elite strengths a row accent bar + tint — e.g. a knockout artist's Knockdowns row pops `8.2×` gold. Carries an **opponent-adjusted OUTPUT and ABSORPTION read** (`landedVsExpected` / `absorbedVsExpected`): the fighter's recent landed/absorbed vs what that exact slate normally concedes/lands — the SoS-balancer that stops a champion climbing through tougher competition (falling raw volume, rising opponent Elo) from reading as "decline". Surfaced as an **always-visible panel above the PACE grid**, deliberately spare (simplified 2026-07-03 to cut clutter): the panel leads with a prominent **STRENGTH OF SCHEDULE · MEAN OPPONENT ELO** headline (big blue number + step vs career); the **OUTPUT/ABSORBED vs schedule** stats, ⓘ explainers, last-5 numbers and per-opponent OUT/EXP·ABS/EXP table all live in the **fight-by-fight** popover. The PACE grid itself is **CAREER vs DIV MED + a TREND arrow only** (no LAST-5 column, no drift magnitude — arrow direction/colour only). Also drives a leading **dominance trend-read insight** that overrides the raw-drift caution. Also surfaced on **/compare** (one strip per fighter) and the **/upcoming main-event** (both corners, via `scheduleContext` on `CardFighter`). Pace grid now carries a **DIV MED** column (median career pace of the division's ranked pool, via `divisionRatioBenchmark.pace`) next to CAREER — the peer baseline. Profile hero shows a prominent **SCHEDULE** rank-card (blue; pure opponent-quality SoS + activity-adjusted `scheduleStrength` as the sub-line). Display-only |
| Form-adjusted win % | ✅ | Compare + Upcoming: validated pure-Elo probability headline + experimental variant shading each side's Elo by bounded (±45) recent-form drift (`formEloNudge`) |
| Division depth heatmap | ✅ | Homepage: per-division top-40 Elo heat strips on one global scale; hover = fighter, click = division |
| Prospect watch `/prospects` | ✅ | Provisional-window (≤5 fights) risers: climb rate, last-2, booked next fight, pre-UFC record, age (colour-coded runway) |
| Fighter ages | ✅ | `buildAges.ts` (2026-07-02): Wikidata P569 via Sherdog-ID join + guarded alias match + Sherdog-profile fill, career-validated. 89% registry / ~96% ranked. Weekly-refreshed; display + trend-read only (`fighterAges.ts`). See `data/SOURCES.md` §6 |
| Distinction decals | ✅ | 2026-07-04: small coloured "decal" badges next to a fighter's name (`lib/distinctions.ts` → `components/DistinctionDecals.tsx`, pure/display-only, never touches Elo). Seven kinds, pre-sorted by priority: reigning **champion** (gold "C" disc), **former champion** (faded gold crown outline), **title wins** (gold belt-with-plate ×N) + **title fights** (gold ring ×N) from `title_fights.csv` via new `getTitleRecord()`, **undefeated** (blue shield, 0 losses + 5+ fights), **win streak** (green flame ×N, ≥3) + **finish streak** (red bolt ×N, ≥2) from the Elo trace, **main events** (purple ring ×N — 5-round *non-title* headliners, mirrors the Gauntlet's gold/purple halo language). Profile hero shows the FULL set; compact surfaces cap at `max={2}` with a `+N` overflow chip and drop the redundant champion decal where "C"/★ already shows. Wired: profile, division rankings (`FighterCard`/`ChampionHero`, via `attachDistinctions` at both `/api/rankings` + the server division page), **/p4p** (`P4PEntry`), **/compare** (`FighterHead`), **/prospects** (`ProspectEntry`). Counts read straight from `title_fights.csv`, so they follow that (currently working-tree-dirty) ledger |
| Ask the Analyst `/api/chat` | ✅ | Built 2026-07-02 (phase 1 of `AGENT_PLAN.md`); promoted 2026-07-02 to a **site-wide floating dock** — chat bubble bottom-right on every page + "Analyst" entry in the header nav, mounted in the root layout so chat history survives navigation; page-aware via `AnalystContext` — `/upcoming` sets the selected card, `/fighter/[id]` sets the fighter (subtitle "Talking <name>", fighter-specific suggested questions, and the fighter_id rides the request so the agent skips the name lookup). `claude-sonnet-5` starts with zero fight facts and grounds every claim via tools over the display path (`src/lib/agent/`). Needs `ANTHROPIC_API_KEY` in `.env.local` (graceful 503 without). Web search / odds discourse = **phase 2, not built**. See `data/SOURCES.md` §7 |
| Model-vs-market `/odds` | ✅ | "MODEL vs MARKET" explorer (nav-linked): the model's point-in-time win probability beside the de-vigged **closing line** for every bout with a line, plus the biggest disagreements. Honest framing — the market is the sharper predictor; this is a divergence lens, **not** a betting-edge generator. **FIREWALLED display-only**: page (`app/odds/page.tsx`) reads a static `data/odds_analysis.json` via `loadOddsAnalysis.ts`, built offline by `research/backtest/exportAnalysis.ts`; odds NEVER enter `eloEngine`/`scoringEngine`. Absent JSON → graceful "run the export" hint. This is the research odds-zone (`research/`, see `research/backtest/`) surfaced as a product page — the firewall holds via the static-file boundary |

**Not yet built / known gaps:** community layer (Phase 3, Supabase) and all-time snapshots. (**Rank-history sparkline: built then CUT 2026-07-05** — a standalone divisional-rank-over-time line chart was implemented and verified, but removed as **visually redundant with the Gauntlet**: both are Elo-derived career-trajectory lines on the same time x-axis, so their shapes track each other. The Gauntlet already IS the career-trajectory chart, and richer. The one thing a rank line adds — *relative* position vs *absolute* Elo, so rank can move when the field moves around you — is too subtle to justify a second full-width chart, and the app had **already** removed the standalone form-timeline line chart for the same reason. Any future rank view should differentiate, e.g. a tiny inline hero sparkline in rank units, not a second big chart.) Pre-UFC pedigree seed is **ENABLED for scoring** (trust pass, golden-master-blessed): bounded ≤25 Elo, thin-sample only (tapers to zero by 6 UFC fights) — see §5 under THE ALGORITHM. The old "no strike-absorption data" blocker was wrong — `STR_1/2` covers both corners; the profile durability panel now shows absorption.

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
    ├── validation_elo_2026-06-13_postdedup.txt ← post recency-de-dup run (evidence)
    ├── validation_elo_2026-07-03_officialseed.txt ← prior reference (official seed form-gated
    │                                          + re-anchored to 0.1; champions lead LW/WW/BW)
    ├── validation_elo_2026-07-04_lhwchamp.txt ← CURRENT reference (Ulberg = LHW champ after
    │                                          Pereira vacated for the HW interim; champions lead LW/WW/BW)
    ├── data/
    │   ├── SOURCES.md             ← DATA PROVENANCE + alignment rules (read for data work)
    │   ├── Fighters_Stats.csv     ← PRIMARY fighter stats + weight class + style (~2,600)
    │   ├── Fights.csv             ← PRIMARY fight-by-fight results + metrics (~8,700, to 2026-05-16)
    │   ├── Events.csv             ← event dates, joined for recency (773, to 2026-05-16)
    │   ├── Fighters.csv           ← physical attributes (reach, height, stance)
    │   ├── recent_ufc_fights.csv  ← ACTIVE Sherdog recency top-up (loaded, contract-guarded)
    │   ├── sherdog_*.csv          ← Sherdog scrape outputs (fights/orgs/prospects/crosswalk)
    │   ├── canonical/             ← identity registry + media + ages: fighter_registry.csv, fighter_media.csv (Wikidata), ufc_photos.csv (UFC.com), fighter_dob.csv (ages)
    │   ├── pro_mma_fights.csv     ← pre-UFC pedigree (Kaggle/Sherdog ~2021); seed ENABLED (bounded, thin-sample only)
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
        │   ├── odds/              ← "MODEL vs MARKET" explorer: model win-prob vs closing line (display-only, firewalled — reads static data/odds_analysis.json, never touches Elo)
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
        │   ├── advancedStats.ts       ← deep analytics: per-15 pace, per-fight `timeline` data (feeds the strike-dominance strips), durability, finish anatomy, formEloNudge; display only
        │   ├── grappleGradient.ts     ← grappling proficiency ramp (grey→blue): RadarAxes.grappling ranked vs own-division 3+-fight pool (percentile) + rampColor; display only, never feeds Elo
        │   ├── fighterAges.ts         ← DOB/age lookup (fighter_dob.csv); display + trend-read context only
        │   ├── titleFights.ts         ← "was this fight for a belt?" lookup (title_fights.csv); display only
        │   ├── fighterPhysical.ts     ← reach lookup (Fighters.csv), attached at API boundary; display only
        │   ├── prospects.ts           ← prospect watchlist builder (provisional-window risers); display only
        │   ├── loadOddsAnalysis.ts    ← loads the precomputed model-vs-market history (data/odds_analysis.json ← research/backtest/exportAnalysis.ts) for /odds; FIREWALLED — never imported by the Elo/scoring path
        │   ├── divisions.ts           ← shared division short codes
        │   ├── pedigreeSeed.ts        ← pre-UFC pedigree loader + seed (ENABLED; ≤25 Elo, tapers out by 6 UFC fights)
        │   ├── fetchOfficialRankings.ts ← reads the committed official-rankings snapshot (data/official_rankings.csv); live Octagon fetch = fallback only. Anthropic API in /api/chat is now the only runtime external call
        │   ├── nameResolver.ts        ← fuzzy UFC.com-name → CSV-id matching
        │   ├── auditOfficialMatches.ts ← diagnostic: which official names resolve
        │   ├── rankingConfig.ts       ← ALL tunables (single source of truth)
        │   └── types.ts               ← TypeScript interfaces
        └── components/
            ├── SiteHeader.tsx     ← top nav (Rankings/P4P/Leaderboards/Compare + Analyst + ⌘K search; inline nav ≥md, scrollable row below)
            ├── AnalystDock.tsx    ← "Ask the Analyst" site-wide floating dock (bubble bottom-right → chat window; streams /api/chat, shows tool activity)
            ├── AnalystContext.tsx ← layout-level provider: dock open state + page context (event or fighter; chat survives navigation)
            ├── AnalystPageContext.tsx ← effect-only bridge so server pages (fighter profile) can set the dock's context
            ├── AnalystNavButton.tsx ← header "Analyst" entry (opens the dock)
            ├── SearchTrigger.tsx  ← ⌘K command-palette fighter search
            ├── DivisionSelector.tsx ← Men/Women toggle + division tabs
            ├── FilterBar.tsx      ← live era/finish/recency/activity sliders
            ├── RankingTable.tsx   ← main list: champion hero + dense contender rows
            ├── ChampionHero.tsx   ← pinned champion card ("C", gold)
            ├── FighterCard.tsx    ← dense contender row (rank, trend chip, stats, score)
            ├── FighterAvatar.tsx  ← photo avatar w/ initials-behind fallback (rows, hero, profile)
            ├── ProfileRadar.tsx   ← 5-axis SVG radar
            ├── Gauntlet.tsx       ← THE career-trajectory chart: per-fight Elo on a calendar x-axis, opponent-Elo node sizing, finish/title/main-event halos, division reference lines (replaced the old standalone form-timeline line chart)
            ├── AdvancedAnalytics.tsx ← profile FORM & OUTPUT + DURABILITY & FINISHES sections
            ├── DepthHeatmap.tsx   ← homepage division-depth heat strips (global Elo scale)
            ├── ComparePicker.tsx  ← inline mini-search for the compare page
            ├── GrappleRamp.tsx    ← grey→blue grappling-proficiency ramp: full gradient track + per-fighter percentile needle(s); profile (1 needle) + /compare (both corners)
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

`eloRating` (≈1300–1850) dominates. `metricsBonus` (±30), `sosNudge` (±30), and `officialBonus` (0–10, form-gated) are deliberately small so they refine ties and edge cases without overriding who-beat-whom. (Exact magnitudes live in `rankingConfig.ts` — these are approximate.)

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
- **Provisional K** — a fighter's first 5 fights use `K × 1.5` so newcomers converge quickly and otherwise sit near the 1500 mean. This is why 3-0 / 5-0 prospects no longer rocket past champions. **Provisional-finish damp (2026-07-04)**: while provisional, the finish-method multiplier is damped toward 1.0 (`elo.provisionalFinishDamp = 0.5`) so finish (×1.4) can't compound with the provisional boost (×1.5) into a ~2.1× K — a newcomer KO'ing low-rated opponents converges on the RESULT, not the method (closed the "finisher-over-cans out-rates a proven gatekeeper" hole; deflated Nazim Sadykhov ~11 Elo). Full finish credit resumes once established.
- **Win-quality gate (2026-07-04, `elo.winQualityGate` = 0.5)** — the points a fighter GAINS from a win are scaled by the OPPONENT'S ABSOLUTE Elo: full credit for beating a ranked-calibre opponent (≥1560), only ~15% for beating a weak one (≤1460). So an unbeaten streak over soft competition PLATEAUS near that slate's level instead of floating into contention (fixes the undefeated-streak inflation — a never-losing fighter's Elo otherwise climbs forever). LOSSES are untouched, and beating someone ranked below you but still elite earns full credit (keyed on the opponent's absolute quality, not the gap to you — so it reins in soft-slate risers without punishing a champ who beats other elites). `displayCurve` + `winProbDenominator` (140) are anchored to the resulting spread.
- **Inactivity regression** — between fights (and once more up to "today"), a rating drifts toward the mean: `rating = 1500 + (rating − 1500) × 0.92^yearsOut`, after a **12-month grace** (`inactivityGraceMonths`). The 12-month window is deliberate: a normal elite cadence (champions defend ~1–2×/yr, often 10–14 months apart) is treated as fully current and pays NO activity penalty, so a fighter going 3 fights/2yr isn't dinged vs one going 4–6/2yr. Past a year the 0.92 slope still fades a genuinely inactive veteran.
- **Current-form recency decay (redesigned 2026-07-04)** — recency dominance is now carried entirely by the continuous inactivity regression above (`inactivityRetentionPerYear` 0.88 + 3mo grace), which fades pre-window form a little at *every* gap along each fighter's own timeline. This **RETIRED the discrete "boundary discount"** (`maxFightAgeYears` now `null`): that mechanism regressed a fighter's carried-in rating 50% toward the mean the first time they fought inside the last 5yr, which drew a synchronized league-wide **cliff** on every veteran's chart (all at the same rolling calendar date, migrating forward each year) and unfairly discounted continuously-active fighters. The continuous decay reproduces the goal — a 10yr-old result can't prop up today's rating — without a wall, without a cliff, and per-fighter. Rate empirically chosen (`scripts/boundaryRedesign.ts`, config "A2"): keeps *currently-active* tenured elites on top while dropping idle vets (Khabib) and NOT floating raw prospects — the middle between naive removal (Jones/Usman float) and over-decay (debutants float). The user-facing **Era filter** is still a hard window (drops older fights) for the historical lens. (Display curve + `winProbDenominator` were re-anchored to the new spread; golden master re-blessed.)
- **Weight-class move decay** — on a detected division change the rating carries across but regresses 10% toward the mean first (`× 0.90`). Champions who move up (Makhachev, Topuria) arrive near the top but must prove the new weight. Interim/catch/open-weight labels are normalized so they don't trigger a bogus move penalty. **Charged ONCE per division (2026-07-04)**: `EloState.divisionsSeen` tracks weights already competed in, so the tax hits only the FIRST entry into a division — a fighter *returning* to a proven weight (Holloway/Volkanovski to FW, Nunes to BW, Adesanya to MW) pays nothing (inactivity regression already covers the gap).

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
  strikeAccuracyDifferential * 0.15 +   // Sig. Str. % edge (balances raw volume)
  knockdownRate              * 0.15 +   // KDs per fight (STRIKE finish threat)
  takedownDifferential       * 0.15 +   // TDs landed − absorbed (grappling control)
  submissionThreat           * 0.15     // sub attempts/fight (GRAPPLE finish threat)
) * metricsScaleElo (30)   // × confidence dampener if < 5 scored fights
```

> **v1 bug this fixes**: the old engine used sig-strike *accuracy %* differential and ignored the `STR` volume columns entirely — so a fighter landing 8-of-10 "beat" one landing 90-of-200. v2 uses landed-strike **volume** as the headline, with accuracy only as a balancer.

> **Submission threat (2026-07-03)**: `submissionThreat` (sub attempts/fight, one-sided like `knockdownRate`, `submissionsPerFight`=2 for full credit) was added to close a striker/grappler asymmetry — the composite rewarded *knockdown* finish threat but not *submission* finish threat. Weights rebalanced 0.40/**0.15**/0.15/0.15/0.15. Paired with `SUB` finish multiplier → **1.4** (KO parity, was 1.35): a submission is as decisive a finish as a KO. Rewards *currently active* sub threats (Oliveira passed Tsarukyan for LW #2; Merab up); it does **not** retroactively lift a fighter whose subs are old/vs weak opponents (their Elo already banked them — the change won't move a Mike Malott whose recent window has ~0 sub activity). Golden-master re-blessed 2026-07-03.

---

### 4. Official rank seed (`officialBonus`) + safety floors

The internal official-rankings route supplies each fighter's current UFC rank. With Elo doing the work, this is a small seed (`seedScore × officialBonusScaleElo` — exact values in `rankingConfig.ts`) plus post-sort **safety floors** (a UFC-ranked fighter never *displays* below a guaranteed slot: champ ≥ #2, top-5 ≥ #8, top-15 ≥ #25).

**Form gate (2026-07-02)**: a NON-champion on a losing streak of `officialSeedSuppressLossStreak` (2) or more gets **zero seed** — the official list is slow to shed fading names, and the cage's verdict stands over it. This mirrors the contender-floor suppression (the champion seed, like the champion floor, is unconditional). Diagnosed with `scripts/diagOfficialImpact.ts`: before the gate, 50 seeded fighters on 2+ skids were being propped 3–16 spots (Dariush +16, Font/Vera +15, Covington +12); after, the stale-seed count is ~4 — all long-layoff-but-not-losing elites (e.g. Shavkat), which the seed exists to protect. Re-run that script after any seed/floor tuning.

**Magnitude re-anchor (2026-07-03)**: `officialBonusScaleElo` 0.4 → 0.1. The current-form boundary discount had compressed the ranked pool (median adjacent top-25 gap ≈3 Elo), so the old +25–40 seeds were worth 5–10 spots each — 87 fighters propped ≥3 spots. At 0.1 the seed spans +6.2 to +10 (~2–3 median gaps): 12 fighters move ≥3 spots, max +5. Consequence at the very top: a champion's belt alone (+10 seed + 8-pt tiebreaker band) no longer overrides a clear form gap — e.g. HW Volkov can out-rate champ Aspinall; the unconditional champion floor (≤#2) and the pinned "C" hero still keep every champ visually on top. If the rating spread is ever recalibrated, re-anchor this scale against the gap distribution (`diagOfficialImpact.ts` prints it).

> **Health check**: floors are a backstop, not the engine. If floors fire for more than ~1–2 fighters in a division, the Elo isn't landing — investigate before tuning anything else. (On the 2026-06-13 v2 run: BW 0 floors, LW 2, WW 5 — down from 5/6/9 under v1. WW runs higher because the Makhachev division-override creates two "C" champs there.)

---

### 5. Pre-UFC pedigree (supplementary seed — ENABLED)

A bounded signal describing the quality of a fighter's record in **other promotions before they reached the UFC**, sourced from `data/pro_mma_fights.csv` / `sherdog_fights.csv` (Kaggle/Sherdog) via `src/lib/pedigreeSeed.ts`. It exists so a newcomer arriving from Bellator/ONE/Cage Warriors isn't treated as a blank slate by their thin early-UFC Elo. **Toggled ON** (`RANKING_CONFIG.preUFCPedigree.seedEnabled = true`, enabled in the trust pass and golden-master-blessed): `pedigreeBonus = strength × seedMaxElo (25) × taper` is added to `finalRating`, tapering linearly from full at 0 UFC fights to **zero at 6 UFC fights** — once a fighter has a real UFC sample, their own Elo speaks and the pedigree fades out entirely.

Strictly scoped: UFC fights in that file are dropped (they duplicate our primary data), only non-UFC fights *before the UFC debut* count, it is weighted by the promotion-tier multiplier (defunct elite orgs like Pride/Strikeforce/WEC are excluded from the seed), and it is **frozen-in-time reference data, never current form**. It must never outweigh in-cage UFC results — the ≤25-Elo cap keeps it below even the official-rank seed (≤50). See `RANKING_CONFIG.preUFCPedigree` and the `PreUFCPedigree` types.

**Workstream A — empirical promotion grading + prediction prior (2026-07-03).** Two upgrades layered on the seed (plans: `PROMOTION_GRADING_PLAN.md`, `PREUFC_SOS_PLAN.md`; motivation: the closing-line backtest showed our accuracy gap vs the market *widens on newcomers* — −9.8pt in the 3–5-fight bucket vs −6.4pt at 6+, `research/backtest/enhancedVsClose.ts`, now with a fight-experience bucket split):
> 1. **Feeder attribution + data-driven grade.** `pedigreeSeed.ts` now attributes each fighter to their **primary feeder promotion** (plurality of last 5 pre-UFC fights, not the old `topMult` which over-credited one lucky good-org fight) and nudges that org's static tier multiplier by an **empirical grade** — how well its graduates actually did in the UFC (settled Elo gain, empirical-Bayes shrunk). Built offline by `scripts/sherdog/gradePromotions.ts` → `data/promotion_grades.csv`, loaded via `promotionGrades.ts`. The grade is a **hierarchy-preserving relative factor** (±20%, centred 1.0) — the Elo-gain signal is weak/compressed, so it only nudges within-tier, never flattens the tier prior. Signal is real but modest (ONE Championship graduates underperform → 0.95×; KSW/PFL/LFA slight premiums). **UFC-tryout orgs (DWCS/Contender Series) are excluded from feeder attribution** (`feederExcludeOrgs`) — DWCS is a one-fight UFC tryout, not a developmental promotion, so a fighter is graded on where they actually came up (their regional/Bellator/etc. circuit), and the DWCS win still counts on the record but is never the feeder identity. Config: `useEmpiricalGrades`, `gradeBlendLambda`, `gradeMinGraduates` (8), `gradeShrinkageKappa`, `feederExcludeOrgs`. **Cage Warriors mis-tiering fixed (2026-07-03):** Sherdog logs it abbreviated ("CW 100 - Cage Warriors 100" / "CWFC …"), which failed the `startsWith` matchers and fell to tier4; `buildContext.ts classifyOrg` now contains-matches `/cage warriors\b/i` (excluding the amateur academy + the unrelated "Cage Wars"), rebuilt from cache → Cage Warriors is tier3, grades 1.03×. **DWCS method-aware "showcase" term evaluated + rejected:** `scripts/sherdog/dwcsCohort.ts` found DWCS finish-winners (+3.9 Elo) barely out-gain decision-winners (+3.0) — a 0.9-Elo gap (noise), so HOW you win on DWCS carries no signal; the real win-vs-no-win gap (~11 Elo) is already captured via winRate + B.1 schedule, so no term was built.
> 2. **Prediction-side pedigree prior.** The ranking seed only touches `finalRating`, NOT the win-prob path the backtest measures. So `fightPrediction.ts` gained a bounded, **taper-out** pedigree logit (`winProbModel.pedigreeEdgeCoef`): `(A's tapered pedigree strength − B's) → logit`, tapering to zero by 6 UFC fights. This is what lets pre-UFC signal reach newcomer *predictions* — it lifted the 3–5-fight backtest bucket 63.9%→65.6% accuracy while leaving the 6+ bucket untouched. Display-only; still never enters the Elo pool.

**Workstream B — deeper pre-UFC SoS (2026-07-03, B.1 built; B.2 deferred).** `pedigreeSeed.ts` now measures WHO you beat, not just your win count: `collectPreUFCFights` carries `opponentSherdogId` (~100% filled) + a subject `sherdogId→ourId` map, so a pre-UFC WIN over an opponent who *themselves reached the UFC* adds a **bounded SoS term** to pedigreeStrength, weighted by that opponent's UFC Elo above the mean (`ufcBoundBeaten` / `ufcBoundQuality`, config `useOpponentSos`/`sosWeight`/`sosTermCap`/`sosNormConst`). Smell-test passes (Michael Chandler beat 5 future UFC fighters pre-UFC, Kai Asakura 3). Surfaced as a **prospect scouting read** on `/prospects` ("beat N future UFC fighters (incl. …)", via `bestScalpId`). Golden master unchanged (the high-SoS fighters are all established → tapered out; genuine newcomers didn't reorder) and the win-prob backtest was flat on the 61-bout newcomer slice — B.1 is *correct and safe but currently low-yield on scoring*; its value is the display read + future-proofing as new prospects enter. **B.2 (a separate firewalled pre-UFC Elo sweep) is deliberately NOT built** — with B.1 flat and the backtest underpowered for this signal, it's high-effort for near-zero measurable gain (see `PREUFC_SOS_PLAN.md` §3, which gated B.2 on B.1 delivering). Leak note: opponent UFC Elo is the settled present-day rating (mild backtest look-ahead; acceptable for the tiny seed).

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

1. ✅ **Data layer** — `loadData.ts`: load + join CSVs, name-resolve fight IDs, recency-patch guard. (`pedigreeSeed.ts` loads the pre-UFC pedigree seed.)
2. ✅ **Elo engine** — `eloEngine.ts`: chronological sweep → one rating per fighter, plus per-fight trace + filter-aware caching.
3. ✅ **Scoring engine** — `scoringEngine.ts`: eligibility + bounded adjustments → ranked array per division (filter-parameterized).
4. ✅ **Validation** — `scripts/validate.ts`: name-match audit + LW/WW/BW top-40 breakdown. Run via `node_modules/.bin/jiti scripts/validate.ts` (needs network for Octagon). **Re-run + diff after any algo/data change.** Current reference: `validation_elo_2026-07-04_lhwchamp.txt`. Engine **unit tests** (`scripts/engine.test.ts`, run via `npm test`) guard the Elo INVARIANTS beneath the ranking output — winner-gains, opponent-quality gate, finish weighting, provisional K, weight-move-once, symmetric win-prob — which can regress while the top-40 order stays put. Wired into CI (typecheck → `npm test` → build → golden master).
5. ✅ **API routes** — `/api/rankings` (+live filters), `/api/fighter/[id]`, `/api/search`.
6. ✅ **Rankings homepage** — division tabs + filter bar + champion hero + dense rows + trend chips.
7. ✅ **Fighter profile page** — why-this-rank, radar, fight history with Elo deltas.
8. ✅ **Discovery** — ⌘K search, P4P, leaderboards, compare. Real photos/flags now wired (build-time media pipeline; `FighterAvatar` uses `next/image` for on-the-fly resize/optimization — hosts allowlisted in `next.config.ts`). **Polish remaining**: community layer. (Rank-history sparkline was tried + cut as redundant with the Gauntlet — see "known gaps" above.)

---

## Algorithm Tuning Notes

- **Tune from real output, never in the abstract.** The workflow is: change a value in `rankingConfig.ts` → run `scripts/validate.ts` → diff against the last saved snapshot (`ufc-rankings/validation_elo_*.txt`) → spot-check that LW/WW/BW still make sense. `validation_elo_2026-07-04_lhwchamp.txt` is the current reference (Ulberg = LHW champ after Pereira vacated for the HW interim; champions still lead LW/WW/BW).
- **`metricsScaleElo` (30)** is the knob most likely to need adjusting. At 40 it occasionally swung a fighter ~±28 Elo points (e.g. King Green) and out-weighed who-beat-whom; lowered to 30 on 2026-06-13. If metrics still override head-to-head logic, keep dialing down.
- **`elo.baseK` (24)** controls volatility. Higher = ratings swing more per fight (more recency-reactive, noisier); lower = stickier, more conservative. Don't raise it without re-checking that one upset can't vault a fighter past a proven champion.
- **`recencyHalfLifeMonths` (15)** only affects the metrics/SoS sampling windows now — the Elo core gets its recency from chronological processing + inactivity regression. Tune `elo.inactivityRetentionPerYear` (0.92) instead to make layoffs bite harder/softer.
- **Champion placement**: two mechanisms keep reigning champs (official rank "C") on top — `championFloorRank` (2) guarantees no champ displays below #2, and `championTiebreakerBand` (8) lifts a champ over a non-champion they're within 8 Elo points of (this is what puts undefeated champ Topuria at LW #1). To push champs harder still, raise `officialBonusScaleElo` rather than hard-coding identities. **Exception by design**: a champ who *lost head-to-head* to the fighter directly above them is NOT lifted (e.g. Yan over Merab at BW — Yan beat Merab, so the in-cage result stands over the belt).
- **Head-to-head leapfrog anti-vault (2026-07-04, `headToHead.leapfrogMaxUnbeaten` = 3)**: beating a higher-ranked fighter lifts you above them, but only as a LOCAL reorder — the move is skipped if it would vault you past more than 3 *un-beaten* in-between fighters. Stops a single win from jumping a whole stack of superior résumés you never fought (Hernandez beat Allen but must not pass Chimaev, whose only loss is to the champ), while preserving legit short hops (Topuria over Oliveira jumps 2). Fighters you've *also* beaten don't count against the cap.

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
| `finishMultipliers` | Scale the Elo K-factor per result method (KO/TKO 1.4 = SUB 1.4 → S-DEC 0.8) |
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

The official rankings are read from the committed `data/official_rankings.csv` snapshot, so there is **no** runtime Octagon fetch to cache — the snapshot is refreshed build-time by the weekly ingest (see the committed-snapshot architecture below). The only runtime external call is the Anthropic API behind `/api/chat`.

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
- ✅ Pre-UFC pedigree seed activated (trust pass; bounded ≤25 Elo, thin-sample taper). Tier 2–4 promotion multipliers feed it via `orgTierMatchers`.
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
- Only ONE external API call at **runtime**: the Anthropic API behind `/api/chat` (Ask the Analyst; rate-limited, graceful 503 without a key). The Octagon official-rankings fetch is now **build-time only** (2026-07-04) — it writes the committed `data/official_rankings.csv` snapshot that the running app reads; the live fetch survives only as a fallback for a fresh checkout with no snapshot. See the committed-snapshot architecture below (`fetchOfficialRankings.ts`).
- No user accounts or persistence (yet — Phase 3)
- No betting odds in the **algorithm** — odds never feed Elo or scoring, ever. Odds ARE surfaced in ONE display-only, firewalled place: the `/odds` "MODEL vs MARKET" explorer (reads a static offline-built `data/odds_analysis.json`; framed as a divergence lens, not a betting-edge generator). No live odds feed, no in-product betting integration.
- Not ranking fighters outside their primary weight class

---

## Official Rankings Source — Octagon API

Official UFC rankings are fetched from **Octagon API**, a free open-source MMA API that scrapes UFC.com and returns structured JSON.

**Endpoint**: `https://api.octagon-api.com/rankings`

### Architecture (as built)

```
scripts/buildOfficialRankings.ts   ← BUILD-TIME: fetches live Octagon → writes data/official_rankings.csv (the committed snapshot). Wired into weeklyUpdate.ts.
data/official_rankings.csv         ← the committed snapshot the running app reads (versioned, git-visible). DO NOT hand-edit — the weekly refresh overwrites it; put corrections in official_rankings_overrides.csv instead.
data/official_rankings_overrides.csv ← manual rank corrections applied ON TOP of the Octagon fetch by buildOfficialRankings.ts (survives the weekly refresh). Format: division,rank,name — pinning a fighter bumps those below down one.
src/lib/fetchOfficialRankings.ts   ← RUNTIME: reads the snapshot; live fetch (fetchLiveOfficialRankings) is the fallback only. The ONE place to change if the source breaks.
```

**Committed-snapshot architecture (2026-07-04).** The running app no longer fetches Octagon at request time. `fetchOfficialRankings()` reads the committed `data/official_rankings.csv` snapshot; the live Octagon fetch (`fetchLiveOfficialRankings`) is kept only as a fallback for a fresh checkout with no snapshot, and an empty `{}` is the final degrade to pure-Elo. The snapshot is refreshed by `scripts/buildOfficialRankings.ts` as a **weekly-ingest step** (the ingest commits the CSV → redeploy). ⚠️ **The ingest runs LOCALLY, not in CI** (2026-07-05): GitHub-hosted runners' datacenter IPs are blocked by Sherdog's anti-bot, so the crawl fatally errored in the Action (run #5). It now runs on the maintainer's Mac via a launchd job (`scripts/sherdog/weeklyIngestLocal.sh` + `~/Library/LaunchAgents/com.fergrank.weekly-ingest.plist`, Sundays 7am local); `weekly-update.yml`'s schedule is disabled (kept for manual dispatch / a future self-hosted runner). This killed the staleness/reliability problem — the feed is now versioned (the git diff on the CSV **is** the staleness detector) and the build script refuses to overwrite a good snapshot with an empty Octagon response. **Hand-corrections go in `data/official_rankings_overrides.csv`, NOT the snapshot** (2026-07-05): `buildOfficialRankings.ts` applies overrides on top of the Octagon fetch every run, so a fix survives the weekly refresh. This was a real bug — a direct edit pinning Ulberg as LHW champ got silently reverted by the next ingest (Octagon still listed the old champ); the overrides file is the durable fix. The JSON shape is an array of division objects — see the parser in `fetchOfficialRankings.ts`.

**⚠️ Recency source moved Sherdog → ufcstats.com (2026-07-05).** Sherdog's Cloudflare edge began hard-blocking every non-browser client (403 from all IPs, curl + Node alike) — the Sherdog crawl is dead. The weekly recency top-up now comes from **ufcstats.com** (`scripts/ufcstats/`: `fetchUfcStats.ts` clears ufcstats's transparent SHA-256 proof-of-work gate, `parseUfcStats.ts` parses the events list + per-bout results/metrics, `buildRecencyFromUfcStats.ts` writes `recent_ufc_fights.csv` — same schema + accumulate-merge as before, IDs resolved by name). `weeklyUpdate.ts` step 1 now runs the ufcstats orchestrator (retired the Sherdog fetchEvent→extendCrosswalk→buildRecencyPatch trio). Still-Sherdog and therefore currently broken (non-fatal): `buildUpcoming.ts` (the /upcoming page will go stale until ported) and `buildAges.ts --fetch` (DOB top-up; falls back to cache). Metrics (KD/STR/TD/sub) are now available from ufcstats but NOT yet written to the patch — a clean follow-up (schema + loadData + golden-master).

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
2. **A small seed + safety floor** — `officialBonus = officialRankScores[rank] × officialBonusScaleElo`, plus the post-sort floor guarantees. This keeps a reigning/returning champ from sinking on a thin recent Elo sample without letting the official list override the data wholesale. **Gated by form**: a non-champion on a ≥`officialSeedSuppressLossStreak` losing streak gets no seed at all (see §4 under THE ALGORITHM).

Exact seed scores, the scale, and the floor ranks live in `rankingConfig.ts` (`officialRankScores`, `officialBonusScaleElo`, `*FloorRank`) — read them there; this doc used to inline the numbers and drifted out of sync. Unranked fighters get 0 (pure Elo + metrics + SoS).

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
- The Octagon rankings fetch is now **build-time only** (writes the committed `data/official_rankings.csv` snapshot; the app reads that file at runtime). The only external **runtime** network call left is the Anthropic API behind `/api/chat`. Keep it that way. (Sherdog scraping is build-time only too.)
- **Recency patch** (`recent_ufc_fights.csv`) is integrated in `loadData.ts` with three guards — stale-drop, duplicate-drop (suffix-tolerant name-pair within ±7 days), and `sd:`-id name-resolution. This fixed silent Elo double-counting. Full provenance + rules in `data/SOURCES.md`.
- **Data freshness drifts**: when the CSVs are refreshed, update the counts in this doc and `data/SOURCES.md`, and **regenerate the validation snapshot**.
