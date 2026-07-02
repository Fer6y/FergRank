import Link from 'next/link';
import type { FightTrace } from '@/lib/eloEngine';

// Per-fight strike rates (per 15 min), keyed by fightId — joined onto the Elo
// history so each row carries both the rating swing and the striking margin.
export interface StrikeRate {
  landed: number;
  absorbed: number;
}

interface Props {
  history: FightTrace[];               // newest-first
  strikes: Record<string, StrikeRate>; // fightId → landed/absorbed per 15
  limit?: number;
}

// Fight history with a DOMINANCE STRIP per row: a diverging bar with strikes
// absorbed to the left (red) and strikes landed to the right (green), both
// pace-normalized and scaled to the fighter's own busiest fight. A long green
// arm over a stub of red = a shutout; two near-equal arms = a competitive
// scrap. The Elo swing stays on the right as the bottom-line result. Rows from
// the Sherdog recency top-up carry no strike data, so they show the result
// only. Pure server component.
export default function FightHistory({ history, strikes, limit = 20 }: Props) {
  if (history.length === 0) {
    return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No dated fights on record.</p>;
  }

  const shown = history.slice(0, limit);

  // Normalize bars to the fighter's own busiest fight (either direction), so
  // the strips are comparable within the profile without a silly flash-KO rate
  // blowing out the scale. Floor of 20/15 keeps low-output careers readable.
  const maxRate = Math.max(
    20,
    ...shown.flatMap((f) => {
      const s = strikes[f.fightId];
      return s ? [s.landed, s.absorbed] : [];
    })
  );

  return (
    <div className="space-y-1.5">
      {shown.map((f, i) => {
        const linkable = !!f.opponentId && !f.opponentId.startsWith('sd:');
        const s = strikes[f.fightId];
        const resultColor =
          f.result === 'W' ? 'var(--accent-green)' : f.result === 'L' ? 'var(--accent-red-light)' : 'var(--text-secondary)';
        const resultBg =
          f.result === 'W' ? 'rgba(45,212,126,0.18)' : f.result === 'L' ? 'rgba(255,45,45,0.14)' : 'var(--bg-elevated)';

        const row = (
          <>
            <span
              className="w-6 h-6 rounded flex items-center justify-center text-xs font-medium shrink-0"
              style={{ backgroundColor: resultBg, color: resultColor }}
            >
              {f.result}
            </span>

            <div className="min-w-0 w-36 sm:w-44 shrink-0">
              <div
                className="text-sm truncate"
                style={{
                  color: 'var(--text-primary)',
                  textDecoration: linkable ? 'underline' : undefined,
                  textDecorationColor: 'var(--border-light)',
                  textUnderlineOffset: '3px',
                }}
              >
                {f.opponentName || 'Unknown opponent'}
              </div>
              <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                {formatMethod(f.method)}
                {f.round ? ` · R${f.round}` : ''} · {new Date(f.date).getFullYear()}
              </div>
            </div>

            {/* Dominance strip: absorbed (left) vs landed (right) */}
            <div className="flex-1 min-w-0 hidden sm:flex items-center h-4" aria-hidden="true">
              {s ? (
                <>
                  <div className="flex-1 flex justify-end">
                    <span
                      className="h-2.5 rounded-l-sm"
                      style={{ width: `${(s.absorbed / maxRate) * 100}%`, backgroundColor: 'var(--accent-red-light)', opacity: 0.5 }}
                    />
                  </div>
                  <span className="w-px h-3.5 shrink-0" style={{ backgroundColor: 'var(--border-light)' }} />
                  <div className="flex-1">
                    <span
                      className="block h-2.5 rounded-r-sm"
                      style={{ width: `${(s.landed / maxRate) * 100}%`, backgroundColor: 'var(--accent-green)', opacity: 0.85 }}
                    />
                  </div>
                </>
              ) : (
                <span className="text-[10px] mx-auto" style={{ color: 'var(--text-muted)' }}>no strike data</span>
              )}
            </div>

            <span
              className="font-mono text-sm shrink-0 w-10 text-right"
              style={{ color: f.delta >= 0 ? 'var(--accent-green)' : 'var(--accent-red-light)' }}
              title={s ? `${s.landed.toFixed(0)} landed / ${s.absorbed.toFixed(0)} absorbed per 15 · Elo ${f.delta >= 0 ? '+' : ''}${f.delta.toFixed(0)}` : 'Elo change from this fight'}
            >
              {f.delta >= 0 ? '+' : ''}{f.delta.toFixed(0)}
            </span>
          </>
        );

        const cls = 'flex items-center gap-3 px-3 py-2 rounded-lg';
        const style = { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' };
        return linkable ? (
          <Link
            key={f.fightId + i}
            href={`/fighter/${f.opponentId}`}
            className={`${cls} transition-colors hover:brightness-125`}
            style={style}
            title={`View ${f.opponentName}`}
          >
            {row}
          </Link>
        ) : (
          <div key={f.fightId + i} className={cls} style={style}>
            {row}
          </div>
        );
      })}
      {history.length > limit && (
        <p className="text-xs text-center pt-1" style={{ color: 'var(--text-muted)' }}>
          + {history.length - limit} earlier fights
        </p>
      )}
      <div className="flex items-center justify-end gap-3 pt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: 'var(--accent-red-light)', opacity: 0.5 }} /> absorbed /15
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: 'var(--accent-green)', opacity: 0.85 }} /> landed /15
        </span>
      </div>
    </div>
  );
}

function formatMethod(method: string): string {
  const m = method.trim();
  const map: Record<string, string> = {
    'U-DEC': 'Decision (unanimous)',
    'S-DEC': 'Decision (split)',
    'M-DEC': 'Decision (majority)',
    SUB: 'Submission',
    'KO/TKO': 'KO/TKO',
  };
  return map[m] || m || 'Result';
}
