import type { Gauntlet, GauntletPoint } from '@/lib/advancedStats';

interface Props {
  gauntlet: Gauntlet;
}

// The Gauntlet — the career-story chart. Each fight is a dot at the OPPONENT's
// Elo the night it happened (dot height = level of competition; colour = result;
// gold ring = finish; size = how much the fighter's own rating moved). A muted
// line traces the fighter's OWN Elo through time, so you can read a career
// climbing, plateauing, or sliding at a glance, and spot upsets as green dots
// sitting well above the line. Overperformance (how often they beat the Elo
// prediction) rides along subtly as a faint gold lane at the base. Pure SVG →
// renders on the server with native <title> tooltips.
export default function Gauntlet({ gauntlet }: Props) {
  const { points, totalOverperf } = gauntlet;
  const n = points.length;
  if (n < 2) return null;

  const W = 640;
  const H = 260;
  const top = 16;
  const bottom = H - 40;      // leave room for the overperformance lane + axis
  const laneTop = bottom + 6; // faint overperformance lane
  const laneH = 14;
  const left = 42;
  const right = W - 14;
  const plotW = right - left;
  const plotH = bottom - top;

  // Elo scale, padded so dots don't kiss the edges. Rounded to tidy gridlines.
  const rawMin = Math.min(...points.flatMap((p) => [p.opponentElo, p.ownElo]));
  const rawMax = Math.max(...points.flatMap((p) => [p.opponentElo, p.ownElo]));
  const pad = Math.max(30, (rawMax - rawMin) * 0.12);
  const yMin = Math.floor((rawMin - pad) / 50) * 50;
  const yMax = Math.ceil((rawMax + pad) / 50) * 50;

  const x = (i: number) => left + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const y = (elo: number) => top + plotH * (1 - (elo - yMin) / (yMax - yMin));

  // Dot radius scales gently with the Elo swing that fight caused (2.8–6).
  const maxAbsDelta = Math.max(6, ...points.map((p) => Math.abs(p.delta)));
  const radius = (p: GauntletPoint) => 2.8 + 3.2 * Math.min(1, Math.abs(p.delta) / maxAbsDelta);

  const resultColor = (r: string) =>
    r === 'W' ? 'var(--accent-green)' : r === 'L' ? 'var(--accent-red-light)' : 'var(--text-muted)';

  const ownLine = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.ownElo).toFixed(1)}`)
    .join(' ');

  // Own-Elo area fill (very faint) to give the trajectory a little body.
  const ownArea = `${ownLine} L${x(n - 1).toFixed(1)},${bottom} L${x(0).toFixed(1)},${bottom} Z`;

  // Gridlines at 100-Elo steps.
  const gridStep = yMax - yMin > 400 ? 100 : 50;
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

  // Overperformance lane: a faint gold sparkline of the running Σ(actual −
  // expected), scaled within its own thin band so it reads as texture, not a
  // second headline. The zero line is the "exactly as predicted" baseline.
  const cumVals = points.map((p) => p.cumOverperf);
  const cumMax = Math.max(0.5, ...cumVals.map(Math.abs));
  const laneY = (v: number) => laneTop + laneH * (1 - (v + cumMax) / (2 * cumMax));
  const cumLine = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${laneY(p.cumOverperf).toFixed(1)}`)
    .join(' ');

  const overSign = totalOverperf > 0 ? '+' : '';

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-[10px] tracking-widest" style={{ color: 'var(--text-muted)' }}>
          THE GAUNTLET · OPPONENT ELO PER FIGHT
        </div>
        <div
          className="text-[10px] tracking-wide font-mono"
          style={{ color: totalOverperf >= 0 ? 'var(--accent-gold)' : 'var(--text-muted)' }}
          title="Cumulative wins above (or below) what the Elo prediction expected across the plotted fights"
        >
          {overSign}{totalOverperf.toFixed(1)} vs expected
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Opponent Elo per fight, with the fighter's own Elo trajectory">
        {/* gridlines + Elo labels */}
        {gridVals.map((v) => (
          <g key={v}>
            <line x1={left} y1={y(v)} x2={right} y2={y(v)} stroke="var(--border)" strokeWidth="1" />
            <text x={left - 6} y={y(v)} fill="var(--text-muted)" fontSize="9" textAnchor="end" dominantBaseline="middle">
              {v}
            </text>
          </g>
        ))}

        {/* year ticks */}
        {shownTicks.map((t) => (
          <text key={t.label + t.i} x={x(t.i)} y={bottom + 2} fill="var(--text-muted)" fontSize="9" textAnchor="middle">
            {t.label}
          </text>
        ))}

        {/* own-Elo trajectory: faint area + line (neutral slate — context, not a hue) */}
        <path d={ownArea} fill="var(--elo-line)" opacity="0.05" />
        <path d={ownLine} fill="none" stroke="var(--elo-line)" strokeWidth="1.75" opacity="0.7" />

        {/* per-fight opponent dots. Ring marks a finish: neon orange = KO/TKO,
            blue = submission. Gold is reserved for champion/title elsewhere. */}
        {points.map((p, i) => {
          const ringColor = p.finishType === 'ko' ? 'var(--accent-magenta)' : p.finishType === 'sub' ? 'var(--accent-cyan)' : null;
          const finishLabel = p.finishType === 'ko' ? ' · KO/TKO' : p.finishType === 'sub' ? ' · submission' : '';
          return (
            <g key={p.date + i}>
              {ringColor && (
                <circle cx={x(i)} cy={y(p.opponentElo)} r={radius(p) + 2.4} fill="none" stroke={ringColor} strokeWidth="1.75" />
              )}
              <circle cx={x(i)} cy={y(p.opponentElo)} r={radius(p)} fill={resultColor(p.result)} stroke="var(--bg-secondary)" strokeWidth="1">
                <title>
                  {`${p.date} · ${p.result} vs ${p.opponentName}\nOpponent Elo ${p.opponentElo} · your Elo ${p.ownElo}\nWin odds were ${(p.expected * 100).toFixed(0)}% · Elo ${p.delta >= 0 ? '+' : ''}${p.delta}${finishLabel}`}
                </title>
              </circle>
            </g>
          );
        })}

        {/* overperformance lane (subtle) */}
        <line x1={left} y1={laneY(0)} x2={right} y2={laneY(0)} stroke="var(--border)" strokeWidth="0.75" strokeDasharray="2 3" />
        <path d={cumLine} fill="none" stroke="var(--accent-gold)" strokeWidth="1.25" opacity="0.5" />
        <text x={left - 6} y={laneY(0)} fill="var(--text-muted)" fontSize="7.5" textAnchor="end" dominantBaseline="middle" opacity="0.7">
          exp.
        </text>
      </svg>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-green)' }} /> win
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-red-light)' }} /> loss
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: 'var(--accent-magenta)' }} /> KO/TKO
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: 'var(--accent-cyan)' }} /> submission
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5" style={{ backgroundColor: 'var(--elo-line)', opacity: 0.7 }} /> own Elo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5" style={{ backgroundColor: 'var(--accent-gold)', opacity: 0.5 }} /> vs expected
        </span>
        <span style={{ color: 'var(--text-muted)' }}>· dot size = Elo swing</span>
      </div>
    </div>
  );
}
