// ─────────────────────────────────────────────────────────────────────────
//  clock.ts — the ranking engines' notion of "today".
//
//  The Elo sweep regresses every rating up to the current date, and the
//  metrics/SoS windows are measured back from it — so ranking output is a
//  function of (code, data, TODAY). For deterministic runs (the golden-master
//  regression test), RANKINGS_ASOF=YYYY-MM-DD freezes that date; unset (the
//  default, and always in production) it is the real wall clock.
// ─────────────────────────────────────────────────────────────────────────

export function rankingsNow(): Date {
  const asOf = process.env.RANKINGS_ASOF;
  if (asOf) {
    const d = new Date(asOf); // "YYYY-MM-DD" parses as UTC midnight — timezone-stable
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}
