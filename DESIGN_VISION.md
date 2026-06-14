# UFC AI Rankings — UI/UX Design Vision

> Status: **largely BUILT** (2026-06-13). Direction: **bolder & editorial** · photo + flag placeholders (no nationality source yet). The homepage, profile, search, filters, P4P, leaderboards, and compare are all live — see §1 and `CLAUDE.md` → "Current Build Status". This doc remains the source of truth for visual decisions; the still-open items are in §9.
> Companion to `CLAUDE.md` (product/algorithm brain) and `data/SOURCES.md` (data provenance).

---

## 0. Design thesis

The product's one true claim: **"We rank deeper and more honestly than the UFC's official top 15."** Every design decision should make that claim *visible and undeniable*. The hero stat of the whole app is not a fighter's score — it's the **delta between our rank and the UFC's official rank**. If a user can't see "we have this guy 6 spots higher and here's why" within two seconds, the design has failed.

Tone: **editorial sports authority**, not fantasy-app gamification. Think The Athletic / ESPN feature page crossed with a Bloomberg terminal — confident typography, generous negative space, data that breathes. Dark, heavy, decisive. The UFC is theatrical; our differentiator is that we are *rigorous*. The design should feel like a verdict.

---

## 1. Build state (what shipped)

This section originally described a one-screen placeholder. That redesign is **done**. As of 2026-06-13 the app has:
- **Homepage** — `SiteHeader` nav + ⌘K search · Men/Women toggle + division tabs · `FilterBar` (live re-rank) · `ChampionHero` (gold `C`) · `RankingTable` of dense `FighterCard` rows with **trend-vs-UFC chips** and semantic stat colours.
- **Fighter profile** (`/fighter/[id]`) — hero with our-rank-vs-UFC delta · **"why this rank"** decomposition (leads) · `ProfileRadar` · fight history with per-fight Elo deltas · snapshot · community stub.
- **Discovery** — `/p4p`, `/leaderboards`, `/compare` (with `ComparePicker`).
- **Type** wired: Oswald display, Geist Sans/Mono. Colour tokens in `globals.css`.

What remains is in §9 (open) and `CLAUDE.md` phases (community layer, rank-history sparkline, real photos/flags, division heatmap, prospect UI).

---

## 2. Visual language (bolder / editorial)

### 2.1 Colour system
Keep the existing dark foundation; formalize accent *meaning* (today colours are picked ad hoc per stat).

| Token | Value | Role |
|-------|-------|------|
| `--bg-primary` | `#13131a` | canvas (keep — dark grey, not pure black) |
| `--bg-secondary` | `#1a1a24` | rails, headers |
| `--bg-card` | `#1e1e2a` | fighter rows, cards |
| `--bg-elevated` | `#2a2a3a` | hover, toggles, score-bar track |
| `--accent-red` `#D20A0A` | UFC brand red | **scarce** — champion + top-5 + primary CTA only |
| `--accent-gold` `#d4a843` | champion / belt | gold = title. Never used for anything else. |
| `--text-primary` `#f0f0f5` / `--text-secondary` `#a0a0b5` / `--text-muted` `#6a6a80` | type ramp |

**Semantic stat colours — formalize and enforce:**
- **Red family** → striking & finishing (KO%, finish rate, strike volume)
- **Blue family** → grappling & schedule (TD, control, SoS)
- **Green family** → efficiency & accuracy (sig-strike %, defense)
- **Trend up** = `#2dd47e` green ↑ · **trend down** = `#ff5a5a` red ↓ (vs UFC official)

This consistency is itself the "data-forward" feel — a user learns "blue = wrestling" once and reads every card faster.

### 2.2 Typography (the editorial lever)
The biggest cheap win toward "bolder." Today everything is ~12–15px uniform.

**LOCKED (2026-06-13):** Display face = **Oswald** (condensed grotesque, weights 500/600/700) for division banners + rank numerals. Body/UI stays **Geist Sans** (already wired via `--font-geist-sans`). All numeric stats stay **Geist Mono** tabular. Oswald chosen over Bebas Neue / Anton for mixed-case versatility — it works at banner size *and* on small labels and long division names.

- **Display / division headers**: Oswald 600/700, large, tight. Division name set big (40–56px) as a page banner.
- **Rank numerals**: Oswald 700, oversized, the visual anchor of each row. A `#1` should read like a jersey number.
- **Numeric data** in a mono/tabular face so columns align and scores feel instrument-read.
- **Restraint elsewhere**: body and labels stay small, quiet, uppercase-tracked micro-labels (`SOS`, `FINISH`). Contrast of huge-numeral vs tiny-label *is* the editorial signature.
- Two weights only in body UI (regular + medium); reserve heavy weight for display.

### 2.3 Imagery (placeholders this pass)
Designed as first-class per CLAUDE.md, but **rendered as placeholders now**:
- **Fighter portrait**: circular avatar, neutral `#2a2a3a` fill + initials. Champion gets a thin gold ring. Slot sized so a real cut-out portrait drops in later with zero layout change.
- **Country flag**: small emoji-flag inline beside the name as the placeholder; swap to proper flag assets later.
- Profile page reserves a **wide hero band** for an eventual full-bleed action shot (greyed gradient placeholder for now).

### 2.4 Motion (sparing)
Score bars fill on load (already implemented). Row hover lifts/tints (already implemented). Add: rank-number count-up on filter re-run, and a subtle highlight pulse on rows that *moved* when a filter changes. Nothing decorative beyond that.

---

## 3. Information architecture / navigation

Persistent **top nav**: `logo · Rankings · P4P · Leaderboards · Compare · [⌘K fighter search]`.

Global **fighter search** is the most important missing primitive — every drill-down, comparison, and profile link depends on "find a fighter." Build it as a command-palette-style overlay (`⌘K`).

### Page map
1. **Rankings** (home) — three-column: left rail (gender + division list + filters), center list, champion hero pinned above #1. *(skeleton exists)*
2. **Fighter profile** `/fighter/[id]` — the highest-value unbuilt page. See §5.
3. **Compare** — two fighters in a division, side-by-side metric breakdown.
4. **P4P** — cross-division, depth-normalized.
5. **Leaderboards** — Strikers / Wrestlers / Submission aces / Finishers / Iron chin.
6. **Prospect watchlist** — 1–2 UFC-fight fighters trending on metrics (not yet ranked).

---

## 4. The Rankings page (home) — detailed

**LOCKED (2026-06-13):** full-width **single-column** layout (no left rail). Vertical stack:
`top nav → division tabs + Men/Women toggle → horizontal filter bar → champion hero → dense rows`.
List layout = **pure dense rows** (every rank the same scannable row). Filters = **top filter bar**.

**Division + gender selector** (replaces the old left rail)
- Men / Women segmented toggle + division tabs across the top. Keep full names where width allows; codes (HW/LHW) only as a fallback on narrow screens.

**Horizontal filter bar** (Phase 4, live re-rank) — sits directly below the division tabs, above the list.
- Era cutoff · Finish weight · Recency weight · Activity weight, laid out horizontally. Compact slider/stepper controls. A `vs UFC official` toggle, a rich-rows/dense-table view toggle, and a "reset to default algorithm" link live in this bar too.

**The list**
- Big division banner header (Oswald) + "40 ranked · updated {date}".
- **Champion hero card** — gold-bordered, pinned above the list, `C` badge (never `#1`), bigger portrait, headline stats. Matches the "champions sit above, not as #1" memory.
- **Ranked rows #1–40, pure dense rows.** Each row: oversized Oswald rank numeral · portrait · name + nickname + flag · **trend chip (↑↓ vs UFC official)** · record · 2–3 semantic stat columns · SoS · score + bar.
- **Rows 16–40 reveal the metrics-differentiator column** (volume strike differential etc.) — this is where the "deeper than top 15" claim lives, so the data that separates mid-tier fighters gets visible real estate exactly where it matters.
- Click any row → fighter profile.

**The trend chip is non-negotiable.** We already compute each fighter's official UFC rank. Showing "↑6 vs UFC" (or "unranked by UFC, we have them #12") on every row is the product's entire thesis made visible. It is currently invisible — fix first in any homepage pass.

---

## 5. Fighter profile `/fighter/[id]` — highest-value unbuilt page

The drill-down that proves the algorithm is transparent, not a black box.

**Hero band** — full-width, greyed placeholder for action shot. Overlaid: portrait, name, nickname, flag, division, record, current rank + champion badge, and the **big "our rank vs UFC official" callout**.

**LOCKED (2026-06-13):** module order below the hero = **"Why this rank" first** (plain-English + score-decomposition bar), then radar, then fight history, then rank timeline, then community stub. The transparency argument leads; everything else supports it.

**Data zone (algorithm, read-only):**
- **"Why this rank" — plain English.** The flagship feature, top billing. Render the score decomposition (`eloRating + metricsBonus + sosNudge + officialBonus`) as a sentence-form explanation + a small stacked bar: *"1742 Elo (beat #1 and the champ) + 18 metrics (high strike volume) + 11 SoS nudge (tough schedule)."* This is what no other ranking site does.
- **Radar chart** — Striking / Control / Finishing / Activity / Opponent quality. (Recharts, already in stack.)
- **Fight history** — chronological, each fight showing opponent (with *their* rank), result + method, and the **per-fight Elo delta** (`+23 ↑` for beating a strong opponent). Makes "opponent quality IS the rating" legible.
- **Rank-history timeline** — our rank over time (sparkline/line).
- **Head-to-head launcher** — "compare with…" → Compare page.

**Community zone** (Phase 3, stubbed visually now): comments, Overranked/About-right/Underranked confidence vote shown *beside* the algorithmic rank, never replacing it. Architecturally separate — community never touches the algorithm.

---

## 6. Filters (user-facing differentiator, Phase 4)

Sliders in the left rail that **re-run the ranking live** and animate the reorder:
- **Era** — only count fights from a chosen year onward.
- **Finish weight** — how much finishing matters to *you*.
- **Recency weight** — last-12-months vs full career.
- **Activity weight** — how hard inactivity is penalized.
- **vs UFC official** overlay toggle — show official rank inline so disagreements pop.

These let a user *generate their own ranking* — a sharable artifact and the main reason to return. The default position of every slider = the tuned house algorithm.

---

## 7. Specialty / discovery surfaces (Phase 2 & 5)

- **P4P** — cross-division leaderboard, normalized by division depth.
- **Division heatmap** — which divisions are deep vs shallow (one glance).
- **Leaderboards** — Strikers (strike diff + KD + distance%), Wrestlers (TD diff + control + subs), Submission aces, Finishers, Iron chin (low absorption).
- **Prospect watchlist** — sub-3-fight fighters trending on metrics, with a "slept on" tag for ranked-20–40 fighters with high community confidence.
- **All-time** — algorithm run on historical snapshots (2010/2015/2018/2020).

---

## 8. Responsive / mobile

Mobile-first per CLAUDE.md. Left rail collapses to a horizontal division scroller + a filter drawer. Rows simplify to: rank · portrait · name+flag · trend chip · score. The dropped stat columns reappear on the profile page, not crammed into the row. Champion hero stays full-width and prominent.

---

## 9. Open design questions

**Resolved 2026-06-13:**
- ~~Row vs hybrid layout~~ → **pure dense rows.**
- ~~Display type~~ → **Oswald** (display) + Geist Sans (body) + Geist Mono (numeric).
- ~~Filter presentation~~ → **top horizontal filter bar**, full-width single-column page.
- ~~"Why this rank" placement~~ → **top billing** on the profile, directly below hero.
- ~~"Why this rank" format~~ → **both** sentence + stacked decomposition bar (see §5 mockup).

**Still open:**
1. **How loud is the red?** Editorial-bold could mean more red, or *less* red + more typographic contrast. Lean: less red, bigger type.
2. **Trend chip math** — show numeric delta (`↑6`) only, or also a small label ("we rank higher")?
3. Real **fighter photo + flag source** — deferred, but decide before the profile hero ships.
4. **Dense-table view** — the alternate view toggle: exact columns and whether it's a real Phase-1 deliverable or later.

---

## 10. Build order — ✅ all shipped

1. ✅ Global fighter **search** (`⌘K`).
2. ✅ **Trend-vs-official chip** on every row.
3. ✅ **Fighter profile page** + "Why this rank".
4. ✅ Homepage **editorial redesign** (Oswald, champion hero, dense rows, top filter bar).
5. ✅ **Filter bar** (live server-side re-rank).
6. ✅ Compare → P4P → Leaderboards.

**Next design work** (not yet built): rank-history sparkline on the profile, real photos/flags (needs a nationality source — `data/SOURCES.md` §5), division heatmap, prospect watchlist UI, and the Phase-3 community layer. Resolve the §9 open items (red intensity, trend-chip wording, dense-table view) as they come up.
