// GrappleRamp — grey→blue grappling proficiency ramp (DISPLAY ONLY).
// A full grey→mid→blue track with one or more needles marking each fighter's
// division-percentile position (see lib/grappleGradient.ts). Because the track
// is always the full gradient, even a single fighter shows the whole ramp — not
// a flat fill whose only variable is width. On /compare it carries two needles
// (one per corner) so grappler-vs-striker reads at a glance.

const RAMP = 'linear-gradient(90deg, #4a4a52 0%, #2f6fb0 50%, #4a9eff 100%)';

export interface RampMarker {
  percentile: number; // 0–100 needle position on the track
  label?: string; // short name shown by the needle (e.g. last name)
  sub?: string; // small value chip (e.g. "p97")
  color?: string; // ramp colour at the fighter's position (dot fill)
  side?: 'top' | 'bottom'; // which side the label sits (compare uses both)
}

export default function GrappleRamp({
  markers,
  height = 14,
  showScaleLabels = false,
}: {
  markers: RampMarker[];
  height?: number;
  showScaleLabels?: boolean;
}) {
  const hasTop = markers.some((m) => (m.side ?? 'top') === 'top' && (m.label || m.sub));
  const hasBottom = markers.some((m) => m.side === 'bottom' && (m.label || m.sub));

  // Text alternative for assistive tech: the whole point of the ramp (each
  // fighter's grappling percentile vs their division) is otherwise conveyed only
  // by needle position and colour.
  const tier = (p: number) => (p >= 80 ? 'elite' : p >= 60 ? 'strong' : p >= 40 ? 'average' : p >= 20 ? 'below average' : 'negligible');
  const rampLabel =
    'Grappling proficiency vs division (negligible to elite): ' +
    markers
      .map((m) => `${m.label ? m.label + ' ' : ''}${Math.round(m.percentile)}th percentile (${tier(m.percentile)})`)
      .join('; ');

  return (
    <div className="w-full">
      <div style={{ paddingTop: hasTop ? 24 : 0, paddingBottom: hasBottom ? 24 : 0 }}>
        <div className="relative rounded-full" role="img" aria-label={rampLabel} style={{ height, background: RAMP }}>
          {markers.map((m, i) => {
            const pos = Math.max(0, Math.min(100, m.percentile));
            const side = m.side ?? 'top';
            // Keep labels from spilling off the ends of the track.
            const align = pos <= 12 ? 'flex-start' : pos >= 88 ? 'flex-end' : 'center';
            const tx = pos <= 12 ? '0' : pos >= 88 ? '-100%' : '-50%';
            return (
              <div key={i}>
                {/* needle */}
                <div
                  className="absolute"
                  style={{
                    left: `${pos}%`,
                    top: -4,
                    height: height + 8,
                    width: 0,
                    borderLeft: '2px solid #fff',
                    boxShadow: '0 0 4px #000',
                    transform: 'translateX(-1px)',
                  }}
                />
                {/* dot on the track in the fighter's ramp colour */}
                {m.color && (
                  <div
                    className="absolute rounded-full"
                    style={{
                      left: `${pos}%`,
                      top: height / 2 - 3,
                      width: 6,
                      height: 6,
                      background: m.color,
                      border: '1.5px solid #fff',
                      transform: 'translate(-50%, 0)',
                    }}
                  />
                )}
                {/* label chip */}
                {(m.label || m.sub) && (
                  <div
                    className="absolute flex flex-col leading-tight"
                    style={{
                      left: `${pos}%`,
                      transform: `translateX(${tx})`,
                      alignItems: align === 'flex-start' ? 'flex-start' : align === 'flex-end' ? 'flex-end' : 'center',
                      [side === 'top' ? 'bottom' : 'top']: height + 8,
                    }}
                  >
                    {m.label && (
                      <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                        {m.label}
                      </span>
                    )}
                    {m.sub && (
                      <span className="text-[10px] font-mono whitespace-nowrap" style={{ color: m.color ?? 'var(--text-muted)' }}>
                        {m.sub}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showScaleLabels && (
        <div className="flex justify-between mt-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <span>negligible</span>
          <span>elite</span>
        </div>
      )}
    </div>
  );
}
