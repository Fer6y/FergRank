'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Gauntlet, GauntletPoint } from '@/lib/advancedStats';

// Shared Gauntlet for the compare page — BOTH fighters' Elo trajectories drawn
// on ONE calendar chart so their recent timelines read together. Fighter A is
// tagged red, fighter B blue (matching the striking/grappling accents used
// elsewhere on the page); nodes are solid fighter-coloured dots sized by
// opponent level. A hover caption carries the per-fight detail. Display-only.

interface Corner {
  name: string;
  gauntlet: Gauntlet;
}
interface Props {
  a: Corner;
  b: Corner;
}

const COLOR_A = 'var(--accent-red-light)';
const COLOR_B = 'var(--accent-blue)';

// Result fill (inside the fighter-colour ring): green win / red loss / grey draw
// — same result palette as the single-fighter Gauntlet.
function resultFill(r: GauntletPoint['result']): string {
  return r === 'W' ? 'var(--accent-green)' : r === 'L' ? 'var(--accent-red-light)' : 'var(--text-muted)';
}

// Opponent-level tiers → node size (same proxy as the single-fighter Gauntlet:
// no historical rank, so opponent Elo stands in). Nodes here run a touch
// smaller since the chart itself is scaled down for the compare layout.
const OPP_ELITE = 1650;
const OPP_RANKED = 1565;
const NODE_R = [3.4, 4.6, 5.8]; // standard / ranked-calibre / elite

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// True calendar x-axis (fixed pixels-per-year), anchored on the right to "today"
// — identical treatment to the single-fighter Gauntlet so idleness reads as a
// real gap. A little more compact here (smaller window + px/year) for the page.
const WINDOW_YEARS = 7;
const PX_PER_YEAR = 74;

function yearFloat(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return (y || 2000) + ((m || 1) - 1) / 12 + ((d || 1) - 1) / 365;
}

function oppTier(p: GauntletPoint): 0 | 1 | 2 {
  return p.opponentElo >= OPP_ELITE ? 2 : p.opponentElo >= OPP_RANKED ? 1 : 0;
}

function lastName(n: string): string {
  return n.split(' ').slice(-1)[0] || n;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[(m || 1) - 1]} ${d || 1}, ${y}`;
}

export default function CompareGauntlet({ a, b }: Props) {
  const A = a.gauntlet.points;
  const B = b.gauntlet.points;
  const [hover, setHover] = useState<{ f: 'a' | 'b'; i: number } | null>(null);
  // Same two series as the single-fighter Gauntlet, same DEFAULT (2026-08-10
  // product decision): 'inCage' moves only on results, so a win can never render
  // as a decline. 'true' is the opt-in actual-rating view. One honest caveat is
  // specific to THIS chart: each in-cage line is offset upward by that fighter's
  // own cumulative drift, so the vertical gap between the two lines understates/
  // overstates the real rating gap — the RATING numbers in the header cards are
  // the comparison to trust.
  const [series, setSeries] = useState<'true' | 'inCage'>('inCage');
  const inCage = series === 'inCage';
  // Value of the ACTIVE series for a point — used by every plot site below so
  // the lines, nodes, labels and hover caption can never disagree on the mode.
  const val = (p: GauntletPoint): number => (inCage ? p.inCageElo : p.ownElo);
  const scrollRef = useRef<HTMLDivElement>(null);

  const geo = useMemo(() => {
    const val = (p: GauntletPoint): number => (inCage ? p.inCageElo : p.ownElo);
    const H = 178;
    const top = 12;
    const bottom = H - 22;
    const left = 42;
    const rightPad = 64; // room for the endpoint name labels (longer surnames)

    const now = new Date();
    const nowYf = now.getFullYear() + now.getMonth() / 12 + (now.getDate() - 1) / 365;
    const allPts = [...A, ...B];
    const firstYf = Math.min(...allPts.map((p) => yearFloat(p.date)));
    const lastYf = Math.max(...allPts.map((p) => yearFloat(p.date)));
    const spanEnd = Math.max(nowYf, lastYf);
    const spanStart = Math.min(firstYf, spanEnd - WINDOW_YEARS);
    const totalYears = spanEnd - spanStart;

    const W = left + totalYears * PX_PER_YEAR + rightPad;
    const right = W - rightPad;
    const plotH = bottom - top;

    const elos = allPts.map(val);
    const rawMin = Math.min(...elos);
    const rawMax = Math.max(...elos);
    const pad = Math.max(25, (rawMax - rawMin) * 0.15);
    const yMin = Math.floor((rawMin - pad) / 50) * 50;
    const yMax = Math.ceil((rawMax + pad) / 50) * 50;

    const xAt = (yf: number) => left + (yf - spanStart) * PX_PER_YEAR;
    const x = (p: GauntletPoint) => xAt(yearFloat(p.date));
    const y = (elo: number) => top + plotH * (1 - (elo - yMin) / (yMax - yMin));

    const gridStep = yMax - yMin > 300 ? 100 : 50;
    const gridVals: number[] = [];
    for (let v = yMin; v <= yMax; v += gridStep) gridVals.push(v);

    const allTicks: { x: number; label: string }[] = [];
    for (let Y = Math.ceil(spanStart); Y <= Math.floor(spanEnd); Y++) {
      allTicks.push({ x: xAt(Y), label: String(Y) });
    }
    const tickStep = Math.max(1, Math.ceil(allTicks.length / 9));
    const shownTicks = allTicks.filter((_, idx) => idx % tickStep === 0);

    const linePath = (pts: GauntletPoint[]) =>
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p).toFixed(1)},${y(val(p)).toFixed(1)}`).join(' ');

    return {
      W, H, top, bottom, left, right, x, y, gridVals, shownTicks,
      lineA: linePath(A), lineB: linePath(B),
    };
  }, [A, B, inCage]);

  // Open scrolled to the right (most-recent / today) when a long career overflows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [geo.W]);

  const { W, H, bottom, left, right, x, y, gridVals, shownTicks, lineA, lineB } = geo;

  const endA = A[A.length - 1];
  const endB = B[B.length - 1];
  // Nudge the two endpoint labels apart if they'd collide.
  let labAy = y(val(endA));
  let labBy = y(val(endB));
  if (Math.abs(labAy - labBy) < 12) {
    const aUp = val(endA) >= val(endB);
    labAy += aUp ? -6 : 6;
    labBy += aUp ? 6 : -6;
  }

  // Each node: result colour in the FILL (green win / red loss), the fighter's
  // identity colour on the OUTER ring, and a thin NEUTRAL (near-white) separator
  // between them so the ring pops against any fill — including the red-fighter /
  // red-loss case where a dark rim would still read as one red blob.
  const renderNodes = (pts: GauntletPoint[], color: string, f: 'a' | 'b') =>
    pts.map((p, i) => {
      const r = NODE_R[oppTier(p)];
      const isHover = hover?.f === f && hover.i === i;
      const core = isHover ? r + 1.8 : r;
      return (
        <g key={f + i} opacity={hover && !isHover ? 0.85 : 1}>
          {p.titleFight && (
            <circle cx={x(p)} cy={y(val(p))} r={core + 3} fill="none" stroke="var(--accent-gold)" strokeWidth="1.1" opacity="0.9" />
          )}
          {/* fighter-identity ring */}
          <circle cx={x(p)} cy={y(val(p))} r={core + 1.4} fill="none" stroke={color} strokeWidth="1.5" />
          {/* result core + neutral separator rim */}
          <circle cx={x(p)} cy={y(val(p))} r={core} fill={resultFill(p.result)} stroke="var(--text-primary)" strokeWidth="1.1" />
        </g>
      );
    });

  const renderHits = (pts: GauntletPoint[], f: 'a' | 'b') =>
    pts.map((p, i) => (
      <circle
        key={`hit-${f}-${i}`}
        cx={x(p)} cy={y(val(p))} r="12"
        fill="transparent"
        style={{ cursor: 'pointer' }}
        onMouseEnter={() => setHover({ f, i })}
      />
    ));

  const hp = hover ? (hover.f === 'a' ? A : B)[hover.i] : null;
  const hoverColor = hover?.f === 'a' ? COLOR_A : COLOR_B;
  const hoverName = hover ? (hover.f === 'a' ? a.name : b.name) : '';

  return (
    <div className="rounded-xl px-4 py-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 mb-1">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] tracking-widest" style={{ color: 'var(--text-muted)' }}>
            THE GAUNTLET · {inCage ? 'SHARED IN-CAGE TRAJECTORY' : 'SHARED ELO TRAJECTORY'}
          </span>
          <span className="inline-flex rounded overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {([['inCage', 'IN-CAGE'], ['true', 'TRUE ELO']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSeries(key)}
                aria-pressed={series === key}
                className="px-2 py-0.5 text-[9px] tracking-widest transition-colors"
                style={{
                  backgroundColor: series === key ? 'var(--bg-elevated)' : 'transparent',
                  color: series === key ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {label}
              </button>
            ))}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
            <span className="w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: COLOR_A }} /> {lastName(a.name)}
          </span>
          <span className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
            <span className="w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: COLOR_B }} /> {lastName(b.name)}
          </span>
        </div>
      </div>

      {/* Hover caption — carries the per-fight detail (result/opponent/Elo) so the
          nodes can stay pure fighter-colour. Fixed height so the chart never jumps. */}
      <div className="h-4 mb-1 text-[10px] tracking-wide truncate" style={{ color: hp ? hoverColor : 'var(--text-muted)' }}>
        {hp ? (
          <>
            <span style={{ fontWeight: 600 }}>{lastName(hoverName)}</span>
            <span style={{ color: 'var(--text-muted)' }}>
              {' '}· {hp.result} vs {hp.opponentName} · {formatDate(hp.date)} ·{' '}
              {inCage ? `in-cage ${hp.inCageElo} (Elo ${hp.ownElo})` : `Elo ${hp.ownElo}`}
            </span>
          </>
        ) : inCage ? (
          'IN-CAGE: results only — a win always steps up; layoff/weight-move drift excluded (the RATING cards above carry the real gap)'
        ) : (
          'Ring = fighter · fill = result (green win / red loss) · size = opponent · gold = title'
        )}
      </div>

      <div ref={scrollRef} className="overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          style={{ maxWidth: 'none', display: 'block' }}
          role="img"
          aria-label={`Elo trajectories for ${a.name} and ${b.name} on a shared calendar timeline`}
          onMouseLeave={() => setHover(null)}
        >
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

          {/* trajectory lines — the fainter of the two sits under the other */}
          <path d={lineB} fill="none" stroke={COLOR_B} strokeWidth="1.6" opacity={hover?.f === 'a' ? 0.4 : 0.85} />
          <path d={lineA} fill="none" stroke={COLOR_A} strokeWidth="1.6" opacity={hover?.f === 'b' ? 0.4 : 0.85} />

          {renderNodes(B, COLOR_B, 'b')}
          {renderNodes(A, COLOR_A, 'a')}

          {/* endpoint name tags — reinforce who is who directly on the chart */}
          <text x={x(endB) + 6} y={labBy} fill={COLOR_B} fontSize="9.5" fontWeight={600} dominantBaseline="middle">
            {lastName(b.name)}
          </text>
          <text x={x(endA) + 6} y={labAy} fill={COLOR_A} fontSize="9.5" fontWeight={600} dominantBaseline="middle">
            {lastName(a.name)}
          </text>

          {/* hit targets last so they sit above everything */}
          {renderHits(B, 'b')}
          {renderHits(A, 'a')}
        </svg>
      </div>
    </div>
  );
}
