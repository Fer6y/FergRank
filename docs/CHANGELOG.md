# Changelog — dated history & superseded decisions

Newest first. This is the project's memory: how each mechanism got here, what was tried and cut,
and the diagnosis that motivated each change. The **current-state** algorithm spec lives in
`docs/ALGORITHM.md`; values quoted here are the values *at the time of the change* and may have
drifted since — `src/lib/rankingConfig.ts` is always the source of truth for current values.

**Validation snapshots** (`ufc-rankings/validation_*.txt`) are committed evidence tied to entries
below; leave them where they are — scripts diff against them.

---

## 2026-08-09

- **REFUTED: refunding the weight-move decay on a division-debut win over a ranked opponent.
  Negative result; no scoring change shipped.** Prompted by a real and correctly-observed
  eyesore — Islam Makhachev, on a 16-fight win streak, beats Jack Della Maddalena at UFC 322 and
  his Elo lands *lower* than before the bout. The trace decomposes it exactly: 1667.3 after
  Moicano → **−8.5** inactivity (9.9-mo layoff, 4.9 mo past the 5-mo grace) → **−15.9** move
  decay (10% of his 159 above the mean) → **+10.6** for the win → 1653.5, net **−13.8**. The win
  itself is unambiguously positive; the drop is charged before the opening bell.
  **Three independent reasons the proposed fix fails.** (1) *Prevalence*: of 828 first-entries
  into a division, 413 were wins and only **15** netted a rating loss — and of the 3 that were
  wins over a ≥1560 opponent, two (GSP 2017, Jon Jones 2023) are dominated by multi-year layoffs
  and stay at −82 / −49 with the decay stripped entirely. Makhachev is the **only** case the gate
  would rescue. (2) *It doesn't even fix the visual*: the measured counterfactual with zero decay
  is **+1.6**, i.e. flat, not the rise the complaint wants. (3) *Firewall + double-count*: a
  "top-15 opponent" gate would inject the official board into `eloEngine.ts`, which by design
  knows nothing about it, and would price opponent quality a second time on top of
  `elo.winQualityGate` (JDM at 1602 is above `winQualityFullElo`, so the win already took full
  credit).
- **New negative-result harness: `research/backtest/moveDecay.ts`.** Settles the knob rather than
  the anecdote: re-runs the **full** Elo sweep at `moveDecayPenalty` ∈ {0, .05, .10, .15, .20}
  (a counterfactual patching only the one fight would measure something else) and scores
  division-debut bouts against the de-vigged BFO close. Result: logloss falls **monotonically as
  the penalty rises** (n=140: .6791 → .6730; strong subset n=15: .7575 → .7078) — the data points
  *away* from a refund. **But the gain is calibration, not information**: refit one temperature
  per arm and they collapse to within **0.004** logloss, with best-T falling **1.37 → 1.03** —
  the no-decay model is badly over-confident and the decay is doing the shrinkage job a
  temperature parameter would do. Underpowered as predicted, and the binding constraint was the
  odds join, not the fight count: the earlier "43 bouts" estimate ignored odds coverage, and the
  actually answerable sample is **15** (resolving the observed effect at t=2 needs n≈36). Every arm is
  far behind the market here (LL .675 vs .565) — division debuts are where the engine is weakest,
  a much larger gap than the ~.03 the ranked+overlay model carries on general bouts. Conclusion
  recorded in `rankingConfig.elo.moveDecayPenalty`: 0.10 stays a fiat value the data can neither
  justify nor refute. Two bugs caught while building it, both by disbelieving the output rather
  than by a failing check: `devig()` takes decimal ODDS and inverts internally (passing implied
  probabilities double-inverted them → market accuracy 0.25, ECE 0.52), and the temperature table
  printed NaN for arms evaluated before the baseline.
- **The Gauntlet now explains the dip — `BEFORE THE BELL` (display fix, zero scoring change).**
  The chart's biggest moves often happen BETWEEN nodes, and nothing said so: a ⚑ MOVED pennant
  marked *that* a fighter changed weight but never that the drop was the move. The info panel now
  carries a row decomposing the pre-bell charge by cause — for Makhachev: `BEFORE THE BELL −24.4
  · ⏸ 9.9-mo layoff −8.5 · ⚑ new weight class −15.9 — charged before the fight, so the line dips
  despite the +11 win`. **The non-obvious part is where the numbers come from.** `FightTrace`
  gained `carryInactivity` / `carryMoveDecay`, written by `prepareForFight()` in the sweep itself,
  so the display *reads the engine's own arithmetic* instead of re-deriving it — a re-derivation
  is free to drift from the engine, a read cannot (same reasoning as `careerSos` reading
  `opponentRating` off the trace). `monthsOut` is measured against the **full** history, not the
  Gauntlet's rated-opponents-only subset, which would overstate the layoff whenever an unrated
  bout sat in between and disagree with the inactivity figure beside it. A guard comment at
  `applyBoundaryDiscount` records that re-enabling `elo.maxFightAgeYears` would need a third carry
  bucket or the row silently under-reports. The row hides below a 1-Elo charge.
  **Verified in the running app, not by inspection**: on Makhachev's profile the row renders the
  numbers above, matching an independent hand-derivation of the inactivity math
  (`0.88^(4.9/12) = 0.9491` → 1658.79 → 1642.91) to 0.1 Elo; the layoff-only node (Moicano,
  −4.3, no weight-move part and no "despite the win" clause) and the hidden case (Moises, 4.4-mo
  gap inside the grace → row absent) both behave correctly; zero console errors. **Golden master
  PASSES unchanged** — the right outcome for a trace-only change. Typecheck, lint, all 5 suites
  and build pass.

---

## 2026-08-05

- **Validation snapshot regenerated → `validation_elo_2026-08-05.txt`** (new reference; CLAUDE.md
  updated). The previous reference, `validation_elo_2026-07-07.txt`, was a month stale — predating
  three backfilled cards, the 2026-08-03 override removal and the dedup fix — and it had a **failing
  assertion baked into it**: `❌ SOME MUST-MATCH NAMES FAILED`, which was the false Shavkat
  Rakhmonov ❌ fixed on 2026-08-03 (he had dropped off the UFC top 15, which can't test name
  resolution). The new snapshot reads `✅ ALL MUST-MATCH NAMES RESOLVED` (Shavkat correctly
  reported as `NOT ON OFFICIAL LIST — skipped`), `✅ FinalRating strictly descending`, **0
  UNMATCHED** names across all 11 divisions, and 8,805 fights vs 8,755 (+50 net: the backfill less
  the 2 de-duplicated bouts — the `3 duplicate-dropped` load line is visible in the header).
  Movement vs the old reference is broad and small, consistent with a month of new results plus
  inactivity decay: 26–28 of ~38 shared names shift in each of LW/WW/BW with 2–3 entries/exits per
  division. The one change verified against a known cause is **Daniil Donchenko WW #15 → #24**,
  matching the dedup measurement exactly. Not every individual move was chased — the golden master
  is the regression guard; this file is committed evidence and a diff target.

- **/prospects: climb rate added as an OPT-IN sort view — default stays raw Elo.** The 2026-08-05
  backtest refuted climb rate as the *default* ordering; it did not say the ordering has no use.
  This ships it as a second lens with the evidence-backed sort still in front: a `Sort:
  Rating | Climb rate` toggle, defaulting to Rating, with a caveat line shown only while the climb
  view is active ("Rating predicts breakthrough better — this view is for spotting fast starters,
  not ranking them"). Same shape as the existing Pure-Elo toggle on the division FilterBar.
  **Client-side, deliberately.** A `?sort=` searchParam would have made /prospects a dynamic route
  and cost its ISR caching, and the ranking pass is far too CPU-heavy to run per request — the
  build output confirms the page stays `○` static with `revalidate` intact. Re-ordering ~100
  pre-computed entries in the browser is free.
  **The non-obvious part is where the slice happens.** `buildProspectWatchlist()` now returns the
  FULL pool per tier (89 prospects / 12 newcomers) instead of pre-slicing to `listLimit`, and the
  client sorts *then* slices. Slicing server-side by Elo first would have pre-filtered on the
  default key and hidden exactly the low-fight-count risers the climb view exists to surface —
  the toggle would have reordered 20 names and shown nothing new. Measured: the rating view has
  **0** fighters with ≤2 UFC fights in its top 20; the climb view has **2**, and surfaces 3 names
  the rating view never shows (Ethyn Ewing n=2, Damian Pinas n=2, Jacobe Smith n=3).
  New `climbShrinkK` (3) in `rankingConfig.prospects` carries the k-vs-convergence tradeoff the
  backtest measured (ρ 0.472 at k=1 → 0.511 at k=5, converging toward raw Elo) so the next reader
  sees why a low k is right for a *view* and wrong for a default. Verified in the browser, not just
  by build: clicking the toggle reorders to exactly the ordering computed offline, `aria-pressed`
  tracks, the caveat shows/hides, it round-trips back to Rating, 32 cards render, zero console
  errors. Golden master passes unchanged; typecheck, lint, all 5 suites and build pass.

- **`/api/chat` no longer ends a turn silently — the stop-reason gap closed, and it was wider than
  first reported.** The SDK bump below flagged the new `model_context_window_exceeded` stop reason
  falling through the route's `break`. Reading the whole block found **three** silent-stop paths,
  not one, and the one actually reachable today was missed in that first pass: **`max_tokens`**.
  At `MAX_TOKENS = 4096` per iteration a long answer simply stopped mid-sentence with nothing to
  distinguish it from a finished reply — `model_context_window_exceeded` (needs 1M tokens) and
  tool-loop exhaustion (8 straight `tool_use` iterations, ending on a trail of tool labels and no
  answer) are the rarer two. Each now sends a plain-prose notice on the `text` channel, which is
  the channel the client appends inline (`error` would have replaced the partial reply instead of
  completing it); `whitespace-pre-wrap` on the assistant bubble renders the `\n\n` separator, and
  the notices avoid markdown because `AnalystDock` renders `{m.content}` as plain text.
  **The load-bearing part is the final `else`, not the enumeration:** an unrecognized stop reason
  now degrades to a visible message plus a `console.warn` rather than silence. Enumerating today's
  reasons alone would let the *next* SDK addition regress this exactly the way this one did.
  **Verified live, not by inspection:** temporarily setting `MAX_TOKENS = 64` and asking for a long
  answer produced a real mid-sentence cut followed by the notice; restoring 4096 and re-running a
  normal tool-using turn (3 tool calls) confirmed no false-positive notice on `end_turn`. The other
  three arms are typecheck- and inspection-verified only — `model_context_window_exceeded` and an
  unknown stop reason can't be provoked from the API, and forcing loop exhaustion would need a
  contrived tool. Typecheck, lint, all 5 suites and build pass.

- **`@anthropic-ai/sdk` 0.110.0 → 0.115.0 — no breaking changes, verified against a live call.**
  The one dependency deliberately deferred in the bump below, since `/api/chat` is a live runtime
  path and a 0.x minor can break. It didn't: all **10 releases** across the range are additive —
  **zero** `BREAKING CHANGE` entries and zero removals (read from the changelog bundled in the
  published tarball, not inferred). Every new feature lands on a surface this app doesn't touch:
  Managed Agents, MCP Tunnels, mid-conversation tool addition/removal blocks, server-side fallback
  credit, `claude-opus-5` as a model constant. Two entries do matter: 0.115.0 fixes a leak — abort
  listeners are now released when requests settle, which is exactly the pattern `/api/chat` uses
  (`AbortController` + `{ signal }` on a long-lived stream) — and 0.114.0 adds the
  `model_context_window_exceeded` stop reason (see the note below).
  **The route needed no migration**, confirmed by reading it rather than assuming: it already uses
  the non-beta `client.messages.stream()`, `output_config: { effort: 'medium' }` (correctly nested,
  not top-level), a single `cache_control` breakpoint on the last system block, and
  `claude-sonnet-5` — a current ID. It carries none of the removed surfaces that 400 on Sonnet 5:
  no assistant prefill, no `budget_tokens`, no `temperature`/`top_p`/`top_k`. It already handles
  `pause_turn` and `refusal`, echoes full `response.content` (thinking blocks included) between
  iterations, and returns all tool results in ONE user message.
  **Verified by live call, not just typecheck** — types alone can't prove a streaming tool loop:
  a real request through `/api/chat` returned HTTP 200 with **3 tool calls** across loop iterations
  (`get_fighter` ×2 → `compare_fighters`), 8 streamed text deltas, a clean `done`, a grounded reply
  citing real engine numbers, and zero server errors. Typecheck, lint, all 5 unit suites, golden
  master and build all pass; `npm audit` stays clean in both scopes.
  **Known gap, not fixed:** the route's `stop_reason` handling breaks on anything outside
  `tool_use`/`pause_turn`/`refusal`, so the new `model_context_window_exceeded` ends the turn
  silently rather than telling the user the conversation outgrew the window. Harmless today (the
  1M window and the capped tool loop make it unreachable in practice) and left alone deliberately —
  worth a branch if the Analyst ever grows long-running sessions.

- **`npm test` now runs the recency-merge regression — and 4 orphaned suites triaged.** The
  dedup fix above shipped with its regression test in `scripts/sherdog/recencyMerge.test.ts`,
  which `npm test` never ran (it was `engine && scoring && display` only) — a guard that executes
  nowhere protects nothing. Audit found **six** `.test.ts` files outside the script, not one, so
  they were triaged rather than bulk-added: `recencyMerge` and `extendCrosswalk` are pure unit
  tests (inline fixtures, no file I/O, no cwd dependence) and are now **in `npm test`**; the other
  four are **deliberately excluded** and moved to a new `npm run test:local`, because they are not
  CI-safe — `parseProfile` / `parseEvent` / `resolveCrosswalk` read `scripts/sherdog/fixtures/*.html`
  with an unguarded `readFileSync`, and that directory is **git-ignored**, so on a fresh checkout
  they would THROW and break the build; `methodMap` reads the git-ignored `data/.sherdog_cache/`
  and hits an early `process.exit(0)` when it finds nothing, i.e. it would pass while testing
  nothing. Both failure modes are worse than leaving them out — one breaks CI, one manufactures
  false confidence. Verified by **negative control**, not just a green run: injecting a failing
  assertion into `recencyMerge.test.ts` makes `npm test` exit 1, and it returns to 0 on restore,
  so the new suites genuinely gate. All 5 CI suites and all 4 local suites pass.

- **Dependencies: `npm audit` clean in BOTH scopes (was 3 high in production).** The audit found
  postcss 8.5.15 exposed to two advisories newer than the 2026-07-07 override
  (GHSA-r28c-9q8g-f849 + GHSA-fxqj-rqcc-2cmp, sourceMappingURL path traversal → arbitrary .map
  disclosure), and sharp 0.34.5 carrying 4 libvips CVEs. The route to the sharp fix was not an
  override: **next@16.2.10 declares `sharp: ^0.34.5`**, so forcing 0.35.x would have violated its
  constraint — but **next@16.3.0 declares `sharp: ^0.35.3`**, the patched line. So the framework
  bump IS the sharp fix. Bumped next + eslint-config-next 16.2.10 → **16.3.0** (sharp 0.34.5 →
  **0.35.3**). The postcss override survives the bump and was raised `^8.5.10` → **`^8.5.25`**:
  16.3.0 still only bundles 8.5.23 (and 16.2.10 pinned an exact 8.4.31, which is why the override
  exists at all). `npm audit fix` then cleared three dev-only transitives via semver-compatible
  patches — undici 7.28.0 → 7.29.0 (via cheerio, the build-time scrapers), js-yaml → 4.3.1 and
  brace-expansion → 5.0.9 (both via eslint tooling); each had an in-range fix, so no `--force` and
  no parent constraint broken. Patch bumps alongside: react/react-dom 19.2.7 → 19.2.8, tailwindcss
  + @tailwindcss/postcss 4.3.2 → 4.3.3, @types/react(-dom).
  **Verified on 16.3.0** — the framework bump is the real risk here, and `AGENTS.md` flags this
  Next as diverging from training data: typecheck, lint, all three unit suites, the recency-merge
  test and the golden master all pass; build emits the same 26 routes with ISR strategies
  unchanged; runtime-checked 10 routes + the dynamic `/fighter/[id]` page and `/api/fighter/[id]`
  (Next 16's awaited-`params` surface) all 200 with correct content, zero server errors, homepage
  renders. **Deliberately NOT bumped** (majors/SDK, each a separate decision with real
  breaking-change risk): typescript 5.9.3 → 7.0.2, eslint 9 → 10, @types/node 20 → 26, and
  @anthropic-ai/sdk 0.110 → 0.115 (a 0.x minor on the live `/api/chat` path).

- **REFUTED: replacing the /prospects raw-Elo sort with climb rate. Negative result, no change
  shipped.** The audit observed that the sort key's attainable ceiling scales with UFC fight
  count — measured max Elo by fights-at-window: **1516 (n=1), 1548 (n=2), 1547 (n=3), 1570 (n=4),
  1575 (n=5)** against a displayed-20th cutoff of ~1538 — so all 19 one-fight fighters in the
  100-strong pool were categorically unreachable on a top-20 page, and `climbPerFight` was
  computed and displayed but never ordered on. The proposed fix was a shrunk climb rate
  ((elo−1500)/(n+k)). **The held-out backtest killed it.** Cohort: fighters inside the window
  with a winning record as of T who fought again after (n=112 at T=2023-08-05, n=118 at
  T=2024-08-05); point-in-time ratings read straight off `FightTrace.ratingAfter` (a pure read,
  no second sweep — same technique as `careerSos`). Raw Elo@T beat climb and shrunk-climb on
  **every** outcome at **both** horizons, including the fully external one — reaching the UFC's
  own official top 15: **AUC 0.716 / 0.744 (raw Elo)** vs 0.645 / 0.619 (climb) vs 0.702 / 0.718
  (shrunk k=3); later win rate ρ 0.137 / 0.233 vs 0.137 / 0.159; net Elo after T ρ 0.137 / 0.091
  vs 0.103 / 0.010. The external target matters because Elo-today is autocorrelated with Elo@T
  and would flatter the incumbent on its own; the UFC's board is not our engine. Shrinkage only
  ever helped by **converging back toward raw Elo** (k=1 → k=5: ρ 0.472 → 0.511), which is what
  (elo−1500)/(n+k) does as k→∞ — the data was asking to go all the way. Conclusion: the
  fight-count ceiling is **not a defect**; it is Elo correctly encoding evidence, since five
  banked wins predict more than one fast start, and climb rate divides away exactly the signal
  that predicts success. Two further gate catches recorded so they aren't re-proposed: (1) the
  originally-sketched "climb + slate quality" composite would have **double-counted** — opponent
  quality is already inside Elo via the win-quality gate; (2) the veteran detector drafted as
  (age ≥ 32 OR pre-UFC ≥ 15 fights) **false-positived Kevin Vallejos** (24, 15 pre-UFC bouts), an
  unambiguous prospect. Caveats: n≈115 per horizon, the win-rate ρ gaps are small (AUC carries
  the result), and fighters who never fought again are excluded, which drops some of the clearest
  failures. The refuted alternative and these numbers are recorded in `rankingConfig.prospects`
  so the next person doesn't re-litigate it from intuition.

- **/prospects split into PROSPECTS + NEW TO THE UFC — a definitional fix, zero new signal.**
  With the ordering vindicated above, the real complaint about Michael Page (39) sitting at #5
  was never "over-rated" — a predictive metric ranks him highly and is right to. It was that he
  is **not in the category**: the `≤5 UFC fights` gate silently covered two populations. Fixed by
  changing *eligibility presentation*, not scoring — one page, two Elo-ordered lists. The rule is
  **age-primary** (runway is the scouting variable): age ≥ `veteranAgeYears` (32) → newcomer;
  age known and below → prospect regardless of pre-UFC volume, which is what rescues Vallejos;
  age unknown (25 of 100 in the pool) falls back to `veteranPreUFCFightsIfAgeUnknown` (20) and
  otherwise **defaults to prospect**, so missing data never silently demotes anyone. Result: 89
  prospects / 12 newcomers, every newcomer 32+ (Page 39, Amosov 32, Belgaroui 34, Alencar 35,
  Musayev 36 …), Vallejos correctly retained as a prospect. Honest note: the unknown-age fallback
  currently fires for **0 fighters** — it is a guard against the ~25% DOB gap (a missing-DOB Page
  would otherwise land in Prospects), not a load-bearing rule. Removal condition in the config:
  collapse back to one list if fewer than ~3 fighters per refresh land in the newcomer tier.
- **/prospects: draws were being dropped from the displayed record.** `${w}-${l}` ignored draws,
  so Chris Padilla rendered "4-0 UFC" while his own card listed `D · MD vs. MarQuel Mederos`
  directly beneath — he is 4-0-1. Four fighters were misreporting (Padilla, Mederos,
  Abdul-Malik, Bellato); now `4-0-1` when a draw exists. The `w > l` eligibility gate is
  unchanged (a draw is not a win).
- **/prospects magic numbers moved into `rankingConfig.prospects`.** `MAX_UFC_FIGHTS = 5`,
  `ACTIVE_WITHIN_MONTHS = 15` and `MIN_PED_FIGHTS = 3` were hardcoded in `prospects.ts`, against
  the project's single-source-of-truth rule. `maxUFCFights` silently duplicated
  `elo.provisionalFights` — and the page copy explicitly claims to track the provisional window,
  so tuning the engine knob would have made the UI a lie. Now config-driven, with a **load-time
  assertion** that the two are equal rather than a comment asking someone to remember. Golden
  master PASSES unchanged (display-only, as it should be); typecheck, lint, all unit tests and
  build pass.

- **Cross-source double-counting closed — the recency patch's bout-identity key was ID-based.**
  Found in an app audit, not by a failing check: two bouts from UFC Fight Night 280
  (2026-06-27) sat in `recent_ufc_fights.csv` **twice**, once from `ufcstats` and once carried
  from the Sherdog era — Donchenko/Berggren and Ofli/Reyes. Both layers that should have caught
  it were keyed wrong for this case:
  (1) `recencyKey(f1, f2, date)` (`buildRecencyPatch.ts`, used by the live
  `buildRecencyFromUfcStats.ts` accumulate-merge) keyed on **ids** — and an off-roster fighter
  carries a different placeholder id per source (`us:feef5f8f5629e5e7` vs
  `sd:Theodor-Berggren-347365`), so one bout produced two keys and both rows survived the merge;
  (2) `loadData.ts`'s duplicate-drop built `primaryPairDates` from the primary CSV and **never
  added accepted patch rows to it**, so it guarded patch-vs-primary but was blind to
  patch-vs-patch — and neither row is in `Fights.csv`. This is the same failure class as the
  2026-06-13 de-dup fix, which only closed the patch-vs-primary half.
  **Measured impact** (removed the 2 rows by hand, re-ran, restored): Donchenko
  1552.9 → **1539.5** (−13.4 Elo), WW **#16 → #24**; Kaan Ofli 1516.3 → **1505.8** (−10.6),
  FW **#31 → #37**; Javier Reyes 1470.4 → **1491.1** (+20.7, was double-charged for the loss,
  unranked either way). Donchenko was also the `/prospects` #6 entry showing "4-0 UFC" when he
  is 3-0, with the same bout listed as both of his last two results. Berggren isn't on the
  roster, so he was counted as two separate phantom ~1500 opponents.
  **Fix:** `recencyKey` now keys on the **normalized name** pair + date (a local `normName`
  mirroring `loadData`'s — accent/suffix tolerant), with all four call sites moved to the name
  columns (`c[1]`/`c[3]`, not `c[0]`/`c[2]`); `loadData`'s map is renamed `acceptedPairDates` and
  **extended with every accepted patch row**, so a second copy is dropped whatever source it came
  from. Names are the only identifier the sources agree on — the same reason the load boundary
  already keyed its duplicate-drop on them. Belt-and-braces by design: the builder collapses
  these at write time, the load guard catches anything already committed.
  **Verified:** with the duplicates still in the committed CSV, the load-boundary fix reproduces
  the hand-deduped run **byte-identically** (only the log counter differs: `1` → `3
  duplicate-dropped`). Golden master re-blessed at asOf 2026-08-05 — diff confined to WW and FW,
  **zero membership changes**. One diff entry needed chasing: Kevin Holland showed a −4.70 score
  drift despite no link to either bout. Cause is display-only and benign — his `elo` (1520.00)
  and `finalRating` (1529.06) are unchanged from the blessed snapshot; Donchenko landing at #24
  pushes the un-beaten in-between count past `headToHead.leapfrogMaxUnbeaten` (4), so the
  anti-vault guard correctly stops lifting Holland over Randy Brown (whom he beat) and his
  displayed score is no longer clamped up to Brown's 69.23 for monotonicity. Same display-curve
  artifact documented for Dern's champion floor on 2026-07-14, not a rating change.
  `recencyMerge.test.ts` gained the regression directly (one bout + two source ids → one key)
  plus suffix/accent cases. Typecheck, all unit tests, lint and build pass.

## 2026-08-03

- **All six title-change division overrides removed — every premise expired.** The refreshed
  official snapshot now lists Makhachev (WW), Yan (BW), Ulberg (LHW), Strickland (MW), Van
  (FLW), and Gaethje (LW) as "C" natively, and three overrides had begun CONTRADICTING the live
  board (JDM pinned WW #1 vs the board's #4; Pereira #1/Ankalaev #2 vs the board's #3/#1).
  Champion audit confirmed all 11 divisions consistent. Measured impact: golden master passes
  identical (zero order/membership changes) — JDM's seed was loss-streak-suppressed under both
  ranks so only his displayed UFC rank corrects (1→4), and the Ankalaev/Pereira seed swap is
  ±0.5 Elo (`officialRankScores` #2 = #3), under the display tolerance. Same maintenance rule
  as the 2026-07-14 Dern/Zhang removal: the official board owns division membership.
- **validate.ts must-match assertion: absent-from-list is now a SKIP, not a failure.** The
  assertion guards name RESOLUTION (official-list name → CSV id); Shavkat Rakhmonov dropped off
  the UFC top 15 (inactivity), which can't test resolution, yet printed a false ❌. A listed
  name that fails to resolve still fails; a name not on the board reports
  "NOT ON OFFICIAL LIST — skipped" and re-arms when the fighter returns.
- **ALGORITHM.md §10 corrected: 11 divisions.** The spec still listed Women's Featherweight,
  deliberately removed 2026-06-25 (commit c655d51); post-removal changelog entries saying
  "12 divisions" were miscounts.
- **Three-week ingest outage diagnosed + healed; three missed cards backfilled.** The weekly
  launchd ingest silently failed every Sunday after Jul 13, for two stacked reasons found in
  `~/Library/Logs/fergrank-weekly-ingest.log`: (1) Jul 19 + Jul 26 — macOS TCC blocked the
  launchd-spawned process from reading `~/Desktop` (`EPERM uv_cwd`); (2) Aug 2 — the repo moved
  `~/Desktop/` → `~/Desktop/AI/` and the plist's hardcoded script path went dead (exit 127).
  Plist path fixed + job reloaded. **TCC resolved later the same day by moving the repo to
  `~/Projects/UFergCRankings`** (plist repointed again) — granting `/bin/bash` Full Disk Access
  proved INSUFFICIENT, reproduced under launchd with FDA in place: bash reads the repo fine but
  node, which does the actual CSV reads, is its own TCC-responsible process and still hits
  `EPERM uv_cwd`. Verified from the new location with a transient launchd job running the real
  ingest script `--dry`: full 8-step plan, zero EPERM. Backfill ran with `--days 25` (the default 8-day
  discovery window would have silently skipped the two older cards — watch this on any catch-up
  run): UFC FN Du Plessis–Usman (Jul 18), UFC FN Ankalaev–Guskov (Jul 25), UFC FN
  Medić–Rodriguez (Aug 1) all ingested; official board refreshed (176/176 names matched);
  golden master re-blessed at asOf 2026-08-03. The push also carried 4 commits stranded local
  since Jul 14 (remote was at `6876e9a`), incl. the CI clock fix and the odds refresh.
- **/upcoming parser: flat-list fallback for ufc.com's removed section anchors.** The weekly
  build wrote 0 bouts for every upcoming card: ufc.com restructured event pages (~Aug 2026),
  dropping the `id="main-card"`/`prelims-card`/`early-prelims` anchors `parseEventCard` sliced
  on — the fight list is now one flat server-rendered section (verified on two live pages;
  corner names/weight classes unchanged, 2 class-text nodes per bout). Fix in
  `fetchUfcCards.ts`: when no anchor is found, parse the whole document as a single unlabeled
  block (`section: ''` → empty CSV column → loader nulls it → `UpcomingClient`'s existing
  flat-list fallback renders; bout ORDER is still authoritative). Snapshot rebuilt: 27 bouts
  across the next 3 cards, 50/54 names resolved; /upcoming verified rendering in the browser
  (event tabs, Gamrot–Salkilld hero + win prob, flat bout list, no console errors). Section
  dividers return automatically if ufc.com restores the anchors — the anchor path is untouched.

## 2026-07-20

- **All-time (career) strength of schedule — new DISPLAY-ONLY stat, zero scoring impact.**
  The app had two schedule numbers, both recency-windowed (`sosElo` → `sosNudge`, and the
  activity-adjusted `scheduleStrength`), so there was no way to read "how hard was this career?"
  as opposed to "how hard is this fighter's form now". New `src/lib/careerSos.ts` +
  `rankingConfig.careerSos`: the mean of every opponent's rating **at the time of that fight**,
  read straight off the existing Elo trace (`FightTrace.opponentRating` = the opponent's pre-fight
  rating) — a pure read, no second sweep and no rating math. Differs from `sosElo` on all three
  axes by design so the two can't restate each other: career-wide (no window), un-weighted (no
  recency half-life), and strictly **fight-time** — deliberately NOT `max(fight-time, current)`,
  which the ranking-side SoS uses; crediting an opponent's later peak is right for rating you
  today but wrong for a résumé stat, which must report what you actually walked into on the night.
  **Reported as a percentile, not a 0–100 curve**, on measured evidence: over the 1,863 fighters
  with 3+ traced fights the career mean compresses to p05 1484 / p50 1503 / p95 1539 / max 1579,
  against the windowed `sosDisplayCurve`'s anchors (p05 1473, p95 1596), so reusing that curve —
  or fitting a new one — would squash every career into one narrow band. Percentile against the
  all-era pool instead (same reasoning and same shape as the grappling ramp). Deliberately **not**
  given a new display curve, so this adds one config group and zero new tunable curves.
  Smell-test on the output: Gaethje 1579 (p100), Chandler 1575, Woodley 1572, Cormier 1568,
  Sonnen 1565 — and the stat earns its keep by diverging from the rating exactly where it should
  (Chandler's p100 career slate against a current Elo of 1467). **Era caveat surfaced, not
  corrected**: ratings cold-start at 1500 and the early UFC had no history to spread the field
  (measured p95−p05 spread 34.5 Elo pre-2001 vs 57.7 for 2019+), so careers median-dated before
  `eraCaveatBeforeYear` (2001) carry a disclosure line — 52 fighters. Verified by independent
  hand-derivation off the raw trace for 5 fighters (mean, top-5, elite faced/beaten, fight count
  all matched to <0.02 Elo); percentile confirmed in-range and monotonic across all 1,863. One
  real bug found and fixed in that pass: the percentile keyed off the unrounded mean while the UI
  showed the 2dp-rounded one, so 12 pairs of fighters with an identical displayed SoS showed
  percentiles 1 apart — both now key off the rounded value. Surfaced on the fighter profile only
  (`components/CareerSchedule.tsx`, blue = schedule per DESIGN_VISION §2.1); the explanatory
  footnote that points at the header's windowed SCHEDULE card is conditional on the fighter
  actually being ranked, since unranked profiles have no such card. **Firewall verified: golden
  master PASSES unchanged (no re-bless), all unit tests and typecheck pass** — the correct
  outcome for a display-only addition, and the reason no held-out metric is claimed here (per
  `modeling-discipline`, this ships as a read-only stat, NOT a scoring mechanism). Removal
  condition recorded in the config: delete it if a career-SoS number is ever wired into
  `finalRating` — the Elo core already banks opponent quality per fight, so scoring it again
  would be a straight double-count.

## 2026-07-15 (CI fix)

- **Golden master made deterministic — frozen `asOf` clock kills the recurring CI baseline rot.**
  CI's golden-master step kept failing on an untouched `main` (runs c4ae3bc 2026-07-15 and several
  on 2026-07-09): the Elo sweep regresses every rating to `new Date()`, so the ranking output is a
  function of (code, data, TODAY) — and as calendar days passed after a bless, near-tied fighters
  decayed at different rates until a pair swapped ranks (reproduced locally: WSW #36/#37
  Dudakova/Martinez flipped by pure clock drift; order must match exactly, so CI hard-failed with
  zero code change). Fix: new `src/lib/clock.ts` `rankingsNow()` — the engines' single notion of
  "today", overridable via `RANKINGS_ASOF=YYYY-MM-DD` (UTC midnight, timezone-stable; unset =
  wall clock, so production is byte-identical). All ranking-path wall-clock reads route through it
  (`eloEngine` final regression + era boundary + cache key, `scoringEngine` ranking pass +
  prediction adjustment + cache key, `crossDivision` P4P recent-form window; remaining
  `new Date()` uses in src/lib are display-only surfaces outside the ranked output).
  `goldenMaster.ts` snapshot format is now `{ asOf, divisions }`: bless stamps today's date,
  compare freezes the clock to the stored `asOf` — output is a pure function of (code, data), so
  the check fails only on real changes (legacy bare-divisions snapshots fall back to wall clock
  with a re-bless warning). Snapshot re-blessed at asOf 2026-07-15; compare passes and re-runs are
  stable. Typecheck + all unit tests pass. The weekly ingest already re-blesses after data
  changes (step 8/8), which stamps a fresh `asOf` weekly — no ingest changes needed.

- **Prediction meters switched to RANKED ratings (the closest model to the closing line).**
  Follow-up to the bake-off below: `research/backtest/last100.ts` (most recent 100/500
  odds-matched bouts, both ≥5 prior UFC fights) showed monotone improvement pure Elo → ranked
  score → +age/style overlay, with **ranked + overlay** the best (n=500: t = −3.83 vs raw-Elo
  predictions on per-bout logloss; LL gap to the de-vigged close +0.0298 vs pure Elo's +0.0561 —
  ~47% of the gap recovered; still significantly behind the market, t = 2.51 — the 100-bout window
  where it nominally beat the close, 73% vs 68% acc, was a lucky stretch: pick-disagreements ran
  11-6 model at n=100 but 71-48 MARKET at n=500). Shipped: `predictiveRating()` in
  `fightPrediction.ts` = current Elo + `predictiveRatingAdjustment()` (new in `scoringEngine.ts` —
  metrics + SoS + pedigree + untested hold in the fighter's home division; official seed excluded,
  matching the backtested composition). All three prediction surfaces route through it: compare's
  `predictMatchup`, `/upcoming`'s headline `prob1`, and the Analyst `compareFighters` tool
  (displayed per-side `elo` stays raw; compare's decomposition label renamed ELO ALONE → RATING
  ALONE). To keep one copy of the formulas, the ranking pass's per-fighter adjustment block was
  extracted as `computeFighterAdjustments()` used by both paths — behavior-identical (golden
  master diff matches clean HEAD's pure clock drift; all unit tests + typecheck pass; verified
  live on /compare + /upcoming, hand-traced Topuria–Oliveira 49.0%→48.0%). `formProb1` and the
  compare fallback still use raw Elo by design. Display-only end to end: nothing feeds Elo or the
  division sort.

## 2026-07-15

- **"Pure Elo closer to the closing line" claim tested — REFUTED; Pure-Elo view toggle added.**
  New research script `research/backtest/rankedVsClose.ts` scores pure Elo vs a point-in-time
  reconstruction of the ranking score (elo + metrics + SoS + pedigree + untested hold, each
  recomputed as of the fight date from pre-fight data only; officialBonus omitted — no historical
  official-rankings snapshots exist) against the de-vigged BFO close. Result, 835 bouts (both ≥3
  prior UFC fights): the ranking layer moves predictions TOWARD the market, not away — full sample
  Δlogloss −0.0067 (paired t = −2.77), acc 59.6%→61.2%, ECE 0.141→0.124; direction consistent in
  every subset (established ≥6: −0.0071, t = −2.26; newcomers 3–5: −0.0063; last-30-cards:
  −0.0039). So the bounded adjustments earn their keep even as predictors. Caveats: officialBonus
  unmeasured (bounded ≤~10 Elo, ranked names only); pedigree empirical grades carry the known mild
  look-ahead. Separately shipped the user-facing **Pure Elo toggle** on the division FilterBar
  (`FilterParams.pureElo` → `pure=1` on /api/rankings): ranks by raw Elo only — adjustments zeroed
  in the output (decomposition agrees with finalRating), H2H leapfrog/champion tiebreaker/champion
  floor skipped (champion hero still pins via RankingTable's "C" filter). View-only: default off
  reproduces the house algorithm byte-identically (verified — golden master diff identical to
  clean HEAD's pure clock drift), and `pureElo` is excluded from the Elo-core cache signature so
  the toggle reuses the default sweep. Typecheck + all unit tests pass.

## 2026-07-14

- **Stale Dern/Zhang WSW division overrides removed — Zhang scored at Strawweight again.** The
  override pair (crown Dern WSW "C", evict Zhang to Women's Flyweight with a hand-made WFW #1
  seed) dated from when ufc.com still stale-listed Zhang as WSW champ after she vacated to move
  up. Verified against the live board (fetched 2026-07-14, byte-identical to the committed
  snapshot): ufc.com now lists **Dern as WSW "C" and Zhang at WSW #1 natively**, so both resolve
  straight from the official snapshot and the override contradicted the documented rule that the
  official board owns division membership. Not a mechanism change — a stale manual override
  deleted (its own comment's premise expired). Measured impact, exactly two divisions: **WSW —
  Zhang enters at #1 (finalRating ~1593, ~27 clear of the field; her 5-fight SW win run over
  Suarez/Yan/Lemos/Joanna is banked Elo and the Shevchenko loss cost little as a big rating
  underdog), Dern floored to #2 (unconditional champion floor, same presentation as Aspinall/
  Strickland), everyone else down one, Carnelossi out at #40; WFW — Zhang (was #5, 0-1 in-division)
  leaves, top-4 unchanged, everyone below up one, Liang Na in at #40.** Dern's displayed score
  +10.2 is the display curve keeping rankScore monotonic around the champion floor, not a rating
  change. If Zhang books a flyweight fight instead, the official board move carries her back
  automatically via the weekly ingest. Golden master re-blessed; typecheck + all unit tests pass.

## 2026-07-10

- **Head-to-head anti-vault cap widened 3→4 (`headToHead.leapfrogMaxUnbeaten`).** Diagnosed off
  a single LHW case: Paulo Costa KO'd Azamat Murzakanov (UFC 327, 2026-04-11) yet sat LHW #9 to
  Murzakanov's #4. The gap is pure Elo — Costa entered at 1521.6 vs Murzakanov's 1574.8 (a 6-0
  UFC finish run over a soft slate, sosElo ~1515), and the KO transferred ~19.4, narrowing the
  ~53-pt lead to ~15 without flipping it. The H2H leapfrog that exists to enforce the in-cage
  result *wanted* to fire but was blocked by the anti-vault guard: lifting Costa to #4 passes 4
  un-beaten in-between fighters (Prochazka/Jacoby/Stirling/Reyes) > the old cap of 3. **Impact
  measured by cold-cache diff across all 12 divisions (the rankings cache doesn't key on config,
  so a two-process run was required): the ONLY edge in the current data on the 4-boundary is
  Costa's** — LHW #9→#4 (five fighters shift down one), every other division byte-identical.
  Hernandez→Allen (would pass ~5 incl. Chimaev) stays blocked. **Honest caveats (this is a
  one-anecdote knob-widen, logged per modeling-discipline):** (1) no held-out/predictive metric
  supports 4 over 3 — the golden-master re-bless proves non-regression, not improvement; (2) the
  jump also vaults Costa over former champ Prochazka (Elo 1560 > Costa's 1540) whom he never
  fought — trading one arguable wrong for another; (3) it permanently loosens the guard for all
  future cards. **Delete-back-to-3 condition** (in the config comment): revert if any future card
  produces a single-win 4-vault over a clearly superior un-fought résumé — handle Costa as a
  manual override instead. Scoring test 5 made cap-relative + a boundary test 5b added ("exactly
  the cap is allowed"); golden master re-blessed; typecheck + all unit tests pass.

## 2026-07-09

- **Inactivity grace widened 3→5mo, paired with the steep-decay elbow pulled 24→18mo.** The grace
  period (`elo.inactivityGraceMonths`) was decaying almost every fighter: measuring the actual
  inter-fight gap distribution off the fight data (`fighter1Name`/`fighter2Name` × `eventDate`,
  numeric-sorted) gave a **modern-era (2023+) median gap of 6.2mo (~1.9 fights/yr)** — only ~9% of
  fights follow a ≤3mo gap, so at grace=3 the model treated the normal ~2×/yr cadence as a layoff.
  Widening to 5mo graces the largest single gap band (3-5mo) so a ~2.4×/yr fighter pays nothing.
  **But grace enters the decay as `gentleMonths = min(gap,elbow) − grace`, so widening it uniformly
  reduces decay for EVERYONE idle — partially undoing the 2026-07-06 two-slope "parked legend" fix**
  (grace=5 alone re-floated Amanda Nunes, 37mo idle/retired, WBW #5→#2; Raphael Assuncao 40mo back
  into the BW top-40; Jon Jones 20mo HW #7→#6). Pulling the elbow (`fullInactivityMonths`) in to
  18mo (~3 missed normal cadences) puts those long layoffs back into the steep 0.65/yr band, so the
  net change lifts only the **recently-active** (Israel Adesanya 3.4mo MW #21→#16, Max Holloway
  4.1mo LW #6→#5) while the parked names stay sunk (Nunes unchanged, Jones #7→#8). The two knobs are
  **coupled — always re-tune them together.** Not a new mechanism (retune of existing knobs); the
  display-only `scheduleStrength` activity dampener + the `⏸ INACTIVE` badge are separate and never
  feed the rating, so no double-count. Re-anchor check via `diagOfficialImpact.ts`: adjacent top-25
  gap held at **median 3.0 / p75 5.7 Elo** with seeds still spanning +6.2→+10 (~2-3 gaps, 5 fighters
  propped ≥3 spots, max +5) — the spread the display curve + official seed are anchored to is
  unchanged, so **no display-curve / `officialBonusScaleElo` re-anchor needed.** Reshuffles every
  division (a broad, mostly small lift as semi-active fighters stop being over-penalized); golden
  master re-blessed, typecheck + all unit tests pass. Caveat logged: validated on premise + impact
  review, NOT a held-out predictive metric — a win-prob backtest is insensitive here (it scores
  bouts where both fighters just fought, i.e. inside grace either way).

- **/upcoming sourced from ufc.com — authoritative bout ORDER + main/prelim/early SECTION split.**
  The upcoming page took its bout order from ufcstats.com (`buildUpcomingFromUfcStats.ts`), which
  lists announced bouts in announcement order and carries no card-section labels. That order
  drifted from the real card as the UFC reshuffled bouts the week of an event (diagnosed on UFC
  329: King Green vs McKinney was our bout #7 but is really main-card #5; Gable Steveson sat at our
  #5 but is a prelim — so a naive "top-5 = main card" rule on the stale data would have been
  wrong), and there was no way to render a main-card/undercard divider. New
  `scripts/ufcstats/fetchUfcCards.ts` parses ufc.com/event pages (server-rendered HTML, no JS/PoW
  gate — same surface as `fetchUfcRankings.ts`) for the correct fight order + the explicit
  `main-card`/`prelims-card`/`early-prelims` sections; `buildUpcomingFromUfcCom.ts` writes
  `upcoming_fights.csv` with a new `section` column (event date from the local hero suffix + year
  from the events-list timestamp, dodging the UTC day-slip; fighter ids resolved by name with a
  suffix-stripped retry for "Rountree Jr." etc.). `loadUpcoming.ts`/`upcomingEnrich.ts` thread
  `section` through; `UpcomingClient.tsx` renders labelled **Main Card / Preliminary Card / Early
  Prelims** dividers (flat-list fallback when a snapshot predates the column). Weekly ingest step 3
  swapped to the new builder; `buildUpcomingFromUfcStats.ts` retired to fallback. Display-only —
  never touches Elo; golden master unaffected. Refreshed the committed snapshot for UFC 329 / the
  two July Fight Nights (35 bouts, 65/70 fighters resolved; the 5 misses are genuine
  debutants/regionals). Typecheck + all unit tests pass.

---

## 2026-07-07

- **Scoring-layer unit tests** (`scripts/scoring.test.ts`, wired into `npm test`). The ranking-layer
  mechanisms built 2026-07-02→06 were guarded only by the golden master, which catches unintended
  change but encodes no intent (a `--update` re-bless can silently bless a bug). Now covered:
  two-slope inactivity regression (continuity at the elbow, steep-past-elbow), untested hold
  (release/taper/linearity), metrics opponent-quality damper, metrics composite invariants
  (confidence dampener, one-sided kd/sub, saturation at `metricsScaleElo`), official-seed
  loss-streak counting, champion tiebreaker + champion floor (including the ABSENCE of contender
  floors), head-to-head leapfrog (stale/split/gap-cap guards, anti-vault with the also-beaten
  exemption, rematch-loss negation + champ-loss exception), and the P4P recent-form tilt. To make
  them testable, the inline formulas were extracted as exported pure helpers
  (`untestedHoldPenalty`, `metricsQualityMultiplier` in `scoringEngine.ts`; `regressForInactivity`,
  `recentFormTilt` exported) — behavior-identical, golden master unchanged.
- **Dead config keys removed** (`top5FloorRank`, `top15FloorRank`,
  `contenderFloorSuppressLossStreak`) — orphaned by the 2026-07-06 contender-floor removal; the
  champion-floor comment now records why they're gone.
- **Odds pipeline made weekly-fresh.** New `research/bfo/refreshRecent.ts` incrementally re-pulls
  recent/upcoming BFO event pages (the bulk cache is fetch-once-forever, which froze PRE-closing
  lines at the recency edge) and merges them into `data/bfo_odds.csv`; `weeklyUpdate.ts` gained two
  non-fatal steps (4/8 refreshRecent, 5/8 exportAnalysis) so `data/odds_analysis.json` and the
  /odds page stay current automatically; the local ingest + CI commit lists now include both odds
  files. First run backfilled June 2026 (Vegas 118/119, Freedom Fights 250, Fight Night 6-27) +
  UFC 329 early lines → 4,198 fights in the export.
- **Dependencies:** `postcss` forced to ≥8.5.10 via npm `overrides` (Next 16.2.10 vendors 8.4.31 —
  GHSA-qx2v-qp2m-jg93; no patched stable Next exists yet) → `npm audit` clean;
  `@anthropic-ai/sdk` 0.109 → 0.110. Build + all tests + golden master verified against the
  overridden postcss.
- **Docs restructure.** CLAUDE.md (629 lines, grown append-only) split: current-state algorithm
  spec → `docs/ALGORITHM.md`, dated history → this file, plan files → `docs/plans/` (with a status
  index), CLAUDE.md rewritten lean. "Restraint when changing the model" rules now live in the
  `~/.claude/skills/modeling-discipline` skill, not CLAUDE.md.

## 2026-07-06

- **Official rankings sourced direct from ufc.com (Octagon demoted to fallback).**
  `scripts/ufcstats/fetchUfcRankings.ts` parses `ufc.com/rankings` (server-rendered HTML, no JS
  hydration, no PoW gate); `buildOfficialRankings.ts` uses it as the primary source and falls back
  to the Octagon API only if the parse comes back empty. Motivation: Octagon lagged ufc.com by
  days/weeks — it kept returning old champions, forcing hand-maintenance via the overrides file.
  The committed-snapshot architecture is unchanged.
- **Contender floors removed — champion floor only.** The post-sort safety floors for UFC top-5
  (≥ #8) and top-15 (≥ #25), and their loss-streak suppression, were first made Elo-respecting
  (never rank lower Elo over higher) which proved them functionally inert, then removed outright.
  Zero ranking change (golden master identical across all 12 divisions). Only the unconditional
  champion floor (`championFloorRank`) remains. The pipeline is now: merit sort → head-to-head
  leapfrog → champion tiebreaker → champion floor. UFC rank's only remaining say is the bounded,
  form-gated `officialBonus` seed. (The old health-check heuristic — "if floors fire for more than
  ~1–2 fighters in a division, the Elo isn't landing" — dates from when contender floors existed;
  on the 2026-06-13 v2 run: BW 0 floors, LW 2, WW 5, down from 5/6/9 under v1. WW ran higher
  because the Makhachev division-override creates two "C" champs there.)
- **Opponent quality = max(fight-time, current) for SoS + untested hold.** An opponent who later
  proved elite now credits the win at their proven level. This also made the earlier "exempt
  title-fight participants from the untested hold" patch unnecessary (the title opponent's quality
  releases the hold at the root), so that exemption was removed.
- **Two-slope inactivity regression.** The single gentle 0.88/yr retention slope let genuinely
  PARKED legends hang onto top slots (Jon Jones was HW #4 on two old finishes with ~20 mo idle).
  Regression is now piecewise — gentle 0.88/yr across the normal-layoff band (grace →
  `fullInactivityMonths` = 24 mo), then a steeper `inactivityRetentionSteep` (0.65/yr) applied ONLY
  to the portion of the gap past the elbow. Active/semi-active fighters (champions defend ~10–14 mo
  apart) never reach the elbow; only the truly shelved fade fast. Effect: Jones's real ~3 yr
  2020→2023 layoff now regresses him harder before the HW run → HW #4→#7 (1582→1561 Elo); Cejudo
  drops out of the BW top-40, Nunes WBW #2→#3, Suarez WSW #1→#4 — every large drop is a genuinely
  inactive name, and champions still lead every division. Golden master re-blessed. Paired
  display: `⏸ INACTIVE` badge for fighters idle ≥18 mo in their division (`getInactivity()` in
  `fighterDisplay.ts`, division-scoped `monthsSinceLastFight`; on `FighterCard` rows,
  `ChampionHero`, profile hero) — badge-only, no forced reorder; placement moves organically via
  the decay.
- **Opponent-quality damper on the metrics composite.** The composite is opponent-blind — gaudy
  strike/grappling differentials over WEAK competition read like elite dominance and inflated
  `finalRating`. `scoringEngine.ts` now scales **positive** `metricsBonus` by a ramp on slate
  quality (`sosElo`): full credit at/above `metricsQualityFullElo` (1520), down to
  `metricsQualityFloor` (0.30) at/below `metricsQualityLowElo` (1460), linear between. Negative
  metrics are untouched — a soft performance counts regardless of who you faced. Diagnosed on an
  LHW audit: Navajo Stirling (5-0 over a ~1475 slate, one win >1500) was earning +15 metrics and
  seating at #3–4; the damper cuts that to ~+7 (a defensible #4) while legit dominators over real
  comp are preserved (Tsarukyan +17.8 vs a 1528 slate, Morales +13.9 vs 1535 — untouched).
  Directionally clean across divisions (weak-slate padders fall: Donchenko WW #10→#12, Salkilld LW
  #7→#8, Jacoby LHW #7→#10; tough-slate résumés rise: Reyes LHW #10→#7, Whittaker MW #16→#14,
  Dumont WBW #10→#6). It removes the *inflation above* a fighter's Elo, not the Elo itself.
  Golden master re-blessed.
- **"Untested" hold — bowling-spare résumé gate.** An undefeated riser who has beaten NOBODY
  ranked shouldn't sit among proven contenders on Elo alone. Like a bowling spare, the pins are
  pending until the next ball counts them: a fighter whose best CAREER win falls below a
  ranked-calibre threshold is held back until they beat someone real, at which point the penalty
  releases entirely and (Elo already banked the win) they jump. `untestedPenalty = −maxPenaltyElo ×
  shortfall × taper`, `shortfall = clamp((thresholdElo − bestWinElo)/rampElo, 0, 1)`, `taper =
  clamp(1 − fights/taperFights, 0, 1)`. Two properties make it surgical: (1) release keys on the
  *career-best* win, so a faded ex-champ's old quality win still exempts them; (2) the fight-count
  taper zeroes the hold by `taperFights` (14) — proven veterans immune by construction. Config
  `untestedHold` = {enabled, thresholdElo 1550, rampElo 70, maxPenaltyElo 25, taperFights 14}.
  LHW audit result: Navajo Stirling (5-0, best win ~1507, no ranked scalp) held #4→#5, now behind
  Azamat Murzakanov (6-1, has a ~1545 win → only lightly held −1.7); same profile drops Salkilld
  LW #7→#9. Zero collateral: blue-chip prospects with real wins (Morales, Umar, Tsarukyan) and all
  established vets untouched; division tails swap untested prospects (Julius Walker, Ivan Erslan)
  for proven vets (Devin Clark, RDA, Cejudo). Ranking-only, never touches Elo. Folded into
  `finalRating`, but P4P subtracts it back out (`crossDivision.ts` `unheldRating = finalRating −
  untestedPenalty`) — P4P is an Elo-pool board and a shallow-division prospect shouldn't be
  double-dinged cross-division. Surfaced in the "why this rank" decomposition as a releasable
  `Untested` part + insight. Golden master re-blessed.
- **Sherdog fully removed from the weekly pipeline.** Step 3 `buildUpcoming` ported to
  `scripts/ufcstats/buildUpcomingFromUfcStats.ts` (parses announced matchups off the upcoming
  cards → `upcoming_fights.csv`); the wrapper's ages step dropped `--fetch` (Wikidata + cache
  only — the Sherdog per-fighter DOB top-up just 403'd).
- **Per-fight metrics (KD/STR/TD/sub) now written + consumed for recency fights.**
  `recent_ufc_fights.csv` gained the 8 metric columns, `buildRecencyFromUfcStats` writes them,
  `loadData.loadRecentPatch` sets `hasMetrics` from strike-column presence (old Sherdog rows
  padded → `hasMetrics:false`), so recency fights now feed the striking/grappling composite
  instead of being metric-blind. Golden master re-blessed; impact is a bounded ranks-14–40 refresh
  for fighters who just fought.
- **Paulo Costa MW→LHW division override removed.** ufc.com now ranks him LHW #8 directly and his
  weightClass data is Light Heavyweight, so he resolves natively from the official snapshot.

## 2026-07-05

- **Rank-history sparkline: built, then CUT.** A standalone divisional-rank-over-time line chart
  was implemented and verified, but removed as visually redundant with the Gauntlet: both are
  Elo-derived career-trajectory lines on the same time x-axis, so their shapes track each other.
  The Gauntlet already IS the career-trajectory chart, and richer. The one thing a rank line adds
  — *relative* position vs *absolute* Elo, so rank can move when the field moves around you — is
  too subtle to justify a second full-width chart, and the app had already removed the standalone
  form-timeline line chart for the same reason. Any future rank view should differentiate (e.g. a
  tiny inline hero sparkline in rank units), not be a second big chart.
- **Weekly ingest moved LOCAL (out of CI).** GitHub-hosted runners' datacenter IPs are blocked by
  Sherdog's anti-bot, so the crawl fatally errored in the Action (run #5). The ingest now runs on
  the maintainer's Mac via a launchd job (`scripts/sherdog/weeklyIngestLocal.sh` +
  `~/Library/LaunchAgents/com.fergrank.weekly-ingest.plist`, Sundays 7am local);
  `weekly-update.yml`'s schedule is disabled (kept for manual dispatch / a future self-hosted
  runner).
- **Recency source moved Sherdog → ufcstats.com.** Sherdog's Cloudflare edge began hard-blocking
  every non-browser client (403 from all IPs, curl + Node alike) — the Sherdog crawl is dead. The
  weekly recency top-up now comes from ufcstats.com (`scripts/ufcstats/`: `fetchUfcStats.ts`
  clears ufcstats's transparent SHA-256 proof-of-work gate, `parseUfcStats.ts` parses the events
  list + per-bout results/metrics, `buildRecencyFromUfcStats.ts` writes `recent_ufc_fights.csv` —
  same schema + accumulate-merge as before, IDs resolved by name). `weeklyUpdate.ts` step 1 runs
  the ufcstats orchestrator (retired the Sherdog fetchEvent → extendCrosswalk → buildRecencyPatch
  trio).
- **Hand-corrections go in `official_rankings_overrides.csv`, NOT the snapshot.** A direct edit
  pinning Ulberg as LHW champ got silently reverted by the next ingest (Octagon still listed the
  old champ). `buildOfficialRankings.ts` now applies `data/official_rankings_overrides.csv`
  (format: division,rank,name; pinning a fighter bumps those below down one) on top of the Octagon
  fetch every run, so a fix survives the weekly refresh.

## 2026-07-04

- **Committed-snapshot architecture for official rankings.** The running app no longer fetches
  Octagon at request time: `fetchOfficialRankings()` reads the committed
  `data/official_rankings.csv`; the live fetch (`fetchLiveOfficialRankings`) survives only as a
  fallback for a fresh checkout, and empty `{}` is the final degrade to pure Elo. The snapshot is
  refreshed by `scripts/buildOfficialRankings.ts` as a weekly-ingest step (ingest commits the CSV
  → redeploy). The feed is now versioned — the git diff on the CSV IS the staleness detector — and
  the build script refuses to overwrite a good snapshot with an empty Octagon response.
- **Win-quality gate (`elo.winQualityGate` = 0.5).** Points GAINED from a win are scaled by the
  opponent's ABSOLUTE Elo: full credit for a ranked-calibre opponent (≥1560), only ~15% for a weak
  one (≤1460). An unbeaten streak over soft competition PLATEAUS near that slate's level instead
  of floating into contention (fixes undefeated-streak inflation — a never-losing fighter's Elo
  otherwise climbs forever). Losses untouched; keyed on the opponent's absolute quality, not the
  gap, so a champ beating other elites keeps full credit. `displayCurve` + `winProbDenominator`
  (140) re-anchored to the resulting spread.
- **Provisional-finish damp (`elo.provisionalFinishDamp` = 0.5).** While provisional, the
  finish-method multiplier is damped toward 1.0 so finish (×1.4) can't compound with the
  provisional boost (×1.5) into a ~2.1× K — a newcomer KO'ing low-rated opponents converges on the
  RESULT, not the method. Closed the "finisher-over-cans out-rates a proven gatekeeper" hole;
  deflated Nazim Sadykhov ~11 Elo. Full finish credit resumes once established.
- **Current-form recency decay redesigned — boundary discount RETIRED (`maxFightAgeYears` →
  `null`).** Recency dominance is now carried entirely by the continuous inactivity regression
  (0.88/yr retention + 3 mo grace), which fades pre-window form a little at every gap along each
  fighter's own timeline. The retired mechanism regressed a fighter's carried-in rating 50% toward
  the mean the first time they fought inside the last 5 yr — which drew a synchronized league-wide
  CLIFF on every veteran's chart (all at the same rolling calendar date, migrating forward each
  year) and unfairly discounted continuously-active fighters. The continuous decay reproduces the
  goal — a 10-yr-old result can't prop up today's rating — without a wall, per-fighter. Rate
  empirically chosen (`scripts/boundaryRedesign.ts`, config "A2"): keeps currently-active tenured
  elites on top while dropping idle vets (Khabib) and NOT floating raw prospects — the middle
  between naive removal (Jones/Usman float) and over-decay (debutants float). The user-facing Era
  filter is still a hard window for the historical lens. Display curve + `winProbDenominator`
  re-anchored; golden master re-blessed.
- **Weight-class move decay charged ONCE per division.** `EloState.divisionsSeen` tracks weights
  already competed in, so the 10%-toward-mean tax hits only the FIRST entry into a division — a
  fighter returning to a proven weight (Holloway/Volkanovski to FW, Nunes to BW, Adesanya to MW)
  pays nothing (inactivity regression already covers the gap).
- **Head-to-head leapfrog anti-vault (`headToHead.leapfrogMaxUnbeaten` = 3).** Beating a
  higher-ranked fighter lifts you above them, but only as a LOCAL reorder — skipped if it would
  vault you past more than 3 *un-beaten* in-between fighters. Stops a single win from jumping a
  whole stack of superior résumés you never fought (Hernandez beat Allen but must not pass
  Chimaev, whose only loss is to the champ) while preserving legit short hops (Topuria over
  Oliveira jumps 2). Fighters you've also beaten don't count against the cap.
- **Gauntlet: TRUE calendar x-axis.** Fixed 7-yr window anchored to today so idleness shows as
  blank space; scrollable left for longer careers; gold ⚑ weight-class-move flags.
- **Distinction decals.** Small coloured badges next to a fighter's name (`lib/distinctions.ts` →
  `components/DistinctionDecals.tsx`, pure/display-only, never touches Elo). Seven kinds,
  pre-sorted by priority: reigning champion (gold "C" disc), former champion (faded gold crown
  outline), title wins (gold belt-with-plate ×N) + title fights (gold ring ×N) from
  `title_fights.csv` via `getTitleRecord()`, undefeated (blue shield, 0 losses + 5+ fights), win
  streak (green flame ×N, ≥3) + finish streak (red bolt ×N, ≥2) from the Elo trace, main events
  (purple ring ×N — 5-round *non-title* headliners, mirrors the Gauntlet's gold/purple halo
  language). Profile hero shows the FULL set; compact surfaces cap at `max={2}` with a `+N`
  overflow chip and drop the redundant champion decal where "C"/★ already shows. Wired: profile,
  division rankings (`FighterCard`/`ChampionHero`, via `attachDistinctions` at both
  `/api/rankings` + the server division page), /p4p (`P4PEntry`), /compare (`FighterHead`),
  /prospects (`ProspectEntry`). Counts read straight from `title_fights.csv`.
- **New validation reference:** `validation_elo_2026-07-04_lhwchamp.txt` (Ulberg = LHW champ after
  Pereira vacated for the HW interim; champions lead LW/WW/BW).

## 2026-07-03

- **Fighter profile reorganized — analytics-dashboard-led.** `AdvancedAnalytics.tsx` renders 3
  stacked cards: Hero → top box (brief personalised one-line "why this rank" from `why.headline` —
  composed from two independently-seeded halves for near-unique output: a form LEAD
  (champ/skid/streak/quality/layoff/steady) + an identity COLOR clause (fighting style, signature
  win = best recent scalp `bestWin` — distinct from `mover` = biggest rating swing —, finish
  tendency, schedule difficulty); each half is a full sentence, data-missing variants are dropped,
  streak-finish counts are streak-scoped; verified 26/26 unique across WW+LW — + ELO/PEAK anchors)
  → Block A: Gauntlet + trend read + strike-ratio panel | fight history (deltas + differential
  strips) → Block B full-width: strength-of-schedule strip on top, then pace split into STRIKING |
  GRAPPLING two-column tables (CAREER vs DIV MED + trend arrow) → Block C: de-emphasized radar +
  durability + finish anatomy ("RADAR REWORK PENDING", dashed/low-opacity until the radar is
  fixed) → "why this rank" decomposition + snapshot below the dashboard. Unranked/no-charted
  fighters get a simpler fallback grid.
- **Grappling proficiency ramp.** Grey `#4a4a52` → blue `#4a9eff` SEQUENTIAL magnitude encoding of
  `RadarAxes.grappling`, ranked as a division percentile (own-division 3+-fight pool) so the
  crowded mid-division spreads while the genuine elite tail honestly stays bunched. Rendered as a
  full-gradient track + needle (`GrappleRamp`/`grappleGradient.ts`) so even one fighter shows the
  whole ramp. On the profile (top of analytics Block B; fallback profiles show it under the radar)
  + /compare (both corners on one track — grappler-vs-striker at a glance). Display-only. PaceRow
  grapple-row tinting deliberately deferred (would clash with the existing red/green/gold
  `standoutOf` colouring).
- **Submission threat added to the metrics composite.** `submissionThreat` (sub attempts/fight,
  one-sided like `knockdownRate`, `submissionsPerFight` = 2 for full credit) closed a
  striker/grappler asymmetry — the composite rewarded knockdown finish threat but not submission
  finish threat. Weights rebalanced 0.40/0.15/0.15/0.15/0.15. Paired with SUB finish multiplier →
  1.4 (KO parity, was 1.35): a submission is as decisive a finish as a KO. Rewards *currently
  active* sub threats (Oliveira passed Tsarukyan for LW #2; Merab up); does NOT retroactively lift
  a fighter whose subs are old/vs weak opponents (their Elo already banked them — won't move a
  Mike Malott whose recent window has ~0 sub activity). Golden master re-blessed.
- **Official seed magnitude re-anchor (`officialBonusScaleElo` 0.4 → 0.1).** The boundary discount
  had compressed the ranked pool (median adjacent top-25 gap ≈3 Elo), so the old +25–40 seeds were
  worth 5–10 spots each — 87 fighters propped ≥3 spots. At 0.1 the seed spans +6.2 to +10 (~2–3
  median gaps): 12 fighters move ≥3 spots, max +5. Consequence at the very top: a champion's belt
  alone (+10 seed + 8-pt tiebreaker band) no longer overrides a clear form gap — e.g. HW Volkov
  can out-rate champ Aspinall; the unconditional champion floor (≤#2) and the pinned "C" hero
  still keep every champ visually on top. If the rating spread is ever recalibrated, re-anchor
  this scale against the gap distribution (`diagOfficialImpact.ts` prints it).
- **Workstream A — empirical promotion grading + prediction prior** (plans:
  `docs/plans/PROMOTION_GRADING_PLAN.md`, `docs/plans/PREUFC_SOS_PLAN.md`; motivation: the
  closing-line backtest showed our accuracy gap vs the market *widens on newcomers* — −9.8 pt in
  the 3–5-fight bucket vs −6.4 pt at 6+, `research/backtest/enhancedVsClose.ts` with a
  fight-experience bucket split):
  1. *Feeder attribution + data-driven grade.* `pedigreeSeed.ts` attributes each fighter to their
     primary feeder promotion (plurality of last 5 pre-UFC fights, not the old `topMult` which
     over-credited one lucky good-org fight) and nudges that org's static tier multiplier by an
     empirical grade — how well its graduates actually did in the UFC (settled Elo gain,
     empirical-Bayes shrunk). Built offline by `scripts/sherdog/gradePromotions.ts` →
     `data/promotion_grades.csv`, loaded via `promotionGrades.ts`. The grade is a
     hierarchy-preserving relative factor (±20%, centred 1.0) — the Elo-gain signal is
     weak/compressed, so it only nudges within-tier, never flattens the tier prior. Signal real
     but modest (ONE Championship graduates underperform → 0.95×; KSW/PFL/LFA slight premiums).
     UFC-tryout orgs (DWCS/Contender Series) excluded from feeder attribution
     (`feederExcludeOrgs`) — DWCS is a one-fight UFC tryout, not a developmental promotion; the
     DWCS win still counts on the record but is never the feeder identity.
  2. *Prediction-side pedigree prior.* The ranking seed only touches `finalRating`, NOT the
     win-prob path the backtest measures, so `fightPrediction.ts` gained a bounded, taper-out
     pedigree logit (`winProbModel.pedigreeEdgeCoef`): (A's tapered pedigree strength − B's) →
     logit, tapering to zero by 6 UFC fights. Lifted the 3–5-fight backtest bucket 63.9% → 65.6%
     accuracy while leaving the 6+ bucket untouched. Display-only; never enters the Elo pool.
- **Cage Warriors mis-tiering fixed.** Sherdog logs it abbreviated ("CW 100 - Cage Warriors 100" /
  "CWFC …"), which failed the `startsWith` matchers and fell to tier4; `buildContext.ts
  classifyOrg` now contains-matches `/cage warriors\b/i` (excluding the amateur academy + the
  unrelated "Cage Wars"), rebuilt from cache → Cage Warriors is tier3, grades 1.03×.
- **DWCS method-aware "showcase" term evaluated + REJECTED.** `scripts/sherdog/dwcsCohort.ts`
  found DWCS finish-winners (+3.9 Elo) barely out-gain decision-winners (+3.0) — a 0.9-Elo gap
  (noise), so HOW you win on DWCS carries no signal; the real win-vs-no-win gap (~11 Elo) is
  already captured via winRate + B.1 schedule. No term built.
- **Workstream B — deeper pre-UFC SoS (B.1 built; B.2 deferred).** `pedigreeSeed.ts` measures WHO
  you beat, not just win count: `collectPreUFCFights` carries `opponentSherdogId` (~100% filled) +
  a subject `sherdogId→ourId` map, so a pre-UFC WIN over an opponent who *themselves reached the
  UFC* adds a bounded SoS term to pedigreeStrength, weighted by that opponent's UFC Elo above the
  mean (`ufcBoundBeaten`/`ufcBoundQuality`; config `useOpponentSos`/`sosWeight`/`sosTermCap`/
  `sosNormConst`). Smell-test passes (Michael Chandler beat 5 future UFC fighters pre-UFC, Kai
  Asakura 3). Surfaced as a prospect scouting read on /prospects ("beat N future UFC fighters
  (incl. …)", via `bestScalpId`). Golden master unchanged (high-SoS fighters are all established →
  tapered out; genuine newcomers didn't reorder) and the win-prob backtest was flat on the 61-bout
  newcomer slice — B.1 is correct and safe but currently low-yield on scoring; its value is the
  display read + future-proofing. B.2 (a separate firewalled pre-UFC Elo sweep) deliberately NOT
  built — with B.1 flat and the backtest underpowered for this signal, high-effort for near-zero
  measurable gain (see `docs/plans/PREUFC_SOS_PLAN.md` §3, which gated B.2 on B.1 delivering).
  Leak note: opponent UFC Elo is the settled present-day rating (mild backtest look-ahead;
  acceptable for the tiny seed).
- **Schedule panel simplified (cut clutter).** The always-visible panel above the PACE grid leads
  with a prominent STRENGTH OF SCHEDULE · MEAN OPPONENT ELO headline (big blue number + step vs
  career); the OUTPUT/ABSORBED-vs-schedule stats, ⓘ explainers, last-5 numbers and per-opponent
  OUT/EXP·ABS/EXP table all live in the fight-by-fight popover. The PACE grid itself is CAREER vs
  DIV MED + a TREND arrow only (no LAST-5 column, no drift magnitude).
- **Prior validation reference:** `validation_elo_2026-07-03_officialseed.txt` (official seed
  form-gated + re-anchored to 0.1; champions lead LW/WW/BW).

## 2026-07-02

- **/upcoming redesigned.** Date-first event tabs, main-event hero + dense prelim rows, last-5
  form pips (gold underline = title fight, via `titleFights.ts` ← `data/title_fights.csv`; shared
  `FormPips` component with a light span timeline — newest-fight year → 5th-fight year — as an
  activity read), win-probability spine, main-event tale-of-the-tape (reach ←
  `fighterPhysical.ts`, activity-adjusted `scheduleStrength`, finish rate; links to /compare);
  per-fighter next-fight attached at the API boundary. Display-only.
- **Schedule-context strip** (`buildScheduleContext` → `ScheduleContextStrip`), above the PACE
  grid: makes the raw Last-5 drift opponent-aware — recent-window mean opp Elo vs career (was it a
  step up?), opponent style mix (striker/grappler, heuristic from each opp's own pace), and an
  opponent-adjusted absorption read (absorbed/15 ÷ what those opponents normally land) in an ⓘ
  popover with a per-fight breakdown. Ratio panel window aligned to the pace grid (Last 5).
  Carries opponent-adjusted OUTPUT and ABSORPTION reads (`landedVsExpected`/`absorbedVsExpected`):
  the fighter's recent landed/absorbed vs what that exact slate normally concedes/lands — the
  SoS-balancer that stops a champion climbing through tougher competition (falling raw volume,
  rising opponent Elo) from reading as "decline". Drives a leading dominance trend-read insight
  that overrides the raw-drift caution. Also on /compare (one strip per fighter) and the /upcoming
  main event (both corners, via `scheduleContext` on `CardFighter`).
- **`scheduleStrength` — activity-adjusted DISPLAY composite.** Alongside pure-quality
  `strengthOfSchedule`: `scheduleStrength = qualityScore × dampener`, `dampener = activityFloor +
  (1−activityFloor)·activity`, `activity = 0.7·recency + 0.3·cadence` (recency from
  `monthsSinceLastFight` past a 12-mo grace; cadence from fights-in-window vs a 2/yr target).
  Shown on the /upcoming tale-of-the-tape: "how good was your schedule, kept honest by whether
  it's current." Never enters `finalRating` — the Elo core already regresses inactive ratings;
  folding activity into `sosNudge` would double-count a layoff. Profile hero shows a prominent
  SCHEDULE rank-card (blue; pure opponent-quality SoS + activity-adjusted `scheduleStrength` as
  the sub-line).
- **Form gate on the official seed (`officialSeedSuppressLossStreak` = 2).** A NON-champion on a
  ≥2 losing streak gets zero seed — the official list is slow to shed fading names, and the cage's
  verdict stands over it. Diagnosed with `scripts/diagOfficialImpact.ts`: before the gate, 50
  seeded fighters on 2+ skids were being propped 3–16 spots (Dariush +16, Font/Vera +15, Covington
  +12); after, the stale-seed count is ~4 — all long-layoff-but-not-losing elites (e.g. Shavkat),
  which the seed exists to protect. Re-run that script after any seed/floor tuning.
- **"Ask the Analyst" phase 1 built** (`docs/plans/AGENT_PLAN.md`), then promoted the same day to
  a site-wide floating dock — chat bubble bottom-right on every page + "Analyst" entry in the
  header nav, mounted in the root layout so chat history survives navigation; page-aware via
  `AnalystContext` — /upcoming sets the selected card, /fighter/[id] sets the fighter (subtitle
  "Talking <name>", fighter-specific suggested questions, and the fighter_id rides the request so
  the agent skips the name lookup). `claude-sonnet-5` starts with zero fight facts and grounds
  every claim via tools over the display path (`src/lib/agent/`). Needs `ANTHROPIC_API_KEY` in
  `.env.local` (graceful 503 without). Web search / odds discourse = phase 2, not built. See
  `data/SOURCES.md` §7.
- **Fighter ages built** (`buildAges.ts`): Wikidata P569 via Sherdog-ID join + guarded alias match
  + Sherdog-profile fill, career-validated. 89% registry / ~96% ranked. Weekly-refreshed; display
  + trend-read only (`fighterAges.ts`). See `data/SOURCES.md` §6.
- **Scorecard bot designed, not built** (`docs/plans/SCORECARD_BOT_PLAN.md`).

## 2026-07-01

- **Advanced analytics band** (`advancedStats.ts`): ONE unified band below the profile grid —
  cautious macro TREND READ (opposition/mileage-aware; UFC tenure = aging proxy, no DOB in the
  primary data), per-fight strike-dominance strips (landed/absorbed per-15 beside each bout in the
  fight-history list — this is where the old form-timeline `timeline` data lives now; the
  standalone form-timeline line chart was RETIRED in favour of the Gauntlet),
  landed:absorbed ratio vs division ranked-pool median, per-15 pace rates, durability, finish
  anatomy. Display-only; ranking-input signals badged. Pace rows highlight significant standouts
  vs DIV MED (`standoutOf` in `AdvancedAnalytics.tsx`): a ratio-based flag colours the CAREER
  value + a `×`/`%↓` badge (gold = elite, green = strength, red = gap) and gives elite strengths a
  row accent bar + tint — e.g. a knockout artist's Knockdowns row pops `8.2×` gold. Later split
  into `advancedStats/` (core.ts + trendRead.ts, barrel index.ts keeps the import path).
- **Durability panel shipped** — the old "no strike-absorption data" blocker was wrong; `STR_1/2`
  covers both corners.
- **/prospects built** — provisional-window (≤5 fights) risers: climb rate, last-2, booked next
  fight, pre-UFC record, age (colour-coded runway).
- **Division depth heatmap** on the homepage — per-division top-40 core-Elo heat strips on one
  global colour scale (`DepthHeatmap`, fed by `/api/dashboard`); hover = fighter, click =
  division.

## 2026-06-14

- **Fighter photos + country flags built.** Build-time media pipeline joins Wikidata (nationality
  → flag, licensed Commons portrait) and UFC.com (standardised photos, name-derived slugs) to the
  registry by `canonical_id`. Display only — attached at the API boundary
  (`src/lib/fighterMedia.ts`), never in the scoring path. Combined ~63% photo / ~65% flag coverage
  (higher for ranked fighters); initials avatar is the fallback. See `data/SOURCES.md` §5.

## 2026-06-13

- **Recency de-dup fix.** Duplicate recency-patch rows were silently double-counting fights in the
  Elo sweep; `loadData.ts` now enforces the patch contract at the load boundary (stale-drop,
  suffix-tolerant duplicate-drop within ±7 days, `sd:`-id name-resolution). See `data/SOURCES.md`
  §4. Snapshots: `validation_elo_2026-06-13.txt` (pre-fix evidence) →
  `validation_elo_2026-06-13_postdedup.txt`.
- **`metricsScaleElo` 40 → 30.** At 40 the metrics composite occasionally swung a fighter ~±28 Elo
  (e.g. King Green) and out-weighed who-beat-whom.
- **Design decisions locked** (full system in `DESIGN_VISION.md`): Oswald display + Geist Sans
  body + Geist Mono numbers; dark grey canvas `#13131a` (not pure black), UFC red `#D20A0A` scarce
  (champ/top-5), champion gold `#d4a843`; semantic stat colours (red striking / blue grappling /
  green accuracy); pure dense rows (not cards), champion hero pinned above, top filter bar (not a
  left rail); trend-vs-UFC chip on every row; mobile responsive from the start. Design thesis: the
  hero stat of the whole app is the delta between our rank and the UFC's official rank. Tone is
  editorial sports authority (ESPN/The Athletic meets a Bloomberg terminal), not fantasy-app
  gamification. Still-open items parked in `DESIGN_VISION.md` §9.
- **v2 floor health check on this run:** BW 0 floors, LW 2, WW 5 — down from 5/6/9 under v1 (WW
  runs higher because the Makhachev division-override creates two "C" champs there). Contender
  floors have since been removed entirely (2026-07-06).

## 2026-06-12

- **v1 additive model validated on real output — and killed.** v1 was an additive sum
  (`WinQuality + FinishBonus + … − Penalties`), built and tuned through six patches (see
  `docs/plans/ALGORITHM_PATCH.md`, now historical). Its win-quality term was an unbounded sum that
  rewarded *volume of recent finishes*, so a 7-1 finisher (Carlos Prates) scored 322 — triple the
  champions — while a division-changing champ (Makhachev) scored 16 and had to be dragged to the
  top by safety floors. `ufc-rankings/validation_baseline_2026-06-12.txt` is the evidence that
  killed the additive model. v2 (Elo core) replaces it; first v2 run:
  `validation_elo_2026-06-12.txt`. A key v1 bug the v2 metrics composite fixes: v1 used sig-strike
  *accuracy %* differential and ignored the `STR` volume columns entirely — a fighter landing
  8-of-10 "beat" one landing 90-of-200; v2 uses landed-strike volume as the headline with accuracy
  as a balancer.

## 2026-06-10

- **ALGORITHM_PATCH v1 written** — six fixes for the additive model (sort/display bug, tuning
  changes). Superseded two days later by the v2 Elo rewrite; retained at
  `docs/plans/ALGORITHM_PATCH.md` as the record of how v1 was tuned and why it was abandoned.
