# FergRank — AI-Powered UFC Rankings

An AI-powered UFC fighter ranking system that ranks the **top 40 fighters per weight class** — not just the official top 15 — purely on in-cage performance. No media votes, no popularity, no promotional bias. The goal: rank deeper and more transparently than the UFC's own rankings, and *show why* for every fighter.

## What it does

- **Top-40 rankings** per division (men's + women's) from a global Elo pool over every UFC fight.
- **Trend vs UFC** — every fighter shows how our rank differs from the official UFC rank (the product's whole thesis).
- **Fighter profiles** — a plain-English "why this rank" score decomposition, attribute radar, and full fight history with per-fight Elo deltas.
- **Live filters** — Era / Finish / Recency / Activity sliders that **re-run the real algorithm** server-side to generate your own ranking.
- **Discovery** — ⌘K fighter search, cross-division P4P, specialty leaderboards, and a two-fighter compare page.

## Run it

```bash
npm install
npm run dev     # http://localhost:3000 (Turbopack)
```

Useful checks:

```bash
npx tsc --noEmit                                  # typecheck
npx eslint src                                    # lint
node_modules/.bin/jiti scripts/validate.ts        # algo validation (needs network for Octagon API)
```

## How it works (short version)

- `src/lib/eloEngine.ts` — **the core**: one chronological sweep over every dated UFC fight → one Elo rating per fighter. Opponent quality, recency, finishes, and weight-class moves are all baked in.
- `src/lib/scoringEngine.ts` — turns Elo into a ranked division via small **bounded** adjustments (metrics, strength-of-schedule, official seed) + head-to-head and champion corrections.
- `src/lib/rankingConfig.ts` — **every** tunable weight/threshold (single source of truth; nothing hardcoded in the engines).
- `src/lib/filters.ts` — maps the user-facing sliders onto Elo-core knobs; neutral position reproduces the house algorithm exactly.

## Docs

| File | What |
|------|------|
| `../CLAUDE.md` | Project brain — architecture, algorithm, build status, phases |
| `../DESIGN_VISION.md` | UI/UX design system + locked decisions |
| `data/SOURCES.md` | Data provenance + external sources + alignment rules |
| `AGENTS.md` | Next.js 16 gotchas — read before writing route/page code |

## Tech

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 · PapaParse · hand-rolled SVG charts. Data is local CSV; the only runtime external call is the Octagon API for official rankings (cached 24h, graceful fallback).
