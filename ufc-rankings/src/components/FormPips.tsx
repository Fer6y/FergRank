// Last-5 form squares, newest first. Title fights get the gold underline so a
// loss to the champ reads differently from a loss to a mid-carder. Underneath,
// a light timeline dates the window: the year of the most recent fight on the
// newest end, the year of the 5th-most-recent on the other — so five results
// packed into 18 months read differently from five spread over 6 years.
// Presentational only (no hooks) — safe in both server and client components.

export interface FormPipFight {
  result: 'W' | 'L' | 'D';
  date: string; // ISO, YYYY-MM-DD or longer; '' when unknown
  isTitle?: boolean;
  label?: string; // e.g. "KO/TKO R2 vs. Opponent" — tooltip context
}

export const resultColor = (r: 'W' | 'L' | 'D') =>
  r === 'W' ? 'var(--accent-green)' : r === 'L' ? 'var(--accent-red-light)' : 'var(--text-muted)';

const pipBg = (r: 'W' | 'L' | 'D') =>
  r === 'W' ? 'rgba(45,212,126,0.15)' : r === 'L' ? 'rgba(255,45,45,0.13)' : 'rgba(160,160,181,0.12)';

function pipTitle(f: FormPipFight): string {
  const when = f.date
    ? new Date(f.date.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      })
    : '';
  return [f.result, f.label, f.isTitle ? 'TITLE FIGHT' : '', when].filter(Boolean).join(' · ');
}

const yearOf = (date: string): string | null => (/^\d{4}/.test(date) ? date.slice(0, 4) : null);

export default function FormPips({
  fights,
  compact = false,
  justifyEnd = false,
}: {
  fights: FormPipFight[];
  compact?: boolean;
  justifyEnd?: boolean;
}) {
  if (fights.length === 0) {
    return compact ? (
      <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>–</span>
    ) : (
      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No UFC fights on record</span>
    );
  }

  const newestYear = yearOf(fights[0].date);
  const oldestYear = yearOf(fights[fights.length - 1].date);
  const showSpan = fights.length > 1 && newestYear != null && oldestYear != null;
  const spanTitle = showSpan
    ? newestYear === oldestYear
      ? `Last ${fights.length} fights · all in ${newestYear}`
      : `Last ${fights.length} fights · ${oldestYear} to ${newestYear}`
    : undefined;

  return (
    <div className={`flex ${justifyEnd ? 'sm:justify-end' : ''}`}>
      <div className="inline-flex flex-col">
        <div className="flex items-center gap-1.5">
          {fights.map((rf, i) => (
            <span
              key={i}
              title={pipTitle(rf)}
              className={`inline-flex items-center justify-center rounded-[3px] font-mono ${
                compact ? 'w-3.5 h-3.5' : 'w-4 h-4'
              } text-[10px]`}
              style={{
                color: resultColor(rf.result),
                backgroundColor: pipBg(rf.result),
                boxShadow: rf.isTitle ? 'inset 0 -2px 0 0 var(--accent-gold)' : undefined,
              }}
            >
              {rf.result}
            </span>
          ))}
        </div>
        {showSpan && (
          <div className="w-full mt-1" title={spanTitle}>
            <div className="h-px w-full" style={{ backgroundColor: 'var(--border-light)' }} />
            <div
              className={`flex justify-between font-mono leading-none mt-[3px] ${
                compact ? 'text-[8px]' : 'text-[9px]'
              }`}
              style={{ color: 'var(--text-muted)' }}
            >
              <span>{newestYear}</span>
              <span>{oldestYear}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
