module.exports = [
"[project]/src/lib/fighterDisplay.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
}),
"[project]/src/components/FighterAvatar.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>FighterAvatar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$fighterDisplay$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/fighterDisplay.ts [app-ssr] (ecmascript)");
'use client';
;
;
;
function FighterAvatar({ src, name, sizeClass, initialsClass, bg, initialsColor, border }) {
    const [failed, setFailed] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const showImg = !!src && !failed;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `${sizeClass} rounded-full shrink-0 overflow-hidden relative flex items-center justify-center font-medium`,
        style: {
            backgroundColor: bg,
            color: initialsColor,
            border
        },
        "aria-hidden": true,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: initialsClass,
                children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$fighterDisplay$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["initials"])(name)
            }, void 0, false, {
                fileName: "[project]/src/components/FighterAvatar.tsx",
                lineNumber: 40,
                columnNumber: 7
            }, this),
            showImg && // eslint-disable-next-line @next/next/no-img-element
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
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
}),
"[project]/src/components/AnalystChat.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AnalystChat
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
// ─────────────────────────────────────────────────────────────────────────
//  AnalystChat — "Ask the Analyst" chat panel on /upcoming.
//
//  Streams NDJSON from /api/chat. Tool activity ("🔍 checking …") is shown
//  live while the agent grounds itself in the site's own data — making the
//  grounding VISIBLE is the trust feature.
// ─────────────────────────────────────────────────────────────────────────
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
'use client';
;
;
const SUGGESTED = [
    'Talk me through the main event',
    "Who's the live dog on this card?",
    'Which fight is closest on paper?'
];
function AnalystChat({ eventName }) {
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [messages, setMessages] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [input, setInput] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('');
    const [busy, setBusy] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [activity, setActivity] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const abortRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const scrollRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>()=>abortRef.current?.abort(), []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight
        });
    }, [
        messages,
        activity
    ]);
    async function ask(question) {
        const q = question.trim();
        if (!q || busy) return;
        setError(null);
        setInput('');
        setBusy(true);
        setActivity(null);
        const history = [
            ...messages,
            {
                role: 'user',
                content: q
            }
        ];
        setMessages([
            ...history,
            {
                role: 'assistant',
                content: ''
            }
        ]);
        const controller = new AbortController();
        abortRef.current = controller;
        // Append streamed text to the trailing assistant message.
        const appendText = (text)=>setMessages((cur)=>{
                const next = [
                    ...cur
                ];
                const last = next[next.length - 1];
                next[next.length - 1] = {
                    ...last,
                    content: last.content + text
                };
                return next;
            });
        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: history,
                    eventName
                }),
                signal: controller.signal
            });
            if (!res.ok || !res.body) {
                const data = await res.json().catch(()=>null);
                throw new Error(data?.error || `HTTP ${res.status}`);
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            for(;;){
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, {
                    stream: true
                });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines){
                    if (!line.trim()) continue;
                    let evt;
                    try {
                        evt = JSON.parse(line);
                    } catch  {
                        continue;
                    }
                    if (evt.type === 'text' && evt.text) {
                        setActivity(null);
                        appendText(evt.text);
                    } else if (evt.type === 'tool' && evt.label) {
                        setActivity(evt.label);
                    } else if (evt.type === 'error') {
                        setError(evt.message || 'Something went wrong.');
                    }
                }
            }
        } catch (err) {
            if (!(err instanceof DOMException && err.name === 'AbortError')) {
                setError(err instanceof Error ? err.message : 'Something went wrong.');
            }
        } finally{
            setActivity(null);
            setBusy(false);
            // Drop an empty assistant bubble if the stream produced nothing.
            setMessages((cur)=>cur.length && cur[cur.length - 1].role === 'assistant' && !cur[cur.length - 1].content ? cur.slice(0, -1) : cur);
        }
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "rounded-xl border overflow-hidden",
        style: {
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-light)'
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                onClick: ()=>setOpen((o)=>!o),
                className: "w-full flex items-center justify-between px-4 py-3 text-left",
                style: {
                    backgroundColor: 'var(--bg-card-hover)'
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "flex items-baseline gap-2.5",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "font-display text-sm uppercase tracking-wide",
                                style: {
                                    color: 'var(--text-primary)'
                                },
                                children: "Ask the Analyst"
                            }, void 0, false, {
                                fileName: "[project]/src/components/AnalystChat.tsx",
                                lineNumber: 129,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-[11px]",
                                style: {
                                    color: 'var(--text-muted)'
                                },
                                children: eventName ? `Talking ${eventName.split(' - ')[0]}` : 'Grounded in our numbers, not vibes'
                            }, void 0, false, {
                                fileName: "[project]/src/components/AnalystChat.tsx",
                                lineNumber: 132,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/AnalystChat.tsx",
                        lineNumber: 128,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "font-mono text-xs",
                        style: {
                            color: 'var(--text-muted)'
                        },
                        children: open ? '−' : '+'
                    }, void 0, false, {
                        fileName: "[project]/src/components/AnalystChat.tsx",
                        lineNumber: 136,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/AnalystChat.tsx",
                lineNumber: 123,
                columnNumber: 7
            }, this),
            open && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "border-t",
                style: {
                    borderColor: 'var(--border)'
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        ref: scrollRef,
                        className: "max-h-96 overflow-y-auto px-4 py-3 space-y-3",
                        children: [
                            messages.length === 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "space-y-2.5",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-xs",
                                        style: {
                                            color: 'var(--text-muted)'
                                        },
                                        children: "Every answer is pulled live from the site's own Elo ratings, form data, and win probabilities — if the analyst didn't look it up, it won't say it."
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/AnalystChat.tsx",
                                        lineNumber: 146,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex flex-wrap gap-2",
                                        children: SUGGESTED.map((s)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>ask(s),
                                                disabled: busy,
                                                className: "text-[11px] px-2.5 py-1.5 rounded-full border transition-colors hover:border-[var(--accent-red)]",
                                                style: {
                                                    color: 'var(--text-secondary)',
                                                    borderColor: 'var(--border)'
                                                },
                                                children: s
                                            }, s, false, {
                                                fileName: "[project]/src/components/AnalystChat.tsx",
                                                lineNumber: 152,
                                                columnNumber: 21
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/AnalystChat.tsx",
                                        lineNumber: 150,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/AnalystChat.tsx",
                                lineNumber: 145,
                                columnNumber: 15
                            }, this),
                            messages.map((m, i)=>m.role === 'user' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex justify-end",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed",
                                        style: {
                                            backgroundColor: 'rgba(210,10,10,0.12)',
                                            color: 'var(--text-primary)'
                                        },
                                        children: m.content
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/AnalystChat.tsx",
                                        lineNumber: 169,
                                        columnNumber: 19
                                    }, this)
                                }, i, false, {
                                    fileName: "[project]/src/components/AnalystChat.tsx",
                                    lineNumber: 168,
                                    columnNumber: 17
                                }, this) : (m.content || busy) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap",
                                        style: {
                                            backgroundColor: 'var(--bg-secondary)',
                                            color: 'var(--text-secondary)'
                                        },
                                        children: [
                                            m.content || !activity && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                style: {
                                                    color: 'var(--text-muted)'
                                                },
                                                children: "Thinking…"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/AnalystChat.tsx",
                                                lineNumber: 183,
                                                columnNumber: 51
                                            }, this),
                                            i === messages.length - 1 && activity && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "block mt-1 font-mono text-[11px]",
                                                style: {
                                                    color: 'var(--text-muted)'
                                                },
                                                children: [
                                                    "🔍 ",
                                                    activity,
                                                    "…"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/AnalystChat.tsx",
                                                lineNumber: 185,
                                                columnNumber: 25
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/AnalystChat.tsx",
                                        lineNumber: 179,
                                        columnNumber: 21
                                    }, this)
                                }, i, false, {
                                    fileName: "[project]/src/components/AnalystChat.tsx",
                                    lineNumber: 178,
                                    columnNumber: 19
                                }, this)),
                            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-[12px]",
                                style: {
                                    color: 'var(--accent-red-light)'
                                },
                                children: error
                            }, void 0, false, {
                                fileName: "[project]/src/components/AnalystChat.tsx",
                                lineNumber: 196,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/AnalystChat.tsx",
                        lineNumber: 143,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                        onSubmit: (e)=>{
                            e.preventDefault();
                            ask(input);
                        },
                        className: "flex items-center gap-2 border-t px-3 py-2.5",
                        style: {
                            borderColor: 'var(--border)'
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                value: input,
                                onChange: (e)=>setInput(e.target.value),
                                placeholder: eventName ? `Ask about ${eventName.split(' - ')[0]}…` : 'Ask about an upcoming fight…',
                                disabled: busy,
                                maxLength: 500,
                                className: "flex-1 bg-transparent text-[13px] outline-none",
                                style: {
                                    color: 'var(--text-primary)'
                                }
                            }, void 0, false, {
                                fileName: "[project]/src/components/AnalystChat.tsx",
                                lineNumber: 210,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "submit",
                                disabled: busy || !input.trim(),
                                className: "font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 rounded disabled:opacity-40",
                                style: {
                                    backgroundColor: 'var(--accent-red)',
                                    color: '#fff'
                                },
                                children: busy ? '…' : 'Ask'
                            }, void 0, false, {
                                fileName: "[project]/src/components/AnalystChat.tsx",
                                lineNumber: 219,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/AnalystChat.tsx",
                        lineNumber: 202,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/AnalystChat.tsx",
                lineNumber: 142,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/AnalystChat.tsx",
        lineNumber: 119,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/components/FormPips.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// Last-5 form squares, newest first. Title fights get the gold underline so a
// loss to the champ reads differently from a loss to a mid-carder. Underneath,
// a light timeline dates the window: the year of the most recent fight on the
// newest end, the year of the 5th-most-recent on the other — so five results
// packed into 18 months read differently from five spread over 6 years.
// Presentational only (no hooks) — safe in both server and client components.
__turbopack_context__.s([
    "default",
    ()=>FormPips,
    "resultColor",
    ()=>resultColor
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
;
const resultColor = (r)=>r === 'W' ? 'var(--accent-green)' : r === 'L' ? 'var(--accent-red-light)' : 'var(--text-muted)';
const pipBg = (r)=>r === 'W' ? 'rgba(45,212,126,0.15)' : r === 'L' ? 'rgba(255,45,45,0.13)' : 'rgba(160,160,181,0.12)';
function pipTitle(f) {
    const when = f.date ? new Date(f.date.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric'
    }) : '';
    return [
        f.result,
        f.label,
        f.isTitle ? 'TITLE FIGHT' : '',
        when
    ].filter(Boolean).join(' · ');
}
const yearOf = (date)=>/^\d{4}/.test(date) ? date.slice(0, 4) : null;
function FormPips({ fights, compact = false, justifyEnd = false }) {
    if (fights.length === 0) {
        return compact ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
            className: "font-mono text-[10px]",
            style: {
                color: 'var(--text-muted)'
            },
            children: "–"
        }, void 0, false, {
            fileName: "[project]/src/components/FormPips.tsx",
            lineNumber: 44,
            columnNumber: 7
        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
            className: "text-[11px]",
            style: {
                color: 'var(--text-muted)'
            },
            children: "No UFC fights on record"
        }, void 0, false, {
            fileName: "[project]/src/components/FormPips.tsx",
            lineNumber: 46,
            columnNumber: 7
        }, this);
    }
    const newestYear = yearOf(fights[0].date);
    const oldestYear = yearOf(fights[fights.length - 1].date);
    const showSpan = fights.length > 1 && newestYear != null && oldestYear != null;
    const spanTitle = showSpan ? newestYear === oldestYear ? `Last ${fights.length} fights · all in ${newestYear}` : `Last ${fights.length} fights · ${oldestYear} to ${newestYear}` : undefined;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `flex ${justifyEnd ? 'sm:justify-end' : ''}`,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "inline-flex flex-col",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex items-center gap-1.5",
                    children: fights.map((rf, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            title: pipTitle(rf),
                            className: `inline-flex items-center justify-center rounded-[3px] font-mono ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-[10px]`,
                            style: {
                                color: resultColor(rf.result),
                                backgroundColor: pipBg(rf.result),
                                boxShadow: rf.isTitle ? 'inset 0 -2px 0 0 var(--accent-gold)' : undefined
                            },
                            children: rf.result
                        }, i, false, {
                            fileName: "[project]/src/components/FormPips.tsx",
                            lineNumber: 64,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/src/components/FormPips.tsx",
                    lineNumber: 62,
                    columnNumber: 9
                }, this),
                showSpan && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "w-full mt-1",
                    title: spanTitle,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "h-px w-full",
                            style: {
                                backgroundColor: 'var(--border-light)'
                            }
                        }, void 0, false, {
                            fileName: "[project]/src/components/FormPips.tsx",
                            lineNumber: 82,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: `flex justify-between font-mono leading-none mt-[3px] ${compact ? 'text-[8px]' : 'text-[9px]'}`,
                            style: {
                                color: 'var(--text-muted)'
                            },
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: newestYear
                                }, void 0, false, {
                                    fileName: "[project]/src/components/FormPips.tsx",
                                    lineNumber: 89,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: oldestYear
                                }, void 0, false, {
                                    fileName: "[project]/src/components/FormPips.tsx",
                                    lineNumber: 90,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/FormPips.tsx",
                            lineNumber: 83,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/FormPips.tsx",
                    lineNumber: 81,
                    columnNumber: 11
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/FormPips.tsx",
            lineNumber: 61,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/FormPips.tsx",
        lineNumber: 60,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/app/upcoming/page.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>UpcomingPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$FighterAvatar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/FighterAvatar.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$AnalystChat$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/AnalystChat.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$FormPips$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/FormPips.tsx [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
;
function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
}
function daysUntil(iso) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return Math.round((new Date(iso + 'T00:00:00').getTime() - today) / 86400000);
}
function lastName(name) {
    const parts = name.trim().split(/\s+/);
    return parts[parts.length - 1] || name;
}
// Event names arrive as "UFC 329 - McGregor vs. Holloway 2" — the suffix is
// the billed matchup, not a venue.
function splitEventName(name) {
    const idx = name.indexOf(' - ');
    return idx === -1 ? {
        title: name,
        subtitle: null
    } : {
        title: name.slice(0, idx),
        subtitle: name.slice(idx + 3)
    };
}
function RankChip({ f, compact = false }) {
    if (!f.rankLabel) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
            className: "font-mono text-[10px] shrink-0",
            style: {
                color: 'var(--text-muted)'
            },
            children: compact ? 'UNR' : 'Unranked'
        }, void 0, false, {
            fileName: "[project]/src/app/upcoming/page.tsx",
            lineNumber: 39,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        className: `font-mono text-[10px] shrink-0 ${compact ? 'px-1' : 'px-1.5'} py-0.5 rounded`,
        style: {
            color: f.isChampion ? '#13131a' : 'var(--accent-red-light)',
            backgroundColor: f.isChampion ? 'var(--accent-gold)' : 'rgba(210,10,10,0.16)'
        },
        children: f.rankLabel
    }, void 0, false, {
        fileName: "[project]/src/app/upcoming/page.tsx",
        lineNumber: 45,
        columnNumber: 5
    }, this);
}
function MainSide({ f, align }) {
    const right = align === 'right';
    const name = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        className: "font-display text-lg sm:text-xl uppercase leading-tight",
        style: {
            color: 'var(--text-primary)'
        },
        children: f.name
    }, void 0, false, {
        fileName: "[project]/src/app/upcoming/page.tsx",
        lineNumber: 60,
        columnNumber: 5
    }, this);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `p-4 ${right ? 'sm:text-right' : ''}`,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `flex items-center gap-3 mb-2.5 ${right ? 'sm:flex-row-reverse' : ''}`,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$FighterAvatar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                        src: f.avatarUrl ?? undefined,
                        name: f.name,
                        sizeClass: "w-14 h-14",
                        initialsClass: "text-sm",
                        bg: "var(--bg-elevated)",
                        initialsColor: "var(--text-secondary)",
                        border: f.isChampion ? '2px solid var(--accent-gold)' : undefined
                    }, void 0, false, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 70,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "min-w-0",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: `flex items-center gap-2 ${right ? 'sm:flex-row-reverse' : ''}`,
                                children: [
                                    f.fighterId ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                        href: `/fighter/${f.fighterId}`,
                                        className: "hover:underline",
                                        children: name
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/upcoming/page.tsx",
                                        lineNumber: 82,
                                        columnNumber: 15
                                    }, this) : name,
                                    f.flag && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-sm leading-none",
                                        children: f.flag
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/upcoming/page.tsx",
                                        lineNumber: 88,
                                        columnNumber: 24
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/upcoming/page.tsx",
                                lineNumber: 80,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: `mt-1 flex items-center gap-2 ${right ? 'sm:flex-row-reverse' : ''}`,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(RankChip, {
                                        f: f
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/upcoming/page.tsx",
                                        lineNumber: 91,
                                        columnNumber: 13
                                    }, this),
                                    f.age != null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "font-mono text-[10px]",
                                        style: {
                                            color: 'var(--text-muted)'
                                        },
                                        children: [
                                            f.age,
                                            " yrs"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/upcoming/page.tsx",
                                        lineNumber: 93,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/upcoming/page.tsx",
                                lineNumber: 90,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 79,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 69,
                columnNumber: 7
            }, this),
            f.description && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-xs leading-snug mb-2.5",
                style: {
                    color: 'var(--text-secondary)'
                },
                children: f.description
            }, void 0, false, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 102,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$FormPips$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                fights: f.recentFights,
                justifyEnd: right
            }, void 0, false, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 107,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `mt-2 flex flex-col gap-1 items-start ${right ? 'sm:items-end' : ''}`,
                children: f.recentFights.slice(0, 2).map((rf, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-[11px]",
                        style: {
                            color: 'var(--text-secondary)'
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "font-medium",
                                style: {
                                    color: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$FormPips$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["resultColor"])(rf.result)
                                },
                                children: rf.result
                            }, void 0, false, {
                                fileName: "[project]/src/app/upcoming/page.tsx",
                                lineNumber: 111,
                                columnNumber: 13
                            }, this),
                            ' ',
                            "· ",
                            rf.label,
                            rf.isTitle && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "font-mono text-[10px] ml-1.5 px-1 py-px rounded-sm",
                                style: {
                                    color: 'var(--accent-gold)',
                                    border: '1px solid rgba(212,168,67,0.45)'
                                },
                                children: "TITLE"
                            }, void 0, false, {
                                fileName: "[project]/src/app/upcoming/page.tsx",
                                lineNumber: 116,
                                columnNumber: 15
                            }, this)
                        ]
                    }, i, true, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 110,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 108,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/upcoming/page.tsx",
        lineNumber: 68,
        columnNumber: 5
    }, this);
}
function compareHref(bout) {
    const { fighter1: f1, fighter2: f2 } = bout;
    return f1.fighterId && f2.fighterId ? `/compare?a=${f1.fighterId}&b=${f2.fighterId}` : null;
}
function ProbabilitySpine({ bout }) {
    if (bout.prob1 == null) return null;
    const p1 = Math.round(bout.prob1 * 100);
    const p2 = 100 - p1;
    const fp1 = bout.formProb1 != null ? Math.round(bout.formProb1 * 100) : null;
    const showForm = fp1 != null && Math.abs(fp1 - p1) >= 2;
    const href = compareHref(bout);
    const spine = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-baseline justify-between mb-1.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "font-display text-lg leading-none",
                        style: {
                            color: p1 >= p2 ? 'var(--text-primary)' : 'var(--text-muted)'
                        },
                        children: [
                            p1,
                            "%"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 145,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "font-mono text-[10px] tracking-widest",
                        style: {
                            color: 'var(--text-muted)'
                        },
                        children: [
                            "WIN PROBABILITY",
                            showForm ? ` · FORM-ADJ ${fp1}–${100 - fp1}` : ''
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 151,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "font-display text-lg leading-none",
                        style: {
                            color: p2 > p1 ? 'var(--text-primary)' : 'var(--text-muted)'
                        },
                        children: [
                            p2,
                            "%"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 154,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 144,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "relative h-1.5 rounded-full",
                style: {
                    backgroundColor: 'var(--bg-elevated)'
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "absolute inset-y-0 left-0 rounded-l-full",
                        style: {
                            width: `${p1}%`,
                            backgroundColor: 'var(--accent-red)'
                        }
                    }, void 0, false, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 162,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "absolute top-1/2 w-2 h-2",
                        style: {
                            left: `${p1}%`,
                            transform: 'translate(-50%,-50%) rotate(45deg)',
                            backgroundColor: 'var(--bg-primary)',
                            border: '1.5px solid var(--text-primary)'
                        }
                    }, void 0, false, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 166,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 161,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "px-4 pb-4",
        children: href ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
            href: href,
            title: "Full comparison",
            className: "block -mx-2 -my-1.5 px-2 py-1.5 rounded-md transition-colors hover:bg-[var(--bg-card-hover)]",
            children: spine
        }, void 0, false, {
            fileName: "[project]/src/app/upcoming/page.tsx",
            lineNumber: 181,
            columnNumber: 9
        }, this) : spine
    }, void 0, false, {
        fileName: "[project]/src/app/upcoming/page.tsx",
        lineNumber: 179,
        columnNumber: 5
    }, this);
}
// Per-row accent: schedule → blue (SoS), finish → red, reach → neutral.
const TAPE_ACCENT = {
    schedule: 'var(--accent-blue)',
    finish: 'var(--accent-red-light)',
    reach: 'var(--text-primary)'
};
// Middle band of the hero: the VS diamond, a short tale-of-the-tape, and a
// link to the full compare page. A row only shows when both corners have the
// stat; the tape as a whole is dropped below two rows (diamond + link remain).
function TaleOfTape({ bout }) {
    const { fighter1: f1, fighter2: f2 } = bout;
    const rows = [];
    if (f1.reach != null && f2.reach != null) rows.push({
        key: 'reach',
        label: 'Reach',
        v1: f1.reach,
        v2: f2.reach,
        fmt: (n)=>`${n}"`
    });
    if (f1.scheduleStrength != null && f2.scheduleStrength != null) rows.push({
        key: 'schedule',
        label: 'Sched str',
        v1: f1.scheduleStrength,
        v2: f2.scheduleStrength,
        fmt: (n)=>`${Math.round(n)}`
    });
    if (f1.finishRate != null && f2.finishRate != null) rows.push({
        key: 'finish',
        label: 'Finish',
        v1: f1.finishRate,
        v2: f2.finishRate,
        fmt: (n)=>`${Math.round(n * 100)}%`
    });
    const href = compareHref(bout);
    const qualityTip = (q)=>q != null ? `Opponent quality ${Math.round(q)} of 100, discounted for activity` : undefined;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-col items-center px-2 py-2 sm:py-0",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "w-8 h-8 flex items-center justify-center rounded shrink-0 sm:mt-7",
                style: {
                    transform: 'rotate(45deg)',
                    border: '1px solid var(--accent-red)',
                    backgroundColor: 'var(--bg-primary)'
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "block font-display text-xs leading-none",
                    style: {
                        transform: 'rotate(-45deg)',
                        color: 'var(--text-primary)'
                    },
                    children: "VS"
                }, void 0, false, {
                    fileName: "[project]/src/app/upcoming/page.tsx",
                    lineNumber: 227,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 223,
                columnNumber: 7
            }, this),
            rows.length >= 2 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "w-full mt-3.5 flex flex-col gap-1.5",
                children: rows.map((r)=>{
                    const accent = TAPE_ACCENT[r.key] ?? 'var(--text-primary)';
                    const tie = r.v1 === r.v2;
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-[1fr_auto_1fr] items-center gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "font-mono text-xs text-left",
                                title: r.key === 'schedule' ? qualityTip(f1.scheduleQuality) : undefined,
                                style: {
                                    color: !tie && r.v1 > r.v2 ? accent : 'var(--text-muted)'
                                },
                                children: r.fmt(r.v1)
                            }, void 0, false, {
                                fileName: "[project]/src/app/upcoming/page.tsx",
                                lineNumber: 239,
                                columnNumber: 17
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-[9px] tracking-widest uppercase text-center whitespace-nowrap",
                                style: {
                                    color: 'var(--text-muted)'
                                },
                                children: r.label
                            }, void 0, false, {
                                fileName: "[project]/src/app/upcoming/page.tsx",
                                lineNumber: 246,
                                columnNumber: 17
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "font-mono text-xs text-right",
                                title: r.key === 'schedule' ? qualityTip(f2.scheduleQuality) : undefined,
                                style: {
                                    color: !tie && r.v2 > r.v1 ? accent : 'var(--text-muted)'
                                },
                                children: r.fmt(r.v2)
                            }, void 0, false, {
                                fileName: "[project]/src/app/upcoming/page.tsx",
                                lineNumber: 249,
                                columnNumber: 17
                            }, this)
                        ]
                    }, r.key, true, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 238,
                        columnNumber: 15
                    }, this);
                })
            }, void 0, false, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 233,
                columnNumber: 9
            }, this),
            href && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                href: href,
                className: "mt-3 pt-2.5 w-full text-center text-[11px] hover:underline border-t",
                style: {
                    color: 'var(--text-muted)',
                    borderColor: 'var(--border)'
                },
                children: "Full comparison →"
            }, void 0, false, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 263,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/upcoming/page.tsx",
        lineNumber: 222,
        columnNumber: 5
    }, this);
}
function MainEventBout({ bout }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "rounded-xl overflow-hidden border",
        style: {
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-light)'
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between px-4 py-2 border-b",
                style: {
                    backgroundColor: 'var(--bg-card-hover)',
                    borderColor: 'var(--border)'
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-[10px] tracking-widest uppercase font-medium",
                        style: {
                            color: 'var(--accent-gold)'
                        },
                        children: "★ Main event"
                    }, void 0, false, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 285,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-[10px] tracking-widest uppercase",
                        style: {
                            color: 'var(--text-muted)'
                        },
                        children: [
                            bout.weightClass,
                            " · 5 rounds"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 291,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 281,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_200px_minmax(0,1fr)] items-start",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MainSide, {
                        f: bout.fighter1,
                        align: "left"
                    }, void 0, false, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 296,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(TaleOfTape, {
                        bout: bout
                    }, void 0, false, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 297,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MainSide, {
                        f: bout.fighter2,
                        align: "right"
                    }, void 0, false, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 298,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 295,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ProbabilitySpine, {
                bout: bout
            }, void 0, false, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 300,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/upcoming/page.tsx",
        lineNumber: 277,
        columnNumber: 5
    }, this);
}
function DenseSide({ f, align }) {
    const right = align === 'right';
    const name = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        className: "block truncate font-display text-sm uppercase",
        style: {
            color: 'var(--text-primary)'
        },
        children: f.name
    }, void 0, false, {
        fileName: "[project]/src/app/upcoming/page.tsx",
        lineNumber: 308,
        columnNumber: 5
    }, this);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `flex items-center gap-2 min-w-0 ${right ? 'sm:flex-row-reverse' : ''}`,
        children: [
            f.fighterId ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                href: `/fighter/${f.fighterId}`,
                className: "hover:underline min-w-0",
                children: name
            }, void 0, false, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 315,
                columnNumber: 9
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "min-w-0",
                children: name
            }, void 0, false, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 319,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(RankChip, {
                f: f,
                compact: true
            }, void 0, false, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 321,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$FormPips$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                fights: f.recentFights,
                compact: true
            }, void 0, false, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 322,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/upcoming/page.tsx",
        lineNumber: 313,
        columnNumber: 5
    }, this);
}
function DenseBout({ bout }) {
    const p1 = bout.prob1 != null ? Math.round(bout.prob1 * 100) : null;
    const href = compareHref(bout);
    const pill = p1 != null ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex justify-between font-mono text-[10px] mb-1",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        style: {
                            color: p1 >= 50 ? 'var(--text-primary)' : 'var(--text-muted)'
                        },
                        children: p1
                    }, void 0, false, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 334,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        style: {
                            color: p1 < 50 ? 'var(--text-primary)' : 'var(--text-muted)'
                        },
                        children: 100 - p1
                    }, void 0, false, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 335,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 333,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "relative h-1 rounded-full",
                style: {
                    backgroundColor: 'var(--bg-elevated)'
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "absolute inset-y-0 left-0 rounded-l-full",
                    style: {
                        width: `${p1}%`,
                        backgroundColor: 'var(--accent-red)'
                    }
                }, void 0, false, {
                    fileName: "[project]/src/app/upcoming/page.tsx",
                    lineNumber: 340,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 339,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "text-center font-mono text-[10px]",
        style: {
            color: 'var(--text-muted)'
        },
        children: "—"
    }, void 0, false, {
        fileName: "[project]/src/app/upcoming/page.tsx",
        lineNumber: 347,
        columnNumber: 7
    }, this);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "rounded-lg border px-4 py-2.5",
        style: {
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border)'
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-[10px] tracking-widest uppercase mb-1.5",
                style: {
                    color: 'var(--text-muted)'
                },
                children: [
                    "Bout ",
                    bout.boutOrder,
                    " · ",
                    bout.weightClass
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 356,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(DenseSide, {
                        f: bout.fighter1,
                        align: "left"
                    }, void 0, false, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 360,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: href ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                            href: href,
                            title: "Full comparison",
                            className: "block -mx-2 -my-1 px-2 py-1 rounded-md transition-colors hover:bg-[var(--bg-card-hover)]",
                            children: pill
                        }, void 0, false, {
                            fileName: "[project]/src/app/upcoming/page.tsx",
                            lineNumber: 363,
                            columnNumber: 13
                        }, this) : pill
                    }, void 0, false, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 361,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(DenseSide, {
                        f: bout.fighter2,
                        align: "right"
                    }, void 0, false, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 374,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 359,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/upcoming/page.tsx",
        lineNumber: 352,
        columnNumber: 5
    }, this);
}
function UpcomingPage() {
    const [events, setEvents] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [active, setActive] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(true);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        let cancelled = false;
        (async ()=>{
            try {
                const res = await fetch('/api/upcoming');
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (!cancelled) setEvents(data.events);
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error');
            } finally{
                if (!cancelled) setLoading(false);
            }
        })();
        return ()=>{
            cancelled = true;
        };
    }, []);
    const event = events?.[active];
    const evParts = event ? splitEventName(event.eventName) : null;
    const hero = event ? event.bouts.find((b)=>b.isMainEvent) ?? event.bouts[0] : null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "max-w-5xl mx-auto px-4 py-6 space-y-5",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                        className: "font-display text-3xl sm:text-4xl leading-none",
                        style: {
                            color: 'var(--text-primary)'
                        },
                        children: "UPCOMING"
                    }, void 0, false, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 412,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-xs mt-1.5 max-w-2xl",
                        style: {
                            color: 'var(--text-muted)'
                        },
                        children: "Every announced card, bout by bout in fight order. Each fighter shows our rank and last five results — gold-underlined when the fight was for a belt — with the model's win probability as the spine of every matchup."
                    }, void 0, false, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 415,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 411,
                columnNumber: 7
            }, this),
            loading && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-sm",
                style: {
                    color: 'var(--text-muted)'
                },
                children: "Loading cards…"
            }, void 0, false, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 422,
                columnNumber: 19
            }, this),
            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-sm",
                style: {
                    color: 'var(--accent-red-light)'
                },
                children: [
                    "Failed to load: ",
                    error
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 423,
                columnNumber: 17
            }, this),
            !loading && !error && (!events || events.length === 0) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-sm",
                style: {
                    color: 'var(--text-muted)'
                },
                children: "No upcoming cards announced."
            }, void 0, false, {
                fileName: "[project]/src/app/upcoming/page.tsx",
                lineNumber: 425,
                columnNumber: 9
            }, this),
            events && events.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-wrap gap-2.5 pt-1.5",
                        children: events.map((ev, i)=>{
                            const { title, subtitle } = splitEventName(ev.eventName);
                            const me = ev.bouts.find((b)=>b.isMainEvent) ?? ev.bouts[0];
                            const teaser = subtitle ?? (me ? `${lastName(me.fighter1.name)} vs ${lastName(me.fighter2.name)}` : null);
                            const d = new Date(ev.eventDate + 'T00:00:00');
                            const days = daysUntil(ev.eventDate);
                            const isActive = i === active;
                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: ()=>setActive(i),
                                className: "relative flex items-center gap-3 px-3.5 py-2.5 rounded-lg border text-left transition-colors min-w-0",
                                style: {
                                    backgroundColor: isActive ? 'var(--bg-card)' : 'var(--bg-secondary)',
                                    borderColor: isActive ? 'var(--accent-red)' : 'var(--border)'
                                },
                                children: [
                                    i === 0 && days >= 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "absolute -top-2 left-3 font-mono text-[10px] tracking-wider uppercase px-1.5 py-px rounded-full",
                                        style: {
                                            backgroundColor: 'var(--accent-red)',
                                            color: '#fff'
                                        },
                                        children: days === 0 ? 'Tonight' : days === 1 ? 'Tomorrow' : `Next · ${days} days`
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/upcoming/page.tsx",
                                        lineNumber: 451,
                                        columnNumber: 21
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-center shrink-0",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "font-display text-xl leading-none",
                                                style: {
                                                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)'
                                                },
                                                children: d.getDate()
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/upcoming/page.tsx",
                                                lineNumber: 459,
                                                columnNumber: 21
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "text-[10px] tracking-widest uppercase mt-0.5",
                                                style: {
                                                    color: 'var(--text-muted)'
                                                },
                                                children: d.toLocaleDateString('en-US', {
                                                    month: 'short'
                                                })
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/upcoming/page.tsx",
                                                lineNumber: 465,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/upcoming/page.tsx",
                                        lineNumber: 458,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "min-w-0",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "font-display text-sm uppercase leading-tight truncate",
                                                style: {
                                                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)'
                                                },
                                                children: title
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/upcoming/page.tsx",
                                                lineNumber: 470,
                                                columnNumber: 21
                                            }, this),
                                            teaser && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "text-[11px] truncate",
                                                style: {
                                                    color: isActive ? 'var(--text-secondary)' : 'var(--text-muted)'
                                                },
                                                children: teaser
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/upcoming/page.tsx",
                                                lineNumber: 477,
                                                columnNumber: 23
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "text-[10px] truncate",
                                                style: {
                                                    color: 'var(--text-muted)'
                                                },
                                                children: [
                                                    ev.bouts.length,
                                                    " bouts"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/upcoming/page.tsx",
                                                lineNumber: 484,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/upcoming/page.tsx",
                                        lineNumber: 469,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, ev.eventId ?? ev.eventName, true, {
                                fileName: "[project]/src/app/upcoming/page.tsx",
                                lineNumber: 441,
                                columnNumber: 17
                            }, this);
                        })
                    }, void 0, false, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 430,
                        columnNumber: 11
                    }, this),
                    event && evParts && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "border-b pb-2.5",
                                style: {
                                    borderColor: 'var(--border)'
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "font-display text-2xl leading-none uppercase",
                                                style: {
                                                    color: 'var(--text-primary)'
                                                },
                                                children: [
                                                    evParts.title,
                                                    evParts.subtitle && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        style: {
                                                            color: 'var(--text-secondary)'
                                                        },
                                                        children: [
                                                            " · ",
                                                            evParts.subtitle
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/upcoming/page.tsx",
                                                        lineNumber: 500,
                                                        columnNumber: 23
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/upcoming/page.tsx",
                                                lineNumber: 497,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-[11px]",
                                                style: {
                                                    color: 'var(--text-muted)'
                                                },
                                                children: [
                                                    formatDate(event.eventDate),
                                                    " · ",
                                                    event.bouts.length,
                                                    " bouts"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/upcoming/page.tsx",
                                                lineNumber: 503,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/upcoming/page.tsx",
                                        lineNumber: 496,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "mt-2 flex items-center gap-1.5 text-[10px] tracking-wider uppercase",
                                        style: {
                                            color: 'var(--text-muted)'
                                        },
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                children: "Last 5, newest first ·"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/upcoming/page.tsx",
                                                lineNumber: 511,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "inline-block w-3 h-3 rounded-[3px]",
                                                style: {
                                                    backgroundColor: 'var(--bg-elevated)',
                                                    boxShadow: 'inset 0 -2px 0 0 var(--accent-gold)'
                                                }
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/upcoming/page.tsx",
                                                lineNumber: 512,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                children: "= title fight"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/upcoming/page.tsx",
                                                lineNumber: 519,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/upcoming/page.tsx",
                                        lineNumber: 507,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/upcoming/page.tsx",
                                lineNumber: 495,
                                columnNumber: 15
                            }, this),
                            event.bouts.map((b)=>// boutOrder alone can collide (missing values default to 999).
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: b === hero ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MainEventBout, {
                                        bout: b
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/upcoming/page.tsx",
                                        lineNumber: 525,
                                        columnNumber: 33
                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(DenseBout, {
                                        bout: b
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/upcoming/page.tsx",
                                        lineNumber: 525,
                                        columnNumber: 62
                                    }, this)
                                }, `${b.boutOrder}-${b.fighter1.name}-${b.fighter2.name}`, false, {
                                    fileName: "[project]/src/app/upcoming/page.tsx",
                                    lineNumber: 524,
                                    columnNumber: 17
                                }, this)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$AnalystChat$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                eventName: event.eventName
                            }, void 0, false, {
                                fileName: "[project]/src/app/upcoming/page.tsx",
                                lineNumber: 528,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/upcoming/page.tsx",
                        lineNumber: 494,
                        columnNumber: 13
                    }, this)
                ]
            }, void 0, true)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/upcoming/page.tsx",
        lineNumber: 410,
        columnNumber: 5
    }, this);
}
}),
];

//# sourceMappingURL=src_00o7ww6._.js.map