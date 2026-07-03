// ─────────────────────────────────────────────────────────────────────────
//  americanOdds.ts — convert between a win probability and an American sports
//  line (moneyline). DISPLAY-ONLY: this is a presentation of the model's own
//  calibrated win%, expressed the way a sportsbook would quote it. It reads no
//  odds and never touches Elo or the ranking.
//
//  These are FAIR (no-vig) lines — the honest translation of P(win) into a
//  price. A real book adds vig, so their favourite would be juicier and their
//  dog shorter; the value check in OddsValue.tsx is where the market line comes
//  in for comparison.
// ─────────────────────────────────────────────────────────────────────────

// Probability (0–1) → American line string, e.g. 0.62 → "-163", 0.40 → "+150".
// Even money (50%) is "+100". Returns null for a non-finite / out-of-range prob.
export function probabilityToAmerican(p: number): string | null {
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return null;
  const decimal = 1 / p; // fair decimal odds
  const line =
    decimal >= 2
      ? Math.round((decimal - 1) * 100) // underdog → positive
      : -Math.round(100 / (decimal - 1)); // favourite → negative
  return `${line > 0 ? '+' : ''}${line}`;
}

// American odds → implied probability. Accepts "-150", "+130", "150".
export function americanToImplied(raw: string): number | null {
  const v = parseFloat(raw.replace(/[^0-9.+-]/g, ''));
  if (!Number.isFinite(v) || v === 0) return null;
  return v > 0 ? 100 / (v + 100) : -v / (-v + 100);
}
