# Changelog — dated history & superseded decisions

Newest first. This is the project's memory: how each mechanism got here, what was tried and cut,
and the diagnosis that motivated each change. The **current-state** algorithm spec lives in
`docs/ALGORITHM.md`; values quoted here are the values *at the time of the change* and may have
drifted since — `src/lib/rankingConfig.ts` is always the source of truth for current values.

**Validation snapshots** (`ufc-rankings/validation_*.txt`) are committed evidence tied to entries
below; leave them where they are — scripts diff against them.

---

## 2026-07-09

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
