# Scorecard Bot — Live Model-vs-Market Tracker (Design)

> Status: **DESIGN — not yet built** (2026-07-02).
> Zone: `research/scorecard/` — lives behind the odds firewall like everything in
> `research/`. **Odds never feed an Elo rating.** Delete the folder and rankings
> are byte-identical.

## 1. What it is

A weekly bot that turns the site's upcoming-card predictions into a permanent,
auditable **prediction ledger**, then grades that ledger after every card
against (a) the actual results and (b) the **de-vigged closing line**, and
emits a per-card report: what the model got right, what it got wrong, and how
it's tracking against the market over time.

This is the live continuation of the 2014–2023 backtest (`research/backtest/`),
with one thing the backtest could never give us: **a true out-of-sample test of
the form-adjusted win %** (`formEloNudge`), which today is labeled
"experimental" in the UI because it has never been validated. Every card is an
A/B: pure Elo vs form-adjusted vs market.

### Hard rules (inherited + new)

1. **Firewall** — one-way dependency `research/scorecard/ → src/lib`. No odds
   data, no ledger, no report is ever read by the engine.
   `grep -rniE "odds|ledger|scorecard" src/lib/` must stay clean (except the
   existing display-only `loadOddsAnalysis`).
2. **Predictions are frozen pre-fight.** A prediction row is written *before*
   the card and never recomputed afterward. Settlement only fills in results
   and odds. This is the anti-leakage rule: post-card, the Elo has already
   absorbed the result, so recomputing would grade the model on information it
   didn't have. (Same principle as `pointInTime.ts` in the backtest.)
3. **The bot tracks exactly what the site showed.** The probability math is
   extracted into one shared helper used by BOTH `/api/upcoming` and the
   snapshot script, so the ledger can never drift from the page.
4. **Network calls are CI/human-run only** — the BFO fetch reuses the existing
   polite cached scraper (`politeFetch`: disk cache, 3s rate limit, identifying
   UA). Claude never runs the crawl.

## 2. The weekly cycle

The existing weekly job (`scripts/sherdog/weeklyUpdate.ts`, GitHub Action cron)
already runs after each card and ingests results + refreshes the upcoming
cards. The bot adds two non-fatal steps inside that same run:

```
Sat night      card happens (done by ~1am ET)
Sun 6am ET     weekly job runs (cron 11:00 UTC):
  1/  fetchEvent            (existing) results discovered
  2/  extendCrosswalk       (existing)
  3/  buildRecencyPatch     (existing) results land in recent_ufc_fights.csv
  ►A/ settleCard            NEW: grade last card's frozen predictions
                                 + fetch its BFO closing lines (1 event page)
                                 + write the per-card report + cumulative summary
  4/  buildUpcoming         (existing) next 3 cards refreshed
  ►B/ snapshotPredictions   NEW: freeze predictions for every future bout
  5–7/ validate, goldenMaster (existing)
CI commits: ledger CSV + reports + summary JSON alongside the data files
→ git history IS the audit trail (each week's diff shows exactly what was
  predicted when, and what got graded).
```

Order matters: **settle before snapshot**. Settlement grades last week's frozen
rows against the just-ingested results; only then do we re-freeze predictions
for the bouts still in the future.

> **Cadence:** cron = Sunday 11:00 UTC (6am EST; 7am EDT in summer — GitHub
> cron has no DST awareness). Cards are always finished by then; BFO closing
> lines are final the moment the card starts. Nothing in this design cares
> which day the job runs, only the order settle → snapshot — and settlement
> re-attempts ALL pending past-dated rows every run, so a one-off late card
> (à la the Whitehouse card) or a slow Sherdog results post simply settles the
> following Sunday. No manual intervention, no lost predictions.

### Snapshot timing & re-snapshots

While a bout's event date is in the future, each weekly run **upserts** its
prediction row (the model may have shifted if an earlier card moved a
fighter's Elo). The row graded at settlement is therefore the **last snapshot
before the fight** — typically ~6 days out, which is the fairest apples-to-
apples against a closing line. Once `event_date ≤ the run date` the row is
immutable; the snapshot script refuses to touch same-day or past-dated rows by
construction. (The same-day case matters for rare Sunday cards: our dates are
day-granular, so we can't prove a Sunday-morning snapshot preceded the opening
bell — such a card keeps its prior week's snapshot instead.)

## 3. The ledger — `data/predictions_ledger.csv`

One row per bout. Prediction columns written at snapshot; settlement columns
filled once, later. Committed weekly by CI.

| group | columns |
|---|---|
| identity | `event_id, event_name, event_date, bout_order, is_main_event, weight_class` |
| fighters | `f1_id, f1_name, f2_id, f2_name` (our canonical ids from `upcoming_fights.csv`) |
| prediction | `elo1, elo2, nudge1, nudge2, prob1_pure, prob1_form, f1_fights, f2_fights, snapshot_at` |
| settlement | `status, winner, method, close1, close2, market_prob1, n_books, settled_at` |

- `prob1_pure` — the validated `/400` Elo probability (`winProbability`), the
  headline number on `/upcoming` and `/compare`.
- `prob1_form` — the form-adjusted variant (`winProbability(elo1+nudge1,
  elo2+nudge2)`), i.e. **"the model's form-adjusted win %" this bot exists to
  track**. Recording the nudges themselves lets the report say *why* the two
  variants differed.
- `f1_fights/f2_fights` — UFC fight counts at snapshot, so thin-sample bouts
  (≤3 fights, the ★ Prospect flag) can be segmented in the report — the
  backtest showed inbound-prospect compression is our known blind spot.
- `status` — `pending | settled | void_nc | void_draw | void_scratched`.
  `void_scratched` = the snapshotted pairing never happened (injury/replacement).
- `market_prob1` — de-vigged (power method, the backtest's choice) implied
  probability for fighter1 from BFO closing consensus. Blank if the odds join
  fails; the bout still grades on result, just without market comparison.

## 4. Components (all in `research/scorecard/`)

| file | job | reuses |
|---|---|---|
| `ledger.ts` | read/upsert/freeze the CSV; the status machine above | PapaParse |
| `snapshotPredictions.ts` | for each future bout in `upcoming_fights.csv` with both ids resolved: compute elos + nudges + both probs, upsert | `buildEloRatings`, `winProbability`, `getAdvancedStats`/`formEloNudge` via the shared helper |
| `fetchCardOdds.ts` | fetch ONE completed event's BFO page, parse closing lines, de-vig | `politeFetch`, `parseEventPage`, `deriveOdds` (research/bfo), `devig` (research/backtest) |
| `settleCard.ts` | join ALL pending past-dated rows to ingested results (fighter-id pair, event date ±3 days); grade; mark voids/scratches; call `fetchCardOdds`; trigger report. Rows with no result yet stay `pending` and are retried next run (late-card safety) | `loadData` (results), registry + `resolveOddsName`/`oddsNameOverrides` for the odds name-join |
| `report.ts` | per-card markdown + rolling `data/scorecard_summary.json` | `logLoss`, `brier`, `accuracy`, `ece` (research/backtest/metrics) |

Plus one **engine-adjacent (display-only) refactor**: extract the ~6 lines in
`src/app/api/upcoming/route.ts` that compute `prob1`/`formProb1` into
`src/lib/boutProbability.ts`, imported by both the route and
`snapshotPredictions.ts` (rule 3). No behavior change on the site;
golden-master must stay green (it's display-only code, so it will).

### Edge cases (decided now, so settlement is mechanical)

- **Draw / NC** → void, excluded from accuracy/log-loss (market gets the same
  treatment — standard practice, matches the backtest).
- **Scratched or changed bout** → `void_scratched`, kept in the ledger for
  honesty, never graded.
- **Fight happened but was never snapshotted** (late addition after the last
  weekly run) → listed in the report under "unscored", not graded. No
  retro-prediction, ever (rule 2).
- **Debutant without a canonical id** → bout skipped at snapshot, shows as
  unscored. (A 1500-provisional "prediction" would be noise anyway.)
- **Odds join miss** → graded on result only; the report shows market coverage
  % per card so join rot is visible.

## 5. The per-card report

`research/scorecard/reports/2026-07-11-ufc-329.md` — written by CI, committed.
Shape (mock):

```markdown
# UFC 329 — McGregor vs. Holloway 2 · 2026-07-11
Scored 12/13 bouts · market lines joined 12/12 · settled 2026-07-14

## Bout-by-bout
| bout | model (pure) | form-adj | market | result | pure | form | mkt |
|---|---|---|---|---|---|---|---|
| McGregor vs Holloway | Holloway 61% | Holloway 66% | Holloway 58% | Holloway KO4 | ✓ | ✓ | ✓ |
| Saint Denis vs Pimblett | BSD 55% | Pimblett 52% | Pimblett 60% | Pimblett SUB2 | ✗ | ✓ | ✓ |
| ...

## Where we disagreed with the market (the interesting rows)
- **Saint Denis vs Pimblett** — pure Elo liked BSD 55%, market said Pimblett
  60%. Market right. Note: the FORM nudge flipped our pick to Pimblett
  (+31 nudge, riding a 3-fight strike-diff surge) — form-adj beat our own
  headline number here.
- ...

## Card scorecard
pure Elo 9–3 · form-adjusted 10–2 · market favourites 10–2
form nudge flipped 2 picks: went 2–0 on flips
biggest miss: X over Y (we had X 71%) · best call: Z 58% (market had 44%)

## Running record (since 2026-07-XX, n=87)
|            | acc   | log-loss | Brier | ECE  |
| pure Elo   | 66.7% | 0.634    | 0.221 | 0.04 |
| form-adj   | 67.8% | 0.629    | 0.218 | 0.05 |
| market     | 70.1% | 0.601    | 0.209 | 0.02 |
disagreement record (pure vs mkt picks differ, n=14): model 5–9
thin-sample bouts (≤3 UFC fights, n=11): model 5–6 — still our blind spot
```

Per-card W/L is entertainment (n≈13 is noise); the **running table is the
product**. Both live in every report so each card is readable standalone.

`data/scorecard_summary.json` holds the cumulative state (same numbers as the
running table + per-card history). Later — optional phase 2 — the `/odds` page
can display it as a "live track record" section next to the 2014–23 backtest,
same precomputed-JSON pattern as `odds_analysis.json`, still display-only.

## 6. What we expect (so the first reports don't alarm anyone)

From the backtest (`project_backtest_findings`): calibrated Elo matches the
market on *accuracy* (~67%) but loses on *log-loss* (0.632 vs 0.607) — **the
model is not expected to beat the close**, and the report's framing must stay
honest about that (as `/odds` already is). The live questions this bot can
actually answer:

1. **Does `formEloNudge` earn its place?** First-ever validation. If after
   ~150–200 fights form-adj consistently beats pure on log-loss, promote it
   from "experimental" in the UI; if it loses, kill or retune it. Watch the
   flip record specifically — flips are where the nudge does anything.
2. **Does live performance match the 2014–23 backtest?** If live accuracy
   drifts well below ~65%, something rotted (data feed, name joins, roster
   churn) — the bot doubles as a regression alarm for the whole pipeline.
3. **Disagreement segments** — over time, are there pockets (divisions,
   thin-sample, title fights) where the model's disagreements with the close
   actually win? That, not the aggregate, is where any real edge would hide.

Statistical honesty: at 40 fights/month, log-loss gaps of ~0.03 need several
hundred fights to mean anything. The report shows running n and refuses
victory laps before n≈200 (a one-line caveat auto-included until then).

## 7. Build order (≈ half-day, all pieces exist)

1. `src/lib/boutProbability.ts` extraction + wire into `/api/upcoming`
   (golden-master + eyeball `/upcoming` to confirm identical numbers).
2. `ledger.ts` + `snapshotPredictions.ts` → run once by hand, inspect the CSV
   for the three currently-announced cards.
3. `fetchCardOdds.ts` + `settleCard.ts` → dry-run against the LAST completed
   card by hand-inserting a snapshot row built from a pre-card git checkout
   (one-time bootstrap so week 1 already produces a report).
4. `report.ts` + summary JSON.
5. Two step lines in `weeklyUpdate.ts` (both non-fatal, like buildUpcoming) +
   add ledger/reports/summary to the CI commit list in
   `.github/workflows/weekly-update.yml`.
6. First real cycle runs unattended; review report #1, then decide on the
   `/odds` page section (phase 2).

## 8. Open choices (defaults chosen, flag if you disagree)

- **Odds source**: BFO closing consensus only (the betmma feed ended Dec 2023).
  BFO was cross-validated at 1.3pts mean diff, so single-source is fine.
- **Pick threshold**: prob > 0.5, no abstain band. Simple, matches backtest.
- **No staking/ROI column** for now — "accuracy before staking" still stands;
  a flat-stake CLV column can be added later without schema changes.
- **Reports in-repo** (committed markdown) rather than emailed/notified.
  Cheap to add a notification later; the git commit is already the signal.
