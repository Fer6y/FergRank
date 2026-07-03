'use client';

import { useMemo, useState } from 'react';
import type { Gauntlet, GauntletPoint } from '@/lib/advancedStats';

interface Props {
  gauntlet: Gauntlet;
}

// The Gauntlet — the career-trajectory chart, redesigned 2026-07-02 per the
// Gauntlet brief. The chart draws ONE thing: the fighter's own Elo line, with
// a small node per fight sitting on it. Colour is reserved for result (green
// win / red loss), node size encodes opponent level, and a gold halo marks a
// championship fight. Everything else — opponent, method, expectancy, rating
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
  const { points, totalOverperf } = gauntlet;
  const n = points.length;
  // hovered = live highlight on the chart; the panel remembers the last
  // hovered fight so it never goes blank (defaults to the most recent fight).
  const [hovered, setHovered] = useState<number | null>(null);
  const [panelIdx, setPanelIdx] = useState(n - 1);

  const geometry = useMemo(() => {
    const W = 640;
    const H = 216;
    const top = 14;
    const bottom = H - 22;
    const left = 42;
    const right = W - 14;
    const plotW = right - left;
    const plotH = bottom - top;

    const rawMin = Math.min(...points.map((p) => p.ownElo));
    const rawMax = Math.max(...points.map((p) => p.ownElo));
    const pad = Math.max(25, (rawMax - rawMin) * 0.15);
    const yMin = Math.floor((rawMin - pad) / 50) * 50;
    const yMax = Math.ceil((rawMax + pad) / 50) * 50;

    const x = (i: number) => left + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
    const y = (elo: number) => top + plotH * (1 - (elo - yMin) / (yMax - yMin));

    const gridStep = yMax - yMin > 300 ? 100 : 50;
    const gridVals: number[] = [];
    for (let v = yMin; v <= yMax; v += gridStep) gridVals.push(v);

    // Year ticks where the calendar year changes (thinned when crowded).
    const ticks: { i: number; label: string }[] = [];
    let lastYear = '';
    points.forEach((p, i) => {
      const yr = p.date.slice(0, 4);
      if (yr !== lastYear) {
        ticks.push({ i, label: yr });
        lastYear = yr;
      }
    });
    const tickStep = Math.max(1, Math.ceil(ticks.length / 8));
    const shownTicks = ticks.filter((_, idx) => idx % tickStep === 0);

    const line = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.ownElo).toFixed(1)}`)
      .join(' ');
    const area = `${line} L${x(n - 1).toFixed(1)},${bottom} L${x(0).toFixed(1)},${bottom} Z`;

    return { W, H, bottom, left, right, x, y, gridVals, shownTicks, line, area };
  }, [points, n]);

  if (n < 2) return null;
  const { W, H, bottom, left, right, x, y, gridVals, shownTicks, line, area } = geometry;

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

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="The fighter's Elo rating after each fight, oldest to newest"
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
            <text key={t.label + t.i} x={x(t.i)} y={bottom + 14} fill="var(--text-muted)" fontSize="9" textAnchor="middle">
              {t.label}
            </text>
          ))}

          <path d={area} fill="url(#gauntlet-area)" />
          <path d={line} fill="none" stroke="var(--elo-line)" strokeWidth="1.5" opacity="0.75" />

          {points.map((p, i) => {
            const r = NODE_R[oppTier(p)];
            return (
              <g key={p.date + i}>
                {p.titleFight && (
                  <circle cx={x(i)} cy={y(p.ownElo)} r={r + 2.2} fill="none" stroke="var(--accent-gold)" strokeWidth="1.25" opacity="0.9" />
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
          {points[panelIdx].titleFight && (
            <circle
              cx={x(panelIdx)} cy={y(points[panelIdx].ownElo)}
              r={NODE_R[oppTier(points[panelIdx])] * 1.6 + 3}
              fill="none" stroke="var(--accent-gold)" strokeWidth="1.5"
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
              </div>
              <div className="text-[10px] tracking-wide" style={{ color: 'var(--text-muted)' }}>
                {sel.method} · {formatDate(sel.date)}
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
