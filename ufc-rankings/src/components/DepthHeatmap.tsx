'use client';

import { useRouter } from 'next/navigation';
import { shortDivision } from '@/lib/divisions';
import type { DashboardDivision } from '@/app/api/dashboard/route';

// Division depth heatmap: one row per division, one cell per ranked slot
// (champion first), coloured by raw core Elo on a scale shared across ALL
// divisions — Elo is one global pool, so a hot streak deep in a row means a
// genuinely dangerous division ("shark tank"), a row that fades fast means a
// shallow one. Hover any cell for the fighter behind it. Display-only.
export default function DepthHeatmap({ divisions }: { divisions: DashboardDivision[] }) {
  const router = useRouter();
  const rows = divisions.filter((d) => d.depth.length > 0);
  if (rows.length === 0) return null;

  const all = rows.flatMap((d) => d.depth.map((c) => c.elo));
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = Math.max(1, max - min);
  const heat = (elo: number) => {
    const t = (elo - min) / span;
    return `rgba(210,10,10,${(0.05 + 0.92 * Math.pow(t, 1.35)).toFixed(3)})`;
  };

  const median15 = (d: DashboardDivision) => {
    const top = d.depth.slice(0, 15).map((c) => c.elo).sort((a, b) => a - b);
    return top.length ? top[Math.floor(top.length / 2)] : 0;
  };

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2.5">
        <h2 className="text-[10px] tracking-widest" style={{ color: 'var(--text-muted)' }}>
          DIVISION DEPTH · TOP 40 BY CORE ELO
        </h2>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          hotter = stronger · same scale across divisions
        </span>
      </div>
      <div
        className="rounded-xl p-4 space-y-1.5"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        {rows.map((d) => (
          <button
            key={d.division}
            onClick={() => router.push(`/division/${encodeURIComponent(d.division)}`)}
            className="w-full flex items-center gap-2.5 group"
            title={`${d.division} — open rankings`}
          >
            <span
              className="font-mono text-[10px] w-9 text-right shrink-0 group-hover:underline"
              style={{ color: 'var(--text-secondary)' }}
            >
              {shortDivision(d.division)}
            </span>
            <span className="flex flex-1 gap-px h-4 rounded-sm overflow-hidden">
              {d.depth.map((c, i) => (
                <span
                  key={i}
                  className="flex-1 min-w-0"
                  style={{ backgroundColor: heat(c.elo) }}
                  title={`${i === 0 ? 'C' : `#${i}`} ${c.name} · ${c.elo}`}
                />
              ))}
            </span>
            <span className="font-mono text-[10px] w-10 text-left shrink-0" style={{ color: 'var(--text-muted)' }}>
              {median15(d)}
            </span>
          </button>
        ))}
        <div className="flex items-center justify-between pt-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <span>← champion, then ranks 1–40 →</span>
          <span>right column: median Elo of the top 15</span>
        </div>
      </div>
    </section>
  );
}
