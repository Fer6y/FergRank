// Display-only loader for the precomputed Contender Series cohort study
// (data/dwcs_analysis.json, built by research/dwcs/exportDwcsAnalysis.ts).
//
// FIREWALL: reads a STATIC analysis output for the /contender-series page and
// the /prospects DWCS chips. Never imported by eloEngine.ts or
// scoringEngine.ts; nothing here reaches a rating. Absent JSON → null → the
// page shows a "run the export" hint and /prospects simply renders no chips.

import fs from 'fs';
import path from 'path';

export interface DwcsBucketRow {
  label: string;
  n: number;
  top15Rate: number | null;   // null = suppressed cell (n < 25)
  meanEloGain: number | null;
}

export interface DwcsChip {
  result: 'W' | 'L' | 'D' | 'NC';
  year: number;
}

export interface DwcsAnalysis {
  summary: {
    generatedAt: string;
    bouts: number;
    participants: number;
    graduates: number;
    contractRate: number;
    gradTop15Rate: number;
    seasons: string;
  };
  seasonTable: {
    season: number;
    bouts: number;
    finishRate: number | null;
    entrants: number;
    contractRate: number | null;
    top15: number;
  }[];
  byResult: { label: string; n: number; contractRate: number | null }[];
  recordShape: {
    experience: DwcsBucketRow[];
    losses: DwcsBucketRow[];
    age: DwcsBucketRow[];
  };
  tiers: DwcsBucketRow[];
  topOrgs: { org: string; n: number; top15: number }[];
  odds: {
    n: number;
    span: string;
    accuracy: number;
    logLoss: number;
    ece: number;
    favWinRate: number;
    meanPFav: number;
    coveredBouts: number;
    totalBouts: number;
  } | null;
  rankedGrads: { ourId: string; name: string; dwcsYear: number }[];
  chips: Record<string, DwcsChip>;
}

// Deliberately NOT module-cached (matching loadOddsAnalysis): the page is ISR
// with a daily revalidate, and a module-level cache would pin the first JSON
// read for the life of the server process — a re-exported analysis would then
// never surface without a redeploy. One small file read per revalidation is
// free.
export function loadDwcsAnalysis(): DwcsAnalysis | null {
  const p = path.join(process.cwd(), 'data', 'dwcs_analysis.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as DwcsAnalysis;
  } catch {
    return null;
  }
}
