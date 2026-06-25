'use client';

import { MENS_DIVISIONS, WOMENS_DIVISIONS } from '@/lib/types';

const DIVISION_SHORT_NAMES: Record<string, string> = {
  'Heavyweight': 'HW',
  'Light Heavyweight': 'LHW',
  'Middleweight': 'MW',
  'Welterweight': 'WW',
  'Lightweight': 'LW',
  'Featherweight': 'FW',
  'Bantamweight': 'BW',
  'Flyweight': 'FLW',
  "Women's Strawweight": 'WSW',
  "Women's Flyweight": 'WFLW',
  "Women's Bantamweight": 'WBW',
};

interface DivisionSelectorProps {
  selectedDivision: string;
  gender: 'male' | 'female';
  onDivisionChange: (division: string) => void;
  onGenderChange: (gender: 'male' | 'female') => void;
}

export default function DivisionSelector({
  selectedDivision,
  gender,
  onDivisionChange,
  onGenderChange,
}: DivisionSelectorProps) {
  const divisions = gender === 'male' ? MENS_DIVISIONS : WOMENS_DIVISIONS;

  return (
    <div className="space-y-3">
      {/* Gender Toggle */}
      <div className="flex items-center gap-1 p-1 rounded-lg w-fit"
        style={{ backgroundColor: 'var(--bg-elevated)' }}
      >
        <button
          onClick={() => onGenderChange('male')}
          className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
          style={{
            backgroundColor: gender === 'male' ? 'var(--accent-red)' : 'transparent',
            color: gender === 'male' ? '#fff' : 'var(--text-secondary)',
          }}
        >
          Men
        </button>
        <button
          onClick={() => onGenderChange('female')}
          className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
          style={{
            backgroundColor: gender === 'female' ? 'var(--accent-red)' : 'transparent',
            color: gender === 'female' ? '#fff' : 'var(--text-secondary)',
          }}
        >
          Women
        </button>
      </div>

      {/* Division Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {divisions.map((div) => {
          const isActive = div === selectedDivision;
          return (
            <button
              key={div}
              onClick={() => onDivisionChange(div)}
              className="px-3 py-1.5 rounded-md text-sm font-medium transition-all"
              style={{
                backgroundColor: isActive ? 'var(--bg-card)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                borderLeft: isActive ? '2px solid var(--accent-red)' : '2px solid transparent',
                borderTop: '1px solid transparent',
                borderRight: '1px solid transparent',
                borderBottom: '1px solid transparent',
              }}
              title={div}
            >
              <span className="hidden sm:inline">{div}</span>
              <span className="sm:hidden">{DIVISION_SHORT_NAMES[div] || div}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
