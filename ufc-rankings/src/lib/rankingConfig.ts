// ─────────────────────────────────────────────────────────────────────────
//  UFC AI Rankings — Tunable Config (v2, Elo-based)
//
//  THE ONLY FILE A DEVELOPER TOUCHES TO TUNE THE ALGORITHM.
//  Nothing in eloEngine.ts or scoringEngine.ts is hardcoded — every weight,
//  multiplier, threshold and decay rate is imported from here. If you add a
//  new tunable, add it HERE first, then reference it.
//
//  v2 model summary (see CLAUDE.md "THE ALGORITHM" for the full rationale):
//    • A fighter's core strength is an ELO RATING earned by beating good
//      opponents. Beating cans barely moves it; beating elites moves it a lot.
//      This means opponent quality / strength-of-schedule is baked into the
//      rating itself — it is NOT a separate additive pile of points.
//    • Recency dominates: ratings drift toward the mean during inactivity, and
//      old fights are overwritten by newer ones. Raw career win COUNT never
//      drives magnitude.
//    • Striking/grappling metrics, an official-rank seed, and a strength-of-
//      schedule nudge are small BOUNDED adjustments layered on top of Elo.
// ─────────────────────────────────────────────────────────────────────────

export const RANKING_CONFIG = {

  // ═══ ELO CORE ═════════════════════════════════════════════════════════
  elo: {
    initialRating: 1500,        // Everyone starts here (league mean)
    baseK: 24,                  // Base K-factor: max points a single result can move a rating
    // Finish-weighted K: a KO/TKO moves ratings more than a split decision.
    // K for a fight = baseK * finishMultipliers[method] (see below).

    // Provisional period — new fighters converge faster.
    provisionalFights: 5,       // First N fights use the boosted K
    provisionalKMultiplier: 1.5,
    // While a fighter is still PROVISIONAL, damp the finish-method K multiplier
    // toward 1.0 by this factor: effMult = 1 + (finishMult − 1) × this. The bug
    // it fixes: finish (×1.4) STACKED with the provisional boost (×1.5) gave a
    // newcomer K ≈ 50 (2.1× base), so KO'ing/subbing low-rated opponents in the
    // first 5 fights paid +22–24 EACH and rocketed a "finisher over cans" above
    // proven gatekeepers who beat elites by decision. 0 = finishes earn NO extra
    // K while provisional (converge fast, but on the RESULT not the method);
    // 1 = full finish credit even while provisional (old behaviour). The finish
    // multiplier still applies at full strength once a fighter is established.
    provisionalFinishDamp: 0.5,

    // ── WIN-QUALITY GATE ──────────────────────────────────────────────────
    // Scale the points a fighter GAINS from a win by the OPPONENT'S ABSOLUTE Elo:
    // beating a strong opponent (≥ winQualityFullElo) earns full credit; beating a
    // weak one (≤ winQualityLowElo) earns only winQualityGateFloor of it; linear
    // between. gainMult = 1 − winQualityGate·(1 − q), q = clamp((oppElo−low)/(full−low),
    // floor, 1). So an unbeaten streak over weak competition PLATEAUS near that
    // slate's level instead of floating into contention (fixes the undefeated-
    // streak inflation the audit flagged: Robertson/Stirling/Salkilld climbing
    // top-8 on sub-median slates), WITHOUT punishing an elite who beats other
    // elites (keyed on absolute opp Elo, not gap-to-winner). LOSSES untouched (they
    // still count in full). winQualityGate: 0 = off, 1 = full gate. Tune via
    // scripts/winGateExperiment.ts, then re-anchor displayCurve to the new spread.
    // Set to 0.5 on 2026-07-04: the sweep showed 0.5 pushes soft-slate streakers
    // (Robertson #1→#4, Edwards #1→#5, Allen off MW #1) down to where their
    // competition justifies while elites who beat quality hold (Chimaev→MW #1);
    // 1.0 over-gated (collapsed the pool). displayCurve + winProbDenominator
    // re-anchored to the resulting spread in the same commit.
    winQualityGate: 0.5,
    winQualityFullElo: 1560,     // beat an opponent at/above this → full gain credit (a ranked-calibre win)
    winQualityLowElo: 1460,      // beat an opponent at/below this → only the floor fraction (a soft win)
    winQualityGateFloor: 0.15,   // minimum gain fraction for beating a very weak opponent (never literally 0)

    // Inactivity regression toward the mean. Applied (a) between a fighter's
    // fights based on the layoff gap, and (b) once more from their last fight
    // to "today" so the displayed rating reflects current layoff.
    // rating = mean + (rating - mean) * retentionPerYear^(yearsInactive)
    // CONTINUOUS RECENCY DECAY (2026-07-04 redesign): this is now the SOLE
    // recency-fade mechanism — it replaced the discrete 5yr "boundary discount"
    // (see maxFightAgeYears below) whose synchronized wall drew a jarring
    // league-wide cliff on every veteran's chart. With only a short grace, a
    // little fade applies at EVERY gap for everyone, so pre-window form fades
    // smoothly along each fighter's own timeline (no wall, no cliff, no
    // year-to-year migration) while old results still can't prop up today's
    // rating. Rate chosen empirically (scripts/boundaryRedesign.ts, config "A2"):
    // 0.88/yr + 3mo grace keeps currently-active tenured elites on top while
    // dropping idle veterans (Khabib) and NOT floating raw prospects — the
    // Goldilocks between naive-removal (Jones/Usman float) and over-decay
    // (debutants float). Tradeoff: elite cadence now pays a small (~10 Elo)
    // activity drift it re-earns by winning — the price of continuous fade over
    // the old discrete wall.
    inactivityRetentionPerYear: 0.88,
    inactivityGraceMonths: 5,   // Grace the NORMAL competitive cadence — a gap only starts a
                                // gentle fade once it exceeds a typical active fighter's schedule.
                                // Calibrated to the measured inter-fight gap distribution
                                // (2026-07-09): modern-era median gap ≈6.2mo (~1.9 fights/yr), so
                                // at the old 3mo only ~9% of fights were graced — the model was
                                // decaying ~90% of bouts, i.e. treating the normal 2x/yr cadence as
                                // a layoff. 5mo graces the largest gap band (3-5mo) so a ~2.4x/yr
                                // fighter pays nothing; only real layoffs fade. (Was 12mo when the
                                // discrete boundary did the recency work, then 3mo; now the decay
                                // does it alone.) DELETE/RE-TUNE if the gap distribution shifts —
                                // re-run the gap measurement before touching this.

    // FULLY-INACTIVE second slope (2026-07-06). The single 0.88/yr slope is
    // deliberately gentle so a normal elite cadence (defend every ~10-14mo) pays
    // almost nothing — but that same gentleness let genuinely PARKED legends hang
    // onto top slots (e.g. a former champ idle ~20mo+ still seated top-5 on two old
    // finishes). So past `fullInactivityMonths` the layoff switches to a steeper
    // `inactivityRetentionSteep` per-year rate, applied ONLY to the portion of the
    // gap beyond the threshold. This is piecewise: grace-18mo keeps the gentle 0.88/yr
    // (active/semi-active fighters are UNTOUCHED), and only the truly shelved fade
    // fast. Set fullInactivityMonths huge to disable the second slope.
    // Lowered 24→18mo (2026-07-09) as the PAIR to the grace 3→5 widening: widening the
    // grace uniformly reduces gentle-band decay for EVERYONE idle, which re-floated
    // genuinely parked names (Nunes ~37mo, Jones ~20mo). Pulling the elbow in to 18mo
    // (~3 missed normal cadences) puts those long layoffs back into steep decay, so the
    // grace change lifts only the recently-active (Adesanya 3.4mo, Holloway 4.1mo) —
    // not the retired. The two knobs are coupled: re-tune them together, never alone.
    fullInactivityMonths: 18,        // "fully inactive" elbow — the 1.5-year line
    inactivityRetentionSteep: 0.65,  // steeper per-year retention past the elbow

    // CURRENT-FORM BOUNDARY: how old "old form" is. The full fight history is
    // still swept (so opponent quality / SoS stays calibrated and the rating
    // SPREAD is preserved), but the FIRST time a fighter competes inside this
    // recent window their carried-in rating is regressed once toward the mean by
    // `boundaryRegressionToMean` — a heavy DISCOUNT on pre-window form, not a
    // reset. So a distant-past prime cannot prop up today's number, yet a
    // genuinely elite resume isn't wiped to 1500 (which would reward fight VOLUME
    // as everyone re-climbs from the mean — the opposite of SoS-first). The
    // user-facing Era filter OVERRIDES this: an explicit era is a hard window
    // (drops older fights, no discount) for the historical lens. Set to null to
    // disable the boundary entirely (pure full-history Elo).
    //
    // RETIRED 2026-07-04 (set to null): the discrete wall drew a synchronized
    // league-wide cliff (every veteran's chart dropped at the same rolling
    // calendar date, ~5yr ago, and the cliff MIGRATED forward each year). Recency
    // dominance is now carried entirely by the continuous inactivity decay above
    // (which fades old form smoothly, per-fighter, with no wall). Restore a number
    // here only to bring the discrete boundary back.
    maxFightAgeYears: null as number | null,
    // Fraction toward the mean applied once at the boundary. 0.5 = halve the
    // accumulated above/below-mean rating (heavy discount); 1.0 ≈ the old hard
    // reset; 0 = no discount. The chosen middle keeps the spread (SoS intact)
    // while making recent form dominate.
    boundaryRegressionToMean: 0.5,

    // Weight-class move decay (user decision: "carry with decay/penalty").
    // On a detected division change, the rating regresses toward the mean by
    // this fraction before the fight at the new weight is processed.
    // rating = mean + (rating - mean) * (1 - moveDecayPenalty)
    //
    // BACKTESTED 2026-08-09 (research/backtest/moveDecay.ts) after the proposal
    // to REFUND this on a division-debut win over a ranked opponent. Verdict:
    // don't, and don't lower it either.
    //  • Prevalence: across 828 division debuts, only 15 wins netted a rating
    //    LOSS, and only ONE (Makhachev→WW, 2025-11-15) is decided by this knob
    //    rather than by a long layoff. A one-case mechanism, per the
    //    modeling-discipline gate.
    //  • Direction: re-running the FULL sweep at 0 / .05 / .10 / .15 / .20 and
    //    scoring the debut bouts against the de-vigged BFO close, logloss falls
    //    MONOTONICALLY as the penalty rises (n=140: .6791 → .6730). The data
    //    points away from a refund, not toward one.
    //  • But it is calibration, not signal: give each arm its own temperature
    //    and they collapse to within 0.004 logloss, with best-T falling 1.37
    //    (penalty 0, badly over-confident) → 1.03 (penalty .20, already
    //    calibrated). The decay is doing a shrinkage job a temperature would do.
    //  • Underpowered either way: only 15 debut bouts have a close AND a decay
    //    cost ≥5 Elo; resolving the observed effect at t=2 would need n≈36.
    // So 0.10 remains a fiat value that the available data can neither justify
    // nor refute. Re-run the script before touching it — and note that a refund
    // gated on opponent quality would double-count elo.winQualityGate, which
    // already prices exactly that on the win itself.
    moveDecayPenalty: 0.10,

    // Display mapping: raw Elo → "RankScore" shown in the UI. MONOTONIC PIECEWISE
    // curve (purely cosmetic — order and accuracy are identical to raw Elo).
    // Reads as a ~25–100 scale: the elite tier SATURATES near 99 (so the very
    // best — Makhachev, Topuria, Pereira — all read 98–99 despite small Elo gaps),
    // the contender mid-pack carries the most spread, and the bottom of the
    // rankings floors at ~25 (no ranked name reads near 0). Anchors are
    // [rawElo, displayScore], ascending; values between anchors are linearly
    // interpolated, outside the ends are clamped. Tune the anchors here — nothing
    // else needs to change. (Ranked pool today spans Elo ~1425–1753.)
    // Re-anchored 2026-07-04 for the win-quality-gate spread (measured ranked-pool
    // finalRating: min 1426, p05 1467, p25 1497, med 1520, p75 1548, p90 1582,
    // p95 1598, max 1645 = Makhachev/P4P#1; Oliveira 1620, Merab 1619, Ulberg
    // 1614, Gane 1612, Chimaev/Topuria 1604, Pereira 1601). The gate slightly
    // compressed + lowered the pool, so anchors pulled in to keep champions
    // saturating ~94–99, the median ~60, floor ~25 (scripts/winGateExperiment.ts
    // + a dist probe print these).
    displayCurve: [
      [1426, 25],   // bottom of the ranked pool → ~25 (scale floor)
      [1467, 33],   // ~p05
      [1497, 45],   // ~p25
      [1520, 60],   // ~median ranked fighter
      [1548, 74],   // ~p75
      [1582, 88],   // ~p90 strong champions / top contenders
      [1600, 94],   // ~p95
      [1620, 97],   // Oliveira / elite tier
      [1645, 99],   // Makhachev (clear P4P #1) tier
      [1680, 100],  // headroom ceiling
    ] as [number, number][],

    // Head-to-head win-PROBABILITY scale (display only, for the Compare page).
    // REFIT 2026-07-03: 400 → 200. A symmetric reliability check (both corners,
    // point-in-time ratingBefore — necessary because the winner is listed as
    // fighter-1 ~64% of the time) re-fit the log-loss-optimal denominator over
    // recent (≤3yr) fights at ≈155 and over all history at ≈235; 200 is the robust
    // middle. The OLD /400 was well-calibrated on the pre-boundary-discount spread,
    // but the current-form discount + inactivity regression have since COMPRESSED
    // the ranked pool (best only ~174 Elo above median), so /400 became far too
    // FLAT: recent ECE 0.061 @400 → ~0.02 @200, and dynamic range recovers (top
    // fighter vs a median one reads ~88% instead of ~73%). Display-only — this
    // feeds winProbability() ONLY, never ratings or ordering, so no ranking gate.
    // Re-fit here (scripts/spreadExperiment.ts / boundaryRedesign.ts) if the
    // rating spread is ever recalibrated. REFIT 2026-07-04: 190 → 140 after the
    // win-quality-gate compressed the pool further (symmetric point-in-time
    // log-loss fit: recent≤3yr ≈115, all-history ≈165; 140 is the robust middle).
    winProbDenominator: 140,

    // PROVISIONAL-UNCERTAINTY SHADING (display only). A head-to-head win% is only
    // as trustworthy as the THINNER fighter's UFC sample: two debutants are far
    // closer to a coin flip than their (both ~1500) ratings imply, yet the raw
    // logistic states the tiny gap with full confidence. When either corner has
    // fewer than `provisionalFights` UFC bouts, the shown probability is pulled
    // toward 0.5 by conf = clamp(minFights / provisionalFights, floor, 1):
    //   p_shaded = 0.5 + (p − 0.5) · conf.
    // At/above the provisional threshold conf = 1 (no change). Symmetric; never
    // touches ratings, rankings, or the Elo sweep. Backtest motivation: over the
    // last 10 cards, "thin" fights (a corner <5 UFC fights) hit 52% at the same
    // 55% mean confidence as established fights that hit 59% — the model was
    // equally sure of coin-flips and real edges. This hedges the coin-flips.
    // TESTED 2026-08-11 (research/backtest/shadeFloorTest.ts, bar pre-registered
    // in DWCS_PLAN addendum 3): a floor sweep {0.25..1.0} on 0–2-prior bouts
    // CHOSE 0.25 on the early half (2021–2022-08), but the late half was
    // monotone toward NO shade — flagged as a possible regime shift with the
    // re-test condition "re-run with 2023+ as the choose half once another
    // year of odds exists". Same run exonerated the context overlay on
    // debutants (helps at t=−3.47 on 0–2); the shade, not the overlay, was
    // the debutant drag.
    // RE-TESTED 2026-08-18 (research/backtest/gapProbes2.ts, condition met):
    // on shade-binding bouts the sweep is MONOTONE toward floor 1.0 in BOTH
    // halves — choose 2023-01→2024-08 (n=204) LL 0.6619→0.6301, confirm
    // 2024-09+ (n=134) 0.6557→0.6348 — and removal is flat on 2021–22
    // (+0.004, t 0.5). Mechanism: UFC newcomer bouts are not coin flips
    // (matchmaking creates real favourites), so pulling thin-sample bouts
    // toward 0.5 punished the informed side of the prediction. Floor 1.0
    // makes the shade INERT; the mechanism + knob stay so a regime flip can
    // re-lower it — but only via a two-half sweep like the ones above, never
    // from a pooled fit (the 2026-08-11 run showed pooling mis-picks).
    winProbShadeFloor: 1.0,   // shade neutralized 2026-08-18 — see re-test above
  },

  // ═══ ENHANCED WIN-PROBABILITY MODEL (display only, src/lib/fightPrediction.ts) ═══
  // Layers AGE + STYLE-MATCHUP nudges on the Elo logit so the shown win% reads
  // like an analyst's ("who wins THIS fight?") not just a rating gap. NEVER feeds
  // Elo/rankings and NEVER reads odds. Coefficients are in LOGIT units and were
  // fit walk-forward on established BFO-priced bouts (research/backtest/
  // edgeExperiment.ts) — re-run it and re-read the raw coefficients if the rating
  // spread or feature set changes. Edges are fav-perspective per-15 differentials.
  // Coefficients FIT walk-forward with the Elo logit held at 1 (offset), OOS-
  // validated: adding these lifts established-fight accuracy 57.5%→60.4% and
  // Brier 0.243→0.237 vs pure Elo. Age is the strongest signal Elo lacks; the
  // striking differential is the main STYLE signal; grappling is near-zero here
  // (already priced into Elo among established fighters) and knockdown power fit
  // NEGATIVE/noisy, so it is disabled (0). Re-fit via edgeExperiment.ts.
  winProbModel: {
    enabled: true,
    ageEdgeCoef: 0.080,       // per YEAR the fighter is younger, NEAR PARITY — the slope for small age gaps (Elo has no aging curve)
    // Age saturation (#2): the age edge is diminishing, not linear. A +14yr gap
    // is NOT 2× a +7yr gap in win terms, and old fighters still win — so age is
    // passed through tanh(years / ageSaturationYears). For small gaps this ≈
    // ageEdgeCoef·years (unchanged); for large gaps it saturates at
    // ageEdgeCoef·ageSaturationYears, so age alone can no longer eat the whole
    // cap. Backtest diagnosis: a +14yr gap was saturating maxAdjustmentLogit and
    // turning a 64% Elo call into 84% (Lucindo, Rodriguez).
    ageSaturationYears: 8,
    // Overlay shrink (#1): a single damping factor on the FITTED age+style
    // overlay (NOT flags/pedigree). The overlay was directionally right but too
    // high-variance — it over-promoted moderate favourites past 80% (won 56%)
    // and demoted others into the 40–60 band (won 68%). Shrinking pulls the
    // whole S-curve toward calibration while keeping the log-loss gain.
    // 1.0 = old behaviour; 0 = pure-Elo win % (age/style contribute nothing).
    // REGIME-SHIFT FLAG (2026-09-01, research/backtest/mgs/t6retune.ts, plan
    // docs/plans/MARKET_GAP_SWEEP_PLAN.md): two-half sweep — the choose half
    // (<2024) picked the current 0.65, but the confirm half (2024+) is MONOTONE
    // toward NO shrink (s=1.0: LL 0.6259→0.6183, t −2.20; overlay-live slice
    // 0.6217→0.6140) — the exact shape the shade floor showed before its
    // confirmed removal. Stays 0.65 per the pre-registered both-halves rule;
    // do NOT pool-fit. Re-run the shrink sweep with 2024+ as the choose half
    // once another year of odds exists. Same sweep confirmed winProbDenominator
    // genuinely flat near 140 (confirm arms within 0.0012 LL) — no re-anchor.
    overlayShrink: 0.65,
    grapplingEdgeCoef: 0.001, // NET grappling dominance (td + CONTROL differential) — refit ~0: already priced into Elo
    strikingEdgeCoef: 0.011,  // per unit of striking edge (net landed−absorbed differential)
    powerEdgeCoef: 0,         // knockdown-power edge — fit noisy/negative, disabled
    // Per-BOUT context flags (data/bout_flags.csv). These are NOT in any career
    // stat — they describe a specific booking, so they apply to scheduled/actual
    // bouts (upcoming + backtest), never a hypothetical compare. DOMAIN PRIORS,
    // not fitted (we have no historical flag data to fit on): bounded, negative,
    // and conservative. Applied to the flagged fighter; re-tune if a labelled
    // dataset is ever built. In logit units on the flagged fighter.
    shortNoticeLogit: -0.30,  // stepped in on short notice (<~3 weeks) — less camp, ≈ −7% near 50/50
    missedWeightLogit: -0.15, // missed weight — modest NET penalty (drained tends to outweigh the size edge)
    maxAdjustmentLogit: 1.1,  // cap on |age+style+flags| so no context read flips a clear Elo favourite outright
    minStyleFights: 3,        // need this many metric'd fights each side before style applies
    // NO SKID TERM — studied 2026-08-18 (research/backtest/skidStudy.ts, plan +
    // verdict rule pre-registered in docs/plans/SKID_STUDY_PLAN.md). Aggregate
    // skid pricing is fine (skidders won 42.4%, we priced 41.1%); the signal is
    // HOW the losses happened: decision-only skidders won 51.9% (we said 40.9%)
    // vs 38.3% for finish-heavy skids. The skid+finished-fraction model was
    // DIRECTIONAL — signs agree and strengthen across both halves (train
    // [+0.52, −1.05] → held-out refit [+0.87, −1.65]), held-out affected LL
    // 0.6190→0.5967 — but t=−1.43 misses the pre-registered t≤−2 at n=80.
    // A skid×loss-quality term ("losses to elites are forgiven") REFUTED (sign
    // flip across halves); skid flag alone flat. Do not add any skid/form term
    // from intuition — re-run skidStudy.ts once another year of odds exists,
    // same rule.
    // NO TREND TERM either — studied 2026-08-27 (research/backtest/trendStudy.ts,
    // pre-registered docs/plans/TREND_STUDY_PLAN.md): 4–6-fight strike-diff /
    // absorption / KD-conceded trajectories are FLAT beyond the production prob
    // (the metrics composite's LEVEL already carries what's there). The one
    // directional survivor is recentFinished (KO/SUB losses in last 6: 3+ → won
    // 30.7%, we priced 41.4%, market 42.1%, n=140; t=−1.26 misses the gate) —
    // the SAME loss-method shape as the skid M3, independently constructed.
    // Re-test the two together with skidStudy's re-run; and recency-sharpened
    // finish rates LOSE to career rates (finishRecency.ts — a trait, not form).
    // MARKET-GAP SWEEP 2026-09-01 (research/backtest/mgs/, 6 candidates
    // pre-registered in docs/plans/MARKET_GAP_SWEEP_PLAN.md, gates t ≤ −2
    // held-out; NOTHING cleared, nothing shipped — do not re-propose these
    // from intuition): REACH diff FLAT (train +0.021/inch → held-out ≈0; the
    // market already prices reach); COMMON-OPPONENT net FLAT on both offsets
    // (transitivity already inside Elo); TITLE champion edge FLAT and
    // underpowered (held-out affected n=11 < the pre-registered 25 floor).
    // Two DIRECTIONAL survivors, both sign-stable train→held-out:
    // (1) SOUTHPAW-vs-orthodox +0.126→+0.199 logit, t −0.64 — southpaws won
    // 53.3% of the 392 mixed-stance bouts vs our 50.0% price (market 52.0%);
    // needs ~4–5× the affected sample to clear the gate.
    // (2) CHIN/POWER career rates on the MONEYLINE, t −1.12, both coefs
    // NEGATIVE — the finish-weighted K + metrics finish threat already
    // OVER-credit finishers as moneyline picks, and being-finished-often
    // underperforms our price: the third independent convergence on the
    // loss-method/damage family (skid M3, recentFinished). Any future combined
    // term must audit double-counts vs finishMultipliers, the disabled
    // powerEdgeCoef, AND metricsWeights.knockdownRate/submissionThreat.
    // Re-test alongside skidStudy's standing re-run condition.
    // Pre-UFC pedigree PRIOR (prediction side, DISPLAY-ONLY — never touches the
    // Elo pool). Logit per unit of tapered pedigree-strength difference (A − B),
    // where each side's strength tapers out by seedTaperUFCFights, so it only
    // informs THIN-SAMPLE bouts — exactly where core Elo is a weak estimate and
    // the market's edge on newcomers is largest. Bounded by maxAdjustmentLogit.
    // MEASURED FLAT at scale (2026-08-11, research/backtest/newcomerRetest.ts):
    // on 1,067 ≤5-prior bouts (17× the original 61-bout slice) the paired
    // pedigree ablation gives t = 0.50 — no effect either way. Kept because the
    // original 3–5-bucket motivation still leans its way (t = −0.96) and it is
    // harmless, but do NOT tune this coefficient up expecting newcomer gains,
    // and B.2 (a pre-UFC Elo sweep) stays shelved on this evidence. The real
    // newcomer problem re-localized to 0–2-prior debutants (acc gap −8.5pt vs
    // market), where the whole overlay slightly HURTS vs pure Elo.
    pedigreeEdgeCoef: 0.5,
  },

  // ═══ PRE-UFC RATING — a SEPARATE system from the Elo core ═══
  //
  // Scores a fighter who has NEVER been in the UFC, from the only signals
  // consistently available beforehand. Completely firewalled: it reads no Elo,
  // feeds no Elo, and a fighter's pre-UFC score is discarded the moment they
  // have UFC results (the Elo core is strictly better once real data exists).
  // Powers the Contender Series scout board; never the rankings.
  //
  // CALIBRATED, NOT HAND-TUNED (2026-08-11). Fitted by
  // research/dwcs/calibratePreUfc.ts on the nine-season DWCS cohort (361
  // entrants with full features), target = reachedTop15 (the UFC's own board —
  // external to our engine). Validation is TEMPORAL: fit on pre-2022 entrants
  // (n=224, 18 positives), score on 2022+ (n=137, 18 positives).
  //
  // Model curation — held-out AUC by feature set, which is why only three
  // features ship:
  //     all 5 features .............. 0.683
  //     drop logFights .............. 0.688
  //     CORE 3 (shipped) ............ 0.691   ← simplest, best
  //     record + age only ........... 0.690
  //     age alone ................... 0.674
  // Single-feature held-out AUC: age 0.674, winRate 0.641, finishRate 0.597,
  // tierMult 0.486, logFights 0.444 (BELOW random).
  //
  // Two features were tested and DELIBERATELY EXCLUDED — do not re-add without
  // re-running the calibration:
  //   • finishRate — real alone (0.597) but collinear with win rate (finishers
  //     win more); it fits NEGATIVE in every multivariate model and adds
  //     nothing (0.688 vs 0.691 without it). It also fails on the "did they get
  //     signed" target (0.516 alone). It is DISPLAYED as a style attribute and
  //     deliberately does not move the score.
  //   • experience volume (log fights) — below-random alone, positive
  //     coefficient only as a suppressor artifact. Matches the H1 refutation:
  //     fight count adds nothing once win rate is known. The 13-4 veteran has
  //     no edge over the 4-0 prospect.
  //
  // Held-out performance of the shipped model: AUC 0.691 on reachedTop15,
  // Spearman ρ 0.283 vs settled Elo gain. Modest by construction — this
  // predicts a career from a regional résumé, the hardest question in the
  // sport, and it beats age alone (0.674) only slightly.
  //
  // Weights are the core-3 refit over all 361 rows. RE-RUN the calibration
  // (and update these) after any DWCS dataset refresh; the comment block is
  // the provenance, so keep the numbers and the fit date together.
  // REMOVAL CONDITION: delete this system if a pre-UFC score is ever wired into
  // finalRating, or if a re-fit's held-out AUC drops below age-alone (0.674) —
  // at that point the composite is adding nothing over one column.
  preUfcRating: {
    fitDate: '2026-08-11',
    heldOutAuc: 0.691,
    intercept: -5.2003,
    winRateCoef: 3.1544,   // × (wins / total fights)
    ageCoef: 0.6424,       // × ((ageAnchor − age) / ageScale) — positive = younger better
    tierCoef: 0.4931,      // × the feeder promotion's static tier multiplier
    ageAnchor: 26,
    ageScale: 4,
    // Display curve: map the model's logit onto 0–100 across the cohort's own
    // p05→p95 spread, so a score is read as "where this résumé sits among
    // Contender Series entrants", not as a probability.
    displayLogitP05: -3.4769,
    displayLogitP95: -1.3572,
    // Grade bands on the 0–100 display score (cohort quintile-ish, rounded).
    gradeA: 70,
    gradeB: 40,
    // Below gradeB is C. Missing age or record → ungraded (never guessed).
    // Fine-grained display grades (A+ … C-) subdividing the same bands — the
    // 70/40 A/B boundaries above are unchanged (A- starts exactly at gradeA,
    // B- exactly at gradeB), so the letter FAMILY can never disagree with the
    // coarse grade. Display bucketing only; the score is the source of truth.
    fineGrades: [
      { min: 90, grade: 'A+' }, { min: 80, grade: 'A' }, { min: 70, grade: 'A-' },
      { min: 60, grade: 'B+' }, { min: 50, grade: 'B' }, { min: 40, grade: 'B-' },
      { min: 25, grade: 'C+' }, { min: 10, grade: 'C' }, { min: 0, grade: 'C-' },
    ] as { min: number; grade: string }[],
  },

  // ═══ DWCS SCOUT BAND: CURRENT-FORM GRADE (display-only) ═══════════════
  // Grades a Contender Series entrant's PRESENT level — distinct from the
  // ceiling-forecasting preUfcRating above. The underlying signal is the
  // cross-promotion regional rating (walk-forward 63.9% on held-out regional
  // bouts), graded against the measured distribution of ratings fighters
  // carried INTO their UFC debuts (data/regional_arrival.csv, p10 1540 /
  // median 1595 / p90 1644) — i.e. "does this fighter already rate like
  // someone who makes the UFC?", in UFC-relevant units rather than raw Elo.
  // Validated limit (2026-08-12): the rating is a FLOOR detector — bottom-
  // quartile entrants win early UFC fights at 36.5% vs ~47% for everyone
  // else, and the top three quartiles are indistinguishable — so grade cuts
  // are deliberately coarse above the median. Absence from the graph renders
  // as ungraded, never a guessed grade. Never enters any score.
  scoutFormGrade: {
    // Cuts on the percentile vs UFC ARRIVALS (not the 18k regional pool).
    cuts: [
      { min: 97, grade: 'A+' }, { min: 90, grade: 'A' }, { min: 75, grade: 'A-' },
      { min: 60, grade: 'B+' }, { min: 40, grade: 'B' }, { min: 25, grade: 'B-' },
      { min: 10, grade: 'C+' }, { min: 0, grade: 'C' },
    ] as { min: number; grade: string }[],
  },

  // ═══ RECENCY WINDOWS (for metrics & strength-of-schedule, NOT the Elo core) ═══
  recencyHalfLifeMonths: 15,    // 50% at 15mo, 25% at 30mo — used to weight metric/SoS samples
  recencyCutoffMonths: 48,      // Fights older than this are ignored entirely for metrics/SoS/eligibility

  // ═══ FINISH MULTIPLIERS (scale the Elo K-factor per result) ═══════════
  finishMultipliers: {
    'KO/TKO': 1.4,
    'SUB':    1.4,   // a submission is as decisive a finish as a KO — parity with KO/TKO (was 1.35)
    'U-DEC':  1.0,
    'M-DEC':  0.9,
    'S-DEC':  0.8,
  } as Record<string, number>,

  // ═══ STRIKING / GRAPPLING METRICS (bounded Elo-point adjustment) ══════
  // PRIMARY signal is VOLUME strike differential (strikes landed minus
  // absorbed), balanced by accuracy and grappling. Weights must sum to 1.0.
  metricsWeights: {
    volumeStrikeDifferential:   0.40,  // STR landed - STR absorbed (the headline)
    strikeAccuracyDifferential: 0.15,  // Sig. Str. % edge (balances raw volume)
    knockdownRate:              0.15,  // KDs per fight (STRIKE finish threat)
    takedownDifferential:       0.15,  // TDs landed - absorbed (grappling control)
    submissionThreat:           0.15,  // sub attempts per fight (GRAPPLE finish threat — mirrors knockdownRate)
  },
  metricsScaleElo: 30,          // Max ± Elo points the metrics composite contributes (lowered from 40 — was swinging ranks too hard)
  metricsConfidenceMinFights: 5, // Below this many scored fights, metrics are dampened
  metricsRecentFights: 5,       // How many recent division fights feed the metrics avg
  // Normalization anchors (what counts as a "full" edge for each metric)
  metricsNorm: {
    volumeStrikePerFight: 40,   // |strDiff| of this many strikes/fight ≈ full credit
    accuracyEdge: 0.25,         // |sigStrPct diff| of this ≈ full credit
    knockdownsPerFight: 1.5,    // this many KD/fight ≈ full credit
    takedownsPerFight: 3,       // |tdDiff| of this ≈ full credit
    submissionsPerFight: 2,     // this many sub attempts/fight ≈ full credit (grapple finish threat)
  },

  // ── OPPONENT-QUALITY DAMPER on POSITIVE metrics (2026-07-06) ──────────────
  // Dominant striking/grappling stats padded against a WEAK slate shouldn't
  // inflate the rating — the metrics composite is opponent-blind, so a fighter
  // racking up gaudy differentials over sub-median competition otherwise reads
  // like elite dominance. Scale POSITIVE metricsBonus by a ramp on the fighter's
  // slate quality (sosElo): FULL credit at/above metricsQualityFullElo, down to
  // metricsQualityFloor at/below metricsQualityLowElo, linear between:
  //   mult = floor + (1 − floor)·clamp((sosElo − low)/(full − low), 0, 1)
  // NEGATIVE metrics (being out-struck/out-grappled) are UNTOUCHED — a soft
  // performance counts against you regardless of who you faced. Diagnosed on the
  // LHW audit: Navajo Stirling (5-0 over a ~1475 slate) was earning +15 metrics,
  // seating him at #3–4; the damper cuts that to ~+7 (slate-honest) while legit
  // dominators over real comp (Tsarukyan +17.8 vs a 1528 slate, Morales +13.9 vs
  // 1535) are preserved. Surgical: established fighters' near-zero metrics are
  // unaffected. Display flows through unchanged (metricsBonus is still ± Elo pts).
  metricsQualityDamp: true,
  metricsQualityFullElo: 1520,  // slate at/above this → full metrics credit
  metricsQualityLowElo: 1460,   // slate at/below this → only the floor fraction
  metricsQualityFloor: 0.30,    // minimum metrics fraction for a very weak slate

  // ── "UNTESTED" HOLD — bowling-spare résumé gate (2026-07-06) ──────────────
  // An undefeated riser who has beaten NOBODY ranked shouldn't sit among proven
  // contenders on Elo alone. Like a bowling spare, the pins are "pending" until
  // the next ball counts them: a fighter whose best CAREER win is below the
  // ranked-calibre threshold is HELD BACK in the rankings until they beat someone
  // real — at which point the penalty RELEASES entirely and (since Elo already
  // banked the big win) they jump. Ranking-only: never touches Elo, and P4P
  // subtracts it back out (a shallow-division prospect shouldn't be double-dinged
  // cross-division — P4P is an Elo-pool board). Penalty scales with how far the
  // best win falls short AND tapers out by fight count, so PROVEN VETERANS are
  // immune by construction (a faded ex-champ has both a career quality win and
  // 10+ fights). Diagnosed on the LHW audit: Navajo Stirling (5-0, best win
  // ~1507, no ranked scalp) held from #4 to #5 behind Azamat Murzakanov (6-1,
  // who HAS a ≥1550 win → released); blue-chip prospects with real wins (Morales,
  // Umar, Tsarukyan) and all established vets are untouched. Surfaced in the
  // "why this rank" decomposition as a releasable hold.
  untestedHold: {
    enabled: true,
    thresholdElo: 1550,   // a career WIN over an opponent at/above this releases the hold
    rampElo: 70,          // penalty ramps to full over this many Elo below threshold
    maxPenaltyElo: 25,    // max Elo points held back (at full shortfall, 0 fights)
    taperFights: 14,      // hold tapers linearly to ZERO by this many UFC fights (vets immune)
  },

  // ═══ STRENGTH OF SCHEDULE ═════════════════════════════════════════════
  // SoS = recency-weighted average of opponents' Elo over the window. Elo
  // ALREADY rewards a tough schedule, so this is a small bounded NUDGE on top
  // (plus a headline display stat and the primary tiebreaker), not a big pile.
  sosWindowYears: 3,
  sosAnchorElo: 1500,           // Schedule at league-average Elo earns zero nudge
  sosSlopePerElo: 0.05,         // Elo points of nudge per Elo point of schedule above/below anchor
  sosAdjustCap: 30,             // Clamp the SoS nudge to ± this many Elo points

  // ── Schedule-strength DISPLAY curve (0–100), ABSOLUTE ─────────────────────
  // sosElo is an AVERAGE of opponent Elos, so it compresses toward the mean —
  // nobody's average opponent is a lone 1700+ champ, and the toughest slate
  // anyone realistically assembles caps around ~1610–1620 league-wide. Reusing
  // the fighter-rating displayCurve (ceiling 1760) therefore squashed every
  // schedule into the bottom-to-middle of the scale (Gaethje's elite slate read
  // ~74). This curve is anchored to the OBSERVED sosElo distribution instead
  // (league-wide across all men's divisions: p05≈1473, med≈1529, p95≈1596,
  // p99≈1608, max≈1617), so a top-contender slate saturates near 100 and a soft
  // one honestly reads low. It stays ABSOLUTE (global Elo pool), so a shallow
  // division's best schedule reads lower than a deep division's — by design.
  // DISPLAY ONLY: this feeds strengthOfSchedule/scheduleStrength, never the
  // rating (sosNudge uses the raw sosElo above).
  sosDisplayCurve: [
    [1450, 15],   // bottom of the ranked pool
    [1475, 25],   // ~p05
    [1505, 40],   // ~p25 (Salkilld tier)
    [1530, 58],   // ~median schedule
    [1558, 74],   // ~p75
    [1582, 88],   // ~p90
    [1596, 94],   // ~p95 (Gaethje tier)
    [1610, 99],   // ~p99 (Topuria / Makhachev tier)
    [1620, 100],  // toughest realistic slate → ceiling
  ] as [number, number][],

  // ── Schedule-strength ACTIVITY dampener (DISPLAY ONLY) ────────────────────
  // The displayed "schedule strength" combines opponent quality (sosElo) with
  // how CURRENT that résumé is: scheduleStrength = qualityScore × dampener,
  // dampener = activityFloor + (1 − activityFloor) × activity, where
  // activity = (1 − cadenceWeight)·recency + cadenceWeight·cadence, all in [0,1].
  // This is a presentation composite ONLY — it never touches finalRating. The
  // Elo core already regresses inactive ratings toward the mean (see the
  // inactivity block above), so folding activity into sosNudge would double-
  // count a layoff. Keep this out of the rating path.
  activityGraceMonths: 12,        // Layoffs shorter than this take no discount (matches Elo grace)
  activityFullDecayMonths: 33,    // Recency contribution hits 0 at this many months out
  activityFloor: 0.7,             // A fully stale/thin résumé keeps this fraction of its quality score
  activityTargetFightsPerYear: 2, // Cadence hits 1.0 at this pace over the window
  activityCadenceWeight: 0.3,     // activity = 0.7·recency + 0.3·cadence (recency-led)

  // ── ALL-TIME (career) strength of schedule — DISPLAY ONLY ─────────────────
  // A career-wide companion to the windowed sosElo above: the mean rating of
  // every opponent a fighter has faced, taken AT THE TIME OF EACH FIGHT (the
  // Elo trace's `opponentRating` = the opponent's pre-fight rating). It answers
  // "how hard was this career?", not "how hard is this fighter's form now".
  //
  // Deliberately different from sosElo on all three axes, so the two never say
  // the same thing: career-wide (no window), un-weighted (no recency half-life),
  // and strictly fight-time (NOT max(fight-time, current) — crediting an
  // opponent's later peak would misreport what the fighter actually walked into).
  //
  // Reported as a PERCENTILE against the all-era pool rather than a 0–100 curve:
  // a career mean compresses hard (measured over 1,863 fighters with 3+ traced
  // fights — p05 1484, p50 1503, p95 1539, max 1579, vs the windowed sosElo's
  // p95 of 1596), so an absolute curve would squash every career into a narrow
  // band. Same reasoning as the grappling ramp (grappleGradient.ts).
  //
  // DELETE THIS if a career-SoS number ever gets wired into finalRating — the
  // Elo core already banks opponent quality per fight, so scoring it again would
  // be a straight double-count. It exists to be READ, never to rank.
  careerSos: {
    minFights: 3,          // traced fights required to enter the percentile pool
    eliteOpponentElo: 1550, // "faced an elite" threshold (matches untestedHold.thresholdElo)
    topOpponents: 5,       // N toughest opponents averaged for the "elite exposure" read
    // Ratings cold-start at 1500 and the early UFC had no rating history to
    // spread the field, so a career fought mostly before this year compresses
    // toward the mean (measured p95−p05 spread: 34.5 Elo pre-2001 vs 57.7 for
    // 2019+). Careers median-dated before this get a caveat flag, not a fudge.
    eraCaveatBeforeYear: 2001,
  },

  // ═══ OFFICIAL RANKINGS SEED ═══════════════════════════════════════════
  // The internal /api/official-rankings route (Octagon API) supplies the
  // current UFC rank. With Elo doing the heavy lifting, this is a small seed +
  // a post-sort safety floor — NOT the main driver. If floors fire for more
  // than ~1–2 fighters per division, the Elo model isn't landing — investigate.
  officialBonusScaleElo: 0.1,   // officialBonus(Elo pts) = seedScore * this (champ seed 100 → +10).
                                // Lowered 0.5→0.4 (2026-06-18), then 0.4→0.1 (2026-07-03): the
                                // current-form boundary discount compressed the ranked pool's spread
                                // (median adjacent top-25 gap ≈3 Elo), so a +25–40 seed had become
                                // worth 5–10 ranking spots — an override, not a tiebreaker (87
                                // fighters propped ≥3 spots; see scripts/diagOfficialImpact.ts).
                                // At 0.1 the seed spans +6.2 (#11–15) to +10 (champ) ≈ 2–3 median
                                // gaps — a genuine nudge (12 fighters move ≥3 spots, max +5).
                                // Re-anchor this if the display/rating spread is recalibrated again.
  officialRankScores: {
    'C': 100, '1': 90, '2': 85, '3': 85, '4': 78, '5': 78, '6': 78,
    '7': 70, '8': 70, '9': 70, '10': 70,
    '11': 62, '12': 62, '13': 62, '14': 62, '15': 62,
  } as Record<string, number>,
  // Form gate on the seed (2026-07-02 diagnostic: scripts/diagOfficialImpact.ts).
  // The official list is slow to shed fading names, so a NON-CHAMPION on a losing
  // streak this long gets NO seed — the cage's verdict stands over the UFC's list
  // (same philosophy the retired contender floors used; the champion seed,
  // like the champion floor, is unconditional). Without this, ~50 seeded fighters
  // on 2+ skids (e.g. a 5-fight skid still paying +28 Elo) were being propped
  // 3–16 spots above their in-cage rating.
  officialSeedSuppressLossStreak: 2,
  // Post-sort champion floor (the ONE remaining safety floor): a reigning champ
  // never displays below this slot. Unconditional. PURPOSE: catch Elo
  // UNDER-rating a genuine champ on a thin recent sample — NOT to prop up
  // decline. (Contender floors — top-5 ≥ #8 / top-15 ≥ #25 with loss-streak
  // suppression — were removed 2026-07-06: once made Elo-respecting they were
  // provably inert, so they were dropped outright; golden-master identical.)
  championFloorRank: 2,           // reigning champ: always ≤ this (unconditional)
  // Champion tiebreaker: a REIGNING champ (official rank "C") sitting directly
  // below a non-champion whose finalRating is within this many Elo points gets
  // lifted above them. Only breaks genuine near-ties at the very top — it does
  // not boost a champ who is clearly out-rated. (An undefeated champ is already
  // rewarded by Elo carrying no loss drag.)
  championTiebreakerBand: 8,

  // Head-to-head leapfrog: a fighter who RECENTLY and DECISIVELY beat someone
  // ranked above them is lifted to directly above that opponent. Elo is
  // gap-preserving, so a single decision win narrows the gap without flipping the
  // order; this correction enforces the in-cage result. ANTI-VAULT (2026-07-04):
  // beating the victim is a LOCAL reorder — it may pass a FEW un-beaten in-between
  // fighters (Topuria beat Oliveira, jumps 2 → allowed) but not a big STACK of
  // superior fighters the winner never fought (Hernandez beat Allen, would jump ~5
  // incl. pristine-résumé Chimaev → blocked). See leapfrogMaxUnbeaten. Guard rails
  // keep one result from overriding the rating wholesale:
  //   • recencyMonths — the meeting must be within this window of "today"; a
  //     stale win can't override years of divergence.
  //   • negateOnLossAfter — if the winner has lost to ANYONE after that meeting,
  //     their form has already turned, so the win no longer proves superiority
  //     and the leapfrog is cancelled.
  //   • decisiveOnly — split decisions / draws don't qualify (a razor-thin split
  //     shouldn't reorder the division).
  //   • eloGapCap — only applies when the two are within this many Elo points, so
  //     a lone upset can't vault someone over half the division.
  //   • leapfrogMaxUnbeaten — the win may reorder the winner past at most this many
  //     UN-BEATEN in-between fighters (a local reorder). Beyond it the leap is
  //     skipped: one win shouldn't vault a fighter over a whole stack of superior
  //     résumés they never fought. Topuria→Oliveira jumps 2 (allowed);
  //     Hernandez→Allen would jump ~5 incl. Chimaev (still blocked at 4).
  //     Widened 3→4 (2026-07-10) so Costa's KO of Murzakanov lifts him above the
  //     man he finished (LHW #9→#4); this was the ONLY edge in the data on the 4
  //     boundary — zero collateral in the other 11 divisions. Caveat: no held-out
  //     metric supports 4 over 3, and the jump also passes Prochazka/Jacoby/
  //     Stirling/Reyes (un-fought). DELETE-BACK-TO-3 CONDITION: if any future card
  //     produces a single-win 4-vault over a clearly superior résumé the winner
  //     never faced, this is too loose — revert and handle Costa as an override.
  headToHead: {
    recencyMonths: 18,
    negateOnLossAfter: true,
    decisiveOnly: true,
    eloGapCap: 50,
    leapfrogMaxUnbeaten: 4,
  },

  // ═══ ELIGIBILITY ══════════════════════════════════════════════════════
  minUFCFights: 3,              // Minimum UFC fights to appear at all
  rankingsDepth: 40,            // Fighters ranked per division

  // ═══ PROSPECT WATCHLIST (/prospects — DISPLAY ONLY) ═══════════════════
  // Feeds NOTHING. `prospects.ts` reads engine output (Elo, rankings) and never
  // writes back; these knobs move a page, not a rating.
  //
  // The ORDER is raw Elo and deliberately stays that way. A 2026-08-05 held-out
  // backtest tested replacing it with climb rate ((elo−1500)/fights) to remove the
  // fight-count ceiling — REFUTED. Over fighters inside the window at T with a
  // later fight (n=112 at T=2023-08-05, n=118 at T=2024-08-05), raw Elo beat both
  // climb and shrunk-climb on every outcome, including the fully external one
  // (reaching the UFC's own official top 15: AUC 0.716/0.744 raw vs 0.645/0.619
  // climb vs 0.702/0.718 shrunk k=3). Shrinkage only helped by converging BACK
  // toward raw Elo. The ceiling is Elo correctly encoding evidence — five banked
  // wins predict more than one fast start — so do not "fix" it without beating
  // those numbers first. Full write-up: docs/CHANGELOG.md 2026-08-05.
  prospects: {
    // Must track elo.provisionalFights — the page's whole premise is "still inside
    // the provisional-Elo window", so a divergence would make the copy a lie.
    // Asserted at module load in prospects.ts rather than trusted.
    maxUFCFights: 5,
    activeWithinMonths: 15,     // idle longer than this drops off unless a fight is booked
    minPedigreeFights: 3,       // don't render a 1-fight pre-UFC "record"
    listLimit: 20,              // entries shown per tier

    // Shrinkage constant for the OPT-IN climb-rate view: (elo − 1500) / (n + k).
    // This orders the alternate view only — the default sort is raw Elo and stays
    // that way (see the refutation note above). k trades differentiation against
    // small-sample noise, and the backtest measured the tradeoff directly: as k
    // rises the ordering converges toward raw Elo (ρ 0.472 at k=1 → 0.511 at k=5),
    // which is the whole reason this is a view and not the default. 3 is a tested
    // mid-point — differentiated enough to surface fast starters the Elo ceiling
    // hides, shrunk enough that a single lucky debut doesn't top the list.
    climbShrinkK: 3,

    // ── Ranked sort key: tested and REFUTED as a swap (2026-08-11) ──
    // The "sort /prospects on finalRating instead of raw elo" hypothesis
    // (pedigreeBonus never reaches the ordering) was run on the committed
    // harness (research/prospects/sortKeyBacktest.ts, bar pre-registered in
    // DWCS_PLAN.md): ΔAUC on the external top-15 target +0.003/−0.001
    // (ranked) and +0.000/−0.006 (unheld), all CIs spanning 0 — despite the
    // adjustments being live (mean |adj| ~8.5 Elo, ~80% of the cohort with a
    // pedigree seed). The internal ρ targets improved slightly, so the ranked
    // key is harmless but adds nothing where it counts; raw elo stays. Revisit
    // only via a re-run of that script at a fresh horizon.

    // ── DWCS / record-shape terms: tested and REFUTED (2026-08-11) ──
    // The Contender Series cohort study (docs/plans/DWCS_PLAN.md, Phase E gate
    // in research/prospects/phaseEGate.ts) scored every pre-registered
    // candidate on the committed two-horizon harness. None cleared the bar
    // (ΔAUC ≥ +0.02 at both horizons over elo@T, 90% CI excluding 0):
    // pre-UFC loss count +0.007/+0.013 (CIs span 0); undefeated flag
    // +0.000/+0.023 with the coefficient FLIPPING SIGN across horizons;
    // DWCS-passage −0.005/+0.014; DWCS-winner ~0; feeder tier/grade
    // +0.030/+0.046 but the 2023 CI includes 0 (in-sample fits). Do not add a
    // record-shape or DWCS term to pedigreeStrength from intuition — re-run
    // the gate first. The descriptive findings (age dominates, finish-win
    // ≈ guaranteed contract) live on /contender-series as display insight.

    // ── Prospect vs newcomer split (a DEFINITIONAL line, not a predictive one) ──
    // "≤5 UFC fights" conflates two populations: genuine prospects, and established
    // fighters importing a career (Michael Page 39/23 pre-UFC bouts, Amosov 32).
    // The backtest above cannot arbitrate this — a predictive metric ranks Page
    // highly and is RIGHT to; the objection is that he is not in the category, not
    // that he is over-rated. So this is a stated definition, deliberately carrying
    // no scoring term and no new signal.
    //
    // AGE-PRIMARY on purpose. An earlier draft used (age ≥ 32 OR pre-UFC ≥ 15) and
    // false-positived Kevin Vallejos (24, 15 pre-UFC bouts) — unambiguously a
    // prospect. Runway is the scouting variable; pre-UFC volume only stands in when
    // age is unknown (25% of the pool), and an unknown-age fighter with a short
    // record defaults to PROSPECT so missing data never silently demotes anyone.
    veteranAgeYears: 32,
    veteranPreUFCFightsIfAgeUnknown: 20,

    // DELETE the split (collapse back to one list) if the UFC's signing pattern
    // changes such that fewer than ~3 fighters per refresh land in the newcomer
    // tier — at that point it is two headings for one list.
  },

  // ═══ P4P RECENT-FORM TILT (display-only, P4P list ONLY) ═══════════════
  // P4P is meant to be the CURRENT best-of-best. A fighter's all-time Elo can
  // coast on banked prime equity — their recent fights start from a high
  // carried-in baseline, so a flat/declining recent run still leaves the rating
  // near its peak (e.g. Oliveira: 4-2 / +23 net Elo over 3.5y but rated #2;
  // Volkanovski: 3-3 / -9 and still top-4). This applies a BOUNDED tilt to the
  // P4P sort key ONLY — it never touches the Elo core, division rankings, or the
  // golden master. Signal = recency-weighted net Elo swing over the window, with
  // each WIN's contribution GATED by the opponent's absolute quality (mirrors the
  // Elo core's winQuality gate): beating an elite counts full, beating a can
  // barely counts — so a hot streak padded against mid-tier opposition does NOT
  // outweigh fewer wins over elites (Prates beating JDM + Leon rates above a
  // volume-padded record). LOSSES keep full weight, so losing to a can still
  // hurts. Coasters/decliners get a small tilt while active elite-beaters approach
  // the cap, so the proven-but-stale slide a few spots without leaving the tier.
  p4pRecentForm: {
    enabled: true,
    windowYears: 3.5,     // how far back "recent form" looks
    halfLifeMonths: 18,   // recency half-life within the window (last ~18mo dominate)
    lambda: 0.4,          // tilt = lambda × (recency-weighted quality-gated net Elo); gentle
    cap: 18,              // clamp the tilt to ±this many Elo points (bounded)
    qualityFullElo: 1560, // beating an opponent at/above this → full win credit
    qualityLowElo: 1460,  // beating an opponent at/below this → only the floor fraction
    qualityFloor: 0.15,   // minimum win-credit fraction for beating a very weak opponent
  },

  // ═══ DIVISION OVERRIDES ═══════════════════════════════════════════════
  // Manual fixes for fighters whose division/rank in the API is stale (e.g. a
  // permanent weight move, or a title change the Octagon API hasn't caught up
  // to). Overrides take precedence over the API and are applied first.
  divisionOverrides: {
    // (ALL title-change overrides removed 2026-08-03: the refreshed ufc.com
    // snapshot now lists every one natively — Makhachev WW "C", Yan BW "C",
    // Ulberg LHW "C", Strickland MW "C", Van FLW "C", Gaethje LW "C" — so each
    // premise expired, and three had begun CONTRADICTING the live board (it had
    // JDM at WW #4 vs our pinned #1, Ankalaev LHW #1 / Pereira #3 vs our pinned
    // #2/#1). Champion audit 2026-08-03 confirmed all 11 divisions consistent.
    // Measured impact of removal: seeds/ranks now follow the board — LHW
    // Ankalaev/Pereira seed swap, JDM's displayed UFC rank 1→4 — no champion
    // identity changes anywhere.)
    // (Dern/Zhang WSW overrides removed 2026-07-14: ufc.com now lists Dern as
    // WSW "C" and Zhang at WSW #1 natively, so both resolve straight from the
    // official snapshot. The old pair — crown Dern, evict Zhang to flyweight —
    // dated from when the feed still stale-listed Zhang as WSW champ. Zhang is
    // scored at WSW again (#1, ~1593, champ floor puts Dern #2); if she books a
    // flyweight fight the official board move will carry her automatically.)
    // (Paulo Costa MW→LHW override removed 2026-07-06: ufc.com now ranks him at
    // LHW #8 directly and no longer lists him at MW, and his weightClass data is
    // now Light Heavyweight — so he resolves natively from the official snapshot
    // with his real #8 seed. The old 'NR' + removeFrom:Middleweight pin, added
    // while the feed still had him at MW #13, is obsolete.)
  } as Record<string, { division: string; rank: string; removeFrom?: string }>,

  // ═══ PROMOTION TIERS ══════════════════════════════════════════════════
  // Scale how much a fighter's PRE-UFC record counts, by where it happened.
  // Ladder rationale:
  //   tier1   UFC — the bar.
  //   tier2   DWCS/Contender Series — UFC-vetted pipeline; a win here is the
  //           single most UFC-predictive non-UFC result (Dana hand-picks, and
  //           winners get a contract on the spot).
  //   tier2_5 Bellator / ONE / PFL / RIZIN / Invicta — major global promotions,
  //           strong but a separate ecosystem from the UFC pipeline.
  //   tier3   Established national/regional feeders (Cage Warriors, LFA, KSW…).
  //   tier4   Everything else (small regional / unknown).
  //   historical  Pride / Strikeforce / WEC — elite but DEFUNCT. `historical:true`
  //           marks them CONTEXT/GRADING ONLY: usable for all-time/historical
  //           views, never fed as current-form pedigree for today's rankings.
  // Multipliers are the tunable knobs — adjust here.
  promotionTiers: {
    tier1:      { promotions: ['UFC'], multiplier: 1.0 },
    tier2:      { promotions: ['DWCS', 'Contender Series'], multiplier: 0.78 },
    tier2_5:    { promotions: ['Bellator', 'ONE Championship', 'PFL', 'RIZIN', 'Invicta FC'], multiplier: 0.68 },
    tier3:      { promotions: ['Cage Warriors', 'LFA', 'KSW', 'M-1', 'Pancrase', 'Shooto', 'Deep', 'Titan FC', 'CFFC', 'MFC', 'Brave CF', 'Jungle Fight', 'KOTC'], multiplier: 0.55 },
    tier4:      { promotions: ['Regional', 'Unknown'], multiplier: 0.35 },
    historical: { promotions: ['Pride', 'Strikeforce', 'WEC'], multiplier: 0.68, historical: true },
  } as Record<string, { promotions: readonly string[]; multiplier: number; historical?: boolean }>,

  // ═══ PRE-UFC PEDIGREE (cross-promotion historical reference) ══════════
  // Source: data/pro_mma_fights.csv (Kaggle/Sherdog, ends Aug 2021).
  // PURPOSE: gauge the quality of a fighter's record in OTHER promotions
  // BEFORE they reached the UFC — nothing more. It is NOT a current-form
  // signal (the data is frozen at 2021) and must never outweigh UFC results.
  preUFCPedigree: {
    enabled: true,
    sourceFile: 'pro_mma_fights.csv',
    // Org substrings dropped outright. UFC rows here duplicate our UFC-only
    // dataset, so excluding them guarantees ZERO double-counting.
    excludeOrgSubstrings: ['Ultimate Fighting'],
    // Only count non-UFC fights dated strictly before the fighter's UFC debut.
    onlyBeforeUFCDebut: true,
    // Sample size at which pedigree confidence saturates (fewer fights = damped).
    confidenceFullFights: 5,
    // Org label → tier-key resolution (matched by substring, first hit wins).
    // Falls back to defaultTier when nothing matches.
    orgTierMatchers: [
      { tier: 'tier2', match: ["Dana White's Contender", 'Contender Series', 'DWCS'] },
      { tier: 'tier2_5', match: ['Bellator', 'ONE Championship', 'One Championship', 'PFL', 'RIZIN', 'Invicta'] },
      { tier: 'historical', match: ['Pride', 'Strikeforce', 'WEC'] },
      { tier: 'tier3', match: ['Cage Warriors', 'LFA', 'KSW', 'Pancrase', 'Shooto'] },
    ] as Array<{ tier: string; match: string[] }>,
    defaultTier: 'tier4',
    // Hard ceiling on pedigreeStrength regardless of tier (safety clamp).
    maxStrength: 0.75,

    // ── Ranking seed (Sherdog-sourced, scoring side) ──────────────────────
    // MASTER TOGGLE — currently ON (enabled in the trust pass, golden-master-
    // blessed). Lets pedigree nudge thin-sample fighters only; set false to
    // make pre-UFC pedigree contribute ZERO to finalRating (rankings identical
    // to having no Sherdog data).
    seedEnabled: true,
    seedSourceFile: 'sherdog_fights.csv',   // built by scripts/sherdog/buildContext.ts
    // Max Elo points the pedigree can add (bounded + small — it should refine
    // edge cases, never reorder the division). Compare to officialBonus (≤50).
    seedMaxElo: 25,
    // Thin-sample only: the seed tapers linearly from full (0 UFC fights) to
    // ZERO at this many UFC fights — once a fighter has a real UFC sample, their
    // own Elo speaks and the pedigree fades out entirely.
    seedTaperUFCFights: 6,
    // Defunct elite orgs (Pride/Strikeforce/WEC, tier `historical`) are excluded
    // from the current-form seed — they remain available for all-time context.
    seedExcludeHistorical: true,

    // ── Empirical promotion grading (Workstream A) ────────────────────────
    // Replace/blend the hand-tuned promotionTiers.multiplier with a DATA-DRIVEN
    // grade: how well fighters who graduated from promotion X actually perform in
    // the UFC (settled Elo gain, empirical-Bayes shrunk). Built offline by
    // scripts/sherdog/gradePromotions.ts → data/promotion_grades.csv. When the
    // file is absent or the toggle is off, the seed falls back to the static tier
    // multiplier (identical to pre-grading behaviour).
    useEmpiricalGrades: true,
    gradeSourceFile: 'promotion_grades.csv',
    gradeBlendLambda: 0.5,   // mult = λ·empiricalGrade + (1−λ)·staticTierMultiplier
    gradeMinGraduates: 8,    // below this graduate count, trust the static tier instead
    gradeShrinkageKappa: 15, // empirical-Bayes pseudo-count: shrink small-n orgs toward the global mean
    // Orgs that are UFC TRYOUTS/showcases, not developmental feeder promotions —
    // matched by canonicalOrg substring (case-insensitive). Excluded from FEEDER
    // attribution (so a fighter is graded on where they actually came up, not the
    // doorway) and therefore never graded as a promotion. The win still counts
    // toward the pre-UFC record; it just isn't the fighter's "feeder identity".
    // DWCS is Dana White's Contender Series — a one-fight UFC tryout.
    feederExcludeOrgs: ['Contender Series', "Dana White"],

    // ── Deeper pre-UFC strength of schedule (Workstream B.1) ──────────────
    // A win rate is blind to WHO you beat. sherdog_fights.csv carries
    // opponentSherdogId on ~100% of rows, and ~1,641 pre-UFC opponents are
    // themselves crosswalked UFC fighters — so we can measure how many FUTURE
    // UFC fighters a fighter beat pre-UFC, weighted by those opponents' UFC Elo.
    // Beating a future contender is the strongest pre-UFC signal available.
    // Folded as a BOUNDED additive term into pedigreeStrength (never past
    // maxStrength). Leak note: opponent UFC Elo is the settled (present-day)
    // rating — a mild look-ahead in backtests; acceptable for the tiny seed, to
    // be upgraded to point-in-time opponent Elo later if validation flags it.
    useOpponentSos: true,
    sosWeight: 0.30,     // weight of the SoS term added on top of winRate×confidence×mult
    sosTermCap: 0.40,    // clamp on the SoS term (keeps strength ≤ maxStrength)
    sosNormConst: 300,   // beaten-opponent Elo-above-1500 SUM that reads as a full SoS term
  },

  // ═══ PROFILE RADAR (DISPLAY ONLY — never feeds finalRating) ════════════
  // The 5-axis fighter radar on the profile / compare pages. It is rebuilt
  // from the SAME recency-weighted per-fight signals the ranking metrics use
  // (reusing metricsNorm where they overlap) instead of raw career CSV
  // percentages — so a knockout striker reads high on STRIKE, not just FINISH.
  // STRIKE/GRAPPLE/FINISH blend per-fight form; ACTIVE/OPP-Q are context.
  // Tunables here change ONLY what the radar draws, not who is ranked where.
  radar: {
    recentFights: 5,              // recent division fights sampled (matches metricsRecentFights)
    volumeStrikePerFightFull: 90, // avg strikes LANDED/fight that reads as a full STRIKE-volume axis (data p90≈83, p95≈103)
    accuracyFull: 0.6,            // sig-strike accuracy that reads as a full accuracy contribution (data mean≈0.48)
    controlSecondsFull: 300,      // avg control sec/fight that reads as full GRAPPLE control (data p90≈429)
    activityFullMonths: 24,       // 0 months out → 1.0 on ACTIVE; this many months out → 0.0
    // STRIKE axis blend (weights sum to 1): output volume, KO power, accuracy, output edge.
    strikeWeights: { volume: 0.30, power: 0.30, accuracy: 0.25, differential: 0.15 },
    // GRAPPLE axis blend (weights sum to 1): takedown edge, control time, ground
    // share, submission threat. `submission` was added 2026-07-03 to close a
    // wrestler bias — the axis credited takedowns + top control but ignored
    // submission grappling, so a guard-based submission artist (Pimblett) read
    // as a mid-pack grappler. Sub threat = attempts/fight PLUS a heavy bonus for
    // an actual submission WIN (see radar.subFinishBonus) so finishes juice it
    // far more than bare attempts. Normalized by metricsNorm.submissionsPerFight.
    grappleWeights: { takedownDiff: 0.35, control: 0.35, groundShare: 0.10, submission: 0.20 },
    // A submission WIN counts as this many sub-attempts toward the recent-form
    // half of the GRAPPLE submission signal — so a finish weighs far more than an
    // attempt that went nowhere. With the most-recent fight carrying ~half the
    // recency weight, one recent sub finish alone lifts recent sub credit high.
    subFinishBonus: 3,
    // CAREER submission pedigree (durable, NOT recency-weighted). Recency wipes a
    // fighter's older submission game, but a BODY of finishes is real proof of
    // jiu-jitsu — so the submission signal takes the MAX of "actively submitting
    // people (recent)" and "proven submission career". This is the count of
    // career submission WINS that reads as a full career-sub contribution, with
    // linear diminishing returns: 1 sub is minor (~1/N), a handful is elite. Set
    // deliberately high so a single lucky sub doesn't crown someone a grappler —
    // it takes MULTIPLE finishes to matter (the user's ask).
    careerSubFull: 5,
    // FINISH axis blend (weights sum to 1): career finish rate + recent KO/knockdown threat.
    finishWeights: { careerFinishRate: 0.6, recentKnockdown: 0.4 },
  },
} as const;
