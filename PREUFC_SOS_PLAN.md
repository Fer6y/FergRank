# Workstream B — Deeper Pre-UFC Strength of Schedule

> **Type:** implementation spec for a fresh agent session.
> **Parent:** `PROSPECT_PEDIGREE_PLAN.md` (motivation + firewall rules).
> **Sibling:** `PROMOTION_GRADING_PLAN.md` (Workstream A). A grades the
> *promotion* a fighter came from; B grades the *opponents* they beat. Both feed
> the same bounded `pedigreeStrength`. Independent — either can ship first.
> **Prepared:** 2026-07-03.

---

## 0. Cold-start orientation (read these first, in order)

1. `PROSPECT_PEDIGREE_PLAN.md` §1 — why: the closing-line backtest shows our
   accuracy gap vs the market widens on newcomers; pre-UFC signal is the lever.
2. `src/lib/pedigreeSeed.ts` — the current seed. Note `PedigreeInfo` and the
   `strength = winRate × confidence × topTierMult` calc you are extending.
3. `src/lib/eloEngine.ts` — the UFC Elo core. Study `buildEloWithTraces`,
   `getElo`, `winProbability`, and the K-factor / expected-score math. B.2
   *mirrors this in a separate pool* — reuse the math, not the data.
4. `scripts/sherdog/buildContext.ts` — how `sherdog_fights.csv` (the pre-UFC
   graph) is produced; the columns you'll join on.
5. `CLAUDE.md` §5 + THE ALGORITHM §1 — the pedigree guarantees + the Elo model.

**The firewall (non-negotiable):** the pre-UFC rating pool is **entirely
separate** from the UFC Elo pool — it never writes to a UFC rating, never enters
`buildEloRatings`/`buildEloWithTraces`, and only informs the bounded,
taper-limited `pedigreeBonus`. No odds anywhere. Build-time only.

---

## 1. The problem

Today's seed treats a pre-UFC record as `winRate × topTierMult`. It is **blind to
who you beat.** A 12-0 run against journeymen in Cage Warriors scores identically
to a 12-0 run against *future UFC fighters* in Cage Warriors. That's the exact
information the market prices on newcomers and we don't. We have the data to fix
it: `opponentSherdogId` is populated on essentially every row.

**Goal:** give each pre-UFC record a *strength-of-schedule* read — measure the
quality of the opposition, not just the win count — and fold it into
`pedigreeStrength`.

---

## 2. Data available (verified 2026-07-03)

`data/sherdog_fights.csv` — 36,962 non-UFC fight rows. For B the key columns are
`ourFighterId`, `sherdogId`, `opponentSherdogId`, `date`, `canonicalOrg`,
`tier`, `result`.

Verified coverage:
- **`opponentSherdogId` fill rate ≈ 100%** (36,957 / 36,962). The pre-UFC
  opponent graph is fully connected by Sherdog ids — a real graph, not sparse.
- **19,149 distinct pre-UFC opponents.**
- **1,641 of those opponents are themselves crosswalked UFC fighters** (their
  `sherdogId` appears as an `ourFighterId`'s `sherdogId` in the file). This is the
  B.1 signal: beating a *future UFC fighter* pre-UFC is directly measurable.

Build a `sherdogId → ourFighterId` map straight from the file (2,219 entries:
every row carries both). Then `opponentSherdogId ∈ map` ⇒ that opponent reached
the UFC, and `getElo(map, ourFighterId)` gives their UFC Elo.

---

## 3. Algorithm — two stages, cheapest signal first

### Stage B.1 — UFC-bound-opponent quality (build this first)
Highest signal per line of code; needs no new rating pool.

For each graduate, over their **pre-UFC-debut** fights only (reuse the debut
cutoff already in `pedigreeSeed.ts`):
- `ufcBoundBeaten` = count of *wins* over opponents whose `opponentSherdogId`
  resolves to a UFC fighter.
- `ufcBoundQuality` = sum (or recency-weighted mean) of those beaten opponents'
  **UFC Elo above 1500** (via the sherdogId→ourFighterId→`getElo` join). Beating a
  future *ranked* fighter counts far more than a future prelim washout.
- Optionally `ufcBoundFaced` (wins + losses) for context/display.

Fold into strength as a bounded additive term:
```
sosTerm = clamp(ufcBoundQuality / normConst, 0, sosTermCap)
strength = min(baseStrength + sosWeight · sosTerm, maxStrength)   // maxStrength=0.75 unchanged
```
`baseStrength` = today's `winRate × confidence × mult`. The clamp + `maxStrength`
ceiling keep the ≤25-Elo seed bound intact.

### Stage B.2 — pre-UFC Elo sweep (only if B.1 + A under-deliver)
Fuller, more work, uncertain marginal gain. Build a **separate** Elo pass over the
*entire* `sherdog_fights.csv` graph (all 19,149 opponents, all orgs,
chronological), producing a `preUfcElo` for every Sherdog id — including
opponents who never reached the UFC. Then a graduate's pre-UFC SoS =
recency-weighted mean `preUfcElo` of their opponents, and `baseStrength` can use
*rating-vs-opposition* instead of raw win rate.

Design notes for the sweep:
- **Reuse `eloEngine.ts` math** (expected-score, finish-weighted K, provisional
  K) but in a standalone module over Sherdog rows keyed by Sherdog id. Do **not**
  route Sherdog fights through `buildEloRatings` — separate pool, separate map.
- **Scale anchoring:** pre-UFC Elo is only meaningful relative to itself. To make
  it comparable to UFC Elo, calibrate on the **overlap set** — the 2,219 fighters
  present in both pools — e.g. linear-fit `preUfcElo → UFC-debut Elo` and apply
  the transform, or simply z-score pre-UFC Elo and use it as a relative SoS index
  (sufficient for a bounded nudge; full anchoring is overkill for ≤25 Elo).
- Tier the K or the org weighting by `canonicalOrg`/`tier` so a Bellator win moves
  pre-UFC Elo more than a regional-circuit win.

**Ship B.1 and measure before touching B.2.** If B.1 (+ Workstream A) already
closes the newcomer gap, B.2 may not be worth the complexity.

---

## 4. New artifacts

| File | Kind | Responsibility |
|---|---|---|
| (extend) `src/lib/pedigreeSeed.ts` | runtime | build the `sherdogId→ourFighterId` map; add `ufcBoundBeaten`, `ufcBoundQuality` to `PedigreeInfo`; fold `sosTerm` into `strength` |
| `scripts/sherdog/buildPreUFCElo.ts` | build-time (B.2) | separate Elo sweep → `data/pre_ufc_elo.csv` |
| `data/pre_ufc_elo.csv` | committed artifact (B.2) | `sherdogId,fullName,preUfcElo,fights,lastDate` |
| `src/lib/preUfcElo.ts` | runtime loader (B.2) | memoized read of the CSV |

**Config additions** under `RANKING_CONFIG.preUFCPedigree`:
```
useOpponentSos: true,      // B.1 master toggle
sosWeight: 0.3,            // weight of the SoS term in strength (tuned by backtest)
sosTermCap: 0.4,           // clamp on the SoS contribution (keeps strength ≤ maxStrength)
sosNormConst: 300,         // ufcBoundQuality Elo-points that read as a full SoS term
usePreUfcEloSweep: false,  // B.2 master toggle (off until B.1 measured)
```

`PedigreeInfo` gains `ufcBoundBeaten: number`, `ufcBoundQuality: number` — the
`/prospects` display (§6) reads these.

---

## 5. Leakage guard

- **B.1:** an opponent's *UFC Elo* is a present-day number. For the **live** seed
  that's fine. For the **backtest**, use the opponent's UFC Elo *as of the bout
  being predicted*, not today's — i.e. join through the point-in-time trace
  (`buildPointInTimeIndex` / `ratingBefore`), not `getElo`'s settled rating.
  Alternatively, since the seed only matters for the graduate's *first ≤6* UFC
  fights and the opponents' pre-UFC fights predate those, a debut-cutoff freeze
  (opponent Elo as of the graduate's UFC debut) is a clean approximation. Decide
  and document.
- **B.2:** the pre-UFC sweep is chronological and self-contained; keep it
  strictly to fights dated before the prediction as-of in backtest folds. Mirror
  `pointInTime.ts` discipline.
- Never read odds. Never write to the UFC pool.

---

## 6. Display payoff (`/prospects` + fighter profile)

This is genuinely differentiating content and serves the app thesis (transparent,
data-driven depth). Turn the bare pre-UFC `W-L` in `src/lib/prospects.ts`
(`preUFC: { record, fights }`) into a scouting read:

> "12-2 pre-UFC — beat **3 future UFC fighters** (best: a future top-15 LW),
> came up through Cage Warriors."

`ProspectEntry.preUFC` extends to `{ record, fights, ufcBoundBeaten, bestScalp }`.
Display-only, reads engine output — no new firewall surface.

---

## 7. Validation (the scoreboard)

1. **Sanity:** for a few known prospects with strong pre-UFC résumés, print
   `ufcBoundBeaten` + `ufcBoundQuality` — do they rank the padded records below
   the tested ones? (This is the whole point.)
2. **Primary — newcomer gap:** re-run the backtest at the thin-sample gate,
   before vs after:
   ```
   MINFIGHTNO=3 node_modules/.bin/jiti research/backtest/enhancedVsClose.ts
   ```
   Success = the ≥3-fight accuracy gap (−7.9 pt today) narrows in the **3–5 UFC-
   fight bucket**; the 6+ bucket barely moves (taper). Add the fightNo-bucket
   breakdown to the script if the sibling workstream hasn't already.
3. **Golden master:** `node_modules/.bin/jiti scripts/goldenMaster.ts` green for
   the established pool. Large shift = leak past the taper → bug.
4. **Ablation:** `useOpponentSos: false` vs `true`; sweep `sosWeight`. Attribute
   the gain. If B.2 is built, ablate it separately (`usePreUfcEloSweep`).
5. Re-bless golden master after pass; update `CLAUDE.md` §5 + `data/SOURCES.md`.

---

## 8. Suggested session sequence

1. Recon: read §0 files; verify the join counts in §2 still hold
   (`opponentSherdogId` fill, UFC-bound-opponent overlap).
2. Build the `sherdogId→ourFighterId` map + `ufcBoundBeaten`/`ufcBoundQuality` in
   `pedigreeSeed.ts` behind `useOpponentSos`.
3. Fold the bounded `sosTerm` into `strength`; keep `maxStrength` ceiling.
4. Backtest (bucketed) + ablation + golden master; tune `sosWeight`.
5. Wire the `/prospects` scouting-read display.
6. Only if the gap persists: build B.2 (`buildPreUFCElo.ts` + `preUfcElo.ts`),
   re-validate.
7. Re-bless; document.

---

## 9. Acceptance criteria

- `ufcBoundBeaten` / `ufcBoundQuality` computed pre-UFC-debut only, joined via
  `opponentSherdogId → ourFighterId → UFC Elo`.
- SoS term is bounded; `strength` never exceeds `maxStrength`; the ≤25-Elo seed
  bound + 6-fight taper remain intact.
- Backtest at `MINFIGHTNO=3` shows the 3–5-fight bucket accuracy gap narrowing,
  6+ bucket unchanged.
- Golden master green (or re-blessed with rationale).
- B.2, if built, is a fully separate rating pool — no path into the UFC Elo sweep.
- `/prospects` shows the scouting read; no odds read anywhere.

---

## 10. Open questions for the session owner

- **B.1 opponent-quality weighting:** count of UFC-bound wins (simple) vs
  Elo-weighted sum (richer) vs recency-weighted mean? (Lean: Elo-weighted sum,
  clamped — beating a future contender ≫ beating a future prelim body.)
- **Backtest opponent-Elo timing:** point-in-time `ratingBefore` (correct) vs
  debut-cutoff freeze (simpler approximation)? (Lean: start with the freeze,
  upgrade if the golden-master/backtest flags leakage.)
- **Is B.2 worth it at all?** Decide *after* B.1 + Workstream A are measured. If
  the newcomer gap is already closed, park B.2.
- **`sosNormConst` calibration** — what Elo-sum reads as a "full" SoS term? Set it
  from the distribution of `ufcBoundQuality` across graduates, not a guess.
