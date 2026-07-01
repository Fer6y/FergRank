import type { FormPoint } from '@/lib/advancedStats';

interface Props {
  timeline: FormPoint[];   // ascending by date
  rolling: number[];       // rolling-3 landedPer15, aligned to timeline
  careerAvg: number;       // career landedPer15 reference line
}

// Per-fight output timeline: strikes landed per 15 min (dots, coloured by
// result) with a rolling-3 trend line, strikes absorbed as a thin grey line,
// and the career average dashed. Pure SVG so it renders on the server —
// native <title> tooltips per dot. A declining trend line IS the story
// ("aging fighter, output falling"), so the trend gets the loudest colour.
export default function FormTimeline({ timeline, rolling, careerAvg }: Props) {
  const n = timeline.length;
  if (n < 2) return null;

  const W = 640;
  const H = 216;
  const top = 14;
  const bottom = H - 30;
  const left = 38;
  const right = W - 12;
  const plotW = right - left;
  const plotH = bottom - top;

  // Winsorized scale: a 30-second flash KO can produce a silly per-15 rate;
  // cap the axis near the 95th percentile so one outlier doesn't flatten
  // the whole career into the bottom of the chart.
  const vals = timeline.flatMap((p) => [p.landedPer15, p.absorbedPer15]);
  const sorted = [...vals].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const yMax = Math.max(20, Math.ceil((p95 * 1.15) / 10) * 10);

  const x = (i: number) => left + (i * plotW) / (n - 1);
  const y = (v: number) => top + plotH * (1 - Math.min(v, yMax) / yMax);

  const linePath = (get: (i: number) => number) =>
    timeline.map((_, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(get(i)).toFixed(1)}`).join(' ');

  const resultColor = (r: string) =>
    r === 'W' ? 'var(--accent-green)' : r === 'L' ? 'var(--accent-red-light)' : 'var(--text-muted)';

  // Year labels where the calendar year changes (thinned when crowded).
  const ticks: { i: number; label: string }[] = [];
  let lastYear = '';
  timeline.forEach((p, i) => {
    const yr = p.date.slice(0, 4);
    if (yr !== lastYear) {
      ticks.push({ i, label: yr });
      lastYear = yr;
    }
  });
  const tickStep = Math.ceil(ticks.length / 8);
  const shownTicks = ticks.filter((_, idx) => idx % tickStep === 0);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Strike output per 15 minutes, by fight">
        {/* horizontal gridlines */}
        {[0, yMax / 2, yMax].map((v) => (
          <g key={v}>
            <line x1={left} y1={y(v)} x2={right} y2={y(v)} stroke="var(--border)" strokeWidth="1" />
            <text x={left - 6} y={y(v)} fill="var(--text-muted)" fontSize="9" textAnchor="end" dominantBaseline="middle">
              {Math.round(v)}
            </text>
          </g>
        ))}

        {/* year ticks */}
        {shownTicks.map((t) => (
          <text key={t.label + t.i} x={x(t.i)} y={bottom + 14} fill="var(--text-muted)" fontSize="9" textAnchor="middle">
            {t.label}
          </text>
        ))}

        {/* career average reference */}
        <line
          x1={left} y1={y(careerAvg)} x2={right} y2={y(careerAvg)}
          stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4 4" opacity="0.6"
        />
        <text x={right} y={y(careerAvg) - 4} fill="var(--text-muted)" fontSize="8" textAnchor="end" opacity="0.8">
          career avg
        </text>

        {/* strikes absorbed (context, thin grey) */}
        <path d={linePath((i) => timeline[i].absorbedPer15)} fill="none" stroke="var(--text-muted)" strokeWidth="1.25" opacity="0.45" />

        {/* rolling-3 trend of landed (the headline) */}
        <path d={linePath((i) => rolling[i] ?? timeline[i].landedPer15)} fill="none" stroke="var(--accent-red-light)" strokeWidth="2" />

        {/* per-fight landed dots, coloured by result */}
        {timeline.map((p, i) => (
          <circle key={p.date + i} cx={x(i)} cy={y(p.landedPer15)} r="3.2" fill={resultColor(p.result)} stroke="var(--bg-secondary)" strokeWidth="1">
            <title>
              {`${p.date} · ${p.result} vs ${p.opponentName}\n${p.landedPer15} landed / ${p.absorbedPer15} absorbed per 15 min · ${p.method}`}
            </title>
          </circle>
        ))}
      </svg>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-green)' }} /> win
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-red-light)' }} /> loss
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5" style={{ backgroundColor: 'var(--accent-red-light)' }} /> output trend (rolling 3)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 opacity-50" style={{ backgroundColor: 'var(--text-muted)' }} /> strikes absorbed
        </span>
      </div>
    </div>
  );
}
