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

    // Inactivity regression toward the mean. Applied (a) between a fighter's
    // fights based on the layoff gap, and (b) once more from their last fight
    // to "today" so the displayed rating reflects current layoff.
    // rating = mean + (rating - mean) * retentionPerYear^(yearsInactive)
    // Gentle on purpose so injured elites (e.g. ~18mo out) aren't nuked.
    inactivityRetentionPerYear: 0.92,
    inactivityGraceMonths: 12,  // No regression for layoffs shorter than this. Set to 12mo
                                // so a normal ELITE cadence (champs defend ~1–2×/yr, often
                                // 10–14mo between bouts) is treated as fully current and pays
                                // NO activity penalty. Decay (the 0.92 slope) still fades a
                                // genuinely inactive veteran past the 1yr mark — a fighter
                                // years out (e.g. last bout 2017) still bleeds toward the mean.

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
    maxFightAgeYears: 5,
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
    // Recalibrated for the post-boundary-discount spread (ranked pool now spans
    // finalRating ~1427–1725; median ~1561, p95 ~1663). The heavy current-form
    // discount tightened the elite band, so anchors were pulled in to keep
    // champions saturating near 96–99 and the floor at ~25.
    displayCurve: [
      [1427, 25],   // bottom of the ranked pool → ~25 (scale floor)
      [1500, 42],
      [1560, 62],   // ~median ranked fighter
      [1610, 80],
      [1645, 91],   // strong champions / top contenders
      [1680, 97],   // Topuria tier
      [1715, 99],   // Makhachev (clear P4P #1) tier
      [1760, 100],  // headroom ceiling
    ] as [number, number][],

    // Head-to-head win-PROBABILITY scale (display only, for the Compare page).
    // VALIDATED: a symmetric reliability check over all ~17k UFC fights (point-in-
    // time ratings) shows the standard /400 logistic is already well-calibrated
    // (ECE ≈0.029). The backtest's apparent "overconfidence" (Platt slope ≈0.68)
    // was an artifact of comparing Elo to MARKET-selected favourites (who carry
    // info Elo lacks) — not a symmetric miscalibration. A neutral A-vs-B matchup
    // has no such selection, so /400 is right; widening it to 589 made ECE worse.
    winProbDenominator: 400,
  },

  // ═══ RECENCY WINDOWS (for metrics & strength-of-schedule, NOT the Elo core) ═══
  recencyHalfLifeMonths: 15,    // 50% at 15mo, 25% at 30mo — used to weight metric/SoS samples
  recencyCutoffMonths: 48,      // Fights older than this are ignored entirely for metrics/SoS/eligibility

  // ═══ FINISH MULTIPLIERS (scale the Elo K-factor per result) ═══════════
  finishMultipliers: {
    'KO/TKO': 1.4,
    'SUB':    1.35,
    'U-DEC':  1.0,
    'M-DEC':  0.9,
    'S-DEC':  0.8,
  } as Record<string, number>,

  // ═══ STRIKING / GRAPPLING METRICS (bounded Elo-point adjustment) ══════
  // PRIMARY signal is VOLUME strike differential (strikes landed minus
  // absorbed), balanced by accuracy and grappling. Weights must sum to 1.0.
  metricsWeights: {
    volumeStrikeDifferential:   0.40,  // STR landed - STR absorbed (the headline)
    strikeAccuracyDifferential: 0.20,  // Sig. Str. % edge (balances raw volume)
    knockdownRate:              0.20,  // KDs per fight (finishing threat)
    takedownDifferential:       0.20,  // TDs landed - absorbed (grappling)
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
  },

  // ═══ STRENGTH OF SCHEDULE ═════════════════════════════════════════════
  // SoS = recency-weighted average of opponents' Elo over the window. Elo
  // ALREADY rewards a tough schedule, so this is a small bounded NUDGE on top
  // (plus a headline display stat and the primary tiebreaker), not a big pile.
  sosWindowYears: 3,
  sosAnchorElo: 1500,           // Schedule at league-average Elo earns zero nudge
  sosSlopePerElo: 0.05,         // Elo points of nudge per Elo point of schedule above/below anchor
  sosAdjustCap: 30,             // Clamp the SoS nudge to ± this many Elo points

  // ═══ OFFICIAL RANKINGS SEED ═══════════════════════════════════════════
  // The internal /api/official-rankings route (Octagon API) supplies the
  // current UFC rank. With Elo doing the heavy lifting, this is a small seed +
  // a post-sort safety floor — NOT the main driver. If floors fire for more
  // than ~1–2 fighters per division, the Elo model isn't landing — investigate.
  officialBonusScaleElo: 0.4,   // officialBonus(Elo pts) = seedScore * this (champ seed 100 → +40).
                                // Lowered 0.5→0.4 (2026-06-18): at 0.5 a #12–15 seed (+31) could
                                // override a real ~27-Elo gap, floating UFC-ranked-but-fading fighters
                                // (e.g. Walker 1-3) above higher-Elo movers (e.g. Costa). Seed is a
                                // nudge/tiebreaker, not an override — Elo must dominate.
  officialRankScores: {
    'C': 100, '1': 90, '2': 85, '3': 85, '4': 78, '5': 78, '6': 78,
    '7': 70, '8': 70, '9': 70, '10': 70,
    '11': 62, '12': 62, '13': 62, '14': 62, '15': 62,
  } as Record<string, number>,
  // Post-sort safety floors (a fighter the UFC ranks here never displays below).
  // PURPOSE: catch Elo UNDER-rating a genuine contender — NOT to prop up a
  // fighter in real decline. The champion floor is unconditional. The CONTENDER
  // floors (top-5 / top-15) are suppressed once a fighter is on a losing streak,
  // because a fighter the cage just beat repeatedly SHOULD be allowed to fall
  // (e.g. a former top-5 on a 3-fight skid drops below 8 instead of being held).
  championFloorRank: 2,           // reigning champ: always ≤ this (unconditional)
  top5FloorRank: 8,               // UFC #1–5 (when in form)
  top15FloorRank: 25,             // UFC #6–15 (when in form)
  contenderFloorSuppressLossStreak: 2, // ≥ this many straight losses → no contender floor
  // Champion tiebreaker: a REIGNING champ (official rank "C") sitting directly
  // below a non-champion whose finalRating is within this many Elo points gets
  // lifted above them. Only breaks genuine near-ties at the very top — it does
  // not boost a champ who is clearly out-rated. (An undefeated champ is already
  // rewarded by Elo carrying no loss drag.)
  championTiebreakerBand: 8,

  // Head-to-head leapfrog: a fighter who RECENTLY and DECISIVELY beat someone
  // ranked above them is lifted to directly above that opponent — even when the
  // two are NOT adjacent (pairwise leapfrog). The winner passes anyone in between
  // (whom they may not have fought) to sit just above the specific fighter they
  // beat. Elo is gap-preserving, so a single decision win narrows the gap without
  // flipping the order; this correction enforces the in-cage result. Guard rails
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
  headToHead: {
    recencyMonths: 18,
    negateOnLossAfter: true,
    decisiveOnly: true,
    eloGapCap: 50,
  },

  // ═══ ELIGIBILITY ══════════════════════════════════════════════════════
  minUFCFights: 3,              // Minimum UFC fights to appear at all
  rankingsDepth: 40,            // Fighters ranked per division

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
    // Pereira beat Ankalaev (LHW), Van beat Pantoja (FLW). Old champ seeded as
    // top contender (#1).
    'Alex Pereira': { division: 'Light Heavyweight', rank: 'C' },
    'Magomed Ankalaev': { division: 'Light Heavyweight', rank: '1' },
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
    // MW→LHW: Costa moved up permanently and KO'd Murzakanov (UFC 327,
    // 2026-04-11). The API still ranks him at MW #13, which would pin him to the
    // MW pool; evict him there and rank him at LHW. 'NR' = no official seed/floor
    // (he's genuinely unranked at 205) — his Elo, lifted by the Murzakanov KO,
    // places him. Bump the rank here if/when the UFC officially ranks him at LHW.
    'Paulo Costa': { division: 'Light Heavyweight', rank: 'NR', removeFrom: 'Middleweight' },
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
    // MASTER TOGGLE. When false (default), pre-UFC pedigree contributes ZERO to
    // finalRating — rankings are identical to having no Sherdog data. Flip to
    // true to let it nudge thin-sample fighters. Deliberately off so the data is
    // pure context until we choose to lean on it.
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
    // GRAPPLE axis blend (weights sum to 1): takedown edge, control time, ground share.
    grappleWeights: { takedownDiff: 0.45, control: 0.40, groundShare: 0.15 },
    // FINISH axis blend (weights sum to 1): career finish rate + recent KO/knockdown threat.
    finishWeights: { careerFinishRate: 0.6, recentKnockdown: 0.4 },
  },
} as const;
