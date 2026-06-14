# `research/` — Closing Odds × Elo (firewalled research zone)

This folder is a **completely separate area** from the ranking product. It exists
so betting odds can be studied retrospectively (informing future bets / past
research) **without ever touching the Elo or the rankings**.

## The one rule

```
src/lib (Elo, names, data)  ─┐
research/loadOdds (odds)    ─┴──►  research/oddsVsElo  ──►  analysis output
```

**The arrow only ever points one way: `research/ → src/lib`.**

- `src/lib/eloEngine.ts` and `src/lib/scoringEngine.ts` **never import anything
  in this folder, and never import odds.** Verified:
  `grep -rniE "odds|research/" src/lib/` returns nothing.
- Odds are **read alongside** Elo here, never fed back into a rating. The Elo
  numbers used are the exact `ratingBefore` / `opponentRating` the engine already
  computed in its per-fight trace — observed, not modified.
- **Delete this entire folder and the rankings are byte-identical.** That is the
  test of whether the firewall holds. Nothing in the product depends on it.

If you ever find yourself wanting an `oddsBonus` in `rankingConfig.ts` or an odds
import in the engine — stop. That breaks the whole point. Odds inform *your*
research, not the algorithm.

## Files

| File | Role | Network? |
|------|------|----------|
| `oddsTypes.ts` | Types for this zone (separate from `src/lib/types.ts`) | — |
| `fetchClosingOdds.ts` | Download + normalise odds → `data/closing_odds.csv` | **yes** (only call) |
| `loadOdds.ts` | Read `data/closing_odds.csv` → `ClosingOdds[]` (returns `[]` if absent) | — |
| `oddsVsElo.ts` | The join: closing line ↔ pre-fight Elo probability | — |
| `runOddsVsElo.ts` | Print the research summary + top value spots | — |
| `auditOdds.ts` | Name/date match-rate audit (run after every fetch) | — |

## Run order

```bash
# 1. ingest (or refresh) the odds — writes data/closing_odds.csv
node_modules/.bin/jiti research/fetchClosingOdds.ts

# 2. audit the join — what % of odds rows matched an Elo bout, and the misses
node_modules/.bin/jiti research/auditOdds.ts

# 3. the research summary — Elo vs the closing line
node_modules/.bin/jiti research/runOddsVsElo.ts
```

## Backtest layer (`research/backtest/`)

Turns the join into a *measured* model. The one rule that matters: **every
prediction goes through `pointInTime.ts`**, which uses each fighter's
`ratingBefore` from the engine trace — never the current regressed rating (that
would be look-ahead leakage).

| File | Role |
|------|------|
| `pointInTime.ts` | THE predictor — pre-fight P(fav) for any engine config + segmentation tags; `joinOddsToPredictions` is the canonical join |
| `devig.ts` | multiplicative / power / shin de-vig (FLB correction) |
| `metrics.ts` | log-loss, Brier, accuracy, reliability/ECE, IRLS logistic (for blends) |
| `coverage.ts` | match rate by year + matched bouts by division (missingness audit) |
| `runBacktest.ts` | **ENTRY** — Elo (raw + calibrated) vs market vs blend, by segment |

One additive engine accessor enables this: `buildEloWithTraces(data, engine)` in
`src/lib/eloEngine.ts` returns per-fight traces for *any* config (verified
byte-identical to the production path). It does not change any rating.

```bash
node_modules/.bin/jiti research/backtest/runBacktest.ts   # accuracy report
node_modules/.bin/jiti research/backtest/coverage.ts      # coverage only
```

**First finding (2026-06-13):** raw Elo is overconfident (Platt slope ≈0.68);
calibrated Elo matches the market on accuracy (67%) but a blend(Elo, market)
gives Elo a *negative* weight — i.e. Elo does not beat the closing line on the
broad sample. See `memory/project_backtest_findings.md`.

## Data source

`data/closing_odds.csv` is normalised from
[`jansen88/ufc-data` → `cleaned_odds.csv`](https://github.com/jansen88/ufc-data)
— decimal closing/consensus odds (betmma.tips lineage), **~Nov 2014 → Dec 2023**,
one row per fight. To change source, edit only `fetchClosingOdds.ts` (same
"one external source, one file" rule the project uses for the Octagon API).

Schema of `data/closing_odds.csv`:
`date, event, favourite, underdog, favourite_odds, underdog_odds, outcome`
(`favourite` always has the lower decimal odds; `outcome` is `favourite` /
`underdog` = who actually won.)

## Known limitations / next steps

- **Coverage gap**: source ends Dec 2023; no 2024–2026 odds. Fine for
  retrospective work. To extend, add a BestFightOdds scraper as a *second*
  source inside `fetchClosingOdds.ts` (still write the same normalised CSV).
- **Name match ≈97%**: the odds feed names fighters differently from the CSV
  (abbreviations, transliterations, name-order flips, married names). Those are
  bridged by `oddsNameOverrides.ts` — a research-zone alias map, kept OUT of
  `src/lib/nameResolver.ts` so the engine's resolution is untouched. The ~3%
  still unmatched are fighters genuinely absent from our CSV or too ambiguous to
  map safely. `auditOdds.ts` lists them; add new safe aliases to
  `oddsNameOverrides.ts` (same-human only — a shared last name is not enough).
- **Consensus, not per-book close**: these are aggregated closing odds, not a
  specific book's true closing line. Good enough for edge research; swap to
  BestFightOdds per-book data if you need book-level granularity later.
