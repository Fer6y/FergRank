interface RadarProps {
  radar: {
    strike: number;
    grappling: number;
    finishing: number;
    activity: number;
    oppQuality: number;
  };
}

const AXES: { key: keyof RadarProps['radar']; label: string }[] = [
  { key: 'strike', label: 'STRIKE' },
  { key: 'grappling', label: 'GRAPPLE' },
  { key: 'finishing', label: 'FINISH' },
  { key: 'activity', label: 'ACTIVE' },
  { key: 'oppQuality', label: 'OPP Q' },
];

// 5-axis pentagon radar. Pure SVG so it renders on the server.
export default function ProfileRadar({ radar }: RadarProps) {
  const cx = 110;
  const cy = 105;
  const R = 78;

  const pt = (i: number, v: number): [number, number] => {
    const angle = (-90 + i * 72) * (Math.PI / 180);
    return [cx + R * v * Math.cos(angle), cy + R * v * Math.sin(angle)];
  };

  const ring = (v: number) =>
    AXES.map((_, i) => pt(i, v).join(',')).join(' ');

  const valuePoly = AXES.map((a, i) => pt(i, radar[a.key]).join(',')).join(' ');

  return (
    <svg viewBox="0 0 220 210" className="w-full h-auto" role="img" aria-label="Fighter attribute radar">
      {/* grid rings */}
      {[1, 0.66, 0.33].map((v) => (
        <polygon key={v} points={ring(v)} fill="none" stroke="var(--border)" strokeWidth="1" />
      ))}
      {/* spokes */}
      {AXES.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth="1" />;
      })}
      {/* value */}
      <polygon points={valuePoly} fill="rgba(210,10,10,0.25)" stroke="var(--accent-red)" strokeWidth="1.5" />
      {AXES.map((a, i) => {
        const [x, y] = pt(i, radar[a.key]);
        return <circle key={a.key} cx={x} cy={y} r="2.5" fill="var(--accent-red-light)" />;
      })}
      {/* labels */}
      {AXES.map((a, i) => {
        const [x, y] = pt(i, 1.22);
        return (
          <text
            key={a.label}
            x={x}
            y={y}
            fill="var(--text-muted)"
            fontSize="9"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}
