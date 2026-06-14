// Pre-UFC pedigree seed (Sherdog-sourced, scoring side).
//
// Reads data/sherdog_fights.csv (built by scripts/sherdog/buildContext.ts) and
// produces one bounded pedigreeStrength per fighter, describing how good their
// record was in OTHER promotions BEFORE they reached the UFC. The scoring engine
// turns this into a small, thin-sample-only Elo nudge (see RANKING_CONFIG
// .preUFCPedigree.seed*). Everything here is gated by `seedEnabled` upstream.
//
// Guarantees carried over: pre-UFC-debut fights only; `historical` orgs
// (Pride/Strikeforce/WEC) excluded from current-form; strength is bounded.
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { RANKING_CONFIG } from './rankingConfig';
import type { LoadedData } from './loadData';

const CFG = RANKING_CONFIG.preUFCPedigree;

export interface PedigreeInfo {
  strength: number;      // bounded [0, maxStrength] — winRate × confidence × topTierMult
  wins: number;
  losses: number;
  fights: number;
  topMultiplier: number; // best tier multiplier the fighter competed at pre-UFC
}

export function loadPedigreeStrength(data: LoadedData): Map<string, PedigreeInfo> {
  const out = new Map<string, PedigreeInfo>();
  const file = path.join(process.cwd(), 'data', CFG.seedSourceFile);
  if (!fs.existsSync(file)) return out;

  // Each fighter's UFC debut (earliest dated fight we have on them).
  const debut = new Map<string, number>();
  for (const [fid, fights] of data.fighterFights) {
    let min = Infinity;
    for (const f of fights) if (f.eventDate) min = Math.min(min, f.eventDate.getTime());
    if (min < Infinity) debut.set(fid, min);
  }

  const rows = Papa.parse<Record<string, string>>(fs.readFileSync(file, 'utf-8'), {
    header: true,
    skipEmptyLines: true,
  }).data;

  const agg = new Map<string, { w: number; l: number; d: number; topMult: number }>();
  for (const r of rows) {
    const fid = r['ourFighterId'];
    if (!fid) continue;
    if (CFG.seedExcludeHistorical && r['tier'] === 'historical') continue;

    // Pre-UFC-debut only.
    if (CFG.onlyBeforeUFCDebut) {
      const db = debut.get(fid);
      const dt = r['date'] ? new Date(r['date']).getTime() : NaN;
      if (db && !Number.isNaN(dt) && dt >= db) continue;
    }

    const res = (r['result'] || '').trim().toLowerCase();
    let a = agg.get(fid);
    if (!a) { a = { w: 0, l: 0, d: 0, topMult: 0 }; agg.set(fid, a); }
    if (res === 'win') a.w++;
    else if (res === 'loss') a.l++;
    else if (res === 'draw') a.d++;
    else continue; // nc / unknown → no credit
    const mult = parseFloat(r['tierMultiplier']) || 0;
    if (mult > a.topMult) a.topMult = mult;
  }

  for (const [fid, a] of agg) {
    const fights = a.w + a.l + a.d;
    const decisive = a.w + a.l;
    const winRate = decisive > 0 ? a.w / decisive : 0;
    const confidence = Math.min(fights / CFG.confidenceFullFights, 1);
    const strength = Math.min(winRate * confidence * a.topMult, CFG.maxStrength);
    out.set(fid, { strength, wins: a.w, losses: a.l, fights, topMultiplier: a.topMult });
  }
  return out;
}
