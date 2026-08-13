# Data Sources & Provenance

How every piece of data in this app originates, how fresh it is, and how the
sources are kept in alignment. Audited 2026-06-13.

The app is **local-first**: rankings are computed entirely from CSVs in this
folder. There is exactly **one external network call at runtime** (the Anthropic
API behind `/api/chat`); official rankings and all scraping (ufcstats.com;
formerly Sherdog) are **build-time** pipelines writing committed files.
Everything else is a local file.

---

## 1. External sources (the only data we pull from outside)

### A. Official UFC rankings — *build-time snapshot*, ufc.com direct (Octagon = fallback)
- **URL**: `https://www.ufc.com/rankings` (server-rendered HTML, parsed by
  `scripts/ufcstats/fetchUfcRankings.ts`). Fallback: the Octagon API
  (`https://api.octagon-api.com/rankings`), used automatically only if the
  ufc.com parse comes back empty (e.g. a page restructure).
- **What**: official UFC rankings — champion + top-15 per division.
- **Used for**: the "vs UFC" trend chips, division membership, a small official
  seed and the champion floor/tiebreaker. It does **not** drive the core
  rating — Elo does.
- **Why direct (2026-07-06)**: Octagon lagged ufc.com by days/weeks — it kept
  returning old champions, forcing hand-maintenance via the overrides file.
  ufc.com serves the live board as parseable server-rendered HTML (no JS
  hydration, no proof-of-work gate), so we read it straight.
- **Freshness / architecture (2026-07-04)**: the running app reads a **committed
  snapshot**, `data/official_rankings.csv`, NOT a live request-time fetch. The
  snapshot is regenerated at build time by `scripts/buildOfficialRankings.ts`
  (wired into the weekly ingest, `weeklyUpdate.ts`). This makes the displayed
  "UFC Rank" versioned, git-visible, and hand-overridable — the git diff on that
  file **is** the staleness detector (a flat diff = the UFC board itself hasn't
  moved). Behaviour is a pure source-swap: the returned shape is unchanged, so
  trend chips / champion "C" / floors / seed are all identical
  (golden-master-verified, zero drift).
- **Resilience**: isolated in `src/lib/fetchOfficialRankings.ts`. Runtime reads
  the snapshot; the live fetch remains only as a fallback for a fresh checkout
  with no snapshot yet, and an empty `{}` is the final degrade to **pure Elo**
  (no crash, no trend chips). The build script refuses to overwrite a good
  snapshot with an empty/short parse from BOTH sources. **To hand-fix a stale/wrong rank, put
  the correction in `official_rankings_overrides.csv` (format: division,rank,name;
  pinning a fighter bumps those below down one), NEVER the snapshot itself** —
  `buildOfficialRankings.ts` applies overrides on top of the fetch every run, so
  they survive the weekly refresh, while direct snapshot edits get silently
  reverted by the next ingest (this was a real bug, 2026-07-05). Swap
  `fetchOfficialRankings.ts` if the API ever changes.
- **Known misalignment (handled)**: the API lags real title changes. Stale
  champions are corrected in `RANKING_CONFIG.divisionOverrides` (e.g. Makhachev
  at WW, Pereira at LHW, Chimaev at MW, Van at FLW, Dern at WSW). Re-audit after
  each card with `scripts/sherdog/championAudit.ts`.

### B. Sherdog — *build-time scrape*, never hit by the running app — **CRAWL DEAD (2026-07-05)**
- **URL**: `https://www.sherdog.com` (fighter profiles + fight-finder).
- **Scraper**: `scripts/sherdog/fetchProfile.ts`, cached under
  `data/.sherdog_cache/` so re-runs don't re-hammer the site.
- **Produced**: `recent_ufc_fights.csv`, `sherdog_fights.csv`, `sherdog_orgs.csv`,
  `sherdog_prospects.csv`, `sherdog_crosswalk*.csv`.
- **Status**: Sherdog's Cloudflare edge hard-blocks every non-browser client
  (403 from all IPs, curl + Node alike) since 2026-07-05, and Sherdog is fully
  out of the weekly pipeline (2026-07-06). The already-scraped CSVs remain in
  active use as **frozen** pedigree/crosswalk/context data.

### C. ufcstats.com — *build-time scrape*, the ACTIVE weekly RECENCY source (2026-07-05)
- **Scripts**: `scripts/ufcstats/` — `fetchUfcStats.ts` clears ufcstats's
  transparent SHA-256 proof-of-work gate, `parseUfcStats.ts` parses the events
  list + per-bout results/metrics, `buildRecencyFromUfcStats.ts` writes
  `recent_ufc_fights.csv` (same schema + accumulate-merge as the Sherdog
  builder, IDs resolved by name). `buildUpcomingFromUfcStats.ts` (announced
  matchups → `upcoming_fights.csv`) was **superseded 2026-07-09** by the ufc.com
  card source in §D and retired to fallback.

### D. ufc.com/event — *build-time scrape*, the ACTIVE UPCOMING-CARD source (2026-07-09)
- **Scripts**: `scripts/ufcstats/fetchUfcCards.ts` parses ufc.com/events (the next
  cards + their main-card timestamps) and each ufc.com/event/<slug> page
  (server-rendered HTML, no JS hydration, no proof-of-work gate — the same
  surface as the rankings scraper); `buildUpcomingFromUfcCom.ts` writes
  `upcoming_fights.csv`.
- **Why (over ufcstats)**: ufc.com gives the AUTHORITATIVE fight order and the
  explicit `main-card` / `prelims-card` / `early-prelims` section split. ufcstats
  lists bouts in announcement order with no section labels, so the /upcoming page
  order drifted from the real card the week of an event and could not render a
  main-card/undercard divider.
- **Schema note**: adds a `section` column (`main`/`prelim`/`early` — **empty
  since 2026-08**: ufc.com removed the per-section anchors from event pages, so
  the bout ORDER is still parsed but the card-section split is unknown and the
  /upcoming UI falls back to one flat list); event date
  from the local hero suffix + year from the events-list timestamp (dodges the
  UTC day-slip); fighter ids resolved by name with a suffix-stripped retry
  ("Rountree Jr." → "Rountree"). Display-only — upcoming bouts never touch the
  Elo/scoring path. NON-FATAL in the weekly ingest; a scrape hiccup leaves the
  last-known-good snapshot.

- Run by `weeklyUpdate.ts`, which executes **locally** on the maintainer's Mac
  via launchd (`scripts/sherdog/weeklyIngestLocal.sh` +
  `~/Library/LaunchAgents/com.fergrank.weekly-ingest.plist`, Sundays 7am) — CI
  runners' datacenter IPs are bot-blocked; `weekly-update.yml` is
  manual-dispatch only.

> The ad/tracker domains (doubleclick, amazon-adsystem, pub.network…) that appear
> if you grep the repo are **noise inside saved Sherdog HTML fixtures** — the app
> never contacts them.

---

## 2. Local primary data (our own dataset)

Originally derived from **UFC.com stats** via the `scrape_ufc_stats` project
(sibling folder `../scrape_ufc_stats-main`). Loaded every request by
`src/lib/loadData.ts`.

| File | Rows | Role | Coverage |
|------|------|------|----------|
| `Fighters_Stats.csv` | ~2,600 fighters | **PRIMARY** stats, weight class, style | — |
| `Fights.csv` | ~8,700 fights | **PRIMARY** fight-by-fight results + metrics | dates to **2026-05-16** |
| `Events.csv` | 773 events | event dates (joined for recency) | 1994-03-11 → 2026-05-16 |
| `Fighters.csv` | ~4,400 | physical attributes (ht/reach/stance) | fallback / profile |
| `raw_fighters.csv`, `raw_fights_detailed.csv` | — | supplementary / fallback | mostly unused at runtime |

> ⚠️ `Fighter_Id` columns in `Fights.csv` are ~88% unreliable — `loadData.ts`
> re-resolves participants by **name** against `Fighters_Stats.csv`.

> 📌 The row/date counts in this file are the ones to trust and update on each
> data refresh (CLAUDE.md no longer inlines them). After a refresh, regenerate
> the validation snapshot (`validation_elo_*.txt`).

### Column reference (primary CSVs)

- **`Fighters_Stats.csv`** (PRIMARY, ~2,600 fighters): `Fighter_Id`, `Full Name`,
  `Nickname`, `Weight_Class`, `Gender`, `W`/`L`/`D`, `Sig. Str. %` (accuracy),
  `Head_%`/`Body_%`/`Leg_%` (strike distribution), `Distance_%`/`Clinch_%`/
  `Ground_%` (location distribution), `Ctrl` (control time, **seconds**,
  aggregate), `KD`, `TD`, `Sub. Att`, `KO Rate`/`SUB Rate`/`DEC Rate`,
  `Fighting Style`, `Striker_Membership`/`Wrestler_Membership`/
  `Hybrid_Membership`, `Belt` (champion flag — **stale, don't use for champion
  identity**; official rank "C" is the authority).
- **`Fights.csv`** (PRIMARY, ~8,700 fights): `Fight_Id`, `Fighter_Id_1/2`
  (**~88% unreliable — re-resolved by name at load**), `Fighter_1/2`,
  `Result_1/2` (W/L/D/NC per fighter), `Method` (KO/TKO, SUB, U-DEC, M-DEC,
  S-DEC), `Method Details` (e.g. "KO/TKO Punches", "Submission Rear Naked
  Choke"), `Round`, `Fight_Time`, `Time Format`, `Weight_Class`, `Ctrl_1/2`
  (control **seconds** per fight), `Sig. Str. %_1/2` (accuracy decimals),
  `STR_1/2` (landed-strike **counts** — the volume signal), `KD_1/2`, `TD_1/2`,
  `Event_Id`.
- **`Events.csv`** (773 events): `Event_Id`, `Name`, `Date` (YYYY-MM-DD),
  `Location`. Date range 1994-03-11 → 2026-05-16. Always join fights on
  `Event_Id` for dates; the Elo engine skips undated fights.
- **`Fighters.csv`** (~4,400): physical attributes `Ht.`, `Wt.`, `Reach`,
  `Stance` — profile pages.
- **`recent_ufc_fights.csv`**: UFC fights newer than `Fights.csv` (see §4).
  Since 2026-07-06 it carries the 8 per-fight metric columns (KD/STR/TD/sub per
  corner); older Sherdog-era rows are padded and load with `hasMetrics: false`.

---

## 3. Supplementary data (pre-UFC / recency / context)

| File | Origin | Status |
|------|--------|--------|
| `recent_ufc_fights.csv` | ufcstats.com recency top-up (was Sherdog) | ✅ **active** — keeps Elo current past the `Fights.csv` cutoff (see §4) |
| `sherdog_fights.csv` | Sherdog full history | ✅ pedigree **seed enabled** (`preUFCPedigree.seedEnabled = true`, bounded ≤25 Elo, thin-sample taper); also crosswalk/context |
| `sherdog_crosswalk.csv` | Sherdog ↔ our-id map (2,240 rows) | ✅ maps Sherdog ids to our roster |
| `sherdog_orgs.csv`, `sherdog_prospects.csv` | Sherdog | context / prospect watchlist (not wired into core) |
| `pro_mma_fights.csv` | **Kaggle/Sherdog**, frozen ~Aug 2021 | ✅ pre-UFC pedigree seed (enabled, bounded ≤25 Elo, tapers out by 6 UFC fights) |
| `dwcs_bouts.csv` / `dwcs_fighters.csv` | derived from `sherdog_fights.csv` by `research/dwcs/buildDwcsDataset.ts` (2026-08-11) | ✅ DWCS cohort study + `/contender-series` (display-only). 325 bouts / 594 participants, 2017–2025. Frozen with the Sherdog source; UFC-outcome columns refresh on manual re-run. See `docs/plans/DWCS_PLAN.md` for operationalizations (`gotContract` = fought-in-UFC proxy; `reachedTop15` = current snapshot only). |
| `dwcs_upcoming.csv` | **hand-maintained snapshot** (2026-08-11): upcoming Contender Series cards — ufc.com/events does NOT list DWCS events, ufcstats has never carried them, Tapology bot-walls scrapers, Sherdog is dead, so there is no scrapable source; refresh weekly during the season from media card announcements. Read by `loadUpcoming.getUpcomingCards()` (merged as name-only cards with per-corner scout data → the /upcoming DWCS treatment + `dwcsScout.ts` cohort grades). Rows dated before today are ignored — stale entries are harmless. |
| `regional_fights.csv` | **Fight Matrix crawl** (`research/regional/crawlDeep.ts`, event-seeded, 2026-08-12): 147k rows → 111,988 de-duplicated modern pro bouts across 50,714 regional fighters. Pro-only by construction (parse is bounded to the "Complete Professional MMA Fight History" section). Phase C (39k opponent profiles) deliberately not run — see CHANGELOG. |
| `regional_profile_meta.csv` | Extracted from the cached Fight Matrix profile pages by `research/regional/extractProfileMeta.ts` (zero network): explicit `proDebutDate` (100% of 11,466 profiles), `proRecord`, and FM's `fmCombatAge` — which is **their experimental wear metric, NOT chronological age** (verified: Joshua Van shows 28 vs real age 24); captured under its honest name, never surfaced as an age. Fight Matrix carries no birthdate — ages still come only from hand-verified card snapshots. |
| `regional_ratings.csv` | Built by `research/regional/rateRegional.ts` — the cross-promotion REGIONAL ELO: chronological sweep, walk-forward validated (63.9% acc / 0.6407 logloss on 27,783 held-out bouts, coin flip 0.6931). 18,443 rated fighters (3+ bouts) with pool percentile. **Display-only**: read by `loadRegionalRatings.ts` for the /upcoming DWCS scout band; never touches Elo/scoring. Name-keyed join; 177 ambiguous duplicate names dropped rather than guessed. |
| `bfo_dwcs_odds.csv` | BestFightOdds DWCS event pages via `research/bfo/scrapeDwcs.ts` | ✅ DWCS closing-odds calibration (research + display). **Sibling of `bfo_odds.csv`, never merged into it** — the UFC backtests' matched pool must not silently change. 68 priced bouts, 2021+ only (2017–2020 pages use BFO's legacy format and don't parse; 2022 absent from BFO); 40 join the canonical bout list — the rest reference bouts missing from the frozen Sherdog data. |

---

## 4. Recency-patch alignment (`recent_ufc_fights.csv`)

This file's **contract** is: *UFC fights newer than anything in `Fights.csv`.*
The upstream builder has historically violated it (stale + duplicate rows), so
`loadData.ts` now **enforces the contract at the load boundary** rather than
trusting the file. For each patch row:

1. **Stale drop** — older than the primary cutoff − 60 days is a scrape error,
   not a gap-fill (a "recency" row dated 2014 / 2022).
2. **Duplicate drop** — same fighter pair (suffix-tolerant name key) within
   ±7 days of a primary fight. These were silently **double-counting** in the Elo
   sweep (e.g. Kamaka 2026-04-04; JDM/Emeev 2022 off-by-one).
3. **ID resolution** — a surviving `sd:` (unmatched) id is resolved by **unique
   name** against the roster, so the new fight attaches to the *real* fighter
   (Junior Tafa, Aaron Pico, Bruno Silva…). Genuinely-new regional fighters not
   in our roster stay `sd:` and are treated as fresh ~1500-Elo opponents.

**Audited result (2026-06-13 file, 47 rows)**: `+23 added, 1 duplicate-dropped,
23 stale-dropped, 5 ids name-resolved`. Watch the
`[loadData] recency patch:` log line after any refresh.

> Because this removes real double-counts, ratings shift very slightly vs the old
> behaviour (WW #1 Makhachev 79.01 → 78.98). Regenerate the validation snapshot
> (`validation_elo_*.txt`) after a data refresh.

---

## 5. Nationality & photos — *build-time media pipeline* (BUILT)

The primary CSVs carry no nationality/photo, so these are sourced separately by
two build-time scripts and joined to the registry by `canonical_id`. Display
only — never touches the Elo/scoring path; attached at the API boundary
(`src/lib/fighterMedia.ts` → `attachMedia`) and in the profile assembler.

### A. Wikidata — nationality + licensed portrait
`scripts/registry/buildMedia.ts` → `data/canonical/fighter_media.csv`. One SPARQL
call, joined to the registry on **Sherdog ID (P2818)** — a precise id↔id join, not
fuzzy names. Captures `nationality` (P27 → flag), a Commons portrait (P18,
CC/PD-licensed), and the **UFC athlete id** (P9722). Coverage ≈ nationality 65%,
licensed photo 21% of the full registry.

### B. UFC.com — standardised athlete photos
`scripts/registry/buildUfcPhotos.ts` → `data/canonical/ufc_photos.csv`. Pulls
UFC.com's full-body + headshot PNGs for every **ranking-eligible** fighter (3+
fights). Slug source per fighter: the Wikidata `ufc_id` if present, else a slug
**derived from the name** (`Sean Strickland` → `sean-strickland`) — deliberately
independent of the Sherdog crosswalk, so big names with no crosswalk row (Jones,
Strickland, Chimaev…) are still covered. Minimal-errors guards: name-match on the
image filename (stricter both-name match for derived slugs), live 200/`image/*`
check before writing, and resumable checkpointing. Coverage ≈ 58% of the full
registry (0 broken/dead URLs by construction).

**Combined** ≈ 63% of all fighters get a real photo (higher among ranked
fighters: ~69% photo / ~81% flag for the 3+-fight pool); the rest fall back to
initials avatars. The photo cascade is UFC headshot → Commons → UFC full-body.

> ⚠️ **Licensing**: Commons images are reusable; the UFC.com images are
> copyrighted (fine for private use, a real exposure if this goes public).
> **Residual gap**: a fighter resolved by *derived UFC slug* gets a photo but no
> flag (nationality still comes only from Wikidata). Re-run either script to
> refresh; `buildUfcPhotos.ts --retry-failed` retries the misses.

---

## 6. Fighter ages — *build-time DOB pipeline* (BUILT 2026-07-02)

`scripts/registry/buildAges.ts` → `data/canonical/fighter_dob.csv` (+
`ages_coverage.txt`). Age curves matter for evaluation/projection and the
primary CSVs carry no DOB, so this pass fills it from two sources, in order:

1. **Wikidata P569** via the Sherdog fighter ID (P2818) — the same precise
   ID↔ID join the media pipeline uses (no fuzzy names). `timePrecision` kept:
   day/month/year (year-precision ages display as `~34`). A **guarded
   name/alias fallback** (registry `fighter_aliases.csv`, unambiguous on both
   sides) catches fighters with no local crosswalk row. Deliberately NO
   `skos:altLabel` subquery — it 504s WDQS.
2. **Sherdog profile pages** (`itemprop="birthDate"`), read from the existing
   scrape cache at zero network cost; `--fetch` politely fetches missing
   *active* fighters (capped, cached).

**Every candidate DOB is validated against the fighter's own career**: debut
age 16–47, last-fight age ≤ 55 (catches namesakes and Wikidata placeholder
dates; known false positive: Ron van Clief, genuinely 51 at UFC 4). Coverage:
**89% of the registry, 90% of active fighters, ~96% of the ranked pool.**
Refreshed weekly by the ingest workflow (`--fetch`, non-fatal). Runtime:
`src/lib/fighterAges.ts`, computed-at-request age — **display + trend-read
context only, never in the scoring path**.

---

## 7. Ask-the-Analyst chat — *Anthropic API* (BUILT 2026-07-02, runtime)

`/api/chat` (`src/app/api/chat/route.ts`) is the app's **only external
runtime call** (the Octagon rankings fetch is build-time). It streams a
conversation with `claude-sonnet-5` via `@anthropic-ai/sdk`; the model starts
with zero fight facts and grounds every claim through tools
(`src/lib/agent/tools.ts`) that wrap the same display-path accessors the UI
reads (`enrichCards`, `getFighterProfile`, `getAdvancedStats`, Elo win
probability, fighter search). **Read-only over our data**: nothing flows back
into Elo/scoring, and `rankingConfig` tunables are never exposed to the model
or the user. Requires `ANTHROPIC_API_KEY` in `.env.local` (missing key →
graceful 503; the chat panel explains itself). Guardrails: in-memory rate
limit (20 req / 5 min / IP), ≤8 tool round-trips per turn, capped history.
Prompt caching (system + tool definitions) keeps per-message cost low.

---

## 8. One-line summary

| Layer | Source | Type | In the running app? |
|-------|--------|------|---------------------|
| Core stats/fights | UFC.com (`scrape_ufc_stats`) → local CSV | local | ✅ every request |
| Official rankings | ufc.com/rankings (Octagon fallback) → committed `official_rankings.csv` | local (build-time snapshot) | ✅ reads snapshot; live fetch = fallback only |
| Recency top-up | ufcstats.com scrape → CSV (was Sherdog, dead 2026-07-05) | external (build) | ✅ loaded (contract-guarded) |
| Upcoming cards | ufc.com/event scrape → `upcoming_fights.csv` (was ufcstats, 2026-07-09) | external (build) | ✅ order + section split; display-only |
| Pre-UFC pedigree | Kaggle/Sherdog (frozen 2021) | local | ✅ enabled seed (bounded ≤25 Elo, tapers out by 6 UFC fights) |
| Nationality / flags | Wikidata (P27) | external (build) | ✅ ~65% (initials/none fallback) |
| Photos | Wikidata Commons + UFC.com | external (build) | ✅ ~63% combined (initials fallback) |
| Ages / DOB | Wikidata (P569) + Sherdog profiles | external (build, weekly) | ✅ 89% (~96% ranked); display only |
| Analyst chat | Anthropic API (`claude-sonnet-5`) | external | ✅ runtime (`/api/chat`, needs `ANTHROPIC_API_KEY`) |

---

## 9. Name resolution — Octagon/UFC.com names → CSV fighter ids

The Octagon API returns fighter names as strings scraped from UFC.com; our CSVs
use their own format. They will not always match exactly and are reconciled by
`src/lib/nameResolver.ts` (`resolveNameToId()`):

1. exact match → 2. normalized match (lowercase, strip accents, strip
punctuation) → 3. last-name + first-initial → 4. no match: log a warning,
return null (the fighter gets no official seed and falls back to pure
computed rating). Diagnostic: `src/lib/auditOfficialMatches.ts` reports which
official names resolve.

**Expected Octagon JSON shape** (division keys are title-cased strings matching
UFC's naming; champion is `rank: "C"`; ranks are strings `"1"`–`"15"`):

```json
{
  "Lightweight": [
    { "rank": "C", "name": "Islam Makhachev", "record": "26-1-0" },
    { "rank": "1", "name": "Charles Oliveira", "record": "34-10-0" }
  ]
}
```

**Known UFC.com name quirks** handled in normalization: accents stripped
(`Renato Moicano` vs `Moicaño`), hyphenated/shortened names (`Ian Machado
Garry` vs `Ian Garry`), nicknames embedded in the name field, middle names
sometimes included. Name-particle fighters (de/da/do/van/von/dos…) may be
capitalized differently or dropped entirely on UFC.com — add discovered
mismatches to the override map in `nameResolver.ts`.

**Flagged fighters from the dataset scan** (29 names with particles or 4+ words
most likely to mismatch): Da'Mon Blackshear, Henrique da Silva, Ariane da
Silva, Alex Da Silva, Yorgan De Castro, Geraldo de Freitas, Philip De Fries,
Chris de la Rocha, Montana De La Rosa, Mark De La Rosa, Mike de la Torre,
Rodrigo de Lima, Edilberto de Oliveira, Jorge de Oliveira, Isabela de Padua,
Gloria de Paula, Germaine de Randamie, Reinier de Ridder, Tiago dos Santos e
Silva, Carls John De Tomas, Da Woon Jung, Marcos Rogerio de Lima, Douglas
Silva de Andrade, Joshua Van, Mike van Arsdale, Matt Van Buren, Ron van Clief,
Jason Von Flue, Elizeu Zaleski dos Santos.
