(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/components/SearchTrigger.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>SearchTrigger
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
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
function SearchTrigger() {
    _s();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [query, setQuery] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [hits, setHits] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [active, setActive] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const inputRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    // Global ⌘K / Ctrl+K to open, Esc to close.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "SearchTrigger.useEffect": ()=>{
            const onKey = {
                "SearchTrigger.useEffect.onKey": (e)=>{
                    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                        e.preventDefault();
                        setOpen({
                            "SearchTrigger.useEffect.onKey": (o)=>!o
                        }["SearchTrigger.useEffect.onKey"]);
                    } else if (e.key === 'Escape') {
                        setOpen(false);
                    }
                }
            }["SearchTrigger.useEffect.onKey"];
            window.addEventListener('keydown', onKey);
            return ({
                "SearchTrigger.useEffect": ()=>window.removeEventListener('keydown', onKey)
            })["SearchTrigger.useEffect"];
        }
    }["SearchTrigger.useEffect"], []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "SearchTrigger.useEffect": ()=>{
            const id = setTimeout({
                "SearchTrigger.useEffect.id": ()=>{
                    if (open) {
                        inputRef.current?.focus();
                    } else {
                        setQuery('');
                        setHits([]);
                        setActive(0);
                    }
                }
            }["SearchTrigger.useEffect.id"], open ? 20 : 0);
            return ({
                "SearchTrigger.useEffect": ()=>clearTimeout(id)
            })["SearchTrigger.useEffect"];
        }
    }["SearchTrigger.useEffect"], [
        open
    ]);
    // Debounced search. All setState lives inside the timeout callback so the
    // effect body itself never sets state synchronously.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "SearchTrigger.useEffect": ()=>{
            const q = query.trim();
            let cancelled = false;
            const t = setTimeout({
                "SearchTrigger.useEffect.t": async ()=>{
                    if (q.length < 2) {
                        setHits([]);
                        setLoading(false);
                        return;
                    }
                    setLoading(true);
                    try {
                        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
                        const data = await res.json();
                        if (!cancelled) {
                            setHits(data.hits || []);
                            setActive(0);
                        }
                    } catch  {
                        if (!cancelled) setHits([]);
                    } finally{
                        if (!cancelled) setLoading(false);
                    }
                }
            }["SearchTrigger.useEffect.t"], q.length < 2 ? 0 : 160);
            return ({
                "SearchTrigger.useEffect": ()=>{
                    cancelled = true;
                    clearTimeout(t);
                }
            })["SearchTrigger.useEffect"];
        }
    }["SearchTrigger.useEffect"], [
        query
    ]);
    const go = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "SearchTrigger.useCallback[go]": (hit)=>{
            setOpen(false);
            const d = hit.division ? `?d=${encodeURIComponent(hit.division)}` : '';
            router.push(`/fighter/${hit.fighterId}${d}`);
        }
    }["SearchTrigger.useCallback[go]"], [
        router
    ]);
    const onInputKey = (e)=>{
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a)=>Math.min(a + 1, hits.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a)=>Math.max(a - 1, 0));
        } else if (e.key === 'Enter' && hits[active]) {
            e.preventDefault();
            go(hits[active]);
        }
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: ()=>setOpen(true),
                className: "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs shrink-0",
                style: {
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-muted)'
                },
                "aria-label": "Search fighters",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        "aria-hidden": true,
                        children: "⌕"
                    }, void 0, false, {
                        fileName: "[project]/src/components/SearchTrigger.tsx",
                        lineNumber: 111,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "hidden md:inline",
                        children: "Search fighters"
                    }, void 0, false, {
                        fileName: "[project]/src/components/SearchTrigger.tsx",
                        lineNumber: 112,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "hidden md:inline font-mono text-[10px] px-1 rounded",
                        style: {
                            backgroundColor: 'var(--bg-elevated)'
                        },
                        children: "⌘K"
                    }, void 0, false, {
                        fileName: "[project]/src/components/SearchTrigger.tsx",
                        lineNumber: 113,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/SearchTrigger.tsx",
                lineNumber: 104,
                columnNumber: 7
            }, this),
            open && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]",
                style: {
                    backgroundColor: 'rgba(0,0,0,0.6)'
                },
                onClick: ()=>setOpen(false),
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "w-full max-w-xl rounded-xl overflow-hidden",
                    style: {
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-light)'
                    },
                    onClick: (e)=>e.stopPropagation(),
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center gap-3 px-4 py-3",
                            style: {
                                borderBottom: '1px solid var(--border)'
                            },
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    "aria-hidden": true,
                                    style: {
                                        color: 'var(--text-muted)'
                                    },
                                    children: "⌕"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/SearchTrigger.tsx",
                                    lineNumber: 130,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    ref: inputRef,
                                    value: query,
                                    onChange: (e)=>setQuery(e.target.value),
                                    onKeyDown: onInputKey,
                                    placeholder: "Search any fighter…",
                                    className: "flex-1 bg-transparent outline-none text-sm",
                                    style: {
                                        color: 'var(--text-primary)'
                                    }
                                }, void 0, false, {
                                    fileName: "[project]/src/components/SearchTrigger.tsx",
                                    lineNumber: 131,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("kbd", {
                                    className: "text-[10px] px-1.5 py-0.5 rounded font-mono",
                                    style: {
                                        backgroundColor: 'var(--bg-elevated)',
                                        color: 'var(--text-muted)'
                                    },
                                    children: "ESC"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/SearchTrigger.tsx",
                                    lineNumber: 140,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/SearchTrigger.tsx",
                            lineNumber: 129,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "max-h-[50vh] overflow-y-auto py-1",
                            children: query.trim().length < 2 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "px-4 py-6 text-xs text-center",
                                style: {
                                    color: 'var(--text-muted)'
                                },
                                children: [
                                    "Type a name to search all ",
                                    '',
                                    "fighters in the dataset."
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/SearchTrigger.tsx",
                                lineNumber: 147,
                                columnNumber: 17
                            }, this) : loading && hits.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "px-4 py-6 text-xs text-center",
                                style: {
                                    color: 'var(--text-muted)'
                                },
                                children: "Searching…"
                            }, void 0, false, {
                                fileName: "[project]/src/components/SearchTrigger.tsx",
                                lineNumber: 151,
                                columnNumber: 17
                            }, this) : hits.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "px-4 py-6 text-xs text-center",
                                style: {
                                    color: 'var(--text-muted)'
                                },
                                children: [
                                    'No fighters match "',
                                    query,
                                    '".'
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/SearchTrigger.tsx",
                                lineNumber: 155,
                                columnNumber: 17
                            }, this) : hits.map((hit, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>go(hit),
                                    onMouseEnter: ()=>setActive(i),
                                    className: "w-full flex items-center gap-3 px-4 py-2.5 text-left",
                                    style: {
                                        backgroundColor: i === active ? 'var(--bg-card-hover)' : 'transparent'
                                    },
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex-1 min-w-0",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-sm truncate",
                                                    style: {
                                                        color: 'var(--text-primary)'
                                                    },
                                                    children: [
                                                        hit.fullName,
                                                        hit.nickname && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "ml-2 text-xs",
                                                            style: {
                                                                color: 'var(--text-muted)'
                                                            },
                                                            children: [
                                                                '"',
                                                                hit.nickname,
                                                                '"'
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/SearchTrigger.tsx",
                                                            lineNumber: 172,
                                                            columnNumber: 27
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/SearchTrigger.tsx",
                                                    lineNumber: 169,
                                                    columnNumber: 23
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-xs font-mono",
                                                    style: {
                                                        color: 'var(--text-muted)'
                                                    },
                                                    children: [
                                                        hit.record,
                                                        " · ",
                                                        hit.fightCount,
                                                        " UFC"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/SearchTrigger.tsx",
                                                    lineNumber: 177,
                                                    columnNumber: 23
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/SearchTrigger.tsx",
                                            lineNumber: 168,
                                            columnNumber: 21
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0",
                                            style: {
                                                backgroundColor: 'var(--bg-elevated)',
                                                color: 'var(--text-secondary)'
                                            },
                                            children: DIVISION_SHORT[hit.weightClass] || hit.weightClass || '—'
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/SearchTrigger.tsx",
                                            lineNumber: 181,
                                            columnNumber: 21
                                        }, this)
                                    ]
                                }, hit.fighterId, true, {
                                    fileName: "[project]/src/components/SearchTrigger.tsx",
                                    lineNumber: 160,
                                    columnNumber: 19
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/src/components/SearchTrigger.tsx",
                            lineNumber: 145,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/SearchTrigger.tsx",
                    lineNumber: 124,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/SearchTrigger.tsx",
                lineNumber: 119,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true);
}
_s(SearchTrigger, "P+bmNYqsH3j8JCf099vl+dolFn8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"]
    ];
});
_c = SearchTrigger;
var _c;
__turbopack_context__.k.register(_c, "SearchTrigger");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_components_SearchTrigger_tsx_0x-62ge._.js.map