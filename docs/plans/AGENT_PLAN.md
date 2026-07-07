# Build Plan: Fight-Card Analyst Agent ("Ask the Analyst")

> **Status:** PHASE 1 BUILT 2026-07-02 (build-order steps 1–6 all done; web
> search / odds discourse = phase 2, not started). Live pieces:
> `src/lib/upcomingEnrich.ts` + `src/lib/searchFighters.ts` (shared refactors),
> `src/lib/agent/{tools,systemPrompt}.ts`, `src/app/api/chat/route.ts`,
> `src/components/AnalystChat.tsx` (mounted on `/upcoming`), smoke test at
> `scripts/agent/smokeTools.ts` (jiti; no API key needed). Requires
> `ANTHROPIC_API_KEY` in `ufc-rankings/.env.local`. Originally written 2026-07-02.
> An in-app conversational agent that talks about upcoming fight cards like an
> expert — grounded in this app's own data (Elo, win probs, advanced stats),
> with a conversational "sports friend who's secretly a quant" voice.

## Locked decisions (2026-07-02)

- **Surface:** in-app chat feature (`/api/chat` streaming route + chat UI on `/upcoming`). User-facing.
- **Model:** `claude-sonnet-5` (cost/speed). Opus was considered; Sonnet chosen.
- **Web search / online discourse (odds, narratives):** **PHASE 2.** Ship the
  data-grounded voice first; layer discourse in later. It adds the most
  cost/latency and the least of the "grounded in our data" magic.

---

## 0. Design principles (non-negotiables)

1. **Tool-grounded, not prompt-stuffed.** Claude starts with *zero* fight facts.
   It obtains them only by calling tools that wrap existing lib functions. This
   forces every claim to trace to a real number and keeps context small.
2. **Data is the spine; discourse is the foil** (once phase 2 lands). Odds and
   online takes are things to react to, never inputs to the analysis — same
   firewall the Elo core already enforces.
3. **Display-path only.** The agent reads the same display-only accessors the UI
   uses. It never touches `scoringEngine`/`eloEngine` write paths or `rankingConfig`.

## 1. Dependencies & config

- Add `@anthropic-ai/sdk` to `ufc-rankings/package.json`.
- Add `ANTHROPIC_API_KEY` to `.env.local`. Document it in `data/SOURCES.md` — this
  becomes the **second external runtime call** (alongside the Octagon rankings fetch).
- Model: `claude-sonnet-5`.
- Prompt-cache the static system prompt + tool defs to cut cost.

## 2. Tool layer (`src/lib/agent/tools.ts`)

Each tool is a thin wrapper over a function that already exists. Definitions +
executors together. Return **compact JSON** (ids, numbers, short labels) — strip
avatar URLs, radar SVG coords, presentation cruft. The model reasons on numbers.

| Tool | Wraps | Input | Output (trimmed) |
|------|-------|-------|------------------|
| `list_upcoming_cards` | `getUpcomingCards()` | — | event names + dates + bout counts |
| `get_card` | `getUpcomingCards()` + shared `enrichCard()` | `eventName` | full card: ranks, style, last-5, win-prob spine |
| `get_fighter` | `getFighterProfile(id)` + `getAdvancedStats` | `fighterId` | why-this-rank, radar axes, pace/durability/finish anatomy, form drift |
| `compare_fighters` | `winProbability(getElo a, getElo b)` + `formEloNudge` | `idA, idB` | pure-Elo % + form-shaded %, SoS, key stat deltas |
| `search_fighter` | existing `/api/search` logic | `query` | id + name + division (resolve a mentioned name → id) |
| `web_search` | Anthropic server-side web search | `query` | **PHASE 2 ONLY** — narratives, injury/weigh-in news, betting lines |

**Key refactor:** extract the bout-enrichment block currently inline in
`src/app/api/upcoming/route.ts` into a shared `enrichCard()`
(in `loadUpcoming.ts` or a new `src/lib/upcomingEnrich.ts`). The tool and the
route must call the same function so the agent and the UI never disagree.

## 3. Persona (`src/lib/agent/systemPrompt.ts`)

- **Voice:** conversational, opinionated, concise — "sports friend who's secretly
  a quant." Reuse the tone of `describeStyle` blurbs and "why this rank" copy so
  it sounds like the app.
- **Hard rule:** never state a fight fact not obtained from a tool call. Empty
  knowledge + rich tools makes this structural.
- **Framing habit:** lead with the model's read → (phase 2: name the public
  narrative/line) → explain the gap.
- **Odds discipline (phase 2):** odds are context to argue with, not evidence.
- **Uncertainty honesty:** flag small sample / provisional fighters / stale data,
  same as the profile badges.

## 4. Route (`src/app/api/chat/route.ts`)

- `POST`, streaming (SDK streaming), `runtime = 'nodejs'` (needs the CSV data
  cache — **not** edge).
- **Agentic loop:** send messages + tool defs → on `stop_reason: tool_use`,
  execute tool(s) locally, append `tool_result`, loop → stream final text. Cap at
  ~6–8 tool iterations/turn.
- Data cache (`getData()`) is already memoized per process; tool calls are cheap
  after warm-up.
- Rate-limit; cap max turns (public API-key-backed route).

## 5. UI (`src/components/AnalystChat.tsx`)

- Chat panel on `/upcoming`, pre-seeded with the selected event ("Ask about UFC 300").
- Stream tokens; show a subtle "🔍 checking Prates' last 5…" affordance when a
  tool fires — makes grounding *visible* (trust feature, matches the "show the
  delta" thesis).
- Suggested-prompt chips: "Who's the live dog?", "Talk me through the main event",
  "Where does the line disagree with your model?" (last one = phase 2).

## 6. Build order

1. `enrichCard()` refactor + `list_upcoming_cards` / `get_card` tools → prove
   grounding with a throwaway script.
2. Route + agentic loop + those two tools, no UI, curl-test.
3. Add `get_fighter`, `compare_fighters`, `search_fighter`.
4. Persona system prompt.
5. `AnalystChat` UI + streaming + tool-activity indicator.
6. Wire onto `/upcoming`.
7. **PHASE 2:** web search tool + odds/narrative persona layer + odds discipline.

## 7. Guardrails

- **Cost/abuse:** rate-limit; cap max turns.
- **Freshness:** stats are only as current as CSVs + recency patch; (phase 2 web
  search covers live news). Persona should be clear which is which.
- **Never leak `rankingConfig`** — tools expose outputs, not tunables.
- **Testing:** golden-master-style fixture (saved card + expected tool-call trace)
  so persona/prompt changes don't silently regress grounding.

## Confirmed signatures (for the builder)

- `getUpcomingCards(): UpcomingCard[]` — `src/lib/loadUpcoming.ts:115`
- `getFighterProfile(...)` — `src/lib/fighterProfile.ts:99` (async)
- `getAdvancedStats(...)`, `formEloNudge(...)` — `src/lib/advancedStats.ts`
- `buildEloRatings(data, eng?)` `:255`, `getElo(map, id)` `:305`,
  `winProbability(eloA, eloB)` `:332` — `src/lib/eloEngine.ts`
- Bout enrichment currently inline in `src/app/api/upcoming/route.ts` → extract to `enrichCard()`.
