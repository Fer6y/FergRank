interface ScoreBarProps {
  value: number;
  maxValue: number;
  color?: string;
  height?: number;
}

export default function ScoreBar({
  value,
  maxValue,
  color = 'var(--accent-red)',
  height = 6,
}: ScoreBarProps) {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;

  return (
    <div
      className="w-full rounded-full overflow-hidden"
      style={{
        backgroundColor: 'var(--score-bar-bg)',
        height: `${height}px`,
      }}
    >
      <div
        className="h-full rounded-full score-bar-fill"
        style={{
          width: `${pct}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}
