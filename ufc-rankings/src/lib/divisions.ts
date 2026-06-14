// Shared division short codes for compact badges.
export const DIVISION_SHORT: Record<string, string> = {
  Heavyweight: 'HW',
  'Light Heavyweight': 'LHW',
  Middleweight: 'MW',
  Welterweight: 'WW',
  Lightweight: 'LW',
  Featherweight: 'FW',
  Bantamweight: 'BW',
  Flyweight: 'FLW',
  "Women's Strawweight": 'WSW',
  "Women's Flyweight": 'WFLW',
  "Women's Bantamweight": 'WBW',
  "Women's Featherweight": 'WFW',
};

export const shortDivision = (d: string) => DIVISION_SHORT[d] || d;
