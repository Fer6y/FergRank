# Plans index

Implementation plans and design docs, moved here from the repo root (2026-07-07).
Statuses below are authoritative; a plan's own internal status header may be staler.
The current algorithm spec lives in `docs/ALGORITHM.md`; dated history in `docs/CHANGELOG.md`.

| Plan | Status |
|---|---|
| `ALGORITHM_PATCH.md` | **HISTORICAL — SUPERSEDED.** v1 additive-model tuning patch. The v1 model failed validation 2026-06-12 and was replaced by Elo. Do not implement from it; its config keys no longer exist. Kept as the record of how v1 was tuned and why it died. |
| `SHERDOG_BACKFILL_PLAN.md` | **COMPLETE / HISTORICAL.** The pipeline was built (`scripts/sherdog/`) and ran until Sherdog's Cloudflare edge began hard-blocking all non-browser clients (2026-07-05). Weekly recency + upcoming now come from ufcstats.com (`scripts/ufcstats/`); Sherdog is fully out of the weekly pipeline (2026-07-06). The scraped CSVs (`sherdog_fights.csv` etc.) remain in active use as frozen pedigree/crosswalk data. |
| `PROSPECT_PEDIGREE_PLAN.md` | **COMPLETE.** Parent plan for Workstreams A + B. A built 2026-07-03; B.1 built 2026-07-03; B.2 deliberately not built (gated on B.1 delivering measurable gain — it didn't). |
| `PROMOTION_GRADING_PLAN.md` | **COMPLETE.** Workstream A (empirical promotion grading + feeder attribution) built 2026-07-03. |
| `PREUFC_SOS_PLAN.md` | **COMPLETE (B.1) / B.2 DEFERRED.** B.1 (pre-UFC opponent SoS) built 2026-07-03. B.2 (separate firewalled pre-UFC Elo sweep) deliberately not built — see §3, which gated it on B.1 delivering. |
| `AGENT_PLAN.md` | **PHASE 1 COMPLETE / PHASE 2 OPEN.** "Ask the Analyst" phase 1 built 2026-07-02 (site-wide dock). Phase 2 (web search / odds discourse) not started. |
| `SCORECARD_BOT_PLAN.md` | **ACTIVE — DESIGN, not yet built.** Live model-vs-market prediction ledger (`research/scorecard/`, behind the odds firewall). |
| `PROMOTION_TIERS_REVIEW.md` | **QUEUED — not started (2026-08-11).** Regional-scene strength review of `promotionTiers`: is ONE Championship (tiered 0.68, grades 0.9467 — worst in the table) and the Japanese scene over-tiered vs US/Euro regionals? Road to UFC verified already at the 0.35 default, not tier 1. Evidence + pre-registered gate inside. |
| `CAREER_STAGE_PLAN.md` | **QUEUED — next session (2026-08-12).** Prospect career-stage metric (pro debut + fight count + chronological age). DOB source found + verified: ESPN's open core API (38k MMA athletes incl. regionals; Hasan's DOB matches hand-verified age). Harvest plan + pre-registered validation bar inside. |
| `DWCS_PLAN.md` | **ACTIVE — IN PROGRESS (2026-08-11).** Contender Series analysis: cohort dataset, prospect/record-shape/promotion backtests, DWCS closing-odds crawl + calibration, `/contender-series` page. Pre-registration doc — hypotheses + the Phase-E model-change bar were committed before any backtest ran. |
| `ROADMAP.md` | **ACTIVE.** Product phases, the community-layer (Phase 3) design, and rendering strategy notes. |
