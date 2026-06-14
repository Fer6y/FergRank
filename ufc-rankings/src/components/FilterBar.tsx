'use client';

import type { FilterParams } from '@/lib/filters';
import { DEFAULT_FILTERS, isDefaultFilters } from '@/lib/filters';

interface FilterBarProps {
  filters: FilterParams;
  onChange: (next: FilterParams) => void;
}

const ERA_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'All-time', value: null },
  { label: 'Since 2010', value: 2010 },
  { label: 'Since 2015', value: 2015 },
  { label: 'Since 2018', value: 2018 },
  { label: 'Since 2021', value: 2021 },
  { label: 'Since 2023', value: 2023 },
];

export default function FilterBar({ filters, onChange }: FilterBarProps) {
  const dirty = !isDefaultFilters(filters);

  return (
    <div
      className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-3"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
    >
      {/* Era */}
      <label className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Era
        </span>
        <select
          value={filters.eraStartYear ?? 'all'}
          onChange={(e) =>
            onChange({ ...filters, eraStartYear: e.target.value === 'all' ? null : parseInt(e.target.value, 10) })
          }
          className="text-xs rounded-md px-2 py-1 outline-none"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
        >
          {ERA_OPTIONS.map((o) => (
            <option key={o.label} value={o.value ?? 'all'}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <Slider
        label="Finish"
        value={filters.finishWeight}
        onChange={(v) => onChange({ ...filters, finishWeight: v })}
      />
      <Slider
        label="Recency"
        value={filters.recencyWeight}
        onChange={(v) => onChange({ ...filters, recencyWeight: v })}
      />
      <Slider
        label="Activity"
        value={filters.activityWeight}
        onChange={(v) => onChange({ ...filters, activityWeight: v })}
      />

      <div className="flex items-center gap-3 ml-auto">
        <span className="text-[10px]" style={{ color: dirty ? 'var(--accent-blue)' : 'var(--text-muted)' }}>
          {dirty ? 'Custom ranking' : 'House algorithm'}
        </span>
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_FILTERS })}
          disabled={!dirty}
          className="text-[11px] px-2 py-1 rounded-md transition-opacity"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: dirty ? 'var(--text-secondary)' : 'var(--text-muted)',
            opacity: dirty ? 1 : 0.5,
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  // Show a low/high hint relative to neutral (0.5).
  const hint = value > 0.55 ? 'high' : value < 0.45 ? 'low' : 'std';
  return (
    <label className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider w-12" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-24 accent-[var(--accent-red)]"
        aria-label={`${label} weight`}
      />
      <span className="text-[10px] w-7" style={{ color: hint === 'std' ? 'var(--text-muted)' : 'var(--accent-blue)' }}>
        {hint}
      </span>
    </label>
  );
}
