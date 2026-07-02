# Data Sources & Provenance

How every piece of data in this app originates, how fresh it is, and how the
sources are kept in alignment. Audited 2026-06-13.

The app is **local-first**: rankings are computed entirely from CSVs in this
folder. There is exactly **one external network call at runtime** (official UFC
rankings) and **one external scrape at build time** (Sherdog). Everything else
is a local file.

---

## 1. External sources (the only data we pull from outside)

### A. Octagon API — *runtime*, the single live dependency
- **URL**: `https://api.octagon-api.com/rankings`
- **What**: official UFC rankings — champion + top-15 per division.
- **Used for**: the "vs UFC" trend chips, division membership, a small official
  seed (≤ +50 Elo) and post-sort safety floors. It does **not** drive the core
  rating — Elo does.
- **Freshness**: fetched on demand, cached **24 h** in-process.
- **Resilience**: isolated in `src/lib/fetchOfficialRankings.ts`. On any failure
  it returns `{}` and the app degrades gracefully to **pure Elo** (no crash, no
  trend chips). Swap that one file if the API ever changes.
- **Known misalignment (handled)**: the API lags real title changes. Stale
  champions are corrected in `RANKING_CONFIG.divisionOverrides` (e.g. Makhachev
  at WW, Pereira at LHW, Chimaev at MW, Van at FLW, Dern at WSW). Re-audit after
  each card with `scripts/sherdog/championAudit.ts`.

### B. Sherdog — *build-time scrape*, never hit by the running app
- **URL**: `https://www.sherdog.com` (fighter profiles + fight-finder).
- **Scraper**: `scripts/sherdog/fetchProfile.ts`, cached under
  `data/.sherdog_cache/` so re-runs don't re-hammer the site.
- **Produces**: `recent_ufc_fights.csv`, `sherdog_fights.csv`, `sherdog_orgs.csv`,
  `sherdog_prospects.csv`, `sherdog_crosswalk*.csv`.
- **Caveat**: a live scrape of a third-party site — subject to their ToS / markup
  changes / rate limits. It is a **pipeline**, run manually, not a runtime call.

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

> 📌 Note: `CLAUDE.md` still quotes the older snapshot (8,713 fights, dates to
> 2025-12-06). The data has since been refreshed to 2026-05-16; treat the numbers
> here as current.

---

## 3. Supplementary data (pre-UFC / recency / context)

| File | Origin | Status |
|------|--------|--------|
| `recent_ufc_fights.csv` | Sherdog recency top-up | ✅ **active** — keeps Elo current past the `Fights.csv` cutoff (see §4) |
| `sherdog_fights.csv` | Sherdog full history | ⚠️ pedigree **seed disabled** (`preUFCPedigree.seedEnabled = false`); crosswalk/context only |
| `sherdog_crosswalk.csv` | Sherdog ↔ our-id map (2,240 rows) | ✅ maps Sherdog ids to our roster |
| `sherdog_orgs.csv`, `sherdog_prospects.csv` | Sherdog | context / prospect watchlist (not wired into core) |
| `pro_mma_fights.csv` | **Kaggle/Sherdog**, frozen ~Aug 2021 | ⚠️ pre-UFC pedigree, behind disabled toggle |

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

## 7. One-line summary

| Layer | Source | Type | In the running app? |
|-------|--------|------|---------------------|
| Core stats/fights | UFC.com (`scrape_ufc_stats`) → local CSV | local | ✅ every request |
| Official rankings | Octagon API | external | ✅ runtime (cached 24h, 1 call) |
| Recency top-up | Sherdog scrape → CSV | external (build) | ✅ loaded (contract-guarded) |
| Pre-UFC pedigree | Kaggle/Sherdog (frozen 2021) | local | ⚠️ disabled toggle |
| Nationality / flags | Wikidata (P27) | external (build) | ✅ ~65% (initials/none fallback) |
| Photos | Wikidata Commons + UFC.com | external (build) | ✅ ~63% combined (initials fallback) |
| Ages / DOB | Wikidata (P569) + Sherdog profiles | external (build, weekly) | ✅ 89% (~96% ranked); display only |
