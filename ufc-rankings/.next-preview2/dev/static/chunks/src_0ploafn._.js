(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/lib/divisions.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/fighterDisplay.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// Presentation helpers shared by FighterCard / ChampionHero / profile.
// Pure display logic — no algorithm here.
__turbopack_context__.s([
    "buildWhyThisRank",
    ()=>buildWhyThisRank,
    "describeStyle",
    ()=>describeStyle,
    "getHighlights",
    ()=>getHighlights,
    "getTrend",
    ()=>getTrend,
    "initials",
    ()=>initials
]);
function initials(fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function getTrend(fighter, displayRank) {
    const official = fighter.officialRank;
    // Not ranked by the UFC at all, but we rank them — the "we go deeper" case.
    if (!official || official === 'NR') {
        return {
            label: 'NR',
            title: 'Unranked by the UFC — we rank them on the data',
            color: 'var(--accent-blue)',
            bg: 'rgba(74, 158, 255, 0.12)'
        };
    }
    // Champions are pinned to the hero card, not shown as a contender row.
    if (official === 'C') return null;
    const officialNum = parseInt(official, 10);
    if (Number.isNaN(officialNum)) return null;
    const delta = officialNum - displayRank; // >0 means we rank them higher than UFC
    if (delta === 0) {
        return {
            label: '=',
            title: 'Same as the UFC official rank',
            color: 'var(--text-muted)',
            bg: 'var(--bg-elevated)'
        };
    }
    if (delta > 0) {
        return {
            label: `▲${delta}`,
            title: `We rank them ${delta} spot${delta > 1 ? 's' : ''} higher than the UFC (UFC #${officialNum})`,
            color: 'var(--accent-green)',
            bg: 'rgba(45, 212, 126, 0.12)'
        };
    }
    return {
        label: `▼${Math.abs(delta)}`,
        title: `We rank them ${Math.abs(delta)} spot${Math.abs(delta) > 1 ? 's' : ''} lower than the UFC (UFC #${officialNum})`,
        color: 'var(--accent-red-light)',
        bg: 'rgba(255, 45, 45, 0.1)'
    };
}
const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;
// Heavier weight class → larger index. Used only to phrase "moved up/down".
const DIVISION_ORDER = {
    Flyweight: 1,
    Bantamweight: 2,
    Featherweight: 3,
    Lightweight: 4,
    Welterweight: 5,
    Middleweight: 6,
    'Light Heavyweight': 7,
    Heavyweight: 8,
    "Women's Strawweight": 1,
    "Women's Flyweight": 2,
    "Women's Bantamweight": 3
};
function monthsAgo(iso) {
    return (Date.now() - new Date(iso).getTime()) / MS_PER_MONTH;
}
function yearOf(iso) {
    return new Date(iso).getFullYear();
}
// 'ko' | 'sub' | null — what kind of finish a method string represents.
function finishKind(method) {
    const m = method.toUpperCase();
    if (m.includes('SUB')) return 'sub';
    if (m.includes('KO') || m.includes('TKO')) return 'ko';
    return null;
}
// Deterministic per-fighter pick so phrasing is stable on a profile but varies
// across the roster — the content (names, numbers) is always real; only the
// wording rotates so every page doesn't read identically.
function seededPick(seed, arr) {
    let h = 2166136261;
    for(let i = 0; i < seed.length; i++){
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return arr[(h >>> 0) % arr.length];
}
function joinNames(names) {
    if (names.length === 0) return '';
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}
function describeStyle(f) {
    const ko = f.koRate, sub = f.subRate, acc = f.sigStrikeAccuracy, finish = f.finishRate;
    if (ko >= 0.5 && ko >= sub * 1.5) return 'a knockout artist';
    if (sub >= 0.4 && sub >= ko) return 'a submission specialist';
    if (ko >= 0.35 && sub >= 0.25) return 'an all-action finisher who can end it anywhere';
    if (finish >= 0.6) return 'a finisher who rarely lets it reach the judges';
    if (acc >= 0.55 && finish < 0.4) return 'a surgical, high-accuracy striker';
    if (sub >= 0.25) return 'a grappling-leaning technician';
    if (finish <= 0.3) return 'a tactical decision-grinder who wins on the cards';
    return 'a well-rounded operator';
}
function buildWhyThisRank(ranked, history = []) {
    const hist = history; // newest-first (getFighterHistory sorts it that way)
    const name = ranked.fullName.split(/\s+/).slice(-1)[0] || ranked.fullName; // last name
    const isChamp = ranked.officialRank === 'C';
    const style = describeStyle(ranked);
    // ── Mine the history for specific story beats ──
    const wins = hist.filter((f)=>f.result === 'W');
    const last5 = hist.slice(0, 5);
    const rec5 = {
        w: last5.filter((f)=>f.result === 'W').length,
        l: last5.filter((f)=>f.result === 'L').length
    };
    let streak = 0;
    for (const f of hist){
        if (f.result === 'W') streak++;
        else break;
    }
    let skid = 0;
    for (const f of hist){
        if (f.result === 'L') skid++;
        else break;
    }
    // Best recent wins by opponent rating (last 4yr, above-average opponents).
    const qualityWins = wins.filter((f)=>monthsAgo(f.date) <= 48 && f.opponentRating >= 1520 && f.opponentName).sort((a, b)=>b.opponentRating - a.opponentRating);
    // Recent finishes (last ~2.5yr).
    const recentFinishes = wins.filter((f)=>monthsAgo(f.date) <= 30 && finishKind(f.method) && f.opponentName);
    // Recent setbacks (newest losses), named.
    const recentLosses = hist.filter((f)=>f.result === 'L' && monthsAgo(f.date) <= 36 && f.opponentName);
    // Biggest single rating mover.
    const signature = [
        ...wins
    ].sort((a, b)=>b.delta - a.delta)[0];
    // Weight-class move: most recent division differs from the prior settled one.
    let movedTo = null;
    if (hist.length >= 3) {
        const recentWc = hist[0].weightClass;
        const priorWc = (hist.slice(1, 5).find((f)=>f.weightClass && f.weightClass !== recentWc) || {}).weightClass;
        const a = DIVISION_ORDER[recentWc];
        const b = priorWc ? DIVISION_ORDER[priorWc] : undefined;
        if (recentWc && priorWc && a && b && a !== b) {
            movedTo = {
                wc: recentWc,
                dir: a > b ? 'up' : 'down'
            };
        }
    }
    const insights = [];
    const used = new Set();
    const ko = Math.round(ranked.koRate * 100);
    const sub = Math.round(ranked.subRate * 100);
    const acc = Math.round(ranked.sigStrikeAccuracy * 100);
    // ── Headline: pick the dominant storyline ──
    let headline;
    if (isChamp) {
        headline = seededPick(ranked.fighterId + 'c', [
            `Reigning champion — ${name} holds the top slot until someone takes the belt in the cage.`,
            `The belt sits with ${name}. As champion they anchor the top of the division by right of the wins that earned it.`,
            `Champion. ${name} stays #1 here on the strength of a title reign, not a poll.`
        ]);
    } else if (skid >= 2 || rec5.l > rec5.w && last5.length >= 4) {
        const loserNames = joinNames(recentLosses.slice(0, 2).map((f)=>f.opponentName));
        headline = seededPick(ranked.fighterId + 's', [
            `A ${rec5.w}-${rec5.l} run over the last ${last5.length} is the story — that recent skid pulls the rating below where the name alone might land them.`,
            `Skidding: ${skid >= 2 ? `back-to-back losses${loserNames ? ` to ${loserNames}` : ''}` : `a ${rec5.w}-${rec5.l} recent stretch`} have eaten into ${name}'s Elo, which is why they sit lower than you might expect.`,
            `Recent form drags here — ${name} is ${rec5.w}-${rec5.l} in their last ${last5.length}, and the algorithm weighs those losses heavily.`
        ]);
        used.add('skid');
    } else if (streak >= 3 && recentFinishes.length >= 2) {
        headline = seededPick(ranked.fighterId + 'h', [
            `Red-hot: ${name} is on a ${streak}-fight win streak with ${recentFinishes.length} finishes — exactly the kind of active, decisive run the rating rewards.`,
            `${name} is surging — ${streak} straight wins, ${recentFinishes.length} of them stoppages. Recent finishes move Elo more than any decision can.`
        ]);
        used.add('streak');
        used.add('finishes');
    } else if (streak >= 3) {
        headline = seededPick(ranked.fighterId + 'w', [
            `${name} is riding a ${streak}-fight win streak — active and climbing, which the recency-weighted rating rewards.`,
            `Momentum: ${streak} consecutive wins keep ${name} trending up the division.`
        ]);
        used.add('streak');
    } else if (qualityWins.length >= 1) {
        const qn = joinNames(qualityWins.slice(0, 2).map((f)=>f.opponentName));
        headline = seededPick(ranked.fighterId + 'q', [
            `${name}'s ${Math.round(ranked.eloRating)} Elo is earned the hard way — wins over ${qn} are what beating the best looks like.`,
            `Built on quality: the rating is propped up by real scalps — ${qn} — not a padded record.`,
            `Who you beat is the rating. For ${name} that means ${qn}, and the Elo reflects it.`
        ]);
        used.add('quality');
    } else if (ranked.monthsSinceLastFight >= 14) {
        headline = seededPick(ranked.fighterId + 'i', [
            `${Math.round(ranked.monthsSinceLastFight)} months out of the cage — inactivity has regressed ${name}'s rating toward the pack, which caps the rank.`,
            `Rust factor: ${name} hasn't competed in ${Math.round(ranked.monthsSinceLastFight)} months, and the rating fades toward the mean the longer that runs.`
        ]);
        used.add('inactive');
    } else {
        headline = seededPick(ranked.fighterId + 'd', [
            `A ${Math.round(ranked.eloRating)} Elo anchors the rank — earned by who ${name} has beaten, weighted toward recent fights.`,
            `${name} grades out as ${style}; the ${Math.round(ranked.eloRating)} Elo reflects a steady body of work against the division.`,
            `No single highlight drives this one — ${name}'s rank is a ${Math.round(ranked.eloRating)} Elo built on consistent, balanced results.`
        ]);
    }
    // ── Supporting bullets (specific, in priority order) ──
    if (!used.has('quality') && qualityWins.length >= 1) {
        const top = qualityWins.slice(0, 2);
        const names = top.map((f)=>`${f.opponentName} (${yearOf(f.date)})`);
        insights.push({
            kind: 'positive',
            text: `Signature wins over ${joinNames(names)} — beating high-rated opponents is what drives the Elo, not the win count.`
        });
    }
    if (!used.has('finishes') && recentFinishes.length >= 1) {
        const shown = recentFinishes.slice(0, 3);
        const names = shown.map((f)=>f.opponentName);
        const kos = shown.filter((f)=>finishKind(f.method) === 'ko').length;
        const subs = shown.length - kos;
        // "by KO/TKO" for a single finish; "all by …" only when there are several.
        const all = shown.length > 1 ? 'all ' : '';
        const breakdown = kos && subs ? `${kos} by KO/TKO, ${subs} by submission` : kos ? `${all}by KO/TKO` : `${all}by submission`;
        insights.push({
            kind: 'positive',
            text: `Active and dangerous — recently finished ${joinNames(names)} (${breakdown}). Stoppages swing the rating more than decisions do.`
        });
    }
    if (!used.has('streak') && streak >= 2) {
        insights.push({
            kind: 'positive',
            text: `On a ${streak}-fight win streak, keeping the rating fresh and trending up.`
        });
    }
    if (!used.has('skid') && skid >= 1 && recentLosses.length >= 1) {
        const l = recentLosses[0];
        insights.push({
            kind: 'negative',
            text: skid >= 2 ? `Two straight setbacks (latest: ${recentLosses[0].opponentName}, ${yearOf(recentLosses[0].date)}) have trimmed the rating.` : `A recent loss to ${l.opponentName} (${yearOf(l.date)}) cost rating points and caps how high this lands.`
        });
    }
    if (movedTo) {
        insights.push({
            kind: 'neutral',
            text: `Recently moved ${movedTo.dir} to ${movedTo.wc} — the Elo carried across with a weight-move discount, so they're still re-proving it at the new weight.`
        });
    }
    if (!used.has('inactive') && ranked.monthsSinceLastFight >= 14) {
        insights.push({
            kind: 'negative',
            text: `${Math.round(ranked.monthsSinceLastFight)} months since the last fight — inactivity regresses the rating toward the mean.`
        });
    } else if (ranked.monthsSinceLastFight <= 6 && !used.has('streak') && !used.has('skid')) {
        const m = Math.round(ranked.monthsSinceLastFight);
        insights.push({
            kind: 'positive',
            text: `Active — fought within the last ${m <= 1 ? 'month' : `${m} months`}, so the rating is current.`
        });
    }
    if (ranked.sosNudge >= 2) {
        insights.push({
            kind: 'positive',
            text: `Tough schedule: an average recent opponent Elo of ${Math.round(ranked.sosElo)} runs hotter than the raw rating, worth +${ranked.sosNudge.toFixed(0)}.`
        });
    } else if (ranked.sosNudge <= -2) {
        insights.push({
            kind: 'negative',
            text: `Soft recent schedule (avg opponent Elo ${Math.round(ranked.sosElo)}) trims ${ranked.sosNudge.toFixed(0)} — the wins haven't come against the division's best.`
        });
    }
    if (ranked.metricsBonus >= 3) {
        insights.push({
            kind: 'positive',
            text: `The underlying fight metrics — strike volume, accuracy, knockdowns, takedowns — grade out strongly, adding +${ranked.metricsBonus.toFixed(0)}.`
        });
    } else if (ranked.metricsBonus <= -3) {
        insights.push({
            kind: 'negative',
            text: `Soft underlying metrics (out-struck or out-grappled in recent fights) cost ${ranked.metricsBonus.toFixed(0)}.`
        });
    }
    if (signature && signature.delta >= 25 && !used.has('quality')) {
        insights.push({
            kind: 'neutral',
            text: `Biggest career mover: the win over ${signature.opponentName} (${yearOf(signature.date)}) swung the rating +${signature.delta.toFixed(0)} in a single night.`
        });
    }
    if (!isChamp && ranked.officialBonus > 0 && ranked.officialRank) {
        insights.push({
            kind: 'neutral',
            text: `The UFC currently ranks them #${ranked.officialRank}, seeding +${ranked.officialBonus.toFixed(0)} into the rating.`
        });
    }
    // Always anchor with a style identity so even thin profiles read distinctly —
    // reserved as the final slot so it survives the cap.
    const styleInsight = {
        kind: 'neutral',
        text: `Stylistically ${style}${ko || sub || acc ? ` — ${[
            ko ? `${ko}% KO` : '',
            sub ? `${sub}% sub` : '',
            acc ? `${acc}% strike accuracy` : ''
        ].filter(Boolean).join(', ')}` : ''}.`
    };
    const parts = [
        {
            label: 'Base Elo',
            value: ranked.eloRating,
            color: 'var(--accent-red)'
        },
        {
            label: 'Metrics',
            value: ranked.metricsBonus,
            color: 'var(--accent-green)'
        },
        {
            label: 'SoS',
            value: ranked.sosNudge,
            color: 'var(--accent-blue)'
        },
        {
            label: 'Official',
            value: ranked.officialBonus,
            color: 'var(--accent-gold)'
        }
    ];
    if (ranked.pedigreeBonus) parts.push({
        label: 'Pedigree',
        value: ranked.pedigreeBonus,
        color: 'var(--text-secondary)'
    });
    return {
        headline,
        insights: [
            ...insights.slice(0, 5),
            styleInsight
        ],
        parts,
        final: ranked.finalRating,
        style
    };
}
function getHighlights(fighter) {
    const stats = [];
    if (fighter.finishRate > 0) {
        stats.push({
            label: 'Finish',
            value: `${Math.round(fighter.finishRate * 100)}%`,
            color: fighter.finishRate > 0.6 ? 'var(--accent-red-light)' : 'var(--text-secondary)'
        });
    }
    if (fighter.koRate > 0) {
        stats.push({
            label: 'KO',
            value: `${Math.round(fighter.koRate * 100)}%`,
            color: fighter.koRate > 0.4 ? 'var(--accent-red-light)' : 'var(--text-secondary)'
        });
    }
    if (fighter.sigStrikeAccuracy > 0) {
        stats.push({
            label: 'Acc',
            value: `${Math.round(fighter.sigStrikeAccuracy * 100)}%`,
            color: fighter.sigStrikeAccuracy > 0.5 ? 'var(--accent-green)' : 'var(--text-secondary)'
        });
    }
    if (fighter.subRate > 0) {
        stats.push({
            label: 'Sub',
            value: `${Math.round(fighter.subRate * 100)}%`,
            color: fighter.subRate > 0.3 ? 'var(--accent-blue)' : 'var(--text-secondary)'
        });
    }
    return stats.slice(0, 3);
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/FighterAvatar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>FighterAvatar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$fighterDisplay$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/fighterDisplay.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
function FighterAvatar({ src, name, sizeClass, initialsClass, bg, initialsColor, border }) {
    _s();
    const [failed, setFailed] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const showImg = !!src && !failed;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `${sizeClass} rounded-full shrink-0 overflow-hidden relative flex items-center justify-center font-medium`,
        style: {
            backgroundColor: bg,
            color: initialsColor,
            border
        },
        "aria-hidden": true,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: initialsClass,
                children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$fighterDisplay$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["initials"])(name)
            }, void 0, false, {
                fileName: "[project]/src/components/FighterAvatar.tsx",
                lineNumber: 40,
                columnNumber: 7
            }, this),
            showImg && // eslint-disable-next-line @next/next/no-img-element
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                src: src,
                alt: "",
                loading: "lazy",
                onError: ()=>setFailed(true),
                className: "absolute inset-0 w-full h-full object-cover",
                style: {
                    objectPosition: 'center top',
                    backgroundColor: bg
                }
            }, void 0, false, {
                fileName: "[project]/src/components/FighterAvatar.tsx",
                lineNumber: 43,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/FighterAvatar.tsx",
        lineNumber: 33,
        columnNumber: 5
    }, this);
}
_s(FighterAvatar, "BFa/7w0IiJnSoWJxZHxuU4kOwF4=");
_c = FighterAvatar;
var _c;
__turbopack_context__.k.register(_c, "FighterAvatar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/FighterPill.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>FighterPill
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$FighterAvatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/FighterAvatar.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$fighterDisplay$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/fighterDisplay.ts [app-client] (ecmascript)");
;
;
;
;
function FighterPill({ fighter, displayRank, division, champion }) {
    const trend = champion ? null : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$fighterDisplay$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getTrend"])(fighter, displayRank);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
        href: `/fighter/${fighter.fighterId}?d=${encodeURIComponent(division)}`,
        className: "fighter-row flex items-center gap-2.5 px-2.5 py-1.5 rounded-md",
        style: {
            backgroundColor: 'transparent'
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "font-display w-5 text-center text-base leading-none shrink-0",
                style: {
                    color: champion ? 'var(--accent-gold)' : displayRank <= 3 ? 'var(--accent-red-light)' : 'var(--text-secondary)'
                },
                children: champion ? 'C' : displayRank
            }, void 0, false, {
                fileName: "[project]/src/components/FighterPill.tsx",
                lineNumber: 26,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$FighterAvatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                src: fighter.avatarUrl,
                name: fighter.fullName,
                sizeClass: "w-6 h-6",
                initialsClass: "text-[9px]",
                bg: "var(--bg-elevated)",
                initialsColor: champion ? 'var(--accent-gold)' : 'var(--text-muted)',
                border: champion ? '1px solid var(--accent-gold)' : undefined
            }, void 0, false, {
                fileName: "[project]/src/components/FighterPill.tsx",
                lineNumber: 34,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 min-w-0",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-xs font-medium truncate",
                        style: {
                            color: 'var(--text-primary)'
                        },
                        children: [
                            fighter.flag && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "mr-1 leading-none",
                                title: fighter.nationality,
                                children: fighter.flag
                            }, void 0, false, {
                                fileName: "[project]/src/components/FighterPill.tsx",
                                lineNumber: 48,
                                columnNumber: 13
                            }, this),
                            fighter.fullName
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/FighterPill.tsx",
                        lineNumber: 46,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-[10px] font-mono truncate",
                        style: {
                            color: 'var(--text-muted)'
                        },
                        children: fighter.record
                    }, void 0, false, {
                        fileName: "[project]/src/components/FighterPill.tsx",
                        lineNumber: 54,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/FighterPill.tsx",
                lineNumber: 45,
                columnNumber: 7
            }, this),
            trend && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0",
                style: {
                    backgroundColor: trend.bg,
                    color: trend.color
                },
                title: trend.title,
                children: trend.label
            }, void 0, false, {
                fileName: "[project]/src/components/FighterPill.tsx",
                lineNumber: 61,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "text-xs font-mono shrink-0 w-9 text-right",
                style: {
                    color: champion ? 'var(--accent-gold)' : 'var(--text-secondary)'
                },
                children: fighter.rankScore.toFixed(1)
            }, void 0, false, {
                fileName: "[project]/src/components/FighterPill.tsx",
                lineNumber: 71,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/FighterPill.tsx",
        lineNumber: 20,
        columnNumber: 5
    }, this);
}
_c = FighterPill;
var _c;
__turbopack_context__.k.register(_c, "FighterPill");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/DivisionCard.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>DivisionCard
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$divisions$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/divisions.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$FighterPill$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/FighterPill.tsx [app-client] (ecmascript)");
;
;
;
;
function DivisionCard({ data }) {
    const { division, champion, fighters } = data;
    const href = `/division/${encodeURIComponent(division)}`;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "rounded-xl overflow-hidden flex flex-col",
        style: {
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)'
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                href: href,
                className: "flex items-center justify-between gap-2 px-3.5 py-3 group",
                style: {
                    borderBottom: '1px solid var(--border)'
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-baseline gap-2 min-w-0",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "font-display text-lg leading-none tracking-wide truncate",
                                style: {
                                    color: 'var(--text-primary)'
                                },
                                children: division
                            }, void 0, false, {
                                fileName: "[project]/src/components/DivisionCard.tsx",
                                lineNumber: 28,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0",
                                style: {
                                    backgroundColor: 'var(--bg-elevated)',
                                    color: 'var(--text-muted)'
                                },
                                children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$divisions$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shortDivision"])(division)
                            }, void 0, false, {
                                fileName: "[project]/src/components/DivisionCard.tsx",
                                lineNumber: 34,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/DivisionCard.tsx",
                        lineNumber: 27,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-[11px] shrink-0 transition-colors group-hover:text-[var(--accent-red-light)]",
                        style: {
                            color: 'var(--text-muted)'
                        },
                        children: "View all →"
                    }, void 0, false, {
                        fileName: "[project]/src/components/DivisionCard.tsx",
                        lineNumber: 41,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/DivisionCard.tsx",
                lineNumber: 22,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "px-1.5 pt-1.5",
                children: champion ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$FighterPill$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                    fighter: champion,
                    displayRank: 0,
                    division: division,
                    champion: true
                }, void 0, false, {
                    fileName: "[project]/src/components/DivisionCard.tsx",
                    lineNumber: 52,
                    columnNumber: 11
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "px-2.5 py-1.5 text-[11px]",
                    style: {
                        color: 'var(--text-muted)'
                    },
                    children: "No reigning champion"
                }, void 0, false, {
                    fileName: "[project]/src/components/DivisionCard.tsx",
                    lineNumber: 54,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/DivisionCard.tsx",
                lineNumber: 50,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "px-1.5 pb-1.5 pt-0.5 space-y-0.5 flex-1",
                children: fighters.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "px-2.5 py-2 text-[11px]",
                    style: {
                        color: 'var(--text-muted)'
                    },
                    children: "No ranked contenders"
                }, void 0, false, {
                    fileName: "[project]/src/components/DivisionCard.tsx",
                    lineNumber: 63,
                    columnNumber: 11
                }, this) : fighters.map((f, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$FighterPill$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                        fighter: f,
                        displayRank: i + 1,
                        division: division
                    }, f.fighterId, false, {
                        fileName: "[project]/src/components/DivisionCard.tsx",
                        lineNumber: 68,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/components/DivisionCard.tsx",
                lineNumber: 61,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/DivisionCard.tsx",
        lineNumber: 17,
        columnNumber: 5
    }, this);
}
_c = DivisionCard;
var _c;
__turbopack_context__.k.register(_c, "DivisionCard");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/DepthHeatmap.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>DepthHeatmap
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$divisions$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/divisions.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
function DepthHeatmap({ divisions }) {
    _s();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const rows = divisions.filter((d)=>d.depth.length > 0);
    if (rows.length === 0) return null;
    const all = rows.flatMap((d)=>d.depth.map((c)=>c.elo));
    const min = Math.min(...all);
    const max = Math.max(...all);
    const span = Math.max(1, max - min);
    const heat = (elo)=>{
        const t = (elo - min) / span;
        return `rgba(210,10,10,${(0.05 + 0.92 * Math.pow(t, 1.35)).toFixed(3)})`;
    };
    const median15 = (d)=>{
        const top = d.depth.slice(0, 15).map((c)=>c.elo).sort((a, b)=>a - b);
        return top.length ? top[Math.floor(top.length / 2)] : 0;
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-baseline justify-between mb-2.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-[10px] tracking-widest",
                        style: {
                            color: 'var(--text-muted)'
                        },
                        children: "DIVISION DEPTH · TOP 40 BY CORE ELO"
                    }, void 0, false, {
                        fileName: "[project]/src/components/DepthHeatmap.tsx",
                        lineNumber: 34,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-[10px]",
                        style: {
                            color: 'var(--text-muted)'
                        },
                        children: "hotter = stronger · same scale across divisions"
                    }, void 0, false, {
                        fileName: "[project]/src/components/DepthHeatmap.tsx",
                        lineNumber: 37,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/DepthHeatmap.tsx",
                lineNumber: 33,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded-xl p-4 space-y-1.5",
                style: {
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border)'
                },
                children: [
                    rows.map((d)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            onClick: ()=>router.push(`/division/${encodeURIComponent(d.division)}`),
                            className: "w-full flex items-center gap-2.5 group",
                            title: `${d.division} — open rankings`,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "font-mono text-[10px] w-9 text-right shrink-0 group-hover:underline",
                                    style: {
                                        color: 'var(--text-secondary)'
                                    },
                                    children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$divisions$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shortDivision"])(d.division)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/DepthHeatmap.tsx",
                                    lineNumber: 52,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "flex flex-1 gap-px h-4 rounded-sm overflow-hidden",
                                    children: d.depth.map((c, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "flex-1 min-w-0",
                                            style: {
                                                backgroundColor: heat(c.elo)
                                            },
                                            title: `${i === 0 ? 'C' : `#${i}`} ${c.name} · ${c.elo}`
                                        }, i, false, {
                                            fileName: "[project]/src/components/DepthHeatmap.tsx",
                                            lineNumber: 60,
                                            columnNumber: 17
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/src/components/DepthHeatmap.tsx",
                                    lineNumber: 58,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "font-mono text-[10px] w-10 text-left shrink-0",
                                    style: {
                                        color: 'var(--text-muted)'
                                    },
                                    children: median15(d)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/DepthHeatmap.tsx",
                                    lineNumber: 68,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, d.division, true, {
                            fileName: "[project]/src/components/DepthHeatmap.tsx",
                            lineNumber: 46,
                            columnNumber: 11
                        }, this)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center justify-between pt-1.5 text-[10px]",
                        style: {
                            color: 'var(--text-muted)'
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: "← champion, then ranks 1–40 →"
                            }, void 0, false, {
                                fileName: "[project]/src/components/DepthHeatmap.tsx",
                                lineNumber: 74,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: "right column: median Elo of the top 15"
                            }, void 0, false, {
                                fileName: "[project]/src/components/DepthHeatmap.tsx",
                                lineNumber: 75,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/DepthHeatmap.tsx",
                        lineNumber: 73,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/DepthHeatmap.tsx",
                lineNumber: 41,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/DepthHeatmap.tsx",
        lineNumber: 32,
        columnNumber: 5
    }, this);
}
_s(DepthHeatmap, "fN7XvhJ+p5oE6+Xlo0NJmXpxjC8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"]
    ];
});
_c = DepthHeatmap;
var _c;
__turbopack_context__.k.register(_c, "DepthHeatmap");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/types.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>HomePage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$DivisionCard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/DivisionCard.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$DepthHeatmap$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/DepthHeatmap.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/types.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
const isWomens = (division)=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["WOMENS_DIVISIONS"].includes(division);
const GENDER_TABS = [
    {
        key: 'all',
        label: 'All'
    },
    {
        key: 'male',
        label: 'Men'
    },
    {
        key: 'female',
        label: 'Women'
    }
];
function HomePage() {
    _s();
    const [divisions, setDivisions] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [gender, setGender] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('all');
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "HomePage.useEffect": ()=>{
            let cancelled = false;
            ({
                "HomePage.useEffect": async ()=>{
                    setLoading(true);
                    setError(null);
                    try {
                        const res = await fetch('/api/dashboard?top=5');
                        if (!res.ok) {
                            const data = await res.json();
                            throw new Error(data.error || `HTTP ${res.status}`);
                        }
                        const data = await res.json();
                        if (!cancelled) setDivisions(data.divisions);
                    } catch (err) {
                        if (!cancelled) {
                            setError(err instanceof Error ? err.message : 'Unknown error');
                            setDivisions(null);
                        }
                    } finally{
                        if (!cancelled) setLoading(false);
                    }
                }
            })["HomePage.useEffect"]();
            return ({
                "HomePage.useEffect": ()=>{
                    cancelled = true;
                }
            })["HomePage.useEffect"];
        }
    }["HomePage.useEffect"], []);
    const visible = (divisions ?? []).filter((d)=>gender === 'all' ? true : gender === 'female' ? isWomens(d.division) : !isWomens(d.division));
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "max-w-7xl mx-auto px-4 py-6 space-y-5",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                className: "font-display text-3xl sm:text-4xl leading-none",
                                style: {
                                    color: 'var(--text-primary)'
                                },
                                children: "DIVISIONS"
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 62,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-xs mt-1.5",
                                style: {
                                    color: 'var(--text-muted)'
                                },
                                children: "Every weight class at a glance — champion and top 5, ranked on in-cage performance."
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 65,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 61,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-1 p-1 rounded-lg w-fit",
                        style: {
                            backgroundColor: 'var(--bg-elevated)'
                        },
                        children: GENDER_TABS.map((t)=>{
                            const active = gender === t.key;
                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: ()=>setGender(t.key),
                                className: "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                                style: {
                                    backgroundColor: active ? 'var(--accent-red)' : 'transparent',
                                    color: active ? '#fff' : 'var(--text-secondary)'
                                },
                                children: t.label
                            }, t.key, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 78,
                                columnNumber: 15
                            }, this);
                        })
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 71,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 60,
                columnNumber: 7
            }, this),
            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-center py-12 rounded-lg border",
                style: {
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border)',
                    color: 'var(--accent-red)'
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-sm font-medium",
                        children: "Failed to load divisions"
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 100,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-xs mt-1",
                        style: {
                            color: 'var(--text-muted)'
                        },
                        children: error
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 101,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 96,
                columnNumber: 9
            }, this),
            loading && !error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4",
                children: Array.from({
                    length: 6
                }).map((_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "h-72 rounded-xl animate-pulse",
                        style: {
                            backgroundColor: 'var(--bg-card)',
                            opacity: 1 - i * 0.08
                        }
                    }, i, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 109,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 107,
                columnNumber: 9
            }, this),
            !loading && !error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4",
                children: visible.map((d)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$DivisionCard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                        data: d
                    }, d.division, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 122,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 120,
                columnNumber: 9
            }, this),
            !loading && !error && visible.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$DepthHeatmap$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                divisions: visible
            }, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 128,
                columnNumber: 52
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-center py-6 text-xs space-y-1",
                style: {
                    color: 'var(--text-muted)'
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        children: "Rankings generated algorithmically from UFC fight data."
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 131,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        children: "No media votes. No popularity bias. Pure in-cage performance."
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 132,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 130,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/page.tsx",
        lineNumber: 58,
        columnNumber: 5
    }, this);
}
_s(HomePage, "EIdGiXDmOf81rliScWBxNqe6vnE=");
_c = HomePage;
var _c;
__turbopack_context__.k.register(_c, "HomePage");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_0ploafn._.js.map