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
    // gap beyond the threshold. This is piecewise: 3-24mo keeps the gentle 0.88/yr
    // (active/semi-active fighters are UNTOUCHED), and only the truly shelved fade
    // fast. Set fullInactivityMonths huge to disable the second slope.
    fullInactivityMonths: 18,        // "fully inactive" elbow — the 2-year line
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
    winProbShadeFloor: 0.25,   // a debut fighter (0 UFC bouts) still keeps 25% of the raw edge
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
    // Pre-UFC pedigree PRIOR (prediction side, DISPLAY-ONLY — never touches the
    // Elo pool). Logit per unit of tapered pedigree-strength difference (A − B),
    // where each side's strength tapers out by seedTaperUFCFights, so it only
    // informs THIN-SAMPLE bouts — exactly where core Elo is a weak estimate and
    // the market's edge on newcomers is largest. Bounded by maxAdjustmentLogit.
    pedigreeEdgeCoef: 0.5,
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
  //     Hernandez→Allen would jump ~5 incl. Chimaev (blocked).
  headToHead: {
    recencyMonths: 18,
    negateOnLossAfter: true,
    decisiveOnly: true,
    eloGapCap: 50,
    leapfrogMaxUnbeaten: 3,
  },

  // ═══ ELIGIBILITY ══════════════════════════════════════════════════════
  minUFCFights: 3,              // Minimum UFC fights to appear at all
  rankingsDepth: 40,            // Fighters ranked per division

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
    // Makhachev moved up and beat JDM for the WW belt; the API hasn't caught
    // up (still lists JDM as champ). Makhachev holds "C", JDM is top contender.
    'Islam Makhachev': { division: 'Welterweight', rank: 'C', removeFrom: 'Lightweight' },
    'Jack Della Maddalena': { division: 'Welterweight', rank: '1' },
    // BW title is stale in the API (still lists Merab as champ). In our data
    // Yan beat Merab for the belt; the series is 1-1 and Yan is the reigning
    // champ, so he holds "C" and Merab is seeded as the top contender.
    'Petr Yan': { division: 'Bantamweight', rank: 'C' },
    'Merab Dvalishvili': { division: 'Bantamweight', rank: '1' },
    // Title changes the API hasn't caught up to, confirmed by the champion audit
    // (scripts/sherdog/championAudit.ts) against current Sherdog results:
    // Van beat Pantoja (FLW). LHW: Pereira VACATED the belt to fight for the HW
    // interim title, so he is no longer champ — Ulberg is the undisputed LHW
    // champ. Ulberg holds "C"; Pereira seeded #1, Ankalaev #2.
    'Carlos Ulberg': { division: 'Light Heavyweight', rank: 'C' },
    'Alex Pereira': { division: 'Light Heavyweight', rank: '1' },
    'Magomed Ankalaev': { division: 'Light Heavyweight', rank: '2' },
    // MW: Strickland beat Chimaev to take the undisputed belt (API still stale).
    // Strickland holds "C"; Chimaev (just dethroned) seeded #1; Du Plessis #2.
    'Sean Strickland': { division: 'Middleweight', rank: 'C' },
    'Khamzat Chimaev': { division: 'Middleweight', rank: '1' },
    'Dricus Du Plessis': { division: 'Middleweight', rank: '2' },
    'Joshua Van': { division: 'Flyweight', rank: 'C' },
    'Alexandre Pantoja': { division: 'Flyweight', rank: '1' },
    // Gaethje KO'd Topuria (R4) at UFC White House / Freedom 250 (2026-06-14) to
    // take the Lightweight belt; the API still lists Topuria as champ. Gaethje
    // holds "C", Topuria — now off his undefeated run — is seeded top contender.
    'Justin Gaethje': { division: 'Lightweight', rank: 'C' },
    'Ilia Topuria': { division: 'Lightweight', rank: '1' },
    // W-Strawweight: Zhang vacated the 115 belt to move up to flyweight (lost
    // to Shevchenko there). Dern won the vacant title. The API still lists Zhang
    // as WSW "C", so we crown Dern and evict Zhang to flyweight.
    'Mackenzie Dern': { division: "Women's Strawweight", rank: 'C' },
    'Zhang Weili': { division: "Women's Flyweight", rank: '1', removeFrom: "Women's Strawweight" },
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
