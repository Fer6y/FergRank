// ProspectPipelineGuide — the visual "how a prospect becomes a contender" strip
// on /prospects. Five stages, each annotated with what the backtests actually
// measured: what predicts breakthrough (age, win rate, a DWCS finish) and what
// was tested and refuted (fight-count experience, climb rate, pedigree as an
// ordering signal). Display-only; the DWCS numbers ride in from the static
// dwcs_analysis.json so they refresh with the export. Collapsible so the list
// stays the page's lead.
//
// Deliberately divs + small inline-SVG chevrons rather than one big SVG canvas:
// the stages need to reflow to a vertical stack on mobile, which live text in a
// fixed viewBox can't do gracefully. Hand-rolled per DESIGN_VISION — no chart lib.
'use client';

import { useState } from 'react';
import Link from 'next/link';

export interface PipelineNumbers {
  finishContractRate: number | null;   // e.g. 0.98
  decisionContractRate: number | null;
  noWinContractRate: number | null;
  gradTop15Rate: number | null;        // e.g. 0.11
}

const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-5 h-5 shrink-0 self-center rotate-90 sm:rotate-0"
      aria-hidden
    >
      <path d="M8 4l8 8-8 8" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface Stage {
  n: string;
  title: string;
  accent: string;
  body: React.ReactNode;
  signal?: React.ReactNode; // "what the data says" line
}

export default function ProspectPipelineGuide({ numbers }: { numbers: PipelineNumbers }) {
  const [open, setOpen] = useState(false);

  const stages: Stage[] = [
    {
      n: '1',
      title: 'Regional circuit',
      accent: 'var(--text-muted)',
      body: <>Feeder promotions — LFA, CFFC, Fury FC, Cage Warriors — build the résumé. The record itself matters less than you&rsquo;d think.</>,
      signal: <><b>Predicts:</b> win rate, youth. <b>Doesn&rsquo;t:</b> sheer fight count — a 13-4 résumé carries no edge over 4-0 once win rate is known.</>,
    },
    {
      n: '2',
      title: 'Contender Series',
      accent: 'var(--accent-gold)',
      body: <>The one-fight tryout. Winning isn&rsquo;t enough — <em>how</em> you win is the doorway: {pct(numbers.finishContractRate)} of finish winners reached the UFC, {pct(numbers.decisionContractRate)} of decision winners, {pct(numbers.noWinContractRate)} of losers.</>,
      signal: <><b>Predicts:</b> the finish. <b>Doesn&rsquo;t:</b> finish <em>method</em> beyond that — and age already looms: 29+ entrants almost never become contenders.</>,
    },
    {
      n: '3',
      title: 'Provisional window',
      accent: 'var(--accent-red-light)',
      body: <>First 5 UFC fights: the engine converges fast (boosted K), damps finish-hype, and lets the pre-UFC pedigree seed taper to zero as real results replace it.</>,
      signal: <><b>By design:</b> a 3-0 debut run can&rsquo;t vault past proven contenders — ratings earn their level.</>,
    },
    {
      n: '4',
      title: 'Prospect Watch',
      accent: 'var(--accent-green)',
      body: <>This page: winning record, active, inside the window — ordered by <b>raw Elo</b>.</>,
      signal: <><b>Why raw Elo:</b> held-out backtests beat every challenger — climb rate (refuted), shrunk climb (refuted), pedigree-adjusted composite (adds nothing). Five banked wins predict more than one fast start.</>,
    },
    {
      n: '5',
      title: 'The ranked 40',
      accent: 'var(--accent-gold)',
      body: <>Graduation. {pct(numbers.gradTop15Rate)} of all Contender Series graduates sit in the official top 15 right now.</>,
      signal: <>The full nine-season evidence lives on <Link href="/contender-series" className="underline" style={{ color: 'var(--text-primary)' }}>Contender Series</Link>.</>,
    },
  ];

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-left"
      >
        <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          How a prospect becomes a contender — the pipeline &amp; what actually predicts it
        </span>
        <svg viewBox="0 0 24 24" className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden>
          <path d="M6 9l6 6 6-6" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="px-3.5 pb-3.5">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-1.5 items-stretch">
            {stages.map((s, i) => (
              <div key={s.n} className="contents">
                {i > 0 && <Chevron />}
                <div
                  className="flex-1 rounded-lg p-2.5 min-w-0"
                  style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: `2px solid ${s.accent}` }}
                >
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-display text-lg leading-none" style={{ color: s.accent }}>{s.n}</span>
                    <span className="font-display text-sm uppercase tracking-wide" style={{ color: 'var(--text-primary)' }}>{s.title}</span>
                  </div>
                  <p className="text-[11px] mt-1.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>{s.body}</p>
                  {s.signal && (
                    <p className="text-[10px] mt-1.5 leading-snug" style={{ color: 'var(--text-muted)' }}>{s.signal}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] mt-2.5" style={{ color: 'var(--text-muted)' }}>
            Every &ldquo;predicts / doesn&rsquo;t&rdquo; claim above is a measured backtest result, not an opinion —
            method and refutations are logged in the changelog and pre-registered in <code>docs/plans/DWCS_PLAN.md</code>.
          </p>
        </div>
      )}
    </div>
  );
}
