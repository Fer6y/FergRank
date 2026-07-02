module.exports = [
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[project]/src/app/favicon.ico (static in ecmascript, tag client)", ((__turbopack_context__) => {

__turbopack_context__.v("/_next/static/media/favicon.2vob68tjqpejf.ico" + (globalThis["NEXT_CLIENT_ASSET_SUFFIX"] || ''));}),
"[project]/src/app/favicon.ico.mjs { IMAGE => \"[project]/src/app/favicon.ico (static in ecmascript, tag client)\" } [app-rsc] (structured image object, ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$favicon$2e$ico__$28$static__in__ecmascript$2c$__tag__client$29$__ = __turbopack_context__.i("[project]/src/app/favicon.ico (static in ecmascript, tag client)");
;
const __TURBOPACK__default__export__ = {
    src: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$favicon$2e$ico__$28$static__in__ecmascript$2c$__tag__client$29$__["default"],
    width: 256,
    height: 256
};
}),
"[project]/src/lib/rankingConfig.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

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
__turbopack_context__.s([
    "RANKING_CONFIG",
    ()=>RANKING_CONFIG
]);
const RANKING_CONFIG = {
    // ═══ ELO CORE ═════════════════════════════════════════════════════════
    elo: {
        initialRating: 1500,
        baseK: 24,
        // Finish-weighted K: a KO/TKO moves ratings more than a split decision.
        // K for a fight = baseK * finishMultipliers[method] (see below).
        // Provisional period — new fighters converge faster.
        provisionalFights: 5,
        provisionalKMultiplier: 1.5,
        // Inactivity regression toward the mean. Applied (a) between a fighter's
        // fights based on the layoff gap, and (b) once more from their last fight
        // to "today" so the displayed rating reflects current layoff.
        // rating = mean + (rating - mean) * retentionPerYear^(yearsInactive)
        // Gentle on purpose so injured elites (e.g. ~18mo out) aren't nuked.
        inactivityRetentionPerYear: 0.92,
        inactivityGraceMonths: 12,
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
            [
                1427,
                25
            ],
            [
                1500,
                42
            ],
            [
                1560,
                62
            ],
            [
                1610,
                80
            ],
            [
                1645,
                91
            ],
            [
                1680,
                97
            ],
            [
                1715,
                99
            ],
            [
                1760,
                100
            ]
        ],
        // Head-to-head win-PROBABILITY scale (display only, for the Compare page).
        // VALIDATED: a symmetric reliability check over all ~17k UFC fights (point-in-
        // time ratings) shows the standard /400 logistic is already well-calibrated
        // (ECE ≈0.029). The backtest's apparent "overconfidence" (Platt slope ≈0.68)
        // was an artifact of comparing Elo to MARKET-selected favourites (who carry
        // info Elo lacks) — not a symmetric miscalibration. A neutral A-vs-B matchup
        // has no such selection, so /400 is right; widening it to 589 made ECE worse.
        winProbDenominator: 400
    },
    // ═══ RECENCY WINDOWS (for metrics & strength-of-schedule, NOT the Elo core) ═══
    recencyHalfLifeMonths: 15,
    recencyCutoffMonths: 48,
    // ═══ FINISH MULTIPLIERS (scale the Elo K-factor per result) ═══════════
    finishMultipliers: {
        'KO/TKO': 1.4,
        'SUB': 1.35,
        'U-DEC': 1.0,
        'M-DEC': 0.9,
        'S-DEC': 0.8
    },
    // ═══ STRIKING / GRAPPLING METRICS (bounded Elo-point adjustment) ══════
    // PRIMARY signal is VOLUME strike differential (strikes landed minus
    // absorbed), balanced by accuracy and grappling. Weights must sum to 1.0.
    metricsWeights: {
        volumeStrikeDifferential: 0.40,
        strikeAccuracyDifferential: 0.20,
        knockdownRate: 0.20,
        takedownDifferential: 0.20
    },
    metricsScaleElo: 30,
    metricsConfidenceMinFights: 5,
    metricsRecentFights: 5,
    // Normalization anchors (what counts as a "full" edge for each metric)
    metricsNorm: {
        volumeStrikePerFight: 40,
        accuracyEdge: 0.25,
        knockdownsPerFight: 1.5,
        takedownsPerFight: 3
    },
    // ═══ STRENGTH OF SCHEDULE ═════════════════════════════════════════════
    // SoS = recency-weighted average of opponents' Elo over the window. Elo
    // ALREADY rewards a tough schedule, so this is a small bounded NUDGE on top
    // (plus a headline display stat and the primary tiebreaker), not a big pile.
    sosWindowYears: 3,
    sosAnchorElo: 1500,
    sosSlopePerElo: 0.05,
    sosAdjustCap: 30,
    // ── Schedule-strength ACTIVITY dampener (DISPLAY ONLY) ────────────────────
    // The displayed "schedule strength" combines opponent quality (sosElo) with
    // how CURRENT that résumé is: scheduleStrength = qualityScore × dampener,
    // dampener = activityFloor + (1 − activityFloor) × activity, where
    // activity = (1 − cadenceWeight)·recency + cadenceWeight·cadence, all in [0,1].
    // This is a presentation composite ONLY — it never touches finalRating. The
    // Elo core already regresses inactive ratings toward the mean (see the
    // inactivity block above), so folding activity into sosNudge would double-
    // count a layoff. Keep this out of the rating path.
    activityGraceMonths: 12,
    activityFullDecayMonths: 33,
    activityFloor: 0.7,
    activityTargetFightsPerYear: 2,
    activityCadenceWeight: 0.3,
    // ═══ OFFICIAL RANKINGS SEED ═══════════════════════════════════════════
    // The internal /api/official-rankings route (Octagon API) supplies the
    // current UFC rank. With Elo doing the heavy lifting, this is a small seed +
    // a post-sort safety floor — NOT the main driver. If floors fire for more
    // than ~1–2 fighters per division, the Elo model isn't landing — investigate.
    officialBonusScaleElo: 0.4,
    // Lowered 0.5→0.4 (2026-06-18): at 0.5 a #12–15 seed (+31) could
    // override a real ~27-Elo gap, floating UFC-ranked-but-fading fighters
    // (e.g. Walker 1-3) above higher-Elo movers (e.g. Costa). Seed is a
    // nudge/tiebreaker, not an override — Elo must dominate.
    officialRankScores: {
        'C': 100,
        '1': 90,
        '2': 85,
        '3': 85,
        '4': 78,
        '5': 78,
        '6': 78,
        '7': 70,
        '8': 70,
        '9': 70,
        '10': 70,
        '11': 62,
        '12': 62,
        '13': 62,
        '14': 62,
        '15': 62
    },
    // Post-sort safety floors (a fighter the UFC ranks here never displays below).
    // PURPOSE: catch Elo UNDER-rating a genuine contender — NOT to prop up a
    // fighter in real decline. The champion floor is unconditional. The CONTENDER
    // floors (top-5 / top-15) are suppressed once a fighter is on a losing streak,
    // because a fighter the cage just beat repeatedly SHOULD be allowed to fall
    // (e.g. a former top-5 on a 3-fight skid drops below 8 instead of being held).
    championFloorRank: 2,
    top5FloorRank: 8,
    top15FloorRank: 25,
    contenderFloorSuppressLossStreak: 2,
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
        eloGapCap: 50
    },
    // ═══ ELIGIBILITY ══════════════════════════════════════════════════════
    minUFCFights: 3,
    rankingsDepth: 40,
    // ═══ DIVISION OVERRIDES ═══════════════════════════════════════════════
    // Manual fixes for fighters whose division/rank in the API is stale (e.g. a
    // permanent weight move, or a title change the Octagon API hasn't caught up
    // to). Overrides take precedence over the API and are applied first.
    divisionOverrides: {
        // Makhachev moved up and beat JDM for the WW belt; the API hasn't caught
        // up (still lists JDM as champ). Makhachev holds "C", JDM is top contender.
        'Islam Makhachev': {
            division: 'Welterweight',
            rank: 'C',
            removeFrom: 'Lightweight'
        },
        'Jack Della Maddalena': {
            division: 'Welterweight',
            rank: '1'
        },
        // BW title is stale in the API (still lists Merab as champ). In our data
        // Yan beat Merab for the belt; the series is 1-1 and Yan is the reigning
        // champ, so he holds "C" and Merab is seeded as the top contender.
        'Petr Yan': {
            division: 'Bantamweight',
            rank: 'C'
        },
        'Merab Dvalishvili': {
            division: 'Bantamweight',
            rank: '1'
        },
        // Title changes the API hasn't caught up to, confirmed by the champion audit
        // (scripts/sherdog/championAudit.ts) against current Sherdog results:
        // Pereira beat Ankalaev (LHW), Van beat Pantoja (FLW). Old champ seeded as
        // top contender (#1).
        'Alex Pereira': {
            division: 'Light Heavyweight',
            rank: 'C'
        },
        'Magomed Ankalaev': {
            division: 'Light Heavyweight',
            rank: '1'
        },
        // MW: Strickland beat Chimaev to take the undisputed belt (API still stale).
        // Strickland holds "C"; Chimaev (just dethroned) seeded #1; Du Plessis #2.
        'Sean Strickland': {
            division: 'Middleweight',
            rank: 'C'
        },
        'Khamzat Chimaev': {
            division: 'Middleweight',
            rank: '1'
        },
        'Dricus Du Plessis': {
            division: 'Middleweight',
            rank: '2'
        },
        'Joshua Van': {
            division: 'Flyweight',
            rank: 'C'
        },
        'Alexandre Pantoja': {
            division: 'Flyweight',
            rank: '1'
        },
        // Gaethje KO'd Topuria (R4) at UFC White House / Freedom 250 (2026-06-14) to
        // take the Lightweight belt; the API still lists Topuria as champ. Gaethje
        // holds "C", Topuria — now off his undefeated run — is seeded top contender.
        'Justin Gaethje': {
            division: 'Lightweight',
            rank: 'C'
        },
        'Ilia Topuria': {
            division: 'Lightweight',
            rank: '1'
        },
        // W-Strawweight: Zhang vacated the 115 belt to move up to flyweight (lost
        // to Shevchenko there). Dern won the vacant title. The API still lists Zhang
        // as WSW "C", so we crown Dern and evict Zhang to flyweight.
        'Mackenzie Dern': {
            division: "Women's Strawweight",
            rank: 'C'
        },
        'Zhang Weili': {
            division: "Women's Flyweight",
            rank: '1',
            removeFrom: "Women's Strawweight"
        },
        // MW→LHW: Costa moved up permanently and KO'd Murzakanov (UFC 327,
        // 2026-04-11). The API still ranks him at MW #13, which would pin him to the
        // MW pool; evict him there and rank him at LHW. 'NR' = no official seed/floor
        // (he's genuinely unranked at 205) — his Elo, lifted by the Murzakanov KO,
        // places him. Bump the rank here if/when the UFC officially ranks him at LHW.
        'Paulo Costa': {
            division: 'Light Heavyweight',
            rank: 'NR',
            removeFrom: 'Middleweight'
        }
    },
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
        tier1: {
            promotions: [
                'UFC'
            ],
            multiplier: 1.0
        },
        tier2: {
            promotions: [
                'DWCS',
                'Contender Series'
            ],
            multiplier: 0.78
        },
        tier2_5: {
            promotions: [
                'Bellator',
                'ONE Championship',
                'PFL',
                'RIZIN',
                'Invicta FC'
            ],
            multiplier: 0.68
        },
        tier3: {
            promotions: [
                'Cage Warriors',
                'LFA',
                'KSW',
                'M-1',
                'Pancrase',
                'Shooto',
                'Deep',
                'Titan FC',
                'CFFC',
                'MFC',
                'Brave CF',
                'Jungle Fight',
                'KOTC'
            ],
            multiplier: 0.55
        },
        tier4: {
            promotions: [
                'Regional',
                'Unknown'
            ],
            multiplier: 0.35
        },
        historical: {
            promotions: [
                'Pride',
                'Strikeforce',
                'WEC'
            ],
            multiplier: 0.68,
            historical: true
        }
    },
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
        excludeOrgSubstrings: [
            'Ultimate Fighting'
        ],
        // Only count non-UFC fights dated strictly before the fighter's UFC debut.
        onlyBeforeUFCDebut: true,
        // Sample size at which pedigree confidence saturates (fewer fights = damped).
        confidenceFullFights: 5,
        // Org label → tier-key resolution (matched by substring, first hit wins).
        // Falls back to defaultTier when nothing matches.
        orgTierMatchers: [
            {
                tier: 'tier2',
                match: [
                    "Dana White's Contender",
                    'Contender Series',
                    'DWCS'
                ]
            },
            {
                tier: 'tier2_5',
                match: [
                    'Bellator',
                    'ONE Championship',
                    'One Championship',
                    'PFL',
                    'RIZIN',
                    'Invicta'
                ]
            },
            {
                tier: 'historical',
                match: [
                    'Pride',
                    'Strikeforce',
                    'WEC'
                ]
            },
            {
                tier: 'tier3',
                match: [
                    'Cage Warriors',
                    'LFA',
                    'KSW',
                    'Pancrase',
                    'Shooto'
                ]
            }
        ],
        defaultTier: 'tier4',
        // Hard ceiling on pedigreeStrength regardless of tier (safety clamp).
        maxStrength: 0.75,
        // ── Ranking seed (Sherdog-sourced, scoring side) ──────────────────────
        // MASTER TOGGLE. When false (default), pre-UFC pedigree contributes ZERO to
        // finalRating — rankings are identical to having no Sherdog data. Flip to
        // true to let it nudge thin-sample fighters. Deliberately off so the data is
        // pure context until we choose to lean on it.
        seedEnabled: true,
        seedSourceFile: 'sherdog_fights.csv',
        // Max Elo points the pedigree can add (bounded + small — it should refine
        // edge cases, never reorder the division). Compare to officialBonus (≤50).
        seedMaxElo: 25,
        // Thin-sample only: the seed tapers linearly from full (0 UFC fights) to
        // ZERO at this many UFC fights — once a fighter has a real UFC sample, their
        // own Elo speaks and the pedigree fades out entirely.
        seedTaperUFCFights: 6,
        // Defunct elite orgs (Pride/Strikeforce/WEC, tier `historical`) are excluded
        // from the current-form seed — they remain available for all-time context.
        seedExcludeHistorical: true
    },
    // ═══ PROFILE RADAR (DISPLAY ONLY — never feeds finalRating) ════════════
    // The 5-axis fighter radar on the profile / compare pages. It is rebuilt
    // from the SAME recency-weighted per-fight signals the ranking metrics use
    // (reusing metricsNorm where they overlap) instead of raw career CSV
    // percentages — so a knockout striker reads high on STRIKE, not just FINISH.
    // STRIKE/GRAPPLE/FINISH blend per-fight form; ACTIVE/OPP-Q are context.
    // Tunables here change ONLY what the radar draws, not who is ranked where.
    radar: {
        recentFights: 5,
        volumeStrikePerFightFull: 90,
        accuracyFull: 0.6,
        controlSecondsFull: 300,
        activityFullMonths: 24,
        // STRIKE axis blend (weights sum to 1): output volume, KO power, accuracy, output edge.
        strikeWeights: {
            volume: 0.30,
            power: 0.30,
            accuracy: 0.25,
            differential: 0.15
        },
        // GRAPPLE axis blend (weights sum to 1): takedown edge, control time, ground share.
        grappleWeights: {
            takedownDiff: 0.45,
            control: 0.40,
            groundShare: 0.15
        },
        // FINISH axis blend (weights sum to 1): career finish rate + recent KO/knockdown threat.
        finishWeights: {
            careerFinishRate: 0.6,
            recentKnockdown: 0.4
        }
    }
};
}),
"[project]/src/lib/filters.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DEFAULT_FILTERS",
    ()=>DEFAULT_FILTERS,
    "effectiveEngine",
    ()=>effectiveEngine,
    "isDefaultFilters",
    ()=>isDefaultFilters,
    "parseFilters",
    ()=>parseFilters
]);
// ─────────────────────────────────────────────────────────────────────────
//  filters.ts — user-facing live-ranking filters (DESIGN_VISION §6)
//
//  The four sliders re-run the real algorithm. Each maps onto Elo-core knobs.
//  CRITICAL INVARIANT: the neutral position (era=null, all weights = 0.5)
//  reproduces RANKING_CONFIG EXACTLY, so default rankings are byte-identical to
//  the un-filtered engine. Verify with scripts after touching the mappings.
// ─────────────────────────────────────────────────────────────────────────
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/rankingConfig.ts [app-rsc] (ecmascript)");
;
const DEFAULT_FILTERS = {
    eraStartYear: null,
    finishWeight: 0.5,
    recencyWeight: 0.5,
    activityWeight: 0.5
};
function isDefaultFilters(f) {
    return f.eraStartYear == null && f.finishWeight === 0.5 && f.recencyWeight === 0.5 && f.activityWeight === 0.5;
}
const clamp = (v, lo, hi)=>Math.max(lo, Math.min(hi, v));
function effectiveEngine(filters) {
    const def = isDefaultFilters(filters);
    const base = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].elo;
    // finishWeight: scale the deviation of each multiplier from 1.0. 0.5→×1 (base),
    // 0→all multipliers collapse to 1.0 (finishing irrelevant), 1→double the spread.
    const finishScale = filters.finishWeight / 0.5;
    const finishMultipliers = {};
    for (const [k, v] of Object.entries(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].finishMultipliers)){
        finishMultipliers[k] = 1 + (v - 1) * finishScale;
    }
    // recencyWeight: higher → bigger K (more reactive) + shorter metric half-life.
    const baseK = base.baseK * (0.6 + filters.recencyWeight * 0.8); // 0.5→×1
    const recencyHalfLifeMonths = clamp(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].recencyHalfLifeMonths * (1.5 - filters.recencyWeight), 3, 36);
    // activityWeight: higher → harsher inactivity regression (lower retention).
    const inactivityRetentionPerYear = clamp(base.inactivityRetentionPerYear - (filters.activityWeight - 0.5) * 0.4, 0.5, 0.99);
    const elo = {
        ...base,
        baseK,
        inactivityRetentionPerYear
    };
    return {
        elo,
        finishMultipliers,
        eraStartYear: filters.eraStartYear,
        recencyHalfLifeMonths,
        signature: def ? 'default' : JSON.stringify(filters),
        isDefault: def
    };
}
function parseFilters(params) {
    const num = (key, fallback)=>{
        const v = params.get(key);
        if (v == null || v === '') return fallback;
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : fallback;
    };
    const eraRaw = params.get('era');
    const eraStartYear = eraRaw && eraRaw !== 'all' ? parseInt(eraRaw, 10) : null;
    return {
        eraStartYear: Number.isFinite(eraStartYear) ? eraStartYear : null,
        finishWeight: clamp(num('finish', 0.5), 0, 1),
        recencyWeight: clamp(num('recency', 0.5), 0, 1),
        activityWeight: clamp(num('activity', 0.5), 0, 1)
    };
}
}),
"[project]/src/lib/eloEngine.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildEloRatings",
    ()=>buildEloRatings,
    "buildEloWithTraces",
    ()=>buildEloWithTraces,
    "eloToDisplayScore",
    ()=>eloToDisplayScore,
    "getElo",
    ()=>getElo,
    "getFighterHistory",
    ()=>getFighterHistory,
    "normalizeWeightClassForMove",
    ()=>normalizeWeightClassForMove,
    "winProbability",
    ()=>winProbability
]);
// ─────────────────────────────────────────────────────────────────────────
//  eloEngine.ts — the core rating system (v2)
//
//  A single chronological sweep over every UFC fight produces one Elo rating
//  per fighter. Properties (all by construction, see CLAUDE.md):
//    • Beating a strong opponent raises your rating a lot; beating a weak one
//      barely moves it. Opponent quality is therefore baked into the rating —
//      strength of schedule is not a bolt-on, it IS the rating.
//    • A KO/TKO moves ratings more than a split decision (finish-weighted K).
//    • New fighters converge faster (provisional K) and sit near the mean until
//      they prove themselves — prospects can't rocket past champions.
//    • Inactivity regresses a rating toward the mean, so an old/declined
//      fighter's long-past wins stop propping up today's number.
//    • Changing weight class carries the rating across with a decay penalty.
//
//  Nothing here is hardcoded — every number comes from RANKING_CONFIG.elo.
// ─────────────────────────────────────────────────────────────────────────
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/rankingConfig.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$filters$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/filters.ts [app-rsc] (ecmascript)");
;
;
function monthsBetween(d1, d2) {
    return (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}
function normalizeWeightClassForMove(wc) {
    if (!wc) return null;
    const w = wc.trim();
    if (/catch ?weight|open ?weight|tournament|superfight/i.test(w)) return null;
    return w.replace(/^Interim\s+/i, '').trim();
}
function finishK(method, mults, baseK) {
    const m = method.trim();
    let mult = 1.0;
    // KO/TKO — including "TKO - Doctor's Stoppage" (a doctor waving it off IS a
    // finish, so it earns full finish credit, not neutral K).
    if (m.startsWith('KO/TKO') || m.startsWith('TKO')) mult = mults['KO/TKO'];
    else if (m === 'SUB' || m === 'Submission') mult = mults['SUB'];
    else if (m === 'U-DEC') mult = mults['U-DEC'];
    else if (m === 'M-DEC') mult = mults['M-DEC'];
    else if (m === 'S-DEC') mult = mults['S-DEC'];
    return baseK * mult;
}
// Regress a rating toward the mean for a layoff of `months`, beyond a grace period.
function regressForInactivity(rating, months, E) {
    if (months <= E.inactivityGraceMonths) return rating;
    const years = (months - E.inactivityGraceMonths) / 12;
    const retention = Math.pow(E.inactivityRetentionPerYear, years);
    return E.initialRating + (rating - E.initialRating) * retention;
}
// One-time "current-form" discount. The first time a fighter competes inside the
// recent window (on/after boundaryDate), the rating they CARRY IN is regressed
// once toward the mean by boundaryRegressionToMean — heavily discounting their
// pre-window form without the spread-destroying full reset of a hard cutoff.
// Applied once per fighter; brand-new fighters (rating already at the mean) are
// unaffected but still flagged so it never re-fires.
function applyBoundaryDiscount(state, fightDate, boundaryDate, E) {
    if (state.discountedAtBoundary || fightDate < boundaryDate) return;
    const frac = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].elo.boundaryRegressionToMean;
    state.rating = E.initialRating + (state.rating - E.initialRating) * (1 - frac);
    state.discountedAtBoundary = true;
}
function newState(E) {
    return {
        rating: E.initialRating,
        ratingAtLastFight: E.initialRating,
        peakRating: E.initialRating,
        fights: 0,
        lastFightDate: null,
        lastWeightClass: null,
        discountedAtBoundary: false
    };
}
// Expected score for A against B (standard Elo logistic).
function expectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}
// Prepare a fighter's rating for an upcoming fight: apply inactivity regression
// for the gap since their last fight, then a move penalty if the division changed.
function prepareForFight(state, fightDate, normWC, E) {
    if (state.lastFightDate) {
        const gap = monthsBetween(state.lastFightDate, fightDate);
        if (gap > 0) state.rating = regressForInactivity(state.rating, gap, E);
    }
    if (normWC && state.lastWeightClass && normWC !== state.lastWeightClass) {
        state.rating = E.initialRating + (state.rating - E.initialRating) * (1 - E.moveDecayPenalty);
    }
}
/**
 * Build one Elo rating per fighter from the full fight history.
 * Memoized per LoadedData instance so repeated division calls don't recompute.
 */ // Cache keyed by (LoadedData → filter signature). The default signature is the
// un-filtered engine; each distinct filter combo gets its own cached sweep.
const eloCache = new WeakMap();
const historyCache = new WeakMap();
// The chronological rating sweep. Pure: same inputs → same {states, history},
// no caching. buildEloRatings (cached, default-history) and buildEloWithTraces
// (any engine, returns history) are thin wrappers so their math is identical.
function runEloSweep(data, engine) {
    const E = engine.elo;
    const states = new Map();
    const history = new Map();
    const pushTrace = (id, t)=>{
        let arr = history.get(id);
        if (!arr) {
            arr = [];
            history.set(id, arr);
        }
        arr.push(t);
    };
    const get = (id)=>{
        let s = states.get(id);
        if (!s) {
            s = newState(E);
            states.set(id, s);
        }
        return s;
    };
    // Chronological order (oldest first). Fights without a date can't be placed on
    // the timeline, so they're skipped. The Era filter (engine.eraStartYear), when
    // set, is a HARD window — drops fights before the chosen year for a pure
    // historical lens. The house default (no era) keeps the FULL history (so the
    // rating spread + opponent calibration are intact) and instead applies the
    // one-time current-form boundary discount below.
    const ordered = data.fights.filter((f)=>f.eventDate && (engine.eraStartYear == null || f.eventDate.getFullYear() >= engine.eraStartYear)).sort((a, b)=>a.eventDate.getTime() - b.eventDate.getTime());
    // Current-form boundary discount applies only in house mode (no explicit era);
    // an explicit era is already its own hard recency window.
    const maxAge = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].elo.maxFightAgeYears;
    const boundaryDate = engine.eraStartYear == null && maxAge != null ? new Date(Date.now() - maxAge * 365.25 * 24 * 60 * 60 * 1000) : null;
    for (const fight of ordered){
        const result = decisiveResult(fight);
        if (!result) continue; // NC / unknown — no rating change
        const a = get(fight.fighterId1);
        const b = get(fight.fighterId2);
        const date = fight.eventDate;
        const normWC = normalizeWeightClassForMove(fight.weightClass);
        prepareForFight(a, date, normWC, E);
        prepareForFight(b, date, normWC, E);
        if (boundaryDate) {
            applyBoundaryDiscount(a, date, boundaryDate, E);
            applyBoundaryDiscount(b, date, boundaryDate, E);
        }
        const ea = expectedScore(a.rating, b.rating);
        const eb = 1 - ea;
        const [sa, sb] = result; // actual scores (1/0, 0/1, or 0.5/0.5)
        // Finish-weighted K, boosted while either fighter is still provisional.
        const kBase = finishK(fight.method, engine.finishMultipliers, E.baseK);
        const ka = kBase * (a.fights < E.provisionalFights ? E.provisionalKMultiplier : 1);
        const kb = kBase * (b.fights < E.provisionalFights ? E.provisionalKMultiplier : 1);
        const aBefore = a.rating;
        const bBefore = b.rating;
        const deltaA = ka * (sa - ea);
        const deltaB = kb * (sb - eb);
        a.rating += deltaA;
        b.rating += deltaB;
        // Additive trace (observation only — does not touch the rating math above).
        const iso = date.toISOString();
        const toResult = (s)=>s === 1 ? 'W' : s === 0 ? 'L' : 'D';
        pushTrace(fight.fighterId1, {
            fightId: fight.fightId,
            date: iso,
            opponentId: fight.fighterId2,
            opponentName: fight.fighter2Name,
            result: toResult(sa),
            method: fight.method,
            round: fight.round,
            weightClass: fight.weightClass,
            ratingBefore: aBefore,
            ratingAfter: a.rating,
            delta: deltaA,
            opponentRating: bBefore
        });
        pushTrace(fight.fighterId2, {
            fightId: fight.fightId,
            date: iso,
            opponentId: fight.fighterId1,
            opponentName: fight.fighter1Name,
            result: toResult(sb),
            method: fight.method,
            round: fight.round,
            weightClass: fight.weightClass,
            ratingBefore: bBefore,
            ratingAfter: b.rating,
            delta: deltaB,
            opponentRating: aBefore
        });
        for (const [s, wc] of [
            [
                a,
                normWC
            ],
            [
                b,
                normWC
            ]
        ]){
            s.peakRating = Math.max(s.peakRating, s.rating);
            s.ratingAtLastFight = s.rating;
            s.lastFightDate = date;
            if (wc) s.lastWeightClass = wc;
            s.fights += 1;
        }
    }
    // Final regression: bring each rating from its last-fight date up to "now"
    // so the displayed number reflects current layoff.
    const now = new Date();
    for (const s of states.values()){
        if (s.lastFightDate) {
            const gap = monthsBetween(s.lastFightDate, now);
            if (gap > 0) s.rating = regressForInactivity(s.ratingAtLastFight, gap, E);
        }
    }
    return {
        states,
        history
    };
}
function buildEloRatings(data, eng) {
    const engine = eng ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$filters$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["effectiveEngine"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$filters$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["DEFAULT_FILTERS"]);
    let perData = eloCache.get(data);
    if (!perData) {
        perData = new Map();
        eloCache.set(data, perData);
    }
    const cached = perData.get(engine.signature);
    if (cached) return cached;
    const { states, history } = runEloSweep(data, engine);
    perData.set(engine.signature, states);
    // History is only needed for the (un-filtered) profile page — record it once.
    if (engine.isDefault) historyCache.set(data, history);
    return states;
}
function buildEloWithTraces(data, eng) {
    const engine = eng ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$filters$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["effectiveEngine"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$filters$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["DEFAULT_FILTERS"]);
    const { states, history } = runEloSweep(data, engine);
    return {
        ratings: states,
        history
    };
}
function getFighterHistory(data, fighterId) {
    buildEloRatings(data);
    const arr = historyCache.get(data)?.get(fighterId) ?? [];
    return [
        ...arr
    ].sort((x, y)=>new Date(y.date).getTime() - new Date(x.date).getTime());
}
// Returns [scoreA, scoreB] or null if the fight shouldn't affect ratings.
function decisiveResult(fight) {
    const r1 = fight.result1;
    const r2 = fight.result2;
    if (r1 === 'W' && r2 === 'L') return [
        1,
        0
    ];
    if (r1 === 'L' && r2 === 'W') return [
        0,
        1
    ];
    if (r1 === 'D' && r2 === 'D') return [
        0.5,
        0.5
    ];
    return null; // NC, DQ-as-NC, blanks, etc.
}
function getElo(map, fighterId) {
    return map.get(fighterId) ?? newState(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].elo);
}
function eloToDisplayScore(elo) {
    // Monotonic piecewise-linear map (anchors in rankingConfig). Fixed (not
    // filtered) so the scale stays comparable across divisions/filters.
    const curve = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].elo.displayCurve;
    if (elo <= curve[0][0]) return curve[0][1];
    const last = curve[curve.length - 1];
    if (elo >= last[0]) return last[1];
    for(let i = 1; i < curve.length; i++){
        const [e1, s1] = curve[i];
        if (elo <= e1) {
            const [e0, s0] = curve[i - 1];
            return s0 + (elo - e0) / (e1 - e0) * (s1 - s0);
        }
    }
    return last[1]; // unreachable (elo < last[0] handled above)
}
function winProbability(eloA, eloB) {
    const d = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].elo.winProbDenominator;
    return 1 / (1 + Math.pow(10, (eloB - eloA) / d));
}
}),
"[project]/src/lib/advancedStats.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// ─────────────────────────────────────────────────────────────────────────
//  advancedStats.ts — deep, display-only fighter analytics.
//
//  Pace-normalized (per-15-minute) rates, recent-vs-career form drift, a
//  per-fight form timeline (the profile chart), durability, and finish
//  anatomy. Derived from the SAME loaded fight rows the engine reads, but
//  strictly DOWNSTREAM: nothing here is imported by eloEngine /
//  scoringEngine / rankingConfig, so the rankings cannot be affected.
//
//  Sampling rules:
//  • Rate stats use only primary-CSV fights (hasMetrics) — Sherdog recency
//    top-ups carry no per-fight counts and are excluded automatically.
//  • A fight with zero recorded strikes on BOTH sides is treated as missing
//    data (early-era rows), not a genuine 0-output performance.
//  • Cage time = (round−1) × 5 min + final-round clock; rows with an
//    unparseable clock are skipped. Loss/finish COUNTS use all dated fights
//    (method + result exist even on Sherdog rows).
// ─────────────────────────────────────────────────────────────────────────
__turbopack_context__.s([
    "buildTrendRead",
    ()=>buildTrendRead,
    "divisionRatioBenchmark",
    ()=>divisionRatioBenchmark,
    "formEloNudge",
    ()=>formEloNudge,
    "getAdvancedStats",
    ()=>getAdvancedStats
]);
const RECENT_WINDOW = 5; // "recent form" = last 5 metric-bearing fights
const MIN_RECENT_FIGHTS = 3; // fewer than this → no recent window / no drift
const TREND_WINDOW = 3; // the macro trend read looks at the last 3 fights
function buildTrendRead(a, ctx) {
    const out = [];
    const { career, last3, ratioCareer, ratioLast3 } = a;
    if (!last3 || ratioCareer == null || ratioLast3 == null) {
        return [
            {
                kind: 'neutral',
                text: 'Fewer than 3 charted fights — not enough for a trend read yet.'
            }
        ];
    }
    // Opposition context: was the last-3 schedule a step up from the career norm?
    const traced = ctx.history.filter((h)=>h.opponentRating > 0);
    const oppRecent = traced.slice(0, TREND_WINDOW);
    const mean = (xs)=>xs.length ? xs.reduce((s, x)=>s + x, 0) / xs.length : 0;
    const oppRecentElo = mean(oppRecent.map((h)=>h.opponentRating));
    const oppCareerElo = mean(traced.map((h)=>h.opponentRating));
    const oppStep = Math.round(oppRecentElo - oppCareerElo);
    const stepUp = oppStep >= 40;
    const ratioChange = ratioLast3 / ratioCareer - 1; // margin trend
    const outputChange = career.landedPer15 >= 5 ? last3.landedPer15 / career.landedPer15 - 1 : 0;
    // Real age leads the mileage judgement (34+ is where MMA age curves bend);
    // tenure/fight-count carry it when no DOB resolved.
    const deepMileage = ctx.age != null && ctx.age >= 34 || ctx.tenureYears >= 9 || a.sampleFights >= 18;
    const mileageNote = ctx.age != null ? `at age ${ctx.age} with ${a.sampleFights} charted fights` : ctx.tenureYears >= 1 ? `${Math.round(ctx.tenureYears)} years and ${a.sampleFights} charted fights into the UFC run` : `${a.sampleFights} charted fights in`;
    const pctFmt = (x)=>`${Math.abs(Math.round(x * 100))}%`;
    // Margin tightening — the aging-pattern read, but opposition-aware.
    if (ratioChange <= -0.15) {
        if (stepUp) {
            out.push({
                kind: 'caution',
                text: `Landed:absorbed ratio has tightened ${pctFmt(ratioChange)} over the last 3 (${ratioLast3.toFixed(2)} vs ${ratioCareer.toFixed(2)} career), but the opposition also stepped up (~+${oppStep} Elo vs career average). Read it as context first, decline second — the next fight against level competition is the real test.`
            });
        } else if (deepMileage) {
            out.push({
                kind: 'negative',
                text: `Landed:absorbed ratio has tightened ${pctFmt(ratioChange)} over the last 3 (${ratioLast3.toFixed(2)} vs ${ratioCareer.toFixed(2)} career) against similar-level opposition, ${mileageNote} — the classic wear pattern. For the next fight it means thinner margins for error, especially if the pace holds into later rounds.`
            });
        } else {
            out.push({
                kind: 'caution',
                text: `Landed:absorbed ratio is down ${pctFmt(ratioChange)} across the last 3, but with a short career sample and no mileage red flags this is a lean, not a pattern — one more fight decides.`
            });
        }
    }
    // Margin widening — ascending read, sample-aware.
    if (ratioChange >= 0.15 && outputChange >= -0.05) {
        out.push({
            kind: 'positive',
            text: stepUp ? `Margins are widening (${ratioLast3.toFixed(2)} landed per absorbed over the last 3, vs ${ratioCareer.toFixed(2)} career) while the opposition stepped up ~+${oppStep} Elo — the strongest version of an ascending signal.` : `Margins are widening — ${ratioLast3.toFixed(2)} landed per absorbed over the last 3, vs ${ratioCareer.toFixed(2)} career. Trajectory points up, with the usual 3-fight caveat.`
        });
    }
    // Age risk that the stat line hasn't shown yet — MMA age curves bend fast.
    if (ctx.age != null && ctx.age >= 36 && ratioChange > -0.15) {
        out.push({
            kind: 'caution',
            text: `At ${ctx.age}, age risk is live even while the numbers hold — MMA age curves bend quickly past the mid-30s, and the drop tends to arrive suddenly rather than gradually.`
        });
    }
    // Output falling with the margin holding → pace, not damage.
    if (outputChange <= -0.2 && ratioChange > -0.15) {
        out.push({
            kind: 'caution',
            text: `Volume is down ${pctFmt(outputChange)} over the last 3 but the strike ratio is holding — slower fights, not one-sided ones. Style of recent opponents matters here; expect the number to swing back against a pressure matchup.`
        });
    }
    // Durability: heavy damage history on a worn fighter.
    if (a.durability.timesFinished >= 4 || a.durability.kdAbsorbedPer15 >= 0.3 && deepMileage) {
        out.push({
            kind: 'negative',
            text: `Damage history is real: finished ${a.durability.timesFinished} times${a.durability.lastFinishedYear ? ` (last ${a.durability.lastFinishedYear})` : ''}, absorbing ${a.durability.kdAbsorbedPer15.toFixed(2)} knockdowns/15 for the career. Late-career chins rarely improve — factor it against heavy hitters.`
        });
    }
    // Layoff.
    if (ctx.monthsSinceLastFight >= 12) {
        out.push({
            kind: 'caution',
            text: `${Math.round(ctx.monthsSinceLastFight)} months since the last fight — the rating already regresses for inactivity, but first-fight-back rust is a real pattern on top of it.`
        });
    }
    // Far below peak — the chart usually shows why.
    if (ctx.eloPeak - ctx.eloRating >= 120 && deepMileage) {
        out.push({
            kind: 'neutral',
            text: `Current rating sits ${Math.round(ctx.eloPeak - ctx.eloRating)} Elo below the career peak — the engine has already priced the slide; the timeline above shows when it started.`
        });
    }
    if (out.length === 0) {
        out.push({
            kind: 'neutral',
            text: 'Output, margins and durability are all tracking near the career baseline — no macro trend worth pricing into the next fight.'
        });
    }
    return out.slice(0, 4);
}
const benchCache = new Map();
function divisionRatioBenchmark(data, division, rankedIds) {
    const hit = benchCache.get(division);
    if (hit !== undefined) return hit;
    const ratios = [];
    const landed = [];
    const absorbed = [];
    for (const id of rankedIds){
        const a = getAdvancedStats(data, id);
        const r = a ? ratioOf(a.career) : null;
        if (a && r != null) {
            ratios.push(r);
            landed.push(a.career.landedPer15);
            absorbed.push(a.career.absorbedPer15);
        }
    }
    const median = (xs)=>{
        if (!xs.length) return 0;
        const s = [
            ...xs
        ].sort((a, b)=>a - b);
        return s[Math.floor(s.length / 2)];
    };
    const result = ratios.length >= 10 ? {
        ratio: Math.round(median(ratios) * 100) / 100,
        landedPer15: Math.round(median(landed) * 10) / 10,
        absorbedPer15: Math.round(median(absorbed) * 10) / 10,
        sample: ratios.length
    } : null;
    benchCache.set(division, result);
    return result;
}
function formEloNudge(drift) {
    if (!drift) return 0;
    const score = drift.diffPer15Delta * 0.7 + drift.tdPer15Delta * 5 * 0.3;
    return Math.max(-45, Math.min(45, Math.round(score * 2.2 * 10) / 10));
}
// ── helpers ──────────────────────────────────────────────────────────────
function fightMinutes(f) {
    const m = /^(\d+):(\d{1,2})$/.exec(f.fightTime.trim());
    if (!m || !f.round || f.round < 1) return null;
    const mins = (f.round - 1) * 5 + parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
    return mins > 0 && mins <= 60 ? mins : null;
}
function sideOf(f, fighterId) {
    const first = f.fighterId1 === fighterId;
    return first ? {
        result: f.result1,
        opponentName: f.fighter2Name,
        landed: f.str1,
        absorbed: f.str2,
        td: f.td1,
        tdAbsorbed: f.td2,
        kd: f.kd1,
        kdAbsorbed: f.kd2,
        subAtt: f.sub1,
        ctrlSec: f.ctrl1,
        sigAcc: f.sigStrPct1
    } : {
        result: f.result2,
        opponentName: f.fighter1Name,
        landed: f.str2,
        absorbed: f.str1,
        td: f.td2,
        tdAbsorbed: f.td1,
        kd: f.kd2,
        kdAbsorbed: f.kd1,
        subAtt: f.sub2,
        ctrlSec: f.ctrl2,
        sigAcc: f.sigStrPct2
    };
}
function buildWindow(samples) {
    const minutes = samples.reduce((s, x)=>s + x.minutes, 0);
    const per15 = (total)=>minutes > 0 ? total / minutes * 15 : 0;
    const sum = (pick)=>samples.reduce((s, x)=>s + pick(x.side), 0);
    const accSamples = samples.filter((x)=>x.side.sigAcc > 0);
    const r1 = (n)=>Math.round(n * 10) / 10;
    return {
        fights: samples.length,
        minutes: Math.round(minutes),
        landedPer15: r1(per15(sum((s)=>s.landed))),
        absorbedPer15: r1(per15(sum((s)=>s.absorbed))),
        diffPer15: r1(per15(sum((s)=>s.landed - s.absorbed))),
        tdPer15: r1(per15(sum((s)=>s.td))),
        tdAbsorbedPer15: r1(per15(sum((s)=>s.tdAbsorbed))),
        kdPer15: Math.round(per15(sum((s)=>s.kd)) * 100) / 100,
        subAttPer15: r1(per15(sum((s)=>s.subAtt))),
        ctrlSharePct: minutes > 0 ? r1(sum((s)=>s.ctrlSec) / (minutes * 60) * 100) : 0,
        sigAccuracy: accSamples.length ? Math.round(accSamples.reduce((s, x)=>s + x.side.sigAcc, 0) / accSamples.length * 1000) / 1000 : null
    };
}
// Raw Method Details are noisy and over-specific ("Punch to Head At Distance",
// "Kick to Head At DistanceFront kick") — bucket them into a readable taxonomy
// so the finish-anatomy panel groups sensibly. Order matters: more specific
// submission names first ("Triangle Armbar" before "Armbar"/"Triangle").
const SUB_TAXONOMY = [
    [
        'rear naked',
        'Rear Naked Choke'
    ],
    [
        "d'arce",
        "D'Arce Choke"
    ],
    [
        'anaconda',
        'Anaconda Choke'
    ],
    [
        'arm triangle',
        'Arm Triangle'
    ],
    [
        'triangle armbar',
        'Triangle Armbar'
    ],
    [
        'triangle',
        'Triangle Choke'
    ],
    [
        'guillotine',
        'Guillotine Choke'
    ],
    [
        'armbar',
        'Armbar'
    ],
    [
        'kimura',
        'Kimura'
    ],
    [
        'kneebar',
        'Kneebar'
    ],
    [
        'heel hook',
        'Heel Hook'
    ],
    [
        'ankle',
        'Ankle Lock'
    ],
    [
        'americana',
        'Americana'
    ],
    [
        'ezekiel',
        'Ezekiel Choke'
    ],
    [
        'von flue',
        'Von Flue Choke'
    ],
    [
        'twister',
        'Twister'
    ],
    [
        'neck crank',
        'Neck Crank'
    ],
    [
        'choke',
        'Other choke'
    ]
];
function cleanFinishLabel(method, details) {
    const m = method.trim().toUpperCase();
    const d = details.toLowerCase();
    if (m === 'SUB') {
        for (const [needle, label] of SUB_TAXONOMY)if (d.includes(needle)) return label;
        return 'Submission (other)';
    }
    if (m.startsWith('KO') || m.startsWith('TKO')) {
        if (d.includes('punch')) return 'Punches';
        if (d.includes('elbow')) return 'Elbows';
        if (d.includes('knee')) return 'Knees';
        if (d.includes('kick') && d.includes('head')) return 'Head kick';
        if (d.includes('kick') && d.includes('body')) return 'Body kick';
        if (d.includes('kick') && d.includes('leg')) return 'Leg kicks';
        if (d.includes('kick')) return 'Kicks';
        if (d.includes('injury')) return 'Injury stoppage';
        if (d.includes('doctor')) return 'Doctor stoppage';
        if (d.includes('retire') || d.includes('corner')) return 'Corner stoppage';
        return 'KO/TKO (other)';
    }
    return '';
}
function topFinishes(entries) {
    const counts = new Map();
    for (const e of entries)counts.set(e, (counts.get(e) ?? 0) + 1);
    return [
        ...counts.entries()
    ].map(([label, count])=>({
            label,
            count
        })).sort((a, b)=>b.count - a.count).slice(0, 5);
}
// Landed:absorbed ratio of a window. Capped so a near-untouched run (absorbed
// ≈ 0) reads as "9.99+" instead of infinity.
function ratioOf(w) {
    if (!w || w.landedPer15 <= 0) return null;
    if (w.absorbedPer15 < 1) return 9.99;
    return Math.round(w.landedPer15 / w.absorbedPer15 * 100) / 100;
}
function getAdvancedStats(data, fighterId) {
    const all = (data.fighterFights.get(fighterId) ?? []).filter((f)=>f.eventDate).sort((a, b)=>a.eventDate.getTime() - b.eventDate.getTime());
    if (all.length === 0) return null;
    // Metric-bearing fights with usable time + strike data → rate samples.
    const samples = [];
    for (const f of all){
        if (!f.hasMetrics) continue;
        const minutes = fightMinutes(f);
        if (minutes == null) continue;
        const side = sideOf(f, fighterId);
        if (side.landed + side.absorbed === 0) continue; // missing early-era data
        samples.push({
            fight: f,
            side,
            minutes
        });
    }
    if (samples.length === 0) return null;
    const career = buildWindow(samples);
    const recentSamples = samples.slice(-RECENT_WINDOW);
    const recent = recentSamples.length >= MIN_RECENT_FIGHTS ? buildWindow(recentSamples) : null;
    const last3 = samples.length >= TREND_WINDOW ? buildWindow(samples.slice(-TREND_WINDOW)) : null;
    let drift = null;
    if (recent) {
        drift = {
            landedPer15Delta: Math.round((recent.landedPer15 - career.landedPer15) * 10) / 10,
            landedPctChange: career.landedPer15 >= 5 ? Math.round((recent.landedPer15 / career.landedPer15 - 1) * 1000) / 1000 : null,
            diffPer15Delta: Math.round((recent.diffPer15 - career.diffPer15) * 10) / 10,
            tdPer15Delta: Math.round((recent.tdPer15 - career.tdPer15) * 10) / 10,
            sigAccuracyDelta: recent.sigAccuracy != null && career.sigAccuracy != null ? Math.round((recent.sigAccuracy - career.sigAccuracy) * 1000) / 1000 : null
        };
    }
    const timeline = samples.map(({ fight, side, minutes })=>({
            date: fight.eventDate.toISOString().slice(0, 10),
            result: side.result || '—',
            opponentName: side.opponentName,
            method: fight.method,
            minutes: Math.round(minutes * 10) / 10,
            landedPer15: Math.round(side.landed / minutes * 15 * 10) / 10,
            absorbedPer15: Math.round(side.absorbed / minutes * 15 * 10) / 10,
            tdPer15: Math.round(side.td / minutes * 15 * 10) / 10,
            kd: side.kd
        }));
    const rollingLanded = timeline.map((_, i)=>{
        const win = timeline.slice(Math.max(0, i - 2), i + 1);
        return Math.round(win.reduce((s, p)=>s + p.landedPer15, 0) / win.length * 10) / 10;
    });
    // Durability counts use ALL dated fights (Sherdog rows carry method+result).
    let koTkoLosses = 0, subLosses = 0, decisionLosses = 0, lastFinishedYear = null;
    const finishWinLabels = [];
    const finishedByLabels = [];
    for (const f of all){
        const side = sideOf(f, fighterId);
        const m = f.method.trim().toUpperCase();
        const isKo = m.startsWith('KO') || m.startsWith('TKO');
        const isSub = m === 'SUB';
        if (side.result === 'L') {
            if (isKo) koTkoLosses++;
            else if (isSub) subLosses++;
            else if (m.includes('DEC')) decisionLosses++;
            if (isKo || isSub) {
                lastFinishedYear = f.eventDate.getFullYear();
                const label = cleanFinishLabel(f.method, f.methodDetails);
                if (label) finishedByLabels.push(label);
            }
        }
        if (side.result === 'W' && (isKo || isSub)) {
            const label = cleanFinishLabel(f.method, f.methodDetails);
            if (label) finishWinLabels.push(label);
        }
    }
    return {
        sampleFights: samples.length,
        totalMinutes: career.minutes,
        career,
        recent,
        last3,
        drift,
        ratioCareer: ratioOf(career),
        ratioLast3: ratioOf(last3),
        timeline,
        rollingLanded,
        durability: {
            koTkoLosses,
            subLosses,
            decisionLosses,
            timesFinished: koTkoLosses + subLosses,
            lastFinishedYear,
            kdAbsorbedPer15: career.minutes > 0 ? Math.round(samples.reduce((s, x)=>s + x.side.kdAbsorbed, 0) / career.minutes * 15 * 100) / 100 : 0,
            strikesAbsorbedPer15: career.absorbedPer15
        },
        finishWins: topFinishes(finishWinLabels),
        finishedBy: topFinishes(finishedByLabels)
    };
}
}),
"[project]/src/components/OddsValue.tsx [app-rsc] (client reference proxy) <module evaluation>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call the default export of [project]/src/components/OddsValue.tsx <module evaluation> from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/src/components/OddsValue.tsx <module evaluation>", "default");
}),
"[project]/src/components/OddsValue.tsx [app-rsc] (client reference proxy)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call the default export of [project]/src/components/OddsValue.tsx from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/src/components/OddsValue.tsx", "default");
}),
"[project]/src/components/OddsValue.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$OddsValue$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__$3c$module__evaluation$3e$__ = __turbopack_context__.i("[project]/src/components/OddsValue.tsx [app-rsc] (client reference proxy) <module evaluation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$OddsValue$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__ = __turbopack_context__.i("[project]/src/components/OddsValue.tsx [app-rsc] (client reference proxy)");
;
__turbopack_context__.n(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$OddsValue$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__);
}),
"[externals]/fs [external] (fs, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("fs", () => require("fs"));

module.exports = mod;
}),
"[externals]/stream [external] (stream, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("stream", () => require("stream"));

module.exports = mod;
}),
"[project]/src/lib/nameResolver.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "KNOWN_NAME_OVERRIDES",
    ()=>KNOWN_NAME_OVERRIDES,
    "buildNameIndex",
    ()=>buildNameIndex,
    "normalize",
    ()=>normalize,
    "resolveNameToId",
    ()=>resolveNameToId
]);
const KNOWN_NAME_OVERRIDES = {
    'Elizeu Zaleski dos Santos': 'Elizeu Zaleski dos Santos',
    'Germaine de Randamie': 'Germaine de Randamie',
    'Reinier de Ridder': 'Reinier de Ridder',
    'Marcos Rogerio de Lima': 'Marcos Rogerio de Lima',
    'Montana De La Rosa': 'Montana De La Rosa',
    'Chris de la Rocha': 'Chris de la Rocha',
    'Douglas Silva de Andrade': 'Douglas Silva de Andrade',
    'Ian Machado Garry': 'Ian Garry',
    'Ian Garry': 'Ian Garry',
    'Jan Błachowicz': 'Jan Blachowicz'
};
function normalize(name) {
    return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z\s]/g, '') // strip punctuation
    .replace(/\s+/g, ' ').trim();
}
function getLastNameFirstInitial(name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length < 2) return normalize(name);
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    return normalize(lastName) + '_' + normalize(firstName).charAt(0);
}
function buildNameIndex(fighters) {
    const exact = new Map();
    const normalized = new Map();
    const lastFirst = new Map();
    for (const f of fighters){
        exact.set(f.fullName, f.fighterId);
        normalized.set(normalize(f.fullName), f.fighterId);
        lastFirst.set(getLastNameFirstInitial(f.fullName), f.fighterId);
    }
    return {
        exact,
        normalized,
        lastFirst
    };
}
function resolveNameToId(apiName, index, opts = {}) {
    const { allowLastFirst = true, quiet = false } = opts;
    // Check overrides first
    const override = KNOWN_NAME_OVERRIDES[apiName];
    if (override) {
        const id = index.exact.get(override);
        if (id) return id;
    }
    // 1. Exact match
    const exactMatch = index.exact.get(apiName);
    if (exactMatch) return exactMatch;
    // 2. Normalized match
    const normalizedMatch = index.normalized.get(normalize(apiName));
    if (normalizedMatch) return normalizedMatch;
    // 3. Last name + first initial (forgiving — opt out for bulk matching)
    if (allowLastFirst) {
        const lfMatch = index.lastFirst.get(getLastNameFirstInitial(apiName));
        if (lfMatch) return lfMatch;
    }
    // No match found
    if (!quiet) console.warn(`[nameResolver] Could not resolve: "${apiName}"`);
    return null;
}
}),
"[project]/src/lib/registry.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getRegistry",
    ()=>getRegistry,
    "resolveToCanonical",
    ()=>resolveToCanonical
]);
// ─────────────────────────────────────────────────────────────────────────
//  registry.ts — the single fighter-identity resolver.
//
//  Reads the canonical alias table (data/canonical/fighter_aliases.csv, built by
//  scripts/registry/buildRegistry.ts) and resolves ANY name spelling seen across
//  our roster, the odds feeds, the official rankings, Sherdog and BFO to one
//  canonical Fighter_Id. Replaces the scattered name-matching that used to live
//  in five places.
//
//  CERTAINTY GUARANTEE: if a normalized name maps to MORE THAN ONE canonical id
//  (a genuine cross-source namesake), it is treated as UNRESOLVABLE (returns
//  null) rather than guessing — a missed link only loses data, a wrong link
//  steals wins. Merged duplicates are folded in, so a secondary name (e.g.
//  "Patricio Pitbull") resolves to the surviving fighter.
//
//  Optional file: if the registry hasn't been built, resolve() returns null for
//  everything and callers fall back to their own logic — so nothing breaks.
// ─────────────────────────────────────────────────────────────────────────
var __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/fs [external] (fs, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/path [external] (path, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$papaparse$2f$papaparse$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/papaparse/papaparse.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$nameResolver$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/nameResolver.ts [app-rsc] (ecmascript)");
;
;
;
;
const ALIAS_FILE = __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["default"].join(process.cwd(), 'data', 'canonical', 'fighter_aliases.csv');
let cached = null;
function build() {
    const map = new Map();
    const ambiguous = new Set();
    if (__TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["default"].existsSync(ALIAS_FILE)) {
        const rows = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$papaparse$2f$papaparse$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"].parse(__TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["default"].readFileSync(ALIAS_FILE, 'utf-8'), {
            header: true,
            skipEmptyLines: true
        }).data;
        for (const r of rows){
            const n = r['normalized_name'];
            const id = r['canonical_id'];
            if (!n || !id) continue;
            const existing = map.get(n);
            if (existing && existing !== id) ambiguous.add(n);
            else map.set(n, id);
        }
        // A name that points at two different fighters is unsafe to resolve → drop it.
        for (const n of ambiguous)map.delete(n);
    }
    return {
        resolve: (name)=>map.get((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$nameResolver$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["normalize"])(name)) ?? null,
        size: map.size,
        ambiguous: ambiguous.size
    };
}
function getRegistry() {
    if (!cached) cached = build();
    return cached;
}
function resolveToCanonical(name) {
    return getRegistry().resolve(name);
}
}),
"[project]/src/lib/loadData.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "loadAllData",
    ()=>loadAllData,
    "loadEvents",
    ()=>loadEvents,
    "loadFighters",
    ()=>loadFighters,
    "loadFights",
    ()=>loadFights,
    "loadRecentPatch",
    ()=>loadRecentPatch
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/fs [external] (fs, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/path [external] (path, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$papaparse$2f$papaparse$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/papaparse/papaparse.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/registry.ts [app-rsc] (ecmascript)");
;
;
;
;
const DATA_DIR = __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["default"].join(process.cwd(), 'data');
function readCSV(filename) {
    const filePath = __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["default"].join(DATA_DIR, filename);
    const raw = __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["default"].readFileSync(filePath, 'utf-8');
    const result = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$papaparse$2f$papaparse$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"].parse(raw, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false
    });
    return result.data;
}
function parseNum(val) {
    if (!val || val === '' || val === 'None' || val === 'null') return 0;
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
}
function parseBool(val) {
    return val?.toLowerCase() === 'true';
}
function loadFighters() {
    const rows = readCSV('Fighters_Stats.csv');
    return rows.map((r)=>({
            fighterId: r['Fighter_Id'] || '',
            fullName: r['Full Name'] || '',
            nickname: r['Nickname'] || '',
            height: r['Ht.'] || '',
            weight: parseNum(r['Wt.']),
            stance: r['Stance'] || '',
            wins: parseNum(r['W']),
            losses: parseNum(r['L']),
            draws: parseNum(r['D']),
            belt: parseBool(r['Belt']),
            weightClass: r['Weight_Class'] || '',
            gender: r['Gender'] || '',
            knockdowns: parseNum(r['KD']),
            sigStrikeAccuracy: parseNum(r['Sig. Str. %']),
            headPct: parseNum(r['Head_%']),
            bodyPct: parseNum(r['Body_%']),
            legPct: parseNum(r['Leg_%']),
            distancePct: parseNum(r['Distance_%']),
            clinchPct: parseNum(r['Clinch_%']),
            groundPct: parseNum(r['Ground_%']),
            subAttempts: parseNum(r['Sub. Att']),
            controlTime: parseNum(r['Ctrl']),
            takedowns: parseNum(r['TD']),
            koRate: parseNum(r['KO Rate']),
            subRate: parseNum(r['SUB Rate']),
            decRate: parseNum(r['DEC Rate']),
            fightingStyle: r['Fighting Style'] || '',
            strikerMembership: parseNum(r['Striker_Membership']),
            wrestlerMembership: parseNum(r['Wrestler_Membership']),
            hybridMembership: parseNum(r['Hybrid_Membership'])
        }));
}
function loadEvents() {
    const rows = readCSV('Events.csv');
    const eventMap = new Map();
    for (const r of rows){
        const eventId = r['Event_Id'] || '';
        eventMap.set(eventId, {
            eventId,
            name: r['Name'] || '',
            date: r['Date'] || '',
            location: r['Location'] || ''
        });
    }
    return eventMap;
}
function loadFights(eventMap) {
    const rows = readCSV('Fights.csv');
    return rows.filter((r)=>r['Fight_Id'] && r['Fighter_Id_1'] && r['Fighter_Id_2']).map((r)=>{
        const eventId = r['Event_Id'] || '';
        const event = eventMap.get(eventId);
        const dateStr = event?.date || '';
        const eventDate = dateStr ? new Date(dateStr) : null;
        return {
            fightId: r['Fight_Id'] || '',
            fighterId1: r['Fighter_Id_1'] || '',
            fighterId2: r['Fighter_Id_2'] || '',
            fighter1Name: r['Fighter_1'] || '',
            fighter2Name: r['Fighter_2'] || '',
            kd1: parseNum(r['KD_1']),
            kd2: parseNum(r['KD_2']),
            str1: parseNum(r['STR_1']),
            str2: parseNum(r['STR_2']),
            td1: parseNum(r['TD_1']),
            td2: parseNum(r['TD_2']),
            sub1: parseNum(r['SUB_1']),
            sub2: parseNum(r['SUB_2']),
            weightClass: r['Weight_Class'] || '',
            method: r['Method'] || '',
            methodDetails: r['Method Details'] || '',
            round: parseNum(r['Round']),
            fightTime: r['Fight_Time'] || '',
            eventId,
            result1: r['Result_1'] || '',
            result2: r['Result_2'] || '',
            timeFormat: r['Time Format'] || '',
            sigStrPct1: parseNum(r['Sig. Str. %_1']),
            sigStrPct2: parseNum(r['Sig. Str. %_2']),
            ctrl1: parseNum(r['Ctrl_1']),
            ctrl2: parseNum(r['Ctrl_2']),
            eventDate,
            source: 'fights',
            hasMetrics: true
        };
    });
}
function loadRecentPatch() {
    const filePath = __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["default"].join(DATA_DIR, 'recent_ufc_fights.csv');
    if (!__TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["default"].existsSync(filePath)) return [];
    const raw = __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["default"].readFileSync(filePath, 'utf-8');
    const rows = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$papaparse$2f$papaparse$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"].parse(raw, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false
    }).data;
    return rows.filter((r)=>r['fighter1_ourId'] && r['fighter2_ourId'] && r['date']).map((r, i)=>{
        const dateStr = r['date'] || '';
        const eventDate = dateStr ? new Date(dateStr) : null;
        const zero = 0;
        return {
            fightId: `sherdog-${i}`,
            fighterId1: r['fighter1_ourId'] || '',
            fighterId2: r['fighter2_ourId'] || '',
            fighter1Name: r['fighter1_name'] || '',
            fighter2Name: r['fighter2_name'] || '',
            kd1: zero,
            kd2: zero,
            str1: zero,
            str2: zero,
            td1: zero,
            td2: zero,
            sub1: zero,
            sub2: zero,
            weightClass: r['weightClass'] || '',
            method: r['method'] || '',
            methodDetails: '',
            round: parseNum(r['round']),
            fightTime: '',
            eventId: '',
            result1: r['result1'] || '',
            result2: r['result2'] || '',
            timeFormat: '',
            sigStrPct1: zero,
            sigStrPct2: zero,
            ctrl1: zero,
            ctrl2: zero,
            eventDate,
            source: 'sherdog',
            hasMetrics: false
        };
    });
}
// Human-confirmed identity merges: secondary Fighter_Id → primary Fighter_Id.
// Built by scripts/registry/buildRegistry.ts review and recorded in
// data/canonical/fighter_merges.csv. Optional → empty map (no-op) if absent.
// These collapse a fighter split across two ids (e.g. Patricio Pitbull/Freire,
// Kai Kamaka III/Kamaka) so the Elo treats them as one person.
function loadFighterMerges() {
    const m = new Map();
    const fp = __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["default"].join(DATA_DIR, 'canonical', 'fighter_merges.csv');
    if (!__TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["default"].existsSync(fp)) return m;
    const rows = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$papaparse$2f$papaparse$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"].parse(__TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["default"].readFileSync(fp, 'utf-8'), {
        header: true,
        skipEmptyLines: true
    }).data;
    for (const r of rows)if (r['secondary_id'] && r['primary_id']) m.set(r['secondary_id'], r['primary_id']);
    return m;
}
// Normalized name + ordered-pair key for cross-source fight de-duplication.
// Strips accents, generational suffixes (Jr/Sr/II/III/IV) and punctuation so
// "Kai Kamaka III" and "Kai Kamaka" collapse to the same key.
function normName(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z0-9]/g, '');
}
function pairKey(a, b) {
    return [
        normName(a),
        normName(b)
    ].sort().join('|');
}
function loadAllData() {
    const events = loadEvents();
    const fighters = loadFighters();
    const fights = loadFights(events);
    // Build fighter lookup by ID
    const fighterMap = new Map();
    for (const f of fighters){
        fighterMap.set(f.fighterId, f);
    }
    // CRITICAL: Fighter_Id columns in Fights.csv are unreliable (~88% mismatch).
    // Build a name→ID map from Fighters_Stats.csv (which has correct IDs),
    // then re-resolve fight participant IDs using the fighter name columns.
    const nameToId = new Map();
    for (const f of fighters){
        nameToId.set(f.fullName, f.fighterId);
    }
    // Re-resolve fighter IDs in every fight via the canonical registry (the single
    // identity source — data/canonical/fighter_aliases.csv), falling back to exact
    // Full-Name lookup if the registry isn't built. Proven byte-identical to the
    // prior exact-name + merge resolution (scripts/registry regression test).
    const registry = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getRegistry"])();
    for (const fight of fights){
        const r1 = registry.resolve(fight.fighter1Name) ?? nameToId.get(fight.fighter1Name);
        const r2 = registry.resolve(fight.fighter2Name) ?? nameToId.get(fight.fighter2Name);
        if (r1) fight.fighterId1 = r1;
        if (r2) fight.fighterId2 = r2;
    }
    // ── Integrate the Sherdog recency top-up (alignment-guarded) ──────────────
    // Contract: these are UFC fights NEWER than Fights.csv. The upstream builder
    // has historically violated that (stale + duplicate rows), so we enforce it
    // at the load boundary instead of trusting the file:
    //   1. DROP duplicates of a primary fight — same fighter pair (suffix-tolerant
    //      name key) within ±7 days. ID keys are unreliable across sources (the
    //      crosswalk id, the Fights.csv id and the roster id for one fighter can
    //      all differ), so we key on normalized names. Catches double-counts like
    //      Kamaka 2026-04-04 that were inflating the Elo sweep.
    //   2. DROP anything older than the primary cutoff minus a grace window — a
    //      "recency" row dated 2014 is a scrape error, not a gap-fill (this also
    //      sweeps up old duplicates like JDM/Emeev 2022).
    //   3. RESOLVE a surviving `sd:` (unmatched) id by UNIQUE name against the
    //      roster (JDM, Aaron Pico, Junior Tafa…) so the new fight attaches to the
    //      real fighter; genuinely-new regional fighters stay `sd:` (~1500 Elo).
    let latestPrimaryMs = 0;
    const primaryPairDates = new Map();
    for (const f of fights){
        if (!f.eventDate) continue;
        const t = f.eventDate.getTime();
        if (t > latestPrimaryMs) latestPrimaryMs = t;
        const k = pairKey(f.fighter1Name, f.fighter2Name);
        const arr = primaryPairDates.get(k);
        if (arr) arr.push(t);
        else primaryPairDates.set(k, [
            t
        ]);
    }
    const DUP_MS = 7 * 24 * 60 * 60 * 1000; // ±7 days ⇒ same fight
    const recencyFloorMs = latestPrimaryMs - 60 * 24 * 60 * 60 * 1000; // 60-day gap-fill grace
    // Only resolve an `sd:` id by name when that name is unambiguous in the roster.
    const nameCount = new Map();
    for (const f of fighters)nameCount.set(f.fullName, (nameCount.get(f.fullName) || 0) + 1);
    let rcAdded = 0, rcDup = 0, rcStale = 0, rcResolved = 0;
    for (const pf of loadRecentPatch()){
        if (!pf.eventDate) continue;
        const t = pf.eventDate.getTime();
        if (t < recencyFloorMs) {
            rcStale++;
            continue;
        }
        const dates = primaryPairDates.get(pairKey(pf.fighter1Name, pf.fighter2Name));
        if (dates && dates.some((x)=>Math.abs(x - t) <= DUP_MS)) {
            rcDup++;
            continue;
        }
        if (pf.fighterId1.startsWith('sd:') && nameCount.get(pf.fighter1Name) === 1) {
            const id = nameToId.get(pf.fighter1Name);
            if (id) {
                pf.fighterId1 = id;
                rcResolved++;
            }
        }
        if (pf.fighterId2.startsWith('sd:') && nameCount.get(pf.fighter2Name) === 1) {
            const id = nameToId.get(pf.fighter2Name);
            if (id) {
                pf.fighterId2 = id;
                rcResolved++;
            }
        }
        fights.push(pf);
        rcAdded++;
    }
    if (rcAdded || rcDup || rcStale) {
        console.log(`[loadData] recency patch: +${rcAdded} added, ${rcDup} duplicate-dropped, ` + `${rcStale} stale-dropped, ${rcResolved} ids name-resolved`);
    }
    // ── Apply confirmed identity merges (collapse split fighters) ─────────────
    // Remap each duplicate id onto its primary, then drop bouts that become
    // identical (same id-pair + date) — the split also inflated the OPPONENT's
    // record, so this de-duplicates that too. Scoped to merged fighters only.
    const merges = loadFighterMerges();
    const mergedAway = new Set(merges.keys());
    if (merges.size) {
        for (const f of fights){
            if (merges.has(f.fighterId1)) f.fighterId1 = merges.get(f.fighterId1);
            if (merges.has(f.fighterId2)) f.fighterId2 = merges.get(f.fighterId2);
        }
        const primaries = new Set(merges.values());
        const seen = new Set();
        const kept = [];
        let dropped = 0;
        for (const f of fights){
            if (primaries.has(f.fighterId1) || primaries.has(f.fighterId2)) {
                const [a, b] = [
                    f.fighterId1,
                    f.fighterId2
                ].sort();
                const key = `${a}|${b}|${f.eventDate ? f.eventDate.toISOString().slice(0, 10) : f.fightId}`;
                if (seen.has(key)) {
                    dropped++;
                    continue;
                }
                seen.add(key);
            }
            kept.push(f);
        }
        fights.length = 0;
        fights.push(...kept);
        console.log(`[loadData] identity merges: ${merges.size} ids collapsed, ${dropped} duplicate bouts dropped`);
    }
    // Build fight history per fighter using corrected IDs
    const fighterFights = new Map();
    for (const fight of fights){
        if (!fighterFights.has(fight.fighterId1)) {
            fighterFights.set(fight.fighterId1, []);
        }
        fighterFights.get(fight.fighterId1).push(fight);
        if (!fighterFights.has(fight.fighterId2)) {
            fighterFights.set(fight.fighterId2, []);
        }
        fighterFights.get(fight.fighterId2).push(fight);
    }
    // Remove merged-away secondary fighters from the roster + lookup so they never
    // appear as phantom (now fight-less) records.
    for (const sid of mergedAway){
        fighterMap.delete(sid);
        fighterFights.delete(sid);
    }
    const rosterFighters = mergedAway.size ? fighters.filter((f)=>!mergedAway.has(f.fighterId)) : fighters;
    return {
        fighters: rosterFighters,
        fights,
        events,
        fighterMap,
        fighterFights
    };
}
}),
"[project]/src/lib/dataCache.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getData",
    ()=>getData
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$loadData$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/loadData.ts [app-rsc] (ecmascript)");
;
// Single process-wide CSV load shared by every route/page. The Elo + history
// caches in eloEngine are keyed off this LoadedData instance, so keeping one
// instance means the chronological sweep runs at most once per process.
let cache = null;
function getData() {
    if (!cache) cache = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$loadData$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["loadAllData"])();
    return cache;
}
}),
"[project]/src/lib/fetchOfficialRankings.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "fetchOfficialRankings",
    ()=>fetchOfficialRankings,
    "getOfficialRankingsForDivision",
    ()=>getOfficialRankingsForDivision
]);
const OCTAGON_API_URL = 'https://api.octagon-api.com/rankings';
let cachedRankings = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
async function fetchOfficialRankings() {
    const now = Date.now();
    if (cachedRankings && now - cacheTimestamp < CACHE_TTL_MS) {
        return cachedRankings;
    }
    try {
        const response = await fetch(OCTAGON_API_URL);
        if (!response.ok) {
            console.warn(`[fetchOfficialRankings] API returned ${response.status}, using empty rankings`);
            return {};
        }
        const data = await response.json();
        cachedRankings = normalizeApiResponse(data);
        cacheTimestamp = now;
        console.log(`[fetchOfficialRankings] Loaded official rankings for ${Object.keys(cachedRankings).length} divisions`);
        return cachedRankings;
    } catch (error) {
        console.warn('[fetchOfficialRankings] Failed to fetch, using empty rankings:', error);
        return {};
    }
}
function normalizeApiResponse(data) {
    if (!data || !Array.isArray(data)) return {};
    const result = {};
    for (const div of data){
        if (!div.categoryName || !div.fighters) continue;
        // Skip P4P lists — they're cross-division and not useful for seeding
        if (div.id?.includes('pound-for-pound')) continue;
        const rankings = [];
        // Add champion first with rank "C"
        if (div.champion?.championName) {
            rankings.push({
                rank: 'C',
                name: div.champion.championName,
                record: ''
            });
        }
        // Fighters array is ordered #1 through #15
        for(let i = 0; i < div.fighters.length; i++){
            rankings.push({
                rank: String(i + 1),
                name: div.fighters[i].name,
                record: ''
            });
        }
        // Map API categoryName to our internal division name
        const internalName = API_TO_INTERNAL_NAME[div.categoryName] || div.categoryName;
        result[internalName] = rankings;
    }
    return result;
}
// API categoryName → our internal division names
const API_TO_INTERNAL_NAME = {
    'Heavyweight': 'Heavyweight',
    'Light Heavyweight': 'Light Heavyweight',
    'Middleweight': 'Middleweight',
    'Welterweight': 'Welterweight',
    'Lightweight': 'Lightweight',
    'Featherweight': 'Featherweight',
    'Bantamweight': 'Bantamweight',
    'Flyweight': 'Flyweight',
    "Women's Strawweight": "Women's Strawweight",
    "Women's Flyweight": "Women's Flyweight",
    "Women's Bantamweight": "Women's Bantamweight"
};
function getOfficialRankingsForDivision(rankings, division) {
    return rankings[division] || [];
}
}),
"[project]/src/lib/pedigreeSeed.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "loadPedigreeStrength",
    ()=>loadPedigreeStrength
]);
// Pre-UFC pedigree seed (Sherdog-sourced, scoring side).
//
// Reads data/sherdog_fights.csv (built by scripts/sherdog/buildContext.ts) and
// produces one bounded pedigreeStrength per fighter, describing how good their
// record was in OTHER promotions BEFORE they reached the UFC. The scoring engine
// turns this into a small, thin-sample-only Elo nudge (see RANKING_CONFIG
// .preUFCPedigree.seed*). Everything here is gated by `seedEnabled` upstream.
//
// Guarantees carried over: pre-UFC-debut fights only; `historical` orgs
// (Pride/Strikeforce/WEC) excluded from current-form; strength is bounded.
var __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/fs [external] (fs, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/path [external] (path, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$papaparse$2f$papaparse$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/papaparse/papaparse.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/rankingConfig.ts [app-rsc] (ecmascript)");
;
;
;
;
const CFG = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].preUFCPedigree;
function loadPedigreeStrength(data) {
    const out = new Map();
    const file = __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["default"].join(process.cwd(), 'data', CFG.seedSourceFile);
    if (!__TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["default"].existsSync(file)) return out;
    // Each fighter's UFC debut (earliest dated fight we have on them).
    const debut = new Map();
    for (const [fid, fights] of data.fighterFights){
        let min = Infinity;
        for (const f of fights)if (f.eventDate) min = Math.min(min, f.eventDate.getTime());
        if (min < Infinity) debut.set(fid, min);
    }
    const rows = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$papaparse$2f$papaparse$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"].parse(__TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["default"].readFileSync(file, 'utf-8'), {
        header: true,
        skipEmptyLines: true
    }).data;
    const agg = new Map();
    for (const r of rows){
        const fid = r['ourFighterId'];
        if (!fid) continue;
        if (CFG.seedExcludeHistorical && r['tier'] === 'historical') continue;
        // Pre-UFC-debut only.
        if (CFG.onlyBeforeUFCDebut) {
            const db = debut.get(fid);
            const dt = r['date'] ? new Date(r['date']).getTime() : NaN;
            if (db && !Number.isNaN(dt) && dt >= db) continue;
        }
        const res = (r['result'] || '').trim().toLowerCase();
        let a = agg.get(fid);
        if (!a) {
            a = {
                w: 0,
                l: 0,
                d: 0,
                topMult: 0
            };
            agg.set(fid, a);
        }
        if (res === 'win') a.w++;
        else if (res === 'loss') a.l++;
        else if (res === 'draw') a.d++;
        else continue; // nc / unknown → no credit
        const mult = parseFloat(r['tierMultiplier']) || 0;
        if (mult > a.topMult) a.topMult = mult;
    }
    for (const [fid, a] of agg){
        const fights = a.w + a.l + a.d;
        const decisive = a.w + a.l;
        const winRate = decisive > 0 ? a.w / decisive : 0;
        const confidence = Math.min(fights / CFG.confidenceFullFights, 1);
        const strength = Math.min(winRate * confidence * a.topMult, CFG.maxStrength);
        out.set(fid, {
            strength,
            wins: a.w,
            losses: a.l,
            fights,
            topMultiplier: a.topMult
        });
    }
    return out;
}
}),
"[project]/src/lib/scoringEngine.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "generateDivisionRankings",
    ()=>generateDivisionRankings,
    "getFighterPerspective",
    ()=>getFighterPerspective,
    "recencyWeight",
    ()=>recencyWeight
]);
// ─────────────────────────────────────────────────────────────────────────
//  scoringEngine.ts — turns Elo ratings into a ranked division (v2)
//
//  The heavy lifting (opponent quality, recency, finishes, weight-class moves)
//  lives in eloEngine.ts. This file:
//    1. Decides who is eligible for a division (official rank OR fight history).
//    2. Reads each fighter's Elo and layers BOUNDED adjustments:
//         finalRating = elo + metricsBonus + sosNudge + officialBonus
//       Elo dominates; the rest only refine ties and edge cases.
//    3. Sorts, applies a head-to-head correction, then official safety floors.
//
//  Nothing is hardcoded — every weight comes from RANKING_CONFIG.
// ─────────────────────────────────────────────────────────────────────────
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/rankingConfig.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$fetchOfficialRankings$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/fetchOfficialRankings.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$nameResolver$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/nameResolver.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$eloEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/eloEngine.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/registry.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$filters$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/filters.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$pedigreeSeed$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/pedigreeSeed.ts [app-rsc] (ecmascript)");
;
;
;
;
;
;
;
// ─── Helpers ─────────────────────────────────────────────────
function monthsBetween(d1, d2) {
    return (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}
function isBeyondCutoff(fightDate, now) {
    if (!fightDate) return true;
    return monthsBetween(fightDate, now) > __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].recencyCutoffMonths;
}
// Era filter: only count fights from the chosen start year onward (null = all).
function inEra(fightDate, eraStartYear) {
    if (eraStartYear == null) return true;
    if (!fightDate) return true; // dateless fights are already dropped by isBeyondCutoff
    return fightDate.getFullYear() >= eraStartYear;
}
function recencyWeight(fightDate, now, halfLifeMonths) {
    if (!fightDate) return 0;
    const months = monthsBetween(fightDate, now);
    if (months < 0) return 1; // future-dated data glitch → treat as current
    return Math.pow(0.5, months / halfLifeMonths);
}
function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}
// Display-only: how CURRENT a fighter's résumé is, in [0,1]. Blends recency
// (months since last fight, past a grace window) with cadence (fights per year
// over the SoS window). Feeds the schedule-strength display composite ONLY —
// never the rating (the Elo core already handles inactivity via regression).
function scheduleActivityFactor(monthsSinceLastFight, fightsInWindow) {
    const { activityGraceMonths, activityFullDecayMonths, activityTargetFightsPerYear, activityCadenceWeight, sosWindowYears } = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"];
    const recency = clamp(1 - (monthsSinceLastFight - activityGraceMonths) / (activityFullDecayMonths - activityGraceMonths), 0, 1);
    const cadence = clamp(fightsInWindow / (sosWindowYears * activityTargetFightsPerYear), 0, 1);
    return (1 - activityCadenceWeight) * recency + activityCadenceWeight * cadence;
}
function getFighterPerspective(fight, fighterId) {
    if (fight.fighterId1 === fighterId) {
        return {
            isWin: fight.result1 === 'W',
            isLoss: fight.result1 === 'L',
            opponentId: fight.fighterId2,
            strSelf: fight.str1,
            strOpp: fight.str2,
            sigStrPctSelf: fight.sigStrPct1,
            sigStrPctOpp: fight.sigStrPct2,
            kdSelf: fight.kd1,
            tdSelf: fight.td1,
            tdOpp: fight.td2
        };
    }
    if (fight.fighterId2 === fighterId) {
        return {
            isWin: fight.result2 === 'W',
            isLoss: fight.result2 === 'L',
            opponentId: fight.fighterId1,
            strSelf: fight.str2,
            strOpp: fight.str1,
            sigStrPctSelf: fight.sigStrPct2,
            sigStrPctOpp: fight.sigStrPct1,
            kdSelf: fight.kd2,
            tdSelf: fight.td2,
            tdOpp: fight.td1
        };
    }
    return null;
}
// ─── Official safety floors (unchanged behavior) ─────────────
// Count consecutive losses from a fighter's most recent UFC fight backward.
// A win/draw/NC ends the streak. Used to suppress contender floors for fighters
// the cage is telling us are in decline.
function recentLossStreak(fighterId, data) {
    const fights = (data.fighterFights.get(fighterId) || []).filter((f)=>f.eventDate).sort((a, b)=>b.eventDate.getTime() - a.eventDate.getTime());
    let streak = 0;
    for (const f of fights){
        const result = f.fighterId1 === fighterId ? f.result1 : f.result2;
        if (result === 'L') streak++;
        else break;
    }
    return streak;
}
function applyOfficialFloors(rankedFighters, officialRankMap, division, data) {
    const tiers = [
        {
            ranks: [
                '6',
                '7',
                '8',
                '9',
                '10',
                '11',
                '12',
                '13',
                '14',
                '15'
            ],
            floor: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].top15FloorRank,
            name: 'top15FloorRank',
            contender: true
        },
        {
            ranks: [
                '1',
                '2',
                '3',
                '4',
                '5'
            ],
            floor: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].top5FloorRank,
            name: 'top5FloorRank',
            contender: true
        },
        {
            ranks: [
                'C'
            ],
            floor: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].championFloorRank,
            name: 'championFloorRank',
            contender: false
        }
    ];
    for (const tier of tiers){
        for (const fighter of [
            ...rankedFighters
        ]){
            const officialRank = officialRankMap.get(fighter.fighterId);
            if (!officialRank || !tier.ranks.includes(officialRank)) continue;
            // Contender floors don't protect a fighter on a losing streak — let the
            // Elo drop stand (the champion floor is unconditional).
            if (tier.contender) {
                const streak = recentLossStreak(fighter.fighterId, data);
                if (streak >= __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].contenderFloorSuppressLossStreak) {
                    console.log(`[scoringEngine] FLOOR SUPPRESSED in ${division}: ${fighter.fullName} ` + `(UFC #${officialRank}) on a ${streak}-fight skid — ${tier.name} not applied`);
                    continue;
                }
            }
            const currentIndex = rankedFighters.indexOf(fighter);
            const floorIndex = tier.floor - 1;
            if (currentIndex > floorIndex) {
                const oldRank = currentIndex + 1;
                rankedFighters.splice(currentIndex, 1);
                rankedFighters.splice(floorIndex, 0, fighter);
                console.log(`[scoringEngine] FLOOR APPLIED in ${division}: ${fighter.fullName} ` + `lifted from #${oldRank} to #${floorIndex + 1} (rule: ${tier.name})`);
            }
        }
    }
}
async function generateDivisionRankings(division, data, filters = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$filters$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["DEFAULT_FILTERS"]) {
    const now = new Date();
    const { fighters, fighterFights } = data;
    // Effective engine from the user filters; neutral filters === RANKING_CONFIG.
    const engine = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$filters$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["effectiveEngine"])(filters);
    const eraStartYear = engine.eraStartYear;
    const halfLife = engine.recencyHalfLifeMonths;
    const elo = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$eloEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["buildEloRatings"])(data, engine);
    // Pre-UFC pedigree seed (Sherdog) — only loaded when the master toggle is on.
    // When off, pedigreeBonus stays 0 everywhere and finalRating is unchanged.
    const pedigree = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].preUFCPedigree.seedEnabled ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$pedigreeSeed$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["loadPedigreeStrength"])(data) : null;
    // 1. Official rankings: authority on division membership + the seed/floor.
    const officialSeedMap = new Map(); // fighterId → seed score (100/90/…)
    const officialRankMap = new Map(); // fighterId → "C"/"1"/…
    const officiallyInDivision = new Set();
    const removedFromDivision = new Set();
    const nameIndex = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$nameResolver$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["buildNameIndex"])(fighters);
    // Resolve official-ranking / override names through the canonical registry
    // first (curated aliases unified across all sources), falling back to the
    // fuzzy resolver. A SUPERSET of the legacy resolution — may seed a few more
    // fighters whose UFC.com spelling the fuzzy matcher missed.
    const registry = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getRegistry"])();
    const resolveOfficial = (name)=>registry.resolve(name) ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$nameResolver$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["resolveNameToId"])(name, nameIndex);
    for (const [name, override] of Object.entries(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].divisionOverrides)){
        const fighterId = resolveOfficial(name);
        if (!fighterId) continue;
        if (override.division === division) {
            officiallyInDivision.add(fighterId);
            officialSeedMap.set(fighterId, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].officialRankScores[override.rank] || 0);
            officialRankMap.set(fighterId, override.rank);
        }
        if (override.removeFrom === division) removedFromDivision.add(fighterId);
    }
    try {
        const officialRankings = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$fetchOfficialRankings$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["fetchOfficialRankings"])();
        const divRankings = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$fetchOfficialRankings$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getOfficialRankingsForDivision"])(officialRankings, division);
        for (const ranked of divRankings){
            const fighterId = resolveOfficial(ranked.name);
            if (!fighterId || removedFromDivision.has(fighterId)) continue;
            if (!officialSeedMap.has(fighterId)) {
                officialSeedMap.set(fighterId, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].officialRankScores[ranked.rank] || 0);
            }
            if (!officialRankMap.has(fighterId)) officialRankMap.set(fighterId, ranked.rank);
            officiallyInDivision.add(fighterId);
        }
    } catch  {
        console.warn('[scoringEngine] Could not fetch official rankings, proceeding without seed');
    }
    // A fight's effective division FOR A GIVEN fighter: its normalized weight class,
    // or — for a divisionless bout (catch/open weight) — the fighter's home division.
    // A short-notice or opponent-missed-weight catch-weight fight is NOT a division
    // change, so it still counts toward the division the fighter actually competes in.
    const effectiveDivision = (wc, home)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$eloEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["normalizeWeightClassForMove"])(wc) ?? home;
    // 2. Eligibility — official membership OR fight history says this is the division.
    const eligibleFighters = fighters.filter((f)=>{
        if (removedFromDivision.has(f.fighterId)) return false;
        const allFights = fighterFights.get(f.fighterId) || [];
        if (allFights.length < __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].minUFCFights) return false;
        if (officiallyInDivision.has(f.fighterId)) return true;
        if (f.weightClass !== division) return false;
        const recentFights = allFights.filter((fight)=>!isBeyondCutoff(fight.eventDate, now) && inEra(fight.eventDate, eraStartYear));
        const divFightsInWindow = recentFights.filter((fight)=>effectiveDivision(fight.weightClass, division) === division);
        if (divFightsInWindow.length < 2) return false;
        const mostRecent = recentFights.filter((x)=>x.eventDate).sort((a, b)=>b.eventDate.getTime() - a.eventDate.getTime())[0];
        if (mostRecent && effectiveDivision(mostRecent.weightClass, division) !== division) return false;
        return true;
    });
    // 3. Score each eligible fighter off their Elo + bounded adjustments.
    const rankedFighters = [];
    for (const fighter of eligibleFighters){
        const fights = fighterFights.get(fighter.fighterId) || [];
        const eloState = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$eloEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getElo"])(elo, fighter.fighterId);
        const divFights = fights.filter((f)=>!isBeyondCutoff(f.eventDate, now) && inEra(f.eventDate, eraStartYear) && effectiveDivision(f.weightClass, division) === division).sort((a, b)=>(b.eventDate?.getTime() || 0) - (a.eventDate?.getTime() || 0));
        // ── Strength of schedule: recency-weighted avg opponent Elo in window ──
        let sosWeighted = 0;
        let sosWeightSum = 0;
        const metricSamples = [];
        for (const fight of divFights){
            const persp = getFighterPerspective(fight, fighter.fighterId);
            if (!persp) continue;
            const w = recencyWeight(fight.eventDate, now, halfLife);
            if (fight.eventDate && monthsBetween(fight.eventDate, now) / 12 <= __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].sosWindowYears) {
                const oppElo = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$eloEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getElo"])(elo, persp.opponentId).rating;
                sosWeighted += oppElo * w;
                sosWeightSum += w;
            }
            // Sherdog recency top-up fights carry no per-fight metrics — include them
            // in Elo/SoS/recency (handled elsewhere) but NEVER in the strike/grappling
            // composite, or they'd drag the averages toward zero.
            if (fight.hasMetrics !== false && metricSamples.length < __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].metricsRecentFights) {
                metricSamples.push({
                    strDiff: persp.strSelf - persp.strOpp,
                    accDiff: persp.sigStrPctSelf - persp.sigStrPctOpp,
                    kd: persp.kdSelf,
                    tdDiff: persp.tdSelf - persp.tdOpp,
                    w
                });
            }
        }
        const sosElo = sosWeightSum > 0 ? sosWeighted / sosWeightSum : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].sosAnchorElo;
        const sosNudge = clamp((sosElo - __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].sosAnchorElo) * __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].sosSlopePerElo, -__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].sosAdjustCap, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].sosAdjustCap);
        // ── Striking/grappling metrics (bounded ± Elo points) ──
        const metricsBonus = computeMetricsBonus(metricSamples, divFights.length);
        // ── Official seed (small; floors are the real backstop) ──
        const officialBonus = (officialSeedMap.get(fighter.fighterId) || 0) * __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].officialBonusScaleElo;
        const officialRank = officialRankMap.get(fighter.fighterId) || null;
        // ── Pre-UFC pedigree seed (gated by seedEnabled; thin-sample only) ──
        // Tapers from full at 0 UFC fights to ZERO at seedTaperUFCFights, so a real
        // UFC sample always overrides it. pedigree is null when the toggle is off.
        const pedInfo = pedigree?.get(fighter.fighterId);
        const pedigreeStrength = pedInfo?.strength ?? 0;
        let pedigreeBonus = 0;
        if (pedInfo) {
            const taper = Math.max(0, 1 - fights.length / __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].preUFCPedigree.seedTaperUFCFights);
            pedigreeBonus = pedInfo.strength * __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].preUFCPedigree.seedMaxElo * taper;
        }
        const finalRating = eloState.rating + metricsBonus + sosNudge + officialBonus + pedigreeBonus;
        const lastDivFightDate = divFights[0]?.eventDate || eloState.lastFightDate;
        const monthsSinceLastFight = lastDivFightDate ? monthsBetween(lastDivFightDate, now) : 999;
        const finishRate = fighter.koRate + fighter.subRate;
        // Schedule-strength display composite: opponent quality discounted by how
        // current the résumé is. Display only — does NOT enter finalRating above.
        const sosQualityScore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$eloEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["eloToDisplayScore"])(sosElo);
        const scheduleActivity = scheduleActivityFactor(monthsSinceLastFight, divFights.length);
        const scheduleStrength = sosQualityScore * (__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].activityFloor + (1 - __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].activityFloor) * scheduleActivity);
        rankedFighters.push({
            rank: 0,
            fighterId: fighter.fighterId,
            fullName: fighter.fullName,
            nickname: fighter.nickname,
            record: `${fighter.wins}-${fighter.losses}-${fighter.draws}`,
            weightClass: fighter.weightClass,
            belt: fighter.belt,
            rankScore: Math.round((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$eloEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["eloToDisplayScore"])(finalRating) * 100) / 100,
            finalRating: Math.round(finalRating * 100) / 100,
            eloRating: Math.round(eloState.rating * 100) / 100,
            eloPeak: Math.round(eloState.peakRating * 100) / 100,
            metricsBonus: Math.round(metricsBonus * 100) / 100,
            sosNudge: Math.round(sosNudge * 100) / 100,
            officialBonus: Math.round(officialBonus * 100) / 100,
            pedigreeBonus: Math.round(pedigreeBonus * 100) / 100,
            pedigreeStrength: Math.round(pedigreeStrength * 1000) / 1000,
            officialRank,
            strengthOfSchedule: Math.round(sosQualityScore * 100) / 100,
            scheduleStrength: Math.round(scheduleStrength * 100) / 100,
            scheduleActivity: Math.round(scheduleActivity * 1000) / 1000,
            sosElo: Math.round(sosElo * 100) / 100,
            monthsSinceLastFight: Math.round(monthsSinceLastFight * 10) / 10,
            recentFightCount: divFights.length,
            sigStrikeAccuracy: fighter.sigStrikeAccuracy,
            koRate: fighter.koRate,
            subRate: fighter.subRate,
            finishRate: Math.round(finishRate * 100) / 100,
            fightCount: fights.length
        });
    }
    // 4. Sort by final rating; SoS is the tiebreaker.
    rankedFighters.sort((a, b)=>{
        if (b.finalRating !== a.finalRating) return b.finalRating - a.finalRating;
        return b.sosElo - a.sosElo;
    });
    // 5. Head-to-head leapfrog: a fighter who recently + decisively beat someone
    //    ranked above them is lifted to directly above that opponent (guard-railed).
    applyHeadToHead(rankedFighters, data, division, now, eraStartYear);
    // 6. Champion tiebreaker: a reigning champ in a near-tie wins the top slot.
    applyChampionTiebreaker(rankedFighters, division);
    // 7. Official safety floors (should rarely fire if Elo is landing).
    applyOfficialFloors(rankedFighters, officialRankMap, division, data);
    // 8. Display-only monotonicity: steps 5–7 reorder the array but never touch
    //    rankScore, so a lifted fighter (especially a champion pinned to the top
    //    of the UI) can show a LOWER score than someone ranked below them. Raise
    //    each displayed score to at least the one beneath it (bottom→top) so the
    //    headline number always agrees with the rank. finalRating / eloRating are
    //    left intact (the true ratings are still shown on profiles / compare).
    for(let i = rankedFighters.length - 2; i >= 0; i--){
        if (rankedFighters[i].rankScore < rankedFighters[i + 1].rankScore) {
            rankedFighters[i].rankScore = rankedFighters[i + 1].rankScore;
        }
    }
    // A reigning champion is pinned ABOVE the numbered list in the UI regardless of
    // rating, so their displayed score must lead the division — otherwise the champ
    // hero shows a lower score than the #1 contender beneath it (e.g. a belt-holder
    // rated below a contender). The true rating stays in finalRating / eloRating.
    const topScore = rankedFighters[0]?.rankScore ?? 0;
    for (const f of rankedFighters){
        if (f.officialRank === 'C' && f.rankScore < topScore) f.rankScore = topScore;
    }
    const ranked = rankedFighters.slice(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].rankingsDepth).map((f, i)=>({
            ...f,
            rank: i + 1
        }));
    return {
        division,
        gender: division.startsWith("Women's") ? 'Female' : 'Male',
        fighters: ranked,
        generatedAt: now.toISOString()
    };
}
// ─── Metrics composite ───────────────────────────────────────
function computeMetricsBonus(samples, scoredFightCount) {
    if (samples.length === 0) return 0;
    let wSum = 0, str = 0, acc = 0, kd = 0, td = 0;
    for (const s of samples){
        str += s.strDiff * s.w;
        acc += s.accDiff * s.w;
        kd += s.kd * s.w;
        td += s.tdDiff * s.w;
        wSum += s.w;
    }
    if (wSum === 0) return 0;
    const norm = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].metricsNorm;
    const nStr = clamp(str / wSum / norm.volumeStrikePerFight, -1, 1);
    const nAcc = clamp(acc / wSum / norm.accuracyEdge, -1, 1);
    const nKd = clamp(kd / wSum / norm.knockdownsPerFight, 0, 1);
    const nTd = clamp(td / wSum / norm.takedownsPerFight, -1, 1);
    const wts = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].metricsWeights;
    const composite = nStr * wts.volumeStrikeDifferential + nAcc * wts.strikeAccuracyDifferential + nKd * wts.knockdownRate + nTd * wts.takedownDifferential;
    // Dampen for thin samples so a 3-fight fighter's metrics can't swing them.
    const confidence = Math.min(scoredFightCount / __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].metricsConfidenceMinFights, 1.0);
    return composite * __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].metricsScaleElo * confidence;
}
// ─── Champion tiebreaker ─────────────────────────────────────
// A reigning champion (official rank "C") ranked directly below a non-champion
// whose finalRating is within championTiebreakerBand gets the higher slot.
// Single forward pass, adjacent swaps only — breaks near-ties, never boosts a
// champ past someone clearly ahead.
function applyChampionTiebreaker(rankedFighters, division) {
    const band = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].championTiebreakerBand;
    for(let i = 1; i < rankedFighters.length; i++){
        const champ = rankedFighters[i];
        const above = rankedFighters[i - 1];
        if (champ.officialRank !== 'C' || above.officialRank === 'C') continue;
        const gap = above.finalRating - champ.finalRating;
        if (gap > 0 && gap <= band) {
            rankedFighters[i - 1] = champ;
            rankedFighters[i] = above;
            console.log(`[scoringEngine] CHAMP TIEBREAK in ${division}: ${champ.fullName} ` + `(${champ.finalRating}) lifted over ${above.fullName} (${above.finalRating}) — gap ${gap.toFixed(2)} ≤ ${band}`);
        }
    }
}
// ─── Head-to-head correction ─────────────────────────────────
// A split decision is not a clean enough result to reorder the division.
// (Draws / no-contests never set a winner below, so they're excluded already.)
function isIndecisive(method) {
    return /S-DEC/i.test(method);
}
function applyHeadToHead(rankedFighters, data, division, now, eraStartYear) {
    const cfg = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].headToHead;
    // In-division fights inside the active window/era, oldest→newest so the LATEST
    // meeting between any pair overwrites earlier ones. Normalize the label so an
    // interim title fight ("Interim Lightweight") counts as the division — without
    // this, title fights (exactly where head-to-head matters most) are skipped.
    const divFights = data.fights.filter((f)=>// null (catch/open weight) counts toward THIS division; edges still only
        // form between two fighters both ranked here, so this can't leak across.
        ((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$eloEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["normalizeWeightClassForMove"])(f.weightClass) ?? division) === division && !isBeyondCutoff(f.eventDate, now) && inEra(f.eventDate, eraStartYear)).sort((a, b)=>(a.eventDate?.getTime() || 0) - (b.eventDate?.getTime() || 0));
    const lastMeeting = new Map();
    for (const f of divFights){
        if (!f.eventDate) continue;
        if (cfg.decisiveOnly && isIndecisive(f.method)) continue;
        let winnerId = null;
        if (f.result1 === 'W') winnerId = f.fighterId1;
        else if (f.result2 === 'W') winnerId = f.fighterId2;
        if (!winnerId) continue;
        const m = {
            winnerId,
            date: f.eventDate
        };
        lastMeeting.set(`${f.fighterId1}|${f.fighterId2}`, m);
        lastMeeting.set(`${f.fighterId2}|${f.fighterId1}`, m);
    }
    // Each fighter's LOSSES (opponent + date) across ALL divisions — a form signal
    // used to decide whether a post-H2H loss should negate the leapfrog (see below).
    const lossEvents = new Map();
    if (cfg.negateOnLossAfter) {
        const addLoss = (id, oppId, t)=>{
            const arr = lossEvents.get(id);
            if (arr) arr.push({
                oppId,
                t
            });
            else lossEvents.set(id, [
                {
                    oppId,
                    t
                }
            ]);
        };
        for (const f of data.fights){
            if (!f.eventDate || !inEra(f.eventDate, eraStartYear)) continue;
            const t = f.eventDate.getTime();
            if (f.result1 === 'L') addLoss(f.fighterId1, f.fighterId2, t);
            if (f.result2 === 'L') addLoss(f.fighterId2, f.fighterId1, t);
        }
    }
    // Current (pre-leapfrog) sorted position of each fighter, for rank-aware
    // negation. Stable during edge gathering; we only reorder in the apply loop.
    const rankIndexById = new Map();
    rankedFighters.forEach((rf, idx)=>rankIndexById.set(rf.fighterId, idx));
    const edges = [];
    for(let i = 0; i < rankedFighters.length; i++){
        const loser = rankedFighters[i]; // potential victim (higher rank)
        for(let j = i + 1; j < rankedFighters.length; j++){
            const winner = rankedFighters[j]; // ranked below the victim
            const meeting = lastMeeting.get(`${winner.fighterId}|${loser.fighterId}`);
            if (!meeting || meeting.winnerId !== winner.fighterId) continue;
            if (monthsBetween(meeting.date, now) > cfg.recencyMonths) continue; // stale win
            if (cfg.negateOnLossAfter) {
                // A post-H2H loss negates the leapfrog ONLY when it signals the winner's
                // form genuinely turned: a rematch loss to this same victim, or a loss to
                // someone NOT clearly better than the victim (ranked at/below them). A loss
                // to a HIGHER-ranked fighter (e.g. losing the title to the champ) does not
                // erase a clean, recent win over a lower-ranked opponent.
                const losses = lossEvents.get(winner.fighterId) ?? [];
                const formTurned = losses.some((L)=>{
                    if (L.t <= meeting.date.getTime()) return false; // loss predates the H2H — irrelevant
                    if (L.oppId === loser.fighterId) return true; // lost the rematch to the victim
                    const oppIdx = rankIndexById.get(L.oppId);
                    if (oppIdx === undefined) return false; // loss outside this division — ignore
                    // Losing to the reigning champ never negates a win over a contender. The
                    // champ may sit BELOW the victim here by raw rating (the champ floor that
                    // lifts them runs later, step 7), so check the belt explicitly, not order.
                    if (rankedFighters[oppIdx].officialRank === 'C') return false;
                    return oppIdx >= i; // lost to someone at/below the victim
                });
                if (formTurned) continue;
            }
            if (loser.finalRating - winner.finalRating > cfg.eloGapCap) continue; // too far below
            edges.push({
                winnerId: winner.fighterId,
                loserId: loser.fighterId,
                loserIdx: i,
                date: meeting.date
            });
        }
    }
    edges.sort((a, b)=>a.loserIdx - b.loserIdx);
    const idxOf = (id)=>rankedFighters.findIndex((rf)=>rf.fighterId === id);
    const moved = new Set(); // each fighter relocates at most once (cycle guard)
    for (const e of edges){
        if (moved.has(e.winnerId)) continue;
        const wi = idxOf(e.winnerId);
        const li = idxOf(e.loserId);
        if (wi < 0 || li < 0 || wi <= li) continue; // already above the victim
        const [w] = rankedFighters.splice(wi, 1);
        rankedFighters.splice(li, 0, w); // insert directly above the victim
        moved.add(e.winnerId);
        const victim = rankedFighters[li + 1];
        console.log(`[scoringEngine] H2H LEAPFROG in ${division}: ${w.fullName} lifted above ` + `${victim.fullName} (beat them ${e.date.toISOString().slice(0, 10)}, ` + `gap ${(victim.finalRating - w.finalRating).toFixed(1)} Elo)`);
    }
}
}),
"[project]/src/lib/fighterRadar.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "computeRadarAxes",
    ()=>computeRadarAxes
]);
// ─────────────────────────────────────────────────────────────────────────
//  fighterRadar.ts — the 5-axis profile radar (DISPLAY ONLY)
//
//  Rebuilt (2026-06-14) so the radar reflects fighting STYLE, not a single raw
//  career percentage per axis. It reuses the exact per-fight, recency-weighted
//  signals the ranking metrics use (getFighterPerspective + recencyWeight) over
//  a fighter's recent division fights:
//
//    STRIKE  = output volume + KO/knockdown power + accuracy + output edge
//    GRAPPLE = takedown differential + control time + ground share
//    FINISH  = career finish rate + recent knockdown threat
//    ACTIVE  = recency of last fight
//    OPP Q   = strength of schedule (opponent Elo)
//
//  Every weight/norm lives in RANKING_CONFIG.radar — nothing is hardcoded here.
//  This NEVER feeds finalRating; it only changes what the radar draws.
// ─────────────────────────────────────────────────────────────────────────
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/rankingConfig.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$scoringEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/scoringEngine.ts [app-rsc] (ecmascript)");
;
;
const clamp01 = (v)=>Math.max(0, Math.min(1, v));
const clamp = (v, lo, hi)=>Math.max(lo, Math.min(hi, v));
// Map a signed ratio in [-1, 1] onto [0, 1] (0 → 0.5 = league average).
const signedTo01 = (v)=>(clamp(v, -1, 1) + 1) / 2;
// Some CSV percentage columns are 0–1, some 0–100 — normalize defensively.
const norm01 = (v)=>v > 1 ? v / 100 : v;
function computeRadarAxes(data, fighterId, division, ctx) {
    const cfg = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].radar;
    const norm = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].metricsNorm;
    const now = new Date();
    const halfLife = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rankingConfig$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RANKING_CONFIG"].recencyHalfLifeMonths;
    // Recent fights with real per-fight metrics, most recent first. When a
    // division is known, restrict to it (matches how the ranking metrics sample);
    // otherwise sample across the fighter's whole record.
    const fights = (data.fighterFights.get(fighterId) || []).filter((f)=>f.eventDate && f.hasMetrics !== false && (!division || f.weightClass === division)).sort((a, b)=>b.eventDate.getTime() - a.eventDate.getTime()).slice(0, cfg.recentFights);
    let wSum = 0;
    let vol = 0; // strikes landed
    let volDiff = 0; // landed − absorbed
    let acc = 0; // sig-strike accuracy (0–1)
    let kd = 0; // knockdowns
    let tdDiff = 0; // takedowns landed − absorbed
    let ctrl = 0; // control seconds
    for (const f of fights){
        const p = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$scoringEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getFighterPerspective"])(f, fighterId);
        if (!p) continue;
        const w = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$scoringEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["recencyWeight"])(f.eventDate, now, halfLife);
        const ctrlSelf = f.fighterId1 === fighterId ? f.ctrl1 : f.ctrl2;
        vol += p.strSelf * w;
        volDiff += (p.strSelf - p.strOpp) * w;
        acc += norm01(p.sigStrPctSelf) * w;
        kd += p.kdSelf * w;
        tdDiff += (p.tdSelf - p.tdOpp) * w;
        ctrl += (ctrlSelf || 0) * w;
        wSum += w;
    }
    // OPP Q: schedule strength, the one axis that doesn't come from per-fight form.
    const oppQuality = clamp01((ctx.sos ?? ctx.eloDisplay) / 100);
    // ACTIVE: 0 months out → 1, activityFullMonths out → 0.
    const activity = clamp01(1 - ctx.monthsSinceLastFight / cfg.activityFullMonths);
    // No per-fight metric sample → fall back to career aggregates so the radar is
    // never blank. Striking from accuracy + KO rate; grappling from ground share.
    if (wSum === 0) {
        return {
            strike: clamp01(0.6 * clamp01(norm01(ctx.careerSigAccuracy) / cfg.accuracyFull) + 0.4 * clamp01(ctx.careerFinishRate)),
            grappling: clamp01(norm01(ctx.careerGroundPct)),
            finishing: clamp01(ctx.careerFinishRate),
            activity,
            oppQuality
        };
    }
    const avgVol = vol / wSum;
    const avgVolDiff = volDiff / wSum;
    const avgAcc = acc / wSum;
    const avgKd = kd / wSum;
    const avgTdDiff = tdDiff / wSum;
    const avgCtrl = ctrl / wSum;
    // Per-axis normalized components (each 0–1).
    const nVolume = clamp01(avgVol / cfg.volumeStrikePerFightFull);
    const nVolDiff = signedTo01(avgVolDiff / norm.volumeStrikePerFight);
    const nAccuracy = clamp01(avgAcc / cfg.accuracyFull);
    const nPower = clamp01(avgKd / norm.knockdownsPerFight);
    const nTdDiff = signedTo01(avgTdDiff / norm.takedownsPerFight);
    const nControl = clamp01(avgCtrl / cfg.controlSecondsFull);
    const nGround = clamp01(norm01(ctx.careerGroundPct));
    const sw = cfg.strikeWeights;
    const strike = clamp01(sw.volume * nVolume + sw.power * nPower + sw.accuracy * nAccuracy + sw.differential * nVolDiff);
    const gw = cfg.grappleWeights;
    const grappling = clamp01(gw.takedownDiff * nTdDiff + gw.control * nControl + gw.groundShare * nGround);
    const fw = cfg.finishWeights;
    const finishing = clamp01(fw.careerFinishRate * clamp01(ctx.careerFinishRate) + fw.recentKnockdown * nPower);
    return {
        strike,
        grappling,
        finishing,
        activity,
        oppQuality
    };
}
}),
"[project]/src/lib/fighterMedia.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "attachMedia",
    ()=>attachMedia,
    "getFighterMedia",
    ()=>getFighterMedia
]);
// ─────────────────────────────────────────────────────────────────────────
//  fighterMedia.ts — presentation media (photo + nationality/flag) per fighter.
//
//  Joins data/canonical/fighter_media.csv (Wikidata: licensed Commons photo +
//  nationality) and data/canonical/ufc_photos.csv (UFC.com headshot/full-body)
//  to one lookup keyed by canonical Fighter_Id. Both files are produced by the
//  build-time scripts scripts/registry/buildMedia.ts + buildUfcPhotos.ts.
//
//  This is STRICTLY presentation — it never touches the Elo/scoring path. It is
//  attached to ranked-fighter payloads at the API boundary (attachMedia) and to
//  the profile assembler, so the algorithm types stay media-free.
//
//  Photo cascade (best head-framing first, maximising coverage ~53%):
//     UFC headshot → licensed Commons portrait → UFC full-body
//  All render with object-fit:cover / position:top so a full-body crop still
//  frames the head. Missing → '' (callers fall back to an initials avatar).
// ─────────────────────────────────────────────────────────────────────────
var __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/fs [external] (fs, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/path [external] (path, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$papaparse$2f$papaparse$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/papaparse/papaparse.js [app-rsc] (ecmascript)");
;
;
;
const DATA = __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["default"].join(process.cwd(), 'data', 'canonical');
// Wikidata country labels → ISO 3166-1 alpha-2. Covers every nationality present
// in the data (86) plus the most likely synonyms a data refresh might introduce.
const COUNTRY_ISO = {
    'United States': 'US',
    'United States of America': 'US',
    Brazil: 'BR',
    Canada: 'CA',
    'United Kingdom': 'GB',
    'English people': 'GB',
    England: 'GB',
    Scotland: 'GB',
    Wales: 'GB',
    Russia: 'RU',
    Japan: 'JP',
    Mexico: 'MX',
    Australia: 'AU',
    France: 'FR',
    Sweden: 'SE',
    'Kingdom of Sweden': 'SE',
    Poland: 'PL',
    "People's Republic of China": 'CN',
    China: 'CN',
    'South Korea': 'KR',
    'Republic of Korea': 'KR',
    'New Zealand': 'NZ',
    'Kingdom of the Netherlands': 'NL',
    Netherlands: 'NL',
    Germany: 'DE',
    Ireland: 'IE',
    Argentina: 'AR',
    Peru: 'PE',
    'South Africa': 'ZA',
    'Kingdom of Denmark': 'DK',
    Denmark: 'DK',
    Spain: 'ES',
    Cuba: 'CU',
    Italy: 'IT',
    Kazakhstan: 'KZ',
    Georgia: 'GE',
    Serbia: 'RS',
    Armenia: 'AM',
    Norway: 'NO',
    'Czech Republic': 'CZ',
    Czechia: 'CZ',
    Croatia: 'HR',
    Uzbekistan: 'UZ',
    Austria: 'AT',
    Finland: 'FI',
    Turkey: 'TR',
    Portugal: 'PT',
    Moldova: 'MD',
    Venezuela: 'VE',
    Tajikistan: 'TJ',
    Ukraine: 'UA',
    Nigeria: 'NG',
    Israel: 'IL',
    Bulgaria: 'BG',
    Philippines: 'PH',
    Tunisia: 'TN',
    Chile: 'CL',
    Azerbaijan: 'AZ',
    Ecuador: 'EC',
    Switzerland: 'CH',
    Slovakia: 'SK',
    Romania: 'RO',
    India: 'IN',
    Belarus: 'BY',
    Colombia: 'CO',
    Cameroon: 'CM',
    Iran: 'IR',
    Kyrgyzstan: 'KG',
    Angola: 'AO',
    Uganda: 'UG',
    Thailand: 'TH',
    Lithuania: 'LT',
    Indonesia: 'ID',
    Iceland: 'IS',
    Suriname: 'SR',
    Guyana: 'GY',
    Ghana: 'GH',
    Mongolia: 'MN',
    'Democratic Republic of the Congo': 'CD',
    Latvia: 'LV',
    Lebanon: 'LB',
    Greece: 'GR',
    'Cape Verde': 'CV',
    Syria: 'SY',
    Uruguay: 'UY',
    Afghanistan: 'AF',
    'Dominican Republic': 'DO',
    Hungary: 'HU',
    Belgium: 'BE',
    Haiti: 'HT',
    Cyprus: 'CY',
    Singapore: 'SG',
    Bolivia: 'BO',
    'El Salvador': 'SV',
    Grenada: 'GD',
    Taiwan: 'TW'
};
function isoToFlag(iso) {
    if (iso.length !== 2) return '';
    const A = 0x1f1e6;
    const base = 'A'.charCodeAt(0);
    return String.fromCodePoint(...[
        ...iso.toUpperCase()
    ].map((c)=>A + c.charCodeAt(0) - base));
}
function readCsv(file) {
    const p = __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["default"].join(DATA, file);
    if (!__TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["default"].existsSync(p)) return [];
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$papaparse$2f$papaparse$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"].parse(__TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["default"].readFileSync(p, 'utf-8'), {
        header: true,
        skipEmptyLines: true
    }).data;
}
let cache = null;
function load() {
    if (cache) return cache;
    const map = new Map();
    // Wikidata layer: nationality + licensed Commons portrait.
    for (const r of readCsv('fighter_media.csv')){
        const id = r.canonical_id;
        if (!id) continue;
        const nationality = r.nationality || '';
        map.set(id, {
            avatarUrl: r.photo_url || '',
            fullBodyUrl: '',
            nationality,
            flag: isoToFlag(COUNTRY_ISO[nationality] || '')
        });
    }
    // UFC.com layer: headshot (best for circles) + full-body (profile hero).
    for (const r of readCsv('ufc_photos.csv')){
        const id = r.canonical_id;
        if (!id) continue;
        const cur = map.get(id) ?? {
            avatarUrl: '',
            fullBodyUrl: '',
            nationality: '',
            flag: ''
        };
        if (r.full_body_url) cur.fullBodyUrl = r.full_body_url;
        // Prefer a UFC headshot for the circular avatar; else keep the Commons photo;
        // else fall back to the UFC full-body so coverage isn't lost.
        if (r.headshot_url) cur.avatarUrl = r.headshot_url;
        else if (!cur.avatarUrl && r.full_body_url) cur.avatarUrl = r.full_body_url;
        map.set(id, cur);
    }
    cache = map;
    return map;
}
function getFighterMedia(fighterId) {
    return load().get(fighterId);
}
function attachMedia(fighters) {
    const media = load();
    for (const f of fighters){
        const m = media.get(f.fighterId);
        if (m) {
            f.avatarUrl = m.avatarUrl || undefined;
            f.flag = m.flag || undefined;
            f.nationality = m.nationality || undefined;
        }
    }
    return fighters;
}
}),
"[project]/src/lib/loadUpcoming.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "attachNextFight",
    ()=>attachNextFight,
    "getNextFight",
    ()=>getNextFight,
    "getUpcomingCards",
    ()=>getUpcomingCards
]);
// ─────────────────────────────────────────────────────────────────────────
//  loadUpcoming.ts — scheduled (not-yet-fought) bouts per fighter.
//
//  Reads data/upcoming_fights.csv (produced by scripts/sherdog/buildUpcoming.ts)
//  and exposes each fighter's NEXT booked fight. This is STRICTLY presentation —
//  upcoming bouts have no result and never touch the Elo/scoring path. Attached
//  at the API boundary (like fighterMedia.ts), so the algorithm stays unaware.
//
//  Missing file → empty map (the feature simply doesn't render until the first
//  buildUpcoming run produces the CSV).
// ─────────────────────────────────────────────────────────────────────────
var __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/fs [external] (fs, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/path [external] (path, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$papaparse$2f$papaparse$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/papaparse/papaparse.js [app-rsc] (ecmascript)");
;
;
;
const FILE = __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["default"].join(process.cwd(), 'data', 'upcoming_fights.csv');
// Both caches are keyed by the calendar day: the "has this card passed?"
// filter bakes today's date into the result, so a long-lived process must
// rebuild after midnight or it keeps serving fights that already happened.
let cache = null;
let cacheDay = '';
function load() {
    const today = new Date().toISOString().slice(0, 10);
    if (cache && cacheDay === today) return cache;
    cacheDay = today;
    const map = new Map();
    if (!__TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["default"].existsSync(FILE)) {
        cache = map;
        return map;
    }
    const rows = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$papaparse$2f$papaparse$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"].parse(__TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["default"].readFileSync(FILE, 'utf-8'), {
        header: true,
        skipEmptyLines: true
    }).data;
    // Index a bout under each side that resolved to one of our fighters. A fighter
    // keeps only their EARLIEST still-upcoming bout (rows can arrive in any order).
    const consider = (fighterId, bout)=>{
        if (!fighterId) return;
        if (bout.eventDate && bout.eventDate < today) return; // drop a card already passed
        const cur = map.get(fighterId);
        if (!cur || bout.eventDate && bout.eventDate < cur.eventDate) map.set(fighterId, bout);
    };
    for (const r of rows){
        const eventName = r.event_name || '';
        const eventDate = r.event_date || '';
        const eventId = r.event_id || null;
        const weightClass = r.weight_class || '';
        const isMainEvent = r.is_main_event === '1';
        const id1 = (r.fighter1_ourId || '').trim();
        const id2 = (r.fighter2_ourId || '').trim();
        const name1 = r.fighter1_name || '';
        const name2 = r.fighter2_name || '';
        consider(id1, {
            opponentId: id2 || null,
            opponentName: name2,
            weightClass,
            eventName,
            eventDate,
            eventId,
            isMainEvent
        });
        consider(id2, {
            opponentId: id1 || null,
            opponentName: name1,
            weightClass,
            eventName,
            eventDate,
            eventId,
            isMainEvent
        });
    }
    cache = map;
    return map;
}
function getNextFight(fighterId) {
    return load().get(fighterId);
}
let cardsCache = null;
let cardsCacheDay = '';
function getUpcomingCards() {
    const today = new Date().toISOString().slice(0, 10);
    if (cardsCache && cardsCacheDay === today) return cardsCache;
    cardsCacheDay = today;
    const cards = [];
    if (!__TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["default"].existsSync(FILE)) {
        cardsCache = cards;
        return cards;
    }
    const rows = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$papaparse$2f$papaparse$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"].parse(__TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["default"].readFileSync(FILE, 'utf-8'), {
        header: true,
        skipEmptyLines: true
    }).data;
    const byEvent = new Map();
    for (const r of rows){
        const eventDate = r.event_date || '';
        if (eventDate && eventDate < today) continue; // drop cards already passed
        const eventName = r.event_name || '';
        const key = r.event_id || eventName || 'unknown';
        let card = byEvent.get(key);
        if (!card) {
            card = {
                eventId: r.event_id || null,
                eventName,
                eventDate,
                bouts: []
            };
            byEvent.set(key, card);
        }
        card.bouts.push({
            boutOrder: Number(r.bout_order) || 999,
            isMainEvent: r.is_main_event === '1',
            weightClass: r.weight_class || '',
            fighter1Id: (r.fighter1_ourId || '').trim() || null,
            fighter1Name: r.fighter1_name || '',
            fighter2Id: (r.fighter2_ourId || '').trim() || null,
            fighter2Name: r.fighter2_name || ''
        });
    }
    cardsCache = Array.from(byEvent.values()).map((c)=>({
            ...c,
            bouts: c.bouts.sort((a, b)=>a.boutOrder - b.boutOrder)
        })).sort((a, b)=>a.eventDate.localeCompare(b.eventDate));
    return cardsCache;
}
function attachNextFight(fighters) {
    const map = load();
    for (const f of fighters){
        const n = map.get(f.fighterId);
        if (n) f.nextFight = n;
    }
    return fighters;
}
}),
"[project]/src/lib/fighterAges.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ageLabel",
    ()=>ageLabel,
    "getFighterAge",
    ()=>getFighterAge
]);
// ─────────────────────────────────────────────────────────────────────────
//  fighterAges.ts — fighter date-of-birth / age lookup (display only).
//
//  Reads data/canonical/fighter_dob.csv (produced by scripts/registry/
//  buildAges.ts: Wikidata P569 via the precise Sherdog-ID join + Sherdog
//  profile fill, career-validated). Age matters for evaluation and
//  projection — age curves are real — but it is PRESENTATION + trend-read
//  context only: nothing here ever touches the Elo/scoring path.
//
//  Missing file → empty map (the app renders without ages until the first
//  buildAges run). `precision: 'year'` DOBs yield approximate ages.
// ─────────────────────────────────────────────────────────────────────────
var __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/fs [external] (fs, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/path [external] (path, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$papaparse$2f$papaparse$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/papaparse/papaparse.js [app-rsc] (ecmascript)");
;
;
;
const FILE = __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["default"].join(process.cwd(), 'data', 'canonical', 'fighter_dob.csv');
let cache = null;
function load() {
    if (cache) return cache;
    const map = new Map();
    if (!__TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["default"].existsSync(FILE)) {
        cache = map;
        return map;
    }
    const rows = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$papaparse$2f$papaparse$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"].parse(__TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["default"].readFileSync(FILE, 'utf-8'), {
        header: true,
        skipEmptyLines: true
    }).data;
    for (const r of rows){
        const id = (r.canonical_id || '').trim();
        const dob = (r.dob || '').trim();
        if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) continue;
        map.set(id, {
            dob,
            approximate: r.precision !== 'day'
        });
    }
    cache = map;
    return map;
}
function getFighterAge(fighterId, asOf = new Date()) {
    const e = load().get(fighterId);
    if (!e) return null;
    const d = new Date(e.dob + 'T00:00:00Z');
    let age = asOf.getUTCFullYear() - d.getUTCFullYear();
    const beforeBirthday = asOf.getUTCMonth() < d.getUTCMonth() || asOf.getUTCMonth() === d.getUTCMonth() && asOf.getUTCDate() < d.getUTCDate();
    if (beforeBirthday) age--;
    return {
        dob: e.dob,
        age,
        approximate: e.approximate
    };
}
function ageLabel(a) {
    if (!a) return null;
    return a.approximate ? `~${a.age}` : `${a.age}`;
}
}),
"[project]/src/lib/types.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// Core data types loaded from CSVs
__turbopack_context__.s([
    "ALL_DIVISIONS",
    ()=>ALL_DIVISIONS,
    "MENS_DIVISIONS",
    ()=>MENS_DIVISIONS,
    "WOMENS_DIVISIONS",
    ()=>WOMENS_DIVISIONS
]);
const MENS_DIVISIONS = [
    'Heavyweight',
    'Light Heavyweight',
    'Middleweight',
    'Welterweight',
    'Lightweight',
    'Featherweight',
    'Bantamweight',
    'Flyweight'
];
const WOMENS_DIVISIONS = [
    "Women's Strawweight",
    "Women's Flyweight",
    "Women's Bantamweight"
];
const ALL_DIVISIONS = [
    ...MENS_DIVISIONS,
    ...WOMENS_DIVISIONS
];
}),
"[project]/src/lib/fighterProfile.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getFighterProfile",
    ()=>getFighterProfile
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$dataCache$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/dataCache.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$scoringEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/scoringEngine.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$eloEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/eloEngine.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$fighterRadar$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/fighterRadar.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$fighterMedia$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/fighterMedia.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$loadUpcoming$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/loadUpcoming.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$fighterAges$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/fighterAges.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$advancedStats$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/advancedStats.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$types$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/types.ts [app-rsc] (ecmascript)");
;
;
;
;
;
;
;
;
;
function isChampion(f) {
    return f.officialRank === 'C' || f.belt;
}
// Which division to rank this fighter in. Prefer the caller-supplied hint (the
// division page they were clicked from); fall back to their CSV weight class.
function resolveDivision(fighter, hint) {
    if (hint && __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$types$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ALL_DIVISIONS"].includes(hint)) return hint;
    if (__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$types$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ALL_DIVISIONS"].includes(fighter.weightClass)) {
        return fighter.weightClass;
    }
    return null;
}
async function getFighterProfile(fighterId, divisionHint) {
    const data = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$dataCache$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getData"])();
    const fighter = data.fighterMap.get(fighterId);
    if (!fighter) return null;
    const elo = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$eloEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getElo"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$eloEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["buildEloRatings"])(data), fighterId);
    const history = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$eloEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getFighterHistory"])(data, fighterId);
    const division = resolveDivision(fighter, divisionHint);
    let ranked = null;
    let displayRank = null;
    let champion = false;
    let rankedIds = [];
    if (division) {
        const rankings = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$scoringEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["generateDivisionRankings"])(division, data);
        rankedIds = rankings.fighters.map((f)=>f.fighterId);
        const contenders = rankings.fighters.filter((f)=>!isChampion(f));
        const found = rankings.fighters.find((f)=>f.fighterId === fighterId);
        if (found) {
            ranked = found;
            champion = isChampion(found);
            if (!champion) {
                displayRank = contenders.findIndex((f)=>f.fighterId === fighterId) + 1 || null;
            }
        }
    }
    const monthsSince = ranked?.monthsSinceLastFight ?? (history[0] ? (Date.now() - new Date(history[0].date).getTime()) / (1000 * 60 * 60 * 24 * 30.44) : 999);
    const finishRate = fighter.koRate + fighter.subRate;
    const sos = ranked?.strengthOfSchedule ?? null;
    const eloDisplay = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$eloEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["eloToDisplayScore"])(elo.rating);
    const media = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$fighterMedia$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getFighterMedia"])(fighterId);
    // Radar axes are rebuilt from the same recency-weighted per-fight signals the
    // ranking metrics use (see fighterRadar.ts) — display only, never feeds Elo.
    // Sampled across ALL weight classes (division = null): the radar is a STYLE
    // portrait, so a recent division-mover (e.g. Topuria) keeps the striking
    // signature of their fights at the old weight instead of being judged on a
    // thin 1–2 fight sample in the new division.
    // Deep analytics + the cautious macro read. Real age (DOB pipeline) leads;
    // UFC tenure is the fallback aging proxy where no DOB resolved.
    // Benchmark = median ratio of the division's ranked pool.
    const advanced = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$advancedStats$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getAdvancedStats"])(data, fighterId);
    const ageInfo = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$fighterAges$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getFighterAge"])(fighterId);
    const tenureYears = history.length ? (Date.now() - new Date(history[history.length - 1].date).getTime()) / (1000 * 60 * 60 * 24 * 365.25) : 0;
    const trendRead = advanced ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$advancedStats$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["buildTrendRead"])(advanced, {
        age: ageInfo?.age ?? null,
        tenureYears,
        monthsSinceLastFight: monthsSince,
        eloRating: elo.rating,
        eloPeak: elo.peakRating,
        history
    }) : [];
    const divisionBenchmark = division && rankedIds.length ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$advancedStats$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["divisionRatioBenchmark"])(data, division, rankedIds) : null;
    const radar = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$fighterRadar$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["computeRadarAxes"])(data, fighterId, null, {
        sos,
        eloDisplay,
        monthsSinceLastFight: monthsSince,
        careerFinishRate: finishRate,
        careerSigAccuracy: fighter.sigStrikeAccuracy,
        careerGroundPct: fighter.groundPct
    });
    return {
        fighterId,
        fullName: fighter.fullName,
        nickname: fighter.nickname,
        record: `${fighter.wins}-${fighter.losses}-${fighter.draws}`,
        weightClass: fighter.weightClass,
        gender: fighter.gender,
        height: fighter.height,
        stance: fighter.stance,
        fightCount: (data.fighterFights.get(fighterId) || []).length,
        age: ageInfo?.age ?? null,
        ageApproximate: ageInfo?.approximate ?? false,
        avatarUrl: media?.avatarUrl || null,
        fullBodyUrl: media?.fullBodyUrl || null,
        nationality: media?.nationality || null,
        flag: media?.flag || null,
        nextFight: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$loadUpcoming$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getNextFight"])(fighterId) ?? null,
        division: ranked ? division : null,
        displayRank,
        isChampion: champion,
        ranked,
        eloRating: Math.round(elo.rating * 100) / 100,
        eloPeak: Math.round(elo.peakRating * 100) / 100,
        eloDisplay: Math.round(eloDisplay * 100) / 100,
        sos,
        monthsSinceLastFight: Math.round(monthsSince * 10) / 10,
        stats: {
            finishRate: Math.round(finishRate * 1000) / 1000,
            koRate: fighter.koRate,
            subRate: fighter.subRate,
            sigStrikeAccuracy: fighter.sigStrikeAccuracy
        },
        radar,
        history,
        advanced,
        trendRead,
        divisionBenchmark
    };
}
}),
"[project]/src/lib/divisions.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// Shared division short codes for compact badges.
__turbopack_context__.s([
    "DIVISION_SHORT",
    ()=>DIVISION_SHORT,
    "shortDivision",
    ()=>shortDivision
]);
const DIVISION_SHORT = {
    Heavyweight: 'HW',
    'Light Heavyweight': 'LHW',
    Middleweight: 'MW',
    Welterweight: 'WW',
    Lightweight: 'LW',
    Featherweight: 'FW',
    Bantamweight: 'BW',
    Flyweight: 'FLW',
    "Women's Strawweight": 'WSW',
    "Women's Flyweight": 'WFLW',
    "Women's Bantamweight": 'WBW'
};
const shortDivision = (d)=>DIVISION_SHORT[d] || d;
}),
"[project]/src/components/ComparePicker.tsx [app-rsc] (client reference proxy) <module evaluation>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call the default export of [project]/src/components/ComparePicker.tsx <module evaluation> from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/src/components/ComparePicker.tsx <module evaluation>", "default");
}),
"[project]/src/components/ComparePicker.tsx [app-rsc] (client reference proxy)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call the default export of [project]/src/components/ComparePicker.tsx from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/src/components/ComparePicker.tsx", "default");
}),
"[project]/src/components/ComparePicker.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ComparePicker$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__$3c$module__evaluation$3e$__ = __turbopack_context__.i("[project]/src/components/ComparePicker.tsx [app-rsc] (client reference proxy) <module evaluation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ComparePicker$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__ = __turbopack_context__.i("[project]/src/components/ComparePicker.tsx [app-rsc] (client reference proxy)");
;
__turbopack_context__.n(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ComparePicker$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__);
}),
"[project]/src/components/ProfileRadar.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ProfileRadar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
;
const AXES = [
    {
        key: 'strike',
        label: 'STRIKE'
    },
    {
        key: 'grappling',
        label: 'GRAPPLE'
    },
    {
        key: 'finishing',
        label: 'FINISH'
    },
    {
        key: 'activity',
        label: 'ACTIVE'
    },
    {
        key: 'oppQuality',
        label: 'OPP Q'
    }
];
function ProfileRadar({ radar }) {
    const cx = 110;
    const cy = 105;
    const R = 78;
    const pt = (i, v)=>{
        const angle = (-90 + i * 72) * (Math.PI / 180);
        return [
            cx + R * v * Math.cos(angle),
            cy + R * v * Math.sin(angle)
        ];
    };
    const ring = (v)=>AXES.map((_, i)=>pt(i, v).join(',')).join(' ');
    const valuePoly = AXES.map((a, i)=>pt(i, radar[a.key]).join(',')).join(' ');
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
        viewBox: "0 0 220 210",
        className: "w-full h-auto",
        role: "img",
        "aria-label": "Fighter attribute radar",
        children: [
            [
                1,
                0.66,
                0.33
            ].map((v)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("polygon", {
                    points: ring(v),
                    fill: "none",
                    stroke: "var(--border)",
                    strokeWidth: "1"
                }, v, false, {
                    fileName: "[project]/src/components/ProfileRadar.tsx",
                    lineNumber: 39,
                    columnNumber: 9
                }, this)),
            AXES.map((_, i)=>{
                const [x, y] = pt(i, 1);
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                    x1: cx,
                    y1: cy,
                    x2: x,
                    y2: y,
                    stroke: "var(--border)",
                    strokeWidth: "1"
                }, i, false, {
                    fileName: "[project]/src/components/ProfileRadar.tsx",
                    lineNumber: 44,
                    columnNumber: 16
                }, this);
            }),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("polygon", {
                points: valuePoly,
                fill: "rgba(210,10,10,0.25)",
                stroke: "var(--accent-red)",
                strokeWidth: "1.5"
            }, void 0, false, {
                fileName: "[project]/src/components/ProfileRadar.tsx",
                lineNumber: 47,
                columnNumber: 7
            }, this),
            AXES.map((a, i)=>{
                const [x, y] = pt(i, radar[a.key]);
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                    cx: x,
                    cy: y,
                    r: "2.5",
                    fill: "var(--accent-red-light)"
                }, a.key, false, {
                    fileName: "[project]/src/components/ProfileRadar.tsx",
                    lineNumber: 50,
                    columnNumber: 16
                }, this);
            }),
            AXES.map((a, i)=>{
                const [x, y] = pt(i, 1.22);
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("text", {
                    x: x,
                    y: y,
                    fill: "var(--text-muted)",
                    fontSize: "9",
                    textAnchor: "middle",
                    dominantBaseline: "middle",
                    children: a.label
                }, a.label, false, {
                    fileName: "[project]/src/components/ProfileRadar.tsx",
                    lineNumber: 56,
                    columnNumber: 11
                }, this);
            })
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/ProfileRadar.tsx",
        lineNumber: 36,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/components/FighterAvatar.tsx [app-rsc] (client reference proxy) <module evaluation>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call the default export of [project]/src/components/FighterAvatar.tsx <module evaluation> from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/src/components/FighterAvatar.tsx <module evaluation>", "default");
}),
"[project]/src/components/FighterAvatar.tsx [app-rsc] (client reference proxy)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call the default export of [project]/src/components/FighterAvatar.tsx from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/src/components/FighterAvatar.tsx", "default");
}),
"[project]/src/components/FighterAvatar.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$FighterAvatar$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__$3c$module__evaluation$3e$__ = __turbopack_context__.i("[project]/src/components/FighterAvatar.tsx [app-rsc] (client reference proxy) <module evaluation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$FighterAvatar$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__ = __turbopack_context__.i("[project]/src/components/FighterAvatar.tsx [app-rsc] (client reference proxy)");
;
__turbopack_context__.n(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$FighterAvatar$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__);
}),
"[project]/src/app/compare/page.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ComparePage,
    "revalidate",
    ()=>revalidate
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.react-server.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$eloEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/eloEngine.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$advancedStats$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/advancedStats.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$OddsValue$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/OddsValue.tsx [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$fighterProfile$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/fighterProfile.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$divisions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/divisions.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ComparePicker$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ComparePicker.tsx [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ProfileRadar$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ProfileRadar.tsx [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$FighterAvatar$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/FighterAvatar.tsx [app-rsc] (ecmascript)");
;
;
;
;
;
;
;
;
;
;
const revalidate = 86400;
async function ComparePage({ searchParams }) {
    const { a, b } = await searchParams;
    const [pa, pb] = await Promise.all([
        a ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$fighterProfile$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getFighterProfile"])(a) : Promise.resolve(null),
        b ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$fighterProfile$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getFighterProfile"])(b) : Promise.resolve(null)
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "max-w-4xl mx-auto px-4 py-6 space-y-6",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                        className: "font-display text-3xl sm:text-4xl leading-none",
                        style: {
                            color: 'var(--text-primary)'
                        },
                        children: "COMPARE"
                    }, void 0, false, {
                        fileName: "[project]/src/app/compare/page.tsx",
                        lineNumber: 27,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-xs mt-1.5",
                        style: {
                            color: 'var(--text-muted)'
                        },
                        children: "Pick any two fighters for a side-by-side breakdown."
                    }, void 0, false, {
                        fileName: "[project]/src/app/compare/page.tsx",
                        lineNumber: 30,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/compare/page.tsx",
                lineNumber: 26,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ComparePicker$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
                        slot: "a",
                        selectedName: pa?.fullName ?? null,
                        a: a ?? null,
                        b: b ?? null
                    }, void 0, false, {
                        fileName: "[project]/src/app/compare/page.tsx",
                        lineNumber: 36,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "font-display text-lg shrink-0",
                        style: {
                            color: 'var(--text-muted)'
                        },
                        children: "VS"
                    }, void 0, false, {
                        fileName: "[project]/src/app/compare/page.tsx",
                        lineNumber: 37,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ComparePicker$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
                        slot: "b",
                        selectedName: pb?.fullName ?? null,
                        a: a ?? null,
                        b: b ?? null
                    }, void 0, false, {
                        fileName: "[project]/src/app/compare/page.tsx",
                        lineNumber: 40,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/compare/page.tsx",
                lineNumber: 35,
                columnNumber: 7
            }, this),
            pa && pb ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(Comparison, {
                pa: pa,
                pb: pb
            }, void 0, false, {
                fileName: "[project]/src/app/compare/page.tsx",
                lineNumber: 44,
                columnNumber: 9
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded-xl py-12 text-center text-sm",
                style: {
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px dashed var(--border-light)',
                    color: 'var(--text-muted)'
                },
                children: "Select two fighters above to compare them."
            }, void 0, false, {
                fileName: "[project]/src/app/compare/page.tsx",
                lineNumber: 46,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/compare/page.tsx",
        lineNumber: 25,
        columnNumber: 5
    }, this);
}
function Comparison({ pa, pb }) {
    // Calibrated head-to-head win probability from each fighter's core Elo (the
    // predictor). winProbability uses the validated /400 scale; the two sum to 100%.
    const haveElo = pa.eloRating != null && pb.eloRating != null;
    // Prospect flag: a fighter with ≤3 UFC fights has a thin (but earned) sample,
    // so the model's read is ranked on merit yet less certain — especially at the
    // very top. Positive framing, display-only (no ranking-math change).
    const PROSPECT_MAX = 3;
    const provA = pa.fightCount <= PROSPECT_MAX;
    const provB = pb.fightCount <= PROSPECT_MAX;
    const prospectAny = provA || provB;
    const prospectNames = [
        provA ? pa.fullName : null,
        provB ? pb.fullName : null
    ].filter(Boolean).join(' & ');
    // Form-adjusted variant: each fighter's Elo shaded by their bounded recent-form
    // nudge (advancedStats.formEloNudge — experimental, display-only). Shown only
    // when at least one side has enough charted fights to carry a form read.
    const nudgeA = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$advancedStats$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["formEloNudge"])(pa.advanced?.drift);
    const nudgeB = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$advancedStats$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["formEloNudge"])(pb.advanced?.drift);
    const haveForm = haveElo && (nudgeA !== 0 || nudgeB !== 0);
    const rows = [
        {
            label: 'Win probability',
            a: haveElo ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$eloEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["winProbability"])(pa.eloRating, pb.eloRating) : null,
            b: haveElo ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$eloEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["winProbability"])(pb.eloRating, pa.eloRating) : null,
            fmt: pctFmt
        },
        {
            label: 'Form-adjusted win %',
            a: haveForm ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$eloEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["winProbability"])(pa.eloRating + nudgeA, pb.eloRating + nudgeB) : null,
            b: haveForm ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$eloEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["winProbability"])(pb.eloRating + nudgeB, pa.eloRating + nudgeA) : null,
            fmt: pctFmt
        },
        {
            label: 'Final rating',
            a: pa.ranked?.finalRating ?? null,
            b: pb.ranked?.finalRating ?? null,
            fmt: (v)=>v.toFixed(1)
        },
        {
            label: 'Core Elo',
            a: pa.eloRating,
            b: pb.eloRating,
            fmt: (v)=>v.toFixed(0)
        },
        {
            label: 'Peak Elo',
            a: pa.eloPeak,
            b: pb.eloPeak,
            fmt: (v)=>v.toFixed(0)
        },
        {
            label: 'Strength of schedule',
            a: pa.sos,
            b: pb.sos,
            fmt: (v)=>v.toFixed(1)
        },
        {
            label: 'Finish rate',
            a: pa.stats.finishRate,
            b: pb.stats.finishRate,
            fmt: pctFmt
        },
        {
            label: 'KO rate',
            a: pa.stats.koRate,
            b: pb.stats.koRate,
            fmt: pctFmt
        },
        {
            label: 'Submission rate',
            a: pa.stats.subRate,
            b: pb.stats.subRate,
            fmt: pctFmt
        },
        {
            label: 'Strike accuracy',
            a: pa.stats.sigStrikeAccuracy,
            b: pb.stats.sigStrikeAccuracy,
            fmt: pctFmt
        }
    ];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-5",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid grid-cols-2 gap-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(FighterHead, {
                        p: pa
                    }, void 0, false, {
                        fileName: "[project]/src/app/compare/page.tsx",
                        lineNumber: 94,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(FighterHead, {
                        p: pb
                    }, void 0, false, {
                        fileName: "[project]/src/app/compare/page.tsx",
                        lineNumber: 95,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/compare/page.tsx",
                lineNumber: 93,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid grid-cols-2 gap-3",
                children: [
                    pa,
                    pb
                ].map((p, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "rounded-xl p-3",
                        style: {
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border)'
                        },
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ProfileRadar$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
                            radar: p.radar
                        }, void 0, false, {
                            fileName: "[project]/src/app/compare/page.tsx",
                            lineNumber: 102,
                            columnNumber: 13
                        }, this)
                    }, i, false, {
                        fileName: "[project]/src/app/compare/page.tsx",
                        lineNumber: 101,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/app/compare/page.tsx",
                lineNumber: 99,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded-xl overflow-hidden",
                style: {
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border)'
                },
                children: rows.map((r)=>{
                    const aWins = r.a != null && r.b != null && r.a > r.b;
                    const bWins = r.a != null && r.b != null && r.b > r.a;
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-[1fr_auto_1fr] items-center",
                        style: {
                            borderBottom: '1px solid var(--border)'
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-right px-3 py-2.5 font-mono text-sm",
                                style: {
                                    color: aWins ? 'var(--accent-green)' : 'var(--text-primary)',
                                    fontWeight: aWins ? 500 : 400
                                },
                                children: r.a != null ? r.fmt(r.a) : '—'
                            }, void 0, false, {
                                fileName: "[project]/src/app/compare/page.tsx",
                                lineNumber: 114,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "px-3 text-[10px] uppercase tracking-wide text-center",
                                style: {
                                    color: 'var(--text-muted)'
                                },
                                children: r.label
                            }, void 0, false, {
                                fileName: "[project]/src/app/compare/page.tsx",
                                lineNumber: 120,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-left px-3 py-2.5 font-mono text-sm",
                                style: {
                                    color: bWins ? 'var(--accent-green)' : 'var(--text-primary)',
                                    fontWeight: bWins ? 500 : 400
                                },
                                children: r.b != null ? r.fmt(r.b) : '—'
                            }, void 0, false, {
                                fileName: "[project]/src/app/compare/page.tsx",
                                lineNumber: 123,
                                columnNumber: 15
                            }, this)
                        ]
                    }, r.label, true, {
                        fileName: "[project]/src/app/compare/page.tsx",
                        lineNumber: 113,
                        columnNumber: 13
                    }, this);
                })
            }, void 0, false, {
                fileName: "[project]/src/app/compare/page.tsx",
                lineNumber: 108,
                columnNumber: 7
            }, this),
            haveForm && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-[10px] leading-snug px-1",
                style: {
                    color: 'var(--text-muted)'
                },
                children: [
                    "Form-adjusted win % shades each fighter's Elo by their recent output vs their own career baseline (",
                    nudgeA >= 0 ? '+' : '',
                    nudgeA.toFixed(0),
                    " / ",
                    nudgeB >= 0 ? '+' : '',
                    nudgeB.toFixed(0),
                    " Elo, bounded ±45). Experimental and display-only — the headline win probability is the validated, pure-Elo number."
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/compare/page.tsx",
                lineNumber: 135,
                columnNumber: 9
            }, this),
            prospectAny && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-start gap-2 rounded-lg px-3 py-2",
                style: {
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--accent-gold)'
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs font-medium shrink-0",
                        style: {
                            color: 'var(--accent-gold)'
                        },
                        children: "★ Prospect"
                    }, void 0, false, {
                        fileName: "[project]/src/app/compare/page.tsx",
                        lineNumber: 148,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-[11px] leading-snug",
                        style: {
                            color: 'var(--text-muted)'
                        },
                        children: [
                            prospectNames,
                            " ",
                            provA && provB ? 'have' : 'has',
                            " ≤",
                            PROSPECT_MAX,
                            " UFC fights — the read is on earned merit, but the sample is thin, so trust it less at the very top."
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/compare/page.tsx",
                        lineNumber: 149,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/compare/page.tsx",
                lineNumber: 144,
                columnNumber: 9
            }, this),
            haveElo && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$OddsValue$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
                modelProbA: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$eloEngine$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["winProbability"])(pa.eloRating, pb.eloRating),
                nameA: pa.fullName,
                nameB: pb.fullName,
                lowConfidence: prospectAny
            }, void 0, false, {
                fileName: "[project]/src/app/compare/page.tsx",
                lineNumber: 157,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/compare/page.tsx",
        lineNumber: 91,
        columnNumber: 5
    }, this);
}
function FighterHead({ p }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
        href: `/fighter/${p.fighterId}${p.division ? `?d=${encodeURIComponent(p.division)}` : ''}`,
        className: "rounded-xl p-4 flex flex-col items-center text-center gap-2 fighter-row",
        style: {
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)'
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$FighterAvatar$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
                src: p.avatarUrl ?? undefined,
                name: p.fullName,
                sizeClass: "w-14 h-14",
                initialsClass: "text-base",
                bg: "var(--bg-elevated)",
                initialsColor: p.isChampion ? 'var(--accent-gold)' : 'var(--text-secondary)',
                border: p.isChampion ? '2px solid var(--accent-gold)' : undefined
            }, void 0, false, {
                fileName: "[project]/src/app/compare/page.tsx",
                lineNumber: 175,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "font-medium text-sm flex items-center justify-center gap-1.5",
                style: {
                    color: 'var(--text-primary)'
                },
                children: [
                    p.flag && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "shrink-0 leading-none",
                        title: p.nationality ?? undefined,
                        children: p.flag
                    }, void 0, false, {
                        fileName: "[project]/src/app/compare/page.tsx",
                        lineNumber: 186,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: p.fullName
                    }, void 0, false, {
                        fileName: "[project]/src/app/compare/page.tsx",
                        lineNumber: 190,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/compare/page.tsx",
                lineNumber: 184,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-[10px] px-1.5 py-0.5 rounded",
                        style: {
                            backgroundColor: 'var(--bg-elevated)',
                            color: 'var(--text-secondary)'
                        },
                        children: p.division ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$divisions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["shortDivision"])(p.division) : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$divisions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["shortDivision"])(p.weightClass)
                    }, void 0, false, {
                        fileName: "[project]/src/app/compare/page.tsx",
                        lineNumber: 193,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs font-mono",
                        style: {
                            color: 'var(--text-secondary)'
                        },
                        children: p.record
                    }, void 0, false, {
                        fileName: "[project]/src/app/compare/page.tsx",
                        lineNumber: 196,
                        columnNumber: 9
                    }, this),
                    p.age != null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs font-mono",
                        style: {
                            color: 'var(--text-muted)'
                        },
                        children: [
                            p.ageApproximate ? '~' : '',
                            p.age,
                            " yrs"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/compare/page.tsx",
                        lineNumber: 200,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/compare/page.tsx",
                lineNumber: 192,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-xs",
                style: {
                    color: 'var(--text-muted)'
                },
                children: p.isChampion ? 'Champion' : p.displayRank != null ? `Our #${p.displayRank}` : 'Unranked'
            }, void 0, false, {
                fileName: "[project]/src/app/compare/page.tsx",
                lineNumber: 205,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/compare/page.tsx",
        lineNumber: 170,
        columnNumber: 5
    }, this);
}
const pctFmt = (v)=>`${Math.round((v > 1 ? v / 100 : v) * 100)}%`;
}),
"[project]/src/app/compare/page.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/src/app/compare/page.tsx [app-rsc] (ecmascript)"));
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0oxz9_c._.js.map