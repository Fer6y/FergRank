# Sherdog Backfill Plan — Cross-Promotion Context for UFC Fighters

## Goal

Build a **current, multi-promotion fight-history layer** sourced from Sherdog, used to
backfill *context* for the fighters in our UFC dataset and to power **prospect
analysis**. This replaces the frozen 3-org Kaggle file (`pro_mma_fights.csv`,
ends Aug 2021) as the cross-promotion source of truth.

**Non-negotiable framing (unchanged):** UFC in-cage results and performance are
THE ranking signal. Regional / minor-promotion data is *context and research* —
a bounded thin-sample seed for ranked fighters, and a standalone tool for
prospect discovery. It never outweighs UFC performance.

---

## What this fixes vs. the Kaggle file

| Limitation of Kaggle file | Sherdog backfill |
|---|---|
| Only 3 orgs (UFC/Bellator/ONE) | All promotions — DWCS, Cage Warriors, LFA, regional, intl |
| Frozen Aug 2021 | Re-scrapeable, current |
| Misses modern entry path (DWCS/regional) — e.g. Mike Malott | Covers it |
| Only 7.9% of active roster had any data | Targets ~100% of crosswalked fighters |
| No opponent identity (flat names) | Opponent Sherdog IDs → recursive pre-UFC opponent quality |

---

## Hard guarantees (carried over from the pedigree loader)

1. **No duplicates.** Every UFC-org fight from Sherdog is dropped; our base
   dataset is UFC-only, so no fight is counted twice. Enforced in the build step.
2. **Not overexaggerated.** Pre-UFC pedigree stays a bounded, thin-sample-only
   seed (`pedigreeStrength`, capped). It feeds Pass-1 seeding for fighters with
   few UFC fights and decays to irrelevance once the UFC sample grows.
3. **Pre-UFC only (for ranking use).** Only non-UFC fights dated before a
   fighter's UFC debut count toward pedigree. (Full history is still *stored* for
   research/prospect use — the pre-debut filter is applied at ranking-consumption
   time, not at scrape time.)

---

## Be a good citizen (this is the "done right" part)

- **Build-time only, never runtime.** Matches the existing CLAUDE.md rule ("No
  web scraping during runtime"). The Next app only ever reads finished CSVs.
- **Claude does not fetch Sherdog.** `robots.txt` disallows `ClaudeBot`. The
  scraper is *your* script under a generic, identifiable user-agent (with a
  contact string), governed by the `User-agent: *  Allow: /` rule.
- **Rate-limit + backoff.** 1 request / 2–3s, exponential backoff on 429/5xx,
  hard daily cap. ~2,700 fighters at this rate ≈ a couple of hours, run once.
- **Cache raw HTML** to `data/.sherdog_cache/<sherdogId>.html`. Parsing re-runs
  hit disk, never the network. Re-scrape only stale/changed profiles.
- **ToS / content-signals caveat.** Sherdog's robots also carries AI-train/
  AI-input *content signals*. Our use is personal research + analysis (not model
  training, not redistribution of raw data). Keep the cache private, don't
  republish raw Sherdog content, and confirm you're comfortable with their
  acceptable-use for this purpose before a full run.
- **Fallback if you'd rather not self-host the crawl:** the managed
  [Apify Sherdog profile scraper](https://apify.com/richard.biros/sherdog-profile-scraper)
  outputs the same data; swap it in behind the same parser contract.
- **Isolation principle (mirrors `fetchOfficialRankings.ts`).** All Sherdog
  knowledge lives behind one fetch module + one parser module. If Sherdog's HTML
  changes, two files change — nothing else.

---

## Architecture & artifacts

All scripts live under `scripts/sherdog/` (TypeScript, run with `tsx`),
**outside** the Next build path. Outputs land in `ufc-rankings/data/`.

```
scripts/sherdog/
  fetchProfile.ts     ← ISOLATED network layer (UA, rate-limit, cache, backoff)
  parseProfile.ts     ← ISOLATED Sherdog HTML → structured fight rows (cheerio)
  resolveCrosswalk.ts ← our 2,695 fighters → Sherdog IDs (the hard part)
  scrapeFighters.ts   ← drive fetchProfile over the crosswalk, populate cache
  buildContext.ts     ← parse cache → emit the CSVs below (filter/tier/dedup)
  validate.ts         ← golden-set + record-consistency QA

ufc-rankings/data/
  sherdog_crosswalk.csv     ← ourFighterId → sherdogId (+ confidence, evidence)
  sherdog_fights.csv        ← normalized full history (org-tagged, opponent IDs)
  sherdog_orgs.csv          ← rawOrg → canonicalOrg → tier (reviewable dict)
  sherdog_prospects.csv     ← non-UFC fighters' aggregate records (prospect pool)
  .sherdog_cache/<id>.html  ← raw HTML cache (gitignored, private)
```

### Output schemas

`sherdog_crosswalk.csv`
`ourFighterId, fullName, sherdogId, sherdogUrl, matchConfidence, matchMethod, verified, notes`

`sherdog_fights.csv`
`sherdogFighterId, ourFighterId, date, organisation, orgTier, opponentName, opponentSherdogId, result, method, methodDetail, round, time, eventName`

`sherdog_orgs.csv`
`rawOrg, canonicalOrg, tier, matchedBy`  (tier ∈ tier1..tier4 from `RANKING_CONFIG.promotionTiers`)

`sherdog_prospects.csv`
`sherdogId, name, totalW, totalL, topOrg, topTier, lastFightDate, recordVsUFCAlumni`

---

## Phased action list

### Phase 0 — Decisions & setup *(blocks everything)*
- [x] **Tooling:** self-hosted TS + cheerio scraper (`scripts/sherdog/`).
- [x] **Initial scope:** ALL 2,695 fighters (full crosswalk + scrape up front).
- [ ] **Decide refresh cadence:** e.g. monthly + before a major card.
- [x] Add `data/.sherdog_cache/` to `.gitignore`. Add `cheerio` dev-dep.
- [ ] Confirm acceptable-use comfort (see "Be a good citizen").
- [x] **Provide parser fixtures:** 4 saved in `scripts/sherdog/fixtures/`
      (Makhachev=champ, Amosov=crossover, Barbosa=debutant, Malott=mixed past).

### Phase 1 — Isolated fetch + parse layer ✅ BUILT
- [x] `fetchProfile.ts`: rate-limited (2.5s + jitter), cached to disk,
      exponential backoff, custom UA + `SHERDOG_CONTACT`. Profile + search fetch.
- [x] `parseProfile.ts`: cheerio parser → full `SherdogProfile` (id, bio,
      PRO-only fights with opponent IDs, event, method, date). Skips amateur.
- [x] Parser test (`parseProfile.test.ts`): all 4 fixtures pass; records match
      reality (Makhachev 28-1, Amosov 30-1, Malott 14-2-1, Barbosa 18-2).

### Phase 2 — Fighter ID crosswalk *(the hard part — get this right)* — SCAFFOLDED
- [x] **Evidence-based scoring** (`scoreCandidate`): UFC-opponent overlap is the
      decisive signal; name + weight class support. Self-tested — verifies all 4
      fixtures; a wrong-profile negative control correctly REJECTS (sibling trap
      closed). Debutants (≤1 opponent) auto-route to review, never auto-verify.
- [x] Auto-accept `verified`; route ambiguous → `sherdog_crosswalk_review.csv`.
      Tightened: low-ratio common-name partials (e.g. 2/6 "Daniel Santos") need
      strong overlap (≥3 or ≥50%) to auto-verify, else review.
- [x] `parseSearchResults` finalized against real search HTML — scoped to
      `table.new_table.fightfinder_result` (excludes sidebar/featured noise).
- [x] Driver is **resumable + crash-safe**: skips already-recorded fighters,
      appends per-row. Ctrl+C/error loses at most the in-flight fighter.
- [x] Live dry run (5 fighters) verified end-to-end: Arnold Allen 15/15,
      Wellmaker 4/4, Costa 9/10 verified; Doo Ho Choi → review (name variant).
- [ ] Run the full crosswalk over all 2,695 fighters (network; your machine).

### Phase 3 — Scrape & normalize
- [x] Scraping is driven by `resolveCrosswalk.ts` (fills the HTML cache as it
      goes), so a separate `scrapeFighters.ts` isn't needed.
- [x] `buildContext.ts`: parse cache → `sherdog_fights.csv`. Drops all UFC
      fights (dedup guarantee, asserted), tags each fight org→tier from the event
      name, stores FULL non-UFC history (pre-debut filter is a ranking-time job).
      Validated on real data: UFC dropped, 0 leaks, tiers assigned.
- [x] `sherdog_orgs.csv`: every distinct org with fight count; unmapped orgs
      default to tier4 and are flagged `needsReview=true` for audit. To retier a
      promotion (e.g. Invicta/Brave CF → tier3), edit RANKING_CONFIG.promotionTiers
      + add the event-name spelling to ORG_MATCHERS in buildContext.ts.

### Phase 3.5 — Recency top-up ✅ BUILT
- [x] `buildRecencyPatch.ts`: per fighter, emit ONLY Sherdog UFC fights dated
      after their latest fight in `Fights.csv` → `recent_ufc_fights.csv`. No date
      overlap ⇒ no double-count, no source disagreement. Deduped across both
      fighters' profiles; opponents resolved via crosswalk (synthetic id + baseline
      Elo if unknown). Method mapping is a dedicated tested module
      (`methodMap.ts`) → OUR exact DB vocabulary (incl. `TKO - Doctor's Stoppage`,
      DQ, CNC); `methodMap.test.ts` audits the whole cache (0 unmatched / 18.8k
      fights, fails CI if >1% fall through). NC/N-A fights are skipped (no Elo).
- [x] Loader integration: `Fight.source`/`hasMetrics` flags; `loadRecentPatch()`
      appended in `loadAllData` (no-op when the file is absent); metrics composite
      fenced to `hasMetrics !== false`. Patch fights feed Elo/SoS/recency only.
- [x] Verified: file-absent = identical rankings; sample run pulled 22 genuinely
      new June-2026 UFC bouts; all flagged Elo-only; must-match still green.
- [ ] Regenerate `recent_ufc_fights.csv` after the full crawl (it's per-fighter,
      so a partial crawl yields a partial patch — run it once the crosswalk is done).

### Phase 4 — Ranking integration (bounded, UFC-first)
- [ ] Upgrade `loadMultiPromotion.ts`: add Sherdog as a source (config switch),
      reuse the 3 guarantees. Keep Kaggle path as fallback/cross-check.
- [ ] Wire `pedigreeStrength` as a **thin-sample-only Pass-1 seed** in the Elo
      engine: fires only under `metricsConfidenceMinFights` UFC fights, bounded,
      decays out as UFC fights accrue. (Separate, reviewable commit.)
- [ ] **v2 (optional):** recursive pre-UFC opponent quality — a Bellator/regional
      win over an opponent who later reached/was-ranked-in the UFC counts more
      than one over a pure regional. Enabled by opponent Sherdog IDs.

### Phase 5 — Prospect tool (the research payoff)
- [ ] Emit `sherdog_prospects.csv`: non-UFC fighters (the unmatched pool) with
      aggregate records, top org/tier, recency, and **record vs. UFC alumni**
      (did they beat people who made the UFC?).
- [ ] Surface as the Phase-2 "Prospect watchlist" — fighters dominating
      Cage Warriors / LFA / DWCS who aren't in the UFC yet.

### Phase 6 — Validation & maintenance
- [ ] `validate.ts` golden set: Amosov (7-0 Bellator), Chandler, Patricio vs
      Patricky Freire (collision test), Malott (must now show DWCS/regional),
      a DWCS grad, a Cage Warriors champ.
- [ ] Record-consistency check: scraped pre-UFC W-L vs known totals; flag
      large deltas.
- [ ] Reports: unmapped-org list, low-confidence-match list, fighters with zero
      pre-UFC history (sanity).
- [ ] Document the re-scrape runbook + cadence.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Wrong-profile match (siblings/namesakes) | Evidence-based crosswalk + manual review queue; never name-only |
| Sherdog HTML changes | Isolated fetch/parse modules; fixture tests catch breakage |
| Over-crediting regional records | Tier multipliers + bounded thin-sample-only seed + cap |
| Rate-limiting / blocking | Slow polite crawl, cache, backoff, run once + incremental |
| ToS / content-signals | Personal research use, private cache, no raw redistribution |
| Scope creep | Phase scope to active+debutants first; backfill rest later |

---

## Definition of done (v1)

- Verified crosswalk for the in-scope fighters, with a reviewed ambiguous list.
- `sherdog_fights.csv` populated, org-tiered, UFC rows excluded, opponent IDs present.
- `loadMultiPromotion` consuming Sherdog; golden-set validation passing.
- Pedigree seed wired as thin-sample-only and shown not to move established
  fighters (Malott-type with 5+ UFC fights unchanged).
- `sherdog_prospects.csv` produced for the watchlist.
