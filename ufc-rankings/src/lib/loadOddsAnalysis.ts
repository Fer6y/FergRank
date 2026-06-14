// Display-only loader for the precomputed model-vs-market history
// (data/odds_analysis.json, built by research/backtest/exportAnalysis.ts).
//
// FIREWALL: this reads a STATIC analysis output for the /odds explorer page. It
// is never imported by eloEngine.ts or scoringEngine.ts, and odds never reach a
// rating. If the JSON is absent (analysis not yet exported) it returns null and
// the page shows a "run the export" hint — nothing breaks.

import fs from 'fs';
import path from 'path';

export interface OddsRecord {
  date: string;
  event: string;
  division: string;
  favName: string;
  dogName: string;
  favOdds: number;
  dogOdds: number;
  modelFavProb: number;  // point-in-time model P(favourite)
  marketFavProb: number; // de-vigged market P(favourite)
  edge: number;          // model − market on the favourite
  favWon: boolean;
  bothEstablished: boolean;
}

export interface OddsAnalysis {
  summary: {
    generatedAt: string;
    n: number;
    span: string;
    model: { accuracy: number; logLoss: number; brier: number; ece: number };
    market: { accuracy: number; logLoss: number; brier: number; ece: number };
    disagreements: number;
    modelDogWinRate: number;
  };
  records: OddsRecord[];
}

export function loadOddsAnalysis(): OddsAnalysis | null {
  const p = path.join(process.cwd(), 'data', 'odds_analysis.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as OddsAnalysis;
  } catch {
    return null;
  }
}
