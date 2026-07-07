# Roadmap — phases, community layer, rendering strategy

> Status: **ACTIVE.** Extracted from CLAUDE.md 2026-07-07. Current-state feature map lives in
> CLAUDE.md; algorithm spec in `docs/ALGORITHM.md`; dated build history in `docs/CHANGELOG.md`.

## Phase status

- **Phase 1 — Core rankings: ✅ DONE.** Top 40 per division, division tabs + Men/Women toggle,
  fighter profile data zone, "why this rank" explainer. (Rank-history sparkline: built then cut
  2026-07-05 as redundant with the Gauntlet — see CHANGELOG. Any future rank view should
  differentiate, e.g. a tiny inline hero sparkline in rank units, not a second big chart.)
- **Phase 2 — Discovery & depth: partial.** ✅ /compare, ✅ /prospects, ✅ division depth heatmap.
  ⬜ "Slept on" tag — needs community scores.
- **Phase 3 — Community layer: ⬜ NOT STARTED.** See design below.
- **Phase 4 — User-facing filter system: ✅ DONE.** Era / Finish / Recency / Activity sliders
  re-run the real algorithm server-side (`filters.ts`); neutral = house algorithm.
- **Phase 5 — Specialty leaderboards: mostly done.** ✅ P4P, ✅ Finishers/Knockouts/Submissions/
  Strikers/Grapplers (sample-weighted), ✅ durability (shipped as the profile durability panel —
  absorption IS derivable, `STR_1/2` covers both corners; the old "no absorption data" blocker was
  wrong). ⬜ All-time rankings — algorithm on historical snapshots (2010/2015/2018/2020).
- **Phase 6 — Broader data: in progress.** ✅ pre-UFC pedigree seed enabled; ✅ recency top-up
  active (ufcstats.com). ⬜ Promotion sub-ranking for new UFC entrants.

## Phase 3 — Community layer (Courtside architecture)

Rankings are the **product**; community is the **personality layer** on top. The two zones stay
architecturally separate — the algorithm is never influenced by community input.

Two zones per fighter profile:

- **Data zone** (algorithm-generated, read-only for users): rankScore breakdown / "why this rank",
  fight history with per-fight scores, stat radar, rank history timeline, head-to-head compare.
- **Community zone** (user-contributed, moderated): comments and fight breakdowns, upvoted notable
  win callouts, prediction threads when a fight is announced (scored after the fight), community
  confidence vote — Overranked / About Right / Underranked — displayed *alongside* the algorithmic
  rank, never replacing it.

Database requirements (when Supabase is added; auth via Supabase + Clerk):

- `users` — auth, username, avatar
- `comments` — fighter_id, user_id, body, upvotes, timestamp
- `confidence_votes` — fighter_id, user_id, vote (over/right/under)
- `predictions` — fight_id, user_id, predicted_winner, correct bool scored post-fight

## Rendering strategy — ISR (implemented)

ISR with 24-hour revalidation (`export const revalidate = 86400` on rankings pages + API routes).
Not fully static (rankings would only update on redeploy); not fully dynamic (the scoring engine is
CPU-heavy). Pages serve statically and regenerate in the background daily, so CSV/official-rankings
refreshes are picked up within a day without a redeploy. The official rankings are read from the
committed `data/official_rankings.csv` snapshot, so there is no runtime Octagon fetch to cache; the
only runtime external call is the Anthropic API behind `/api/chat`.

**Open stub:** on-demand revalidation for forced refreshes after a big card — a protected API route
`/api/revalidate?secret=YOUR_SECRET` (Next.js on-demand ISR). Not yet built.
