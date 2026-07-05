import type { Distinction } from '@/lib/distinctions';

// Small "decal" badges rendered next to a fighter's name. Purely presentational
// — fed the pre-sorted Distinction[] from lib/distinctions.ts. The ring/belt
// glyphs deliberately reuse the Gauntlet's visual language (gold title ring,
// purple main-event ring) so the profile reads as one system. Hand-rolled inline
// SVG, matching the app's no-icon-library convention.

interface Props {
  distinctions: Distinction[];
  max?: number;    // cap for compact views (rows/compare/p4p); omit = show all
  size?: number;   // glyph box in px (default 15)
}

export default function DistinctionDecals({ distinctions, max, size = 15 }: Props) {
  if (!distinctions.length) return null;
  const shown = max != null ? distinctions.slice(0, max) : distinctions;
  const extra = distinctions.length - shown.length;

  return (
    <span className="inline-flex items-center gap-[5px] align-middle">
      {shown.map((d) => (
        <Decal key={d.kind} d={d} size={size} />
      ))}
      {extra > 0 && (
        <span
          className="font-mono leading-none"
          style={{ fontSize: size - 4, color: 'var(--text-muted)' }}
          title={distinctions.slice(shown.length).map((d) => d.label).join(' · ')}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}

function Decal({ d, size }: { d: Distinction; size: number }) {
  return (
    <span
      className="inline-flex items-center gap-[2px] leading-none"
      title={d.label}
      role="img"
      aria-label={d.label}
    >
      <Glyph d={d} size={size} />
      {d.count != null && (
        <span className="font-mono leading-none" style={{ fontSize: size - 4, color: d.color }}>
          {d.count}
        </span>
      )}
    </span>
  );
}

function Glyph({ d, size }: { d: Distinction; size: number }) {
  const s = size;
  switch (d.kind) {
    case 'champion':
      // Solid gold disc with a "C" — the reigning-champion mark.
      return (
        <span
          className="inline-flex items-center justify-center rounded-full font-display"
          style={{
            width: s + 3,
            height: s + 3,
            backgroundColor: d.color,
            color: '#3a2c06',
            fontSize: s - 4,
            fontWeight: 600,
          }}
        >
          C
        </span>
      );

    case 'formerChampion':
      // Faded gold crown outline — held a belt, but not the reigning champ.
      return (
        <svg width={s + 1} height={s + 1} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ opacity: 0.6 }}>
          <path
            d="M4 8l3.5 3.5L12 5l4.5 6.5L20 8l-1.5 10h-13L4 8z"
            fill="none"
            stroke={d.color}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      );

    case 'titleFights':
    case 'mainEvents':
      // Hollow ring — gold (title) / purple (main event), matching the Gauntlet.
      return (
        <span
          className="inline-block rounded-full"
          style={{ width: s, height: s, border: `2px solid ${d.color}` }}
        />
      );

    case 'titleWins':
      // Championship belt — a gold strap with a prominent oval centre plate
      // (the title plate) so it reads unmistakably as a belt, not a pill.
      return (
        <svg width={s + 3} height={s + 3} viewBox="0 0 24 24" aria-hidden="true">
          <rect x="0" y="8.5" width="24" height="7" rx="2" fill={d.color} />
          <rect x="0" y="8.5" width="24" height="7" rx="2" fill="none" stroke="#3a2c06" strokeWidth="1" opacity="0.35" />
          <ellipse cx="12" cy="12" rx="6" ry="7.5" fill={d.color} stroke="#3a2c06" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="2.4" fill="#3a2c06" />
        </svg>
      );

    case 'undefeated':
      return (
        <svg width={s + 1} height={s + 1} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 2l8 3v6c0 5-3.4 8.2-8 9.5C7.4 19.2 4 16 4 11V5l8-3z"
            fill="none"
            stroke={d.color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M8.5 11.8l2.4 2.4 4.4-4.6" stroke={d.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );

    case 'winStreak':
      // Flame.
      return (
        <svg width={s + 1} height={s + 1} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2c.6 3.2 3.6 4.4 3.6 8.2A5.6 5.6 0 0 1 12 22a5.4 5.4 0 0 1-5.4-5.6c0-1.6.7-2.7 1.6-3.6.1 1.3.9 2 1.7 2.2-.5-2.4.9-4.6 2.1-5.6-.4 2.1 1 3 1.6 3.6.3-2.9-1.4-4.4-1.2-9.2z"
            fill={d.color}
          />
        </svg>
      );

    case 'finishStreak':
      // Lightning bolt.
      return (
        <svg width={s + 1} height={s + 1} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill={d.color} />
        </svg>
      );

    default:
      return null;
  }
}
