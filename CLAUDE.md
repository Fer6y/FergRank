# UFC AI Rankings — CLAUDE.md

AI-powered UFC rankings: top 40 per weight class (deeper than the official top 15), built purely
on in-cage performance — no media votes, no popularity, no promotional bias. Next.js web app:
ingests historical fight CSVs, runs an Elo-core scoring algorithm per division, renders ranked
fighter cards. Goal: outperform the UFC's own upcoming Meta/AI rankings on transparency and depth.

## Commands (run inside `ufc-rankings/`)

- Dev server: `npm run dev` (Turbopack). Verify changes against running output, not just types.
- Validate rankings: `node_modules/.bin/jiti scripts/validate.ts` — name-match audit + LW/WW/BW
  top-40 breakdown; needs network. Diff against the latest `validation_elo_*.txt` snapshot after
  any algo/data change (current reference: `validation_elo_2026-08-05.txt`).
- Unit tests: `npm test` — engine + scoring + display suites guarding the INVARIANTS beneath the
  ranking output: Elo core (winner-gains, opponent-quality gate, finish weighting, provisional K,
  weight-move-once, symmetric win-prob) and the ranking layer (untested hold, metrics damper, H2H
  leapfrog + anti-vault, champion tiebreaker/floor, two-slope inactivity, P4P tilt) — all of which
  can regress while the top-40 order stays put.
- Golden master: `node_modules/.bin/jiti scripts/goldenMaster.ts` (compare) / `--update` (re-bless
  intentionally). Deterministic: the snapshot records its bless date (`asOf`) and the compare
  freezes the engine clock to it (`RANKINGS_ASOF` → `src/lib/clock.ts`), so it fails only on real
  code/data changes — never from calendar days passing since the bless.
- Official-seed diagnostics: `node_modules/.bin/jiti scripts/diagOfficialImpact.ts` — who the seed
  props + the ranked-pool gap distribution. Re-run after any seed/floor tuning.
- Typecheck: `npx tsc --noEmit`. CI = typecheck → `npm test` → build → golden master.
- Quick single-division print: `jiti scripts/sanityCheck.ts`.

## Project structure

```
UFergCRankings/
├── CLAUDE.md                  ← this file
├── DESIGN_VISION.md           ← UI/UX design system + locked decisions (source of truth for UI)
├── docs/                      ← ALGORITHM.md (current spec) · CHANGELOG.md (dated history) · plans/
└── ufc-rankings/              ← the Next.js app
    ├── AGENTS.md              ← "this is NOT the Next.js you know" — read the docs first
    ├── validation_*.txt       ← committed validation snapshots (evidence; diff targets — keep)
    ├── data/                  ← CSVs + SOURCES.md (provenance/alignment — read for data work);
    │                            canonical/ (registry/media/ages), golden/ (golden-master baseline)
    ├── scripts/               ← validate, goldenMaster, engine/display tests, diagOfficialImpact,
    │                            buildOfficialRankings, registry/, ufcstats/ (weekly ingest),
    │                            sherdog/ (retired scrape pipeline; source blocked)
    ├── research/              ← odds zone (backtests, /odds export) — firewalled from the engine
    └── src/
        ├── app/               ← routes: / (rankings) · fighter/[id] · division/[division] · p4p ·
        │                        leaderboards · compare · upcoming · prospects · odds ·
        │                        api/{rankings,fighter,search,upcoming,chat,dashboard}
        ├── lib/
        │   ├── rankingConfig.ts   ← ALL tunables — single source of truth, nothing hardcoded
        │   ├── eloEngine.ts       ← THE CORE: chronological Elo sweep (+ per-fight trace)
        │   ├── scoringEngine.ts   ← eligibility + bounded adjustments → ranked division
        │   ├── loadData.ts / dataCache.ts ← CSV ingestion + recency-patch guards; memoized load
        │   ├── filters.ts         ← live era/finish/recency/activity sliders → effective engine
        │   ├── crossDivision.ts   ← P4P + specialty leaderboards (global Elo pool)
        │   ├── careerSos.ts       ← all-time (career, fight-time) SoS — display-only, feeds nothing
        │   ├── pedigreeSeed.ts    ← pre-UFC pedigree seed (bounded, thin-sample taper)
        │   ├── fetchOfficialRankings.ts ← reads committed official_rankings.csv snapshot
        │   ├── nameResolver.ts    ← fuzzy UFC.com-name → CSV-id matching
        │   ├── fighterProfile.ts / fighterDisplay.ts / advancedStats/ / prospects.ts /
        │   │   upcomingEnrich.ts / searchFighters.ts / fightPrediction.ts ← display assembly
        │   ├── fighterMedia.ts / fighterAges.ts / fighterPhysical.ts / titleFights.ts /
        │   │   grappleGradient.ts / loadUpcoming.ts / loadOddsAnalysis.ts ← display-only lookups
        │   └── agent/             ← "Ask the Analyst" tools + frozen persona (/api/chat)
        └── components/        ← RankingTable/FighterCard/ChampionHero, Gauntlet (career chart),
                                 AdvancedAnalytics, DistinctionDecals, GrappleRamp, DepthHeatmap,
                                 AnalystDock (site-wide chat), SearchTrigger (⌘K), FilterBar …
```

Stack: Next.js 16 App Router + TypeScript + Tailwind v4 + PapaParse; npm. Charts are hand-rolled
inline SVG — Recharts is NOT installed; don't add it without reason. Fonts: Oswald display, Geist
Sans body, Geist Mono numbers.

## The firewall (display vs scoring)

**The algorithm is influenced only by in-cage results.** Everything else attaches at the API/display
boundary and must never feed `eloEngine.ts`/`scoringEngine.ts`:

- **Odds never feed Elo or scoring, ever.** `/odds` reads a static offline-built
  `data/odds_analysis.json` (`research/` is the odds zone); delete `research/` and rankings are
  byte-identical. No live odds feed, no betting integration.
- Photos/flags, ages, reach, title-fight lookups, upcoming cards, grapple ramp, decals, advanced
  stats, `scheduleStrength` — all display-only.
- Community input (Phase 3, when built) never touches the algorithm — see `docs/plans/ROADMAP.md`.
- Only ONE runtime external call: the Anthropic API behind `/api/chat` (graceful 503 without a
  key). Official rankings + all scraping are build-time pipelines writing committed files.
- All tunables live in `rankingConfig.ts` — never hardcode a number in the engines; add new
  tunables to the config first, then reference them. Config is dev-facing only, never exposed.
- Not ranking fighters outside their primary weight class; no user accounts/persistence yet.

## Data gotchas

- **`Fighter_Id` columns in `Fights.csv` are unreliable (~88% mismatch).** `loadData.ts`
  re-resolves participant IDs by joining on fighter **name** against `Fighters_Stats.csv`. Never
  trust the raw fight ID columns.
- Control time (`Ctrl`, `Ctrl_1/2`) is in **seconds** (not used by the v2 metrics composite).
- `STR_1/2` are landed-strike **counts** (the volume signal); `Sig. Str. %_1/2` are accuracy
  decimals. `Fights.csv` is the per-fight metrics source; `Fighters_Stats.csv` assigns divisions.
- Dates come from `Events.csv` — always join on `Event_Id`; the Elo engine skips undated fights.
- **Recency patch** (`recent_ufc_fights.csv`) is contract-guarded in `loadData.ts`: stale-drop,
  duplicate-drop (suffix-tolerant name-pair ±7 days), `sd:`-id name-resolution. This fixed silent
  Elo double-counting — watch the `[loadData] recency patch:` log line after any refresh. Full
  rules in `data/SOURCES.md` §4.
- Champion identity comes from official rank `"C"` / `divisionOverrides` — never the stale `Belt`
  CSV flag.
- Next.js 16 breaking change: `params`/`searchParams` are **Promises** (await them); read
  `node_modules/next/dist/docs/` before writing route/page code (see `ufc-rankings/AGENTS.md`).
- On data refresh: update counts in `data/SOURCES.md` and regenerate the validation snapshot.
- Rendering is ISR, `revalidate = 86400` on rankings pages/APIs (engine too CPU-heavy for fully
  dynamic; fully static would only update on redeploy).

## Pipeline ops (weekly ingest)

- Official rankings: the app reads the committed `data/official_rankings.csv` snapshot, built by
  `scripts/buildOfficialRankings.ts` — **primary source ufc.com/rankings** (server-rendered HTML,
  `scripts/ufcstats/fetchUfcRankings.ts`); Octagon API is the automatic fallback; runtime live
  fetch = fresh-checkout fallback only.
  **Hand-corrections go in `data/official_rankings_overrides.csv`, never the snapshot** — the
  weekly refresh overwrites the snapshot and silently reverts direct edits.
- The weekly ingest runs **locally** (launchd: `scripts/sherdog/weeklyIngestLocal.sh`, Sundays
  7am), not in CI — datacenter IPs are bot-blocked. `weekly-update.yml` is manual-dispatch only.
- Recency comes from **ufcstats.com** (`scripts/ufcstats/`); **upcoming cards come from ufc.com/event**
  (`fetchUfcCards.ts` → `buildUpcomingFromUfcCom.ts`, 2026-07-09) — authoritative bout order + the
  main/prelim/early `section` split (ufcstats gave neither). The Sherdog crawl is dead
  (Cloudflare-blocked) — its frozen CSVs still serve pedigree/crosswalk. See `data/SOURCES.md`.

## Tuning workflow

Change `rankingConfig.ts` → `jiti scripts/validate.ts` → diff vs the last snapshot → spot-check
LW/WW/BW → golden master (re-bless only if the change is intended). Tune from real output, never
in the abstract. **Before adding/tuning any scoring mechanism or reacting to a "fighter X is
ranked wrong" complaint, run the `modeling-discipline` skill** — it owns the restraint and
burden-of-proof rules that used to live in this file.

## Pointers

- Algorithm spec (current state, all mechanisms + config keys): @docs/ALGORITHM.md
- Dated history, post-mortems, superseded decisions: @docs/CHANGELOG.md
- UI/UX system + locked design decisions: @DESIGN_VISION.md
- Data provenance + alignment rules: @ufc-rankings/data/SOURCES.md
- Plans (status index in `docs/plans/README.md`; ALGORITHM_PATCH.md is superseded — never
  implement from it): `docs/plans/`
