// Barrel for the advancedStats module. Consumers import from '@/lib/advancedStats'
// unchanged; the implementation is split into core.ts (pace / durability /
// schedule / gauntlet / benchmark + getAdvancedStats) and trendRead.ts (the
// prose trend read + comparable). See core.ts for the module's design notes.
export * from './core';
export * from './trendRead';
