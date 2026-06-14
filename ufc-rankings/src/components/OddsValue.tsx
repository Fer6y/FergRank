'use client';

import { useState } from 'react';

// Option A — value calculator. You type the current market line for an upcoming
// fight; this compares the MODEL's calibrated win% (from core Elo) to the
// market's de-vigged implied probability and shows the disagreement. No odds
// data lives in the app — the line is user-supplied, so the engine is untouched.

interface Props {
  modelProbA: number; // model P(fighter A wins), 0–1
  nameA: string;
  nameB: string;
  lowConfidence?: boolean; // a fighter has a thin UFC sample (Elo still converging)
}

// American odds → implied probability. Accepts "-150", "+130", "150".
function americanToImplied(raw: string): number | null {
  const v = parseFloat(raw.replace(/[^0-9.+-]/g, ''));
  if (!Number.isFinite(v) || v === 0) return null;
  return v > 0 ? 100 / (v + 100) : -v / (-v + 100);
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}`;

export default function OddsValue({ modelProbA, nameA, nameB, lowConfidence }: Props) {
  const [oddsA, setOddsA] = useState('');
  const [oddsB, setOddsB] = useState('');

  const iA = americanToImplied(oddsA);
  const iB = americanToImplied(oddsB);
  const haveBoth = iA != null && iB != null;
  const overround = haveBoth ? iA! + iB! : null;
  const marketA = haveBoth ? iA! / overround! : null; // de-vigged (multiplicative)
  const marketB = haveBoth ? iB! / overround! : null;

  const modelB = 1 - modelProbA;
  const edgeA = marketA != null ? modelProbA - marketA : null;

  let verdict = 'Enter both fighters’ odds to compare the model with the market.';
  let lean: 'a' | 'b' | 'none' = 'none';
  if (edgeA != null) {
    if (edgeA > 0.03) { verdict = `Model rates ${nameA} ~${Math.round(edgeA * 100)} pts higher than the market priced.`; lean = 'a'; }
    else if (edgeA < -0.03) { verdict = `Model rates ${nameB} ~${Math.round(-edgeA * 100)} pts higher than the market priced.`; lean = 'b'; }
    else { verdict = 'Model and market broadly agree on this matchup.'; }
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)',
    color: 'var(--text-primary)', borderRadius: 6, padding: '4px 8px', width: 84,
    fontFamily: 'ui-monospace, monospace', fontSize: 13, textAlign: 'center',
  };
  const leanColor = (who: 'a' | 'b') => (lean === who ? 'var(--accent-green)' : 'var(--text-primary)');

  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Odds value check</div>
        {overround != null && (
          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>book vig {Math.round((overround - 1) * 100)}%</div>
        )}
      </div>
      <div className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
        Enter the current market line (American odds) for each fighter.
      </div>

      {/* odds inputs */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {[{ n: nameA, v: oddsA, set: setOddsA }, { n: nameB, v: oddsB, set: setOddsB }].map((f, i) => (
          <label key={i} className="flex items-center justify-between gap-2">
            <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{f.n}</span>
            <input
              type="text" inputMode="numeric" placeholder="-150" value={f.v}
              onChange={(e) => f.set(e.target.value)} style={inputStyle} aria-label={`${f.n} odds`}
            />
          </label>
        ))}
      </div>

      {/* model vs market table */}
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {[
          { label: 'Model win %', a: pct(modelProbA), b: pct(modelB), strong: true },
          { label: 'Market (de-vig)', a: marketA != null ? pct(marketA) : '—', b: marketB != null ? pct(marketB) : '—' },
          { label: 'Edge (model − mkt)', a: edgeA != null ? `${signed(edgeA)}` : '—', b: edgeA != null ? `${signed(-edgeA)}` : '—', edge: true },
        ].map((r) => (
          <div key={r.label} className="grid grid-cols-[1fr_auto_1fr] items-center" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="text-right px-3 py-2 font-mono text-sm" style={{ color: r.edge ? leanColor('a') : 'var(--text-primary)', fontWeight: r.strong ? 600 : 400 }}>{r.a}</div>
            <div className="px-3 text-[10px] uppercase tracking-wide text-center" style={{ color: 'var(--text-muted)' }}>{r.label}</div>
            <div className="text-left px-3 py-2 font-mono text-sm" style={{ color: r.edge ? leanColor('b') : 'var(--text-primary)', fontWeight: r.strong ? 600 : 400 }}>{r.b}</div>
          </div>
        ))}
      </div>

      {/* verdict + honesty caveat */}
      <div className="mt-3 text-xs" style={{ color: lean === 'none' ? 'var(--text-secondary)' : 'var(--accent-green)' }}>{verdict}</div>
      <div className="mt-1 text-[10px] leading-snug" style={{ color: 'var(--text-muted)' }}>
        The model matches the market on accuracy but does not beat sharp closing lines. Treat a gap as a place to dig, not an automatic bet — it’s most meaningful against early/soft lines.
      </div>
      {lowConfidence && (
        <div className="mt-1.5 text-[10px] leading-snug" style={{ color: 'var(--accent-gold)' }}>
          ★ Prospect — a fighter here has ≤3 UFC fights, so the model&rsquo;s edge is on a thin sample and less reliable.
        </div>
      )}
    </div>
  );
}
