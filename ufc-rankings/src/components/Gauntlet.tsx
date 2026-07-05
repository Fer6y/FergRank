'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Gauntlet, GauntletPoint } from '@/lib/advancedStats';

interface Props {
  gauntlet: Gauntlet;
}

// The Gauntlet — the career-trajectory chart, redesigned 2026-07-02 per the
// Gauntlet brief. The chart draws ONE thing: the fighter's own Elo line, with
// a small node per fight sitting on it. Colour is reserved for result (green
// win / red loss), node size encodes opponent level, and a halo marks the
// card's headline bout — gold for a title fight, purple for a (non-title)
// 5-round main event. Everything else — opponent, method, expectancy, rating
// swing — lives in the persistent info panel below, driven by hovering (or
// tapping) a node: the node enlarges with a white glow, its adjacent line
// segments brighten, and the rest of the chart fades back.

// Opponent-level tiers (node size). We don't have historical rank at fight
// time, so opponent Elo is the proxy: ~1650+ is top-contender/champion
// territory, ~1565+ is ranked-calibre, below that a standard opponent.
const OPP_ELITE = 1650;
const OPP_RANKED = 1565;

const NODE_R = [5.2, 7.4, 9.6]; // standard / ranked-calibre / elite (~2× the old base so nodes read clearly)

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// X-axis is a TRUE calendar scale (fixed pixels-per-year), NOT one node per
// slot. So activity/inactivity reads honestly: a busy stretch bunches, a layoff
// leaves a real gap, and the axis is identical across every fighter. The window
// defaults to the last WINDOW_YEARS and is anchored on the right to "today"
// (so a fighter idle since 2021 shows empty space out to now); a longer career
// overflows to the left inside a horizontally-scrollable container.
const WINDOW_YEARS = 7;
const PX_PER_YEAR = 84; // a WINDOW_YEARS window ≈ 640px wide (matches the old chart)

// Fractional calendar year of an ISO date ("2022-07-01" → 2022.5).
function yearFloat(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return (y || 2000) + ((m || 1) - 1) / 12 + ((d || 1) - 1) / 365;
}

function oppTier(p: GauntletPoint): 0 | 1 | 2 {
  return p.opponentElo >= OPP_ELITE ? 2 : p.opponentElo >= OPP_RANKED ? 1 : 0;
}

function resultColor(r: GauntletPoint['result']): string {
  return r === 'W' ? 'var(--accent-green)' : r === 'L' ? 'var(--accent-red-light)' : 'var(--text-muted)';
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[(m || 1) - 1]} ${d || 1}, ${y}`;
}

export default function GauntletChart({ gauntlet }: Props) {
  const { points, totalOverperf, divMedianElo, champElo } = gauntlet;
  const n = points.length;
  // hovered = live highlight on the chart; the panel remembers the last
  // hovered fight so it never goes blank (defaults to the most recent fight).
  const [hovered, setHovered] = useState<number | null>(null);
  const [panelIdx, setPanelIdx] = useState(n - 1);
  const scrollRef = useRef<HTMLDivElement>(null);

  const geometry = useMemo(() => {
    const H = 216;
    const top = 14;
    const bottom = H - 22;
    const left = 42;
    const rightPad = 14;

    // Calendar span. Right edge anchored to "today" so idleness shows as blank
    // space out to now; left edge extends to the first fight, but at least a full
    // WINDOW_YEARS so short careers still render on the same scale (and older
    // careers overflow left → the container scrolls).
    const now = new Date();
    const nowYf = now.getFullYear() + now.getMonth() / 12 + (now.getDate() - 1) / 365;
    const firstYf = yearFloat(points[0]?.date ?? '2000-01-01');
    const lastYf = yearFloat(points[n - 1]?.date ?? '2000-01-01');
    const spanEnd = Math.max(nowYf, lastYf);
    const spanStart = Math.min(firstYf, spanEnd - WINDOW_YEARS);
    const totalYears = spanEnd - spanStart;

    const W = left + totalYears * PX_PER_YEAR + rightPad;
    const right = W - rightPad;
    const plotH = bottom - top;

    // Include the division reference Elos in the domain so their lines always
    // sit at a real height on the axis (even if the champ is above / the median
    // below the fighter's own range) — the whole point is to see where the
    // fighter stacks up against them.
    const refs = [divMedianElo, champElo].filter((v): v is number => v != null);
    const rawMin = Math.min(...points.map((p) => p.ownElo), ...refs);
    const rawMax = Math.max(...points.map((p) => p.ownElo), ...refs);
    const pad = Math.max(25, (rawMax - rawMin) * 0.15);
    const yMin = Math.floor((rawMin - pad) / 50) * 50;
    const yMax = Math.ceil((rawMax + pad) / 50) * 50;

    const xAt = (yf: number) => left + (yf - spanStart) * PX_PER_YEAR;
    const x = (i: number) => xAt(yearFloat(points[i].date));
    const y = (elo: number) => top + plotH * (1 - (elo - yMin) / (yMax - yMin));

    const gridStep = yMax - yMin > 300 ? 100 : 50;
    const gridVals: number[] = [];
    for (let v = yMin; v <= yMax; v += gridStep) gridVals.push(v);

    // Year ticks at each January 1 within the span (thinned if a long career
    // makes them crowd). On a true calendar axis these sit at real positions.
    const allTicks: { x: number; label: string }[] = [];
    for (let Y = Math.ceil(spanStart); Y <= Math.floor(spanEnd); Y++) {
      allTicks.push({ x: xAt(Y), label: String(Y) });
    }
    const tickStep = Math.max(1, Math.ceil(allTicks.length / 9));
    const shownTicks = allTicks.filter((_, idx) => idx % tickStep === 0);

    const line = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.ownElo).toFixed(1)}`)
      .join(' ');
    const area = `${line} L${x(n - 1).toFixed(1)},${bottom} L${x(0).toFixed(1)},${bottom} Z`;

    return { W, H, top, bottom, left, right, x, y, gridVals, shownTicks, line, area };
  }, [points, n, divMedianElo, champElo]);

  // Open scrolled to the right (most-recent fights / today) when the timeline
  // is wider than the viewport (a career longer than the default window).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [geometry.W]);

  if (n < 2) return null;
  const { W, H, top, bottom, left, right, x, y, gridVals, shownTicks, line, area } = geometry;

  // Brightened path through the hovered node's adjacent segments.
  const highlightPath = (i: number): string => {
    const from = Math.max(0, i - 1);
    const to = Math.min(n - 1, i + 1);
    let d = `M${x(from).toFixed(1)},${y(points[from].ownElo).toFixed(1)}`;
    for (let k = from + 1; k <= to; k++) d += ` L${x(k).toFixed(1)},${y(points[k].ownElo).toFixed(1)}`;
    return d;
  };

  const activate = (i: number) => {
    setHovered(i);
    setPanelIdx(i);
  };

  const sel = points[panelIdx];
  const overSign = totalOverperf > 0 ? '+' : '';

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-[10px] tracking-widest" style={{ color: 'var(--text-muted)' }}>
          THE GAUNTLET · CAREER ELO TRAJECTORY
        </div>
        <div
          className="text-[10px] tracking-wide font-mono"
          style={{ color: 'var(--text-muted)' }}
          title="Cumulative wins above (or below) what the Elo prediction expected across the plotted fights"
        >
          {overSign}{totalOverperf.toFixed(1)} vs expected
        </div>
      </div>

      <div ref={scrollRef} className="overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        style={{ maxWidth: 'none', display: 'block' }}
        role="img"
        aria-label="The fighter's Elo rating after each fight on a calendar timeline, oldest to newest"
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <filter id="gauntlet-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="gauntlet-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--elo-line)" stopOpacity="0.1" />
            <stop offset="100%" stopColor="var(--elo-line)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* base chart — fades back while a fight is hovered */}
        <g style={{ opacity: hovered != null ? 0.35 : 1, transition: 'opacity 220ms ease' }}>
          {gridVals.map((v) => (
            <g key={v}>
              <line x1={left} y1={y(v)} x2={right} y2={y(v)} stroke="var(--border)" strokeWidth="1" opacity="0.6" />
              <text x={left - 6} y={y(v)} fill="var(--text-muted)" fontSize="9" textAnchor="end" dominantBaseline="middle">
                {v}
              </text>
            </g>
          ))}

          {shownTicks.map((t) => (
            <text key={t.label} x={t.x} y={bottom + 14} fill="var(--text-muted)" fontSize="9" textAnchor="middle">
              {t.label}
            </text>
          ))}

          {/* division reference lines — the median of the ranked pool (blue,
              dashed) and the reigning champion's Elo (gold, dotted), drawn
              across the plot so the fighter's trajectory reads against the
              division. Labelled at the RIGHT edge (the chart opens scrolled to
              "today", so the right edge is always in view even when a long
              career overflows the scroll container). */}
          {divMedianElo != null && (
            <g opacity="0.7">
              <line
                x1={left} y1={y(divMedianElo)} x2={right} y2={y(divMedianElo)}
                stroke="var(--accent-blue)" strokeWidth="1" strokeDasharray="4 4" opacity="0.55"
              />
              <text
                x={right - 2} y={y(divMedianElo) - 3}
                fill="var(--accent-blue)" fontSize="8.5" letterSpacing="0.5" textAnchor="end"
              >
                DIV MED {divMedianElo}
              </text>
            </g>
          )}
          {champElo != null && (
            <g opacity="0.8">
              <line
                x1={left} y1={y(champElo)} x2={right} y2={y(champElo)}
                stroke="var(--accent-gold)" strokeWidth="1" strokeDasharray="1.5 3" opacity="0.65"
              />
              <text
                x={right - 2} y={y(champElo) - 3}
                fill="var(--accent-gold)" fontSize="8.5" letterSpacing="0.5" textAnchor="end"
              >
                DIVISION CHAMP {champElo}
              </text>
            </g>
          )}

          <path d={area} fill="url(#gauntlet-area)" />
          <path d={line} fill="none" stroke="var(--elo-line)" strokeWidth="1.5" opacity="0.75" />

          {/* weight-class move flags — a gold pennant at the top with a dashed
              drop line to the node marking the first fight in a new division. */}
          {points.map((p, i) =>
            p.divisionChange ? (
              <g key={`flag-${p.date}-${i}`} opacity="0.85">
                <line
                  x1={x(i)} y1={top + 2} x2={x(i)} y2={y(p.ownElo)}
                  stroke="var(--accent-gold)" strokeWidth="1" strokeDasharray="2 3" opacity="0.45"
                />
                <path d={`M${x(i)},${top} l8,2.6 l-8,2.6 z`} fill="var(--accent-gold)" />
              </g>
            ) : null
          )}

          {points.map((p, i) => {
            const r = NODE_R[oppTier(p)];
            return (
              <g key={p.date + i}>
                {p.titleFight && (
                  <circle cx={x(i)} cy={y(p.ownElo)} r={r + 2.2} fill="none" stroke="var(--accent-gold)" strokeWidth="1.25" opacity="0.9" />
                )}
                {p.mainEvent && (
                  <circle cx={x(i)} cy={y(p.ownElo)} r={r + 2.2} fill="none" stroke="var(--accent-purple)" strokeWidth="1.25" opacity="0.9" />
                )}
                <circle cx={x(i)} cy={y(p.ownElo)} r={r} fill={resultColor(p.result)} stroke="var(--bg-secondary)" strokeWidth="1" />
              </g>
            );
          })}
        </g>

        {/* hover highlight — always mounted (following the panel's fight) so it
            fades in/out instead of popping. The adjacent segments brighten only
            gently; the glowing node is where the eye should land. */}
        <g
          style={{
            pointerEvents: 'none',
            opacity: hovered != null ? 1 : 0,
            transition: 'opacity 220ms ease',
          }}
        >
          <path d={highlightPath(panelIdx)} fill="none" stroke="var(--text-primary)" strokeWidth="1.5" opacity="0.4" />
          {(points[panelIdx].titleFight || points[panelIdx].mainEvent) && (
            <circle
              cx={x(panelIdx)} cy={y(points[panelIdx].ownElo)}
              r={NODE_R[oppTier(points[panelIdx])] * 1.6 + 3}
              fill="none"
              stroke={points[panelIdx].titleFight ? 'var(--accent-gold)' : 'var(--accent-purple)'}
              strokeWidth="1.5"
            />
          )}
          <circle
            cx={x(panelIdx)} cy={y(points[panelIdx].ownElo)}
            r={NODE_R[oppTier(points[panelIdx])] * 1.6}
            fill={resultColor(points[panelIdx].result)}
            stroke="#fff" strokeWidth="1.5"
            filter="url(#gauntlet-glow)"
          />
        </g>

        {/* invisible hit targets — generous radius so hovering is effortless */}
        {points.map((p, i) => (
          <circle
            key={`hit-${p.date}-${i}`}
            cx={x(i)} cy={y(p.ownElo)} r="15"
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => activate(i)}
            onClick={() => activate(i)}
          />
        ))}
      </svg>
      </div>

      {/* persistent fight information panel — hovering a node updates it */}
      <div
        className="mt-2 rounded-lg px-3.5 py-3"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span
              className="text-xl font-bold font-mono w-6 shrink-0 text-center"
              style={{ color: resultColor(sel.result) }}
            >
              {sel.result}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {sel.opponentName}
                {sel.titleFight && (
                  <span
                    className="ml-2 align-middle text-[9px] tracking-widest px-1.5 py-0.5 rounded"
                    style={{ color: 'var(--accent-gold)', border: '1px solid var(--accent-gold)' }}
                  >
                    TITLE FIGHT
                  </span>
                )}
                {sel.mainEvent && (
                  <span
                    className="ml-2 align-middle text-[9px] tracking-widest px-1.5 py-0.5 rounded"
                    style={{ color: 'var(--accent-purple)', border: '1px solid var(--accent-purple)' }}
                  >
                    MAIN EVENT
                  </span>
                )}
                {sel.divisionChange && (
                  <span
                    className="ml-2 align-middle text-[9px] tracking-widest px-1.5 py-0.5 rounded"
                    style={{ color: 'var(--accent-gold)', border: '1px solid var(--accent-gold)' }}
                  >
                    ⚑ MOVED
                  </span>
                )}
              </div>
              <div className="text-[10px] tracking-wide" style={{ color: 'var(--text-muted)' }}>
                {sel.method} · {formatDate(sel.date)} · {sel.weightClass}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-x-3 sm:gap-x-4 text-right font-mono">
            <PanelStat label="PRE ELO" value={String(sel.ownEloBefore)} />
            <PanelStat label="OPP ELO" value={String(sel.opponentElo)} />
            <PanelStat label="EXP. WIN" value={`${Math.round(sel.expected * 100)}%`} />
            <PanelStat
              label="SWING"
              value={`${sel.delta >= 0 ? '+' : ''}${sel.delta}`}
              color={sel.delta >= 0 ? 'var(--accent-green)' : 'var(--accent-red-light)'}
            />
            <PanelStat label="POST ELO" value={String(sel.ownElo)} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-green)' }} /> win
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-red-light)' }} /> loss
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: 'var(--accent-gold)' }} /> title fight
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: 'var(--accent-purple)' }} /> main event
        </span>
        <span className="flex items-center gap-1.5" style={{ color: 'var(--accent-gold)' }}>
          ⚑ weight-class move
        </span>
        {divMedianElo != null && (
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t border-dashed" style={{ borderColor: 'var(--accent-blue)' }} /> div median
          </span>
        )}
        {champElo != null && (
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t border-dotted" style={{ borderColor: 'var(--accent-gold)' }} /> division champ
          </span>
        )}
        <span>node size = opponent level · hover a fight for detail</span>
      </div>
    </div>
  );
}

function PanelStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[9px] tracking-widest font-sans whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-sm" style={{ color: color || 'var(--text-secondary)' }}>{value}</div>
    </div>
  );
}
