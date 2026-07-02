(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/components/OddsValue.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>OddsValue
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
// American odds → implied probability. Accepts "-150", "+130", "150".
function americanToImplied(raw) {
    const v = parseFloat(raw.replace(/[^0-9.+-]/g, ''));
    if (!Number.isFinite(v) || v === 0) return null;
    return v > 0 ? 100 / (v + 100) : -v / (-v + 100);
}
const pct = (x)=>`${Math.round(x * 100)}%`;
const signed = (x)=>`${x >= 0 ? '+' : ''}${Math.round(x * 100)}`;
function OddsValue({ modelProbA, nameA, nameB, lowConfidence }) {
    _s();
    const [oddsA, setOddsA] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [oddsB, setOddsB] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const iA = americanToImplied(oddsA);
    const iB = americanToImplied(oddsB);
    const haveBoth = iA != null && iB != null;
    const overround = haveBoth ? iA + iB : null;
    const marketA = haveBoth ? iA / overround : null; // de-vigged (multiplicative)
    const marketB = haveBoth ? iB / overround : null;
    const modelB = 1 - modelProbA;
    const edgeA = marketA != null ? modelProbA - marketA : null;
    let verdict = 'Enter both fighters’ odds to compare the model with the market.';
    let lean = 'none';
    if (edgeA != null) {
        if (edgeA > 0.03) {
            verdict = `Model rates ${nameA} ~${Math.round(edgeA * 100)} pts higher than the market priced.`;
            lean = 'a';
        } else if (edgeA < -0.03) {
            verdict = `Model rates ${nameB} ~${Math.round(-edgeA * 100)} pts higher than the market priced.`;
            lean = 'b';
        } else {
            verdict = 'Model and market broadly agree on this matchup.';
        }
    }
    const inputStyle = {
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
        borderRadius: 6,
        padding: '4px 8px',
        width: 84,
        fontFamily: 'ui-monospace, monospace',
        fontSize: 13,
        textAlign: 'center'
    };
    const leanColor = (who)=>lean === who ? 'var(--accent-green)' : 'var(--text-primary)';
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "rounded-xl p-4",
        style: {
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)'
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-baseline justify-between mb-1",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-sm font-medium",
                        style: {
                            color: 'var(--text-primary)'
                        },
                        children: "Odds value check"
                    }, void 0, false, {
                        fileName: "[project]/src/components/OddsValue.tsx",
                        lineNumber: 59,
                        columnNumber: 9
                    }, this),
                    overround != null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-[10px]",
                        style: {
                            color: 'var(--text-muted)'
                        },
                        children: [
                            "book vig ",
                            Math.round((overround - 1) * 100),
                            "%"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/OddsValue.tsx",
                        lineNumber: 61,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/OddsValue.tsx",
                lineNumber: 58,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-[11px] mb-3",
                style: {
                    color: 'var(--text-muted)'
                },
                children: "Enter the current market line (American odds) for each fighter."
            }, void 0, false, {
                fileName: "[project]/src/components/OddsValue.tsx",
                lineNumber: 64,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid grid-cols-2 gap-3 mb-3",
                children: [
                    {
                        n: nameA,
                        v: oddsA,
                        set: setOddsA
                    },
                    {
                        n: nameB,
                        v: oddsB,
                        set: setOddsB
                    }
                ].map((f, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                        className: "flex items-center justify-between gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-xs truncate",
                                style: {
                                    color: 'var(--text-secondary)'
                                },
                                children: f.n
                            }, void 0, false, {
                                fileName: "[project]/src/components/OddsValue.tsx",
                                lineNumber: 72,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "text",
                                inputMode: "numeric",
                                placeholder: "-150",
                                value: f.v,
                                onChange: (e)=>f.set(e.target.value),
                                style: inputStyle,
                                "aria-label": `${f.n} odds`
                            }, void 0, false, {
                                fileName: "[project]/src/components/OddsValue.tsx",
                                lineNumber: 73,
                                columnNumber: 13
                            }, this)
                        ]
                    }, i, true, {
                        fileName: "[project]/src/components/OddsValue.tsx",
                        lineNumber: 71,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/components/OddsValue.tsx",
                lineNumber: 69,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded-lg overflow-hidden",
                style: {
                    border: '1px solid var(--border)'
                },
                children: [
                    {
                        label: 'Model win %',
                        a: pct(modelProbA),
                        b: pct(modelB),
                        strong: true
                    },
                    {
                        label: 'Market (de-vig)',
                        a: marketA != null ? pct(marketA) : '—',
                        b: marketB != null ? pct(marketB) : '—'
                    },
                    {
                        label: 'Edge (model − mkt)',
                        a: edgeA != null ? `${signed(edgeA)}` : '—',
                        b: edgeA != null ? `${signed(-edgeA)}` : '—',
                        edge: true
                    }
                ].map((r)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-[1fr_auto_1fr] items-center",
                        style: {
                            borderTop: '1px solid var(--border)'
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-right px-3 py-2 font-mono text-sm",
                                style: {
                                    color: r.edge ? leanColor('a') : 'var(--text-primary)',
                                    fontWeight: r.strong ? 600 : 400
                                },
                                children: r.a
                            }, void 0, false, {
                                fileName: "[project]/src/components/OddsValue.tsx",
                                lineNumber: 89,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "px-3 text-[10px] uppercase tracking-wide text-center",
                                style: {
                                    color: 'var(--text-muted)'
                                },
                                children: r.label
                            }, void 0, false, {
                                fileName: "[project]/src/components/OddsValue.tsx",
                                lineNumber: 90,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-left px-3 py-2 font-mono text-sm",
                                style: {
                                    color: r.edge ? leanColor('b') : 'var(--text-primary)',
                                    fontWeight: r.strong ? 600 : 400
                                },
                                children: r.b
                            }, void 0, false, {
                                fileName: "[project]/src/components/OddsValue.tsx",
                                lineNumber: 91,
                                columnNumber: 13
                            }, this)
                        ]
                    }, r.label, true, {
                        fileName: "[project]/src/components/OddsValue.tsx",
                        lineNumber: 88,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/components/OddsValue.tsx",
                lineNumber: 82,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mt-3 text-xs",
                style: {
                    color: lean === 'none' ? 'var(--text-secondary)' : 'var(--accent-green)'
                },
                children: verdict
            }, void 0, false, {
                fileName: "[project]/src/components/OddsValue.tsx",
                lineNumber: 97,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mt-1 text-[10px] leading-snug",
                style: {
                    color: 'var(--text-muted)'
                },
                children: "The model matches the market on accuracy but does not beat sharp closing lines. Treat a gap as a place to dig, not an automatic bet — it’s most meaningful against early/soft lines."
            }, void 0, false, {
                fileName: "[project]/src/components/OddsValue.tsx",
                lineNumber: 98,
                columnNumber: 7
            }, this),
            lowConfidence && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mt-1.5 text-[10px] leading-snug",
                style: {
                    color: 'var(--accent-gold)'
                },
                children: "★ Prospect — a fighter here has ≤3 UFC fights, so the model’s edge is on a thin sample and less reliable."
            }, void 0, false, {
                fileName: "[project]/src/components/OddsValue.tsx",
                lineNumber: 102,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/OddsValue.tsx",
        lineNumber: 57,
        columnNumber: 5
    }, this);
}
_s(OddsValue, "NfaYYwSyYEab4y5GAC0fJI8lrTw=");
_c = OddsValue;
var _c;
__turbopack_context__.k.register(_c, "OddsValue");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/ComparePicker.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ComparePicker
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
function ComparePicker({ slot, selectedName, a, b }) {
    _s();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [query, setQuery] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [hits, setHits] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const boxRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ComparePicker.useEffect": ()=>{
            const q = query.trim();
            let cancelled = false;
            const t = setTimeout({
                "ComparePicker.useEffect.t": async ()=>{
                    if (q.length < 2) {
                        setHits([]);
                        return;
                    }
                    try {
                        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
                        const data = await res.json();
                        if (!cancelled) setHits(data.hits || []);
                    } catch  {
                        if (!cancelled) setHits([]);
                    }
                }
            }["ComparePicker.useEffect.t"], 160);
            return ({
                "ComparePicker.useEffect": ()=>{
                    cancelled = true;
                    clearTimeout(t);
                }
            })["ComparePicker.useEffect"];
        }
    }["ComparePicker.useEffect"], [
        query
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ComparePicker.useEffect": ()=>{
            const onDocClick = {
                "ComparePicker.useEffect.onDocClick": (e)=>{
                    if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
                }
            }["ComparePicker.useEffect.onDocClick"];
            document.addEventListener('mousedown', onDocClick);
            return ({
                "ComparePicker.useEffect": ()=>document.removeEventListener('mousedown', onDocClick)
            })["ComparePicker.useEffect"];
        }
    }["ComparePicker.useEffect"], []);
    const pick = (hit)=>{
        const aId = slot === 'a' ? hit.fighterId : a;
        const bId = slot === 'b' ? hit.fighterId : b;
        const params = new URLSearchParams();
        if (aId) params.set('a', aId);
        if (bId) params.set('b', bId);
        setOpen(false);
        setQuery('');
        router.push(`/compare?${params.toString()}`);
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: boxRef,
        className: "relative flex-1 min-w-0",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: ()=>setOpen((o)=>!o),
                className: "w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-left",
                style: {
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-light)'
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-sm truncate",
                        style: {
                            color: selectedName ? 'var(--text-primary)' : 'var(--text-muted)'
                        },
                        children: selectedName || `Pick fighter ${slot.toUpperCase()}…`
                    }, void 0, false, {
                        fileName: "[project]/src/components/ComparePicker.tsx",
                        lineNumber: 72,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        "aria-hidden": true,
                        style: {
                            color: 'var(--text-muted)'
                        },
                        children: "⌕"
                    }, void 0, false, {
                        fileName: "[project]/src/components/ComparePicker.tsx",
                        lineNumber: 75,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/ComparePicker.tsx",
                lineNumber: 66,
                columnNumber: 7
            }, this),
            open && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute z-50 mt-1 w-full rounded-lg overflow-hidden",
                style: {
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-light)'
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                        autoFocus: true,
                        value: query,
                        onChange: (e)=>setQuery(e.target.value),
                        placeholder: "Search…",
                        className: "w-full bg-transparent outline-none text-sm px-3 py-2.5",
                        style: {
                            color: 'var(--text-primary)',
                            borderBottom: '1px solid var(--border)'
                        }
                    }, void 0, false, {
                        fileName: "[project]/src/components/ComparePicker.tsx",
                        lineNumber: 83,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "max-h-60 overflow-y-auto",
                        children: [
                            hits.map((hit)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>pick(hit),
                                    className: "w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[var(--bg-card-hover)]",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-sm truncate",
                                            style: {
                                                color: 'var(--text-primary)'
                                            },
                                            children: hit.fullName
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/ComparePicker.tsx",
                                            lineNumber: 99,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-xs font-mono shrink-0",
                                            style: {
                                                color: 'var(--text-muted)'
                                            },
                                            children: hit.record
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/ComparePicker.tsx",
                                            lineNumber: 102,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, hit.fighterId, true, {
                                    fileName: "[project]/src/components/ComparePicker.tsx",
                                    lineNumber: 93,
                                    columnNumber: 15
                                }, this)),
                            query.trim().length >= 2 && hits.length === 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "px-3 py-3 text-xs",
                                style: {
                                    color: 'var(--text-muted)'
                                },
                                children: "No matches."
                            }, void 0, false, {
                                fileName: "[project]/src/components/ComparePicker.tsx",
                                lineNumber: 108,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/ComparePicker.tsx",
                        lineNumber: 91,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/ComparePicker.tsx",
                lineNumber: 79,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/ComparePicker.tsx",
        lineNumber: 65,
        columnNumber: 5
    }, this);
}
_s(ComparePicker, "r9nHZnONq6e38KzVf/Mpxd6Rhl0=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"]
    ];
});
_c = ComparePicker;
var _c;
__turbopack_context__.k.register(_c, "ComparePicker");
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
]);

//# sourceMappingURL=src_1kknglh._.js.map