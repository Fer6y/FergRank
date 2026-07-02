// ─────────────────────────────────────────────────────────────────────────
//  searchFighters.ts — fuzzy fighter-name search, shared by the ⌘K palette
//  route (/api/search) and the analyst agent's search_fighter tool.
// ─────────────────────────────────────────────────────────────────────────

import { getData } from './dataCache';
import { ALL_DIVISIONS } from './types';

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

export interface SearchHit {
  fighterId: string;
  fullName: string;
  nickname: string;
  weightClass: string;
  division: string | null; // valid ranked division if weightClass maps to one
  record: string;
  fightCount: number;
}

// Score each fighter: exact (3) > starts-with (2) > word-start (1.5) >
// substring (1). Tiebreak by UFC fight count so well-known names surface.
export function searchFighters(query: string, limit = 8): SearchHit[] {
  const nq = normalize(query);
  if (nq.length < 2) return [];

  const data = getData();
  const scored: { hit: SearchHit; score: number }[] = [];
  for (const f of data.fighters) {
    const name = normalize(f.fullName);
    const nick = normalize(f.nickname);
    let score = 0;
    if (name === nq || nick === nq) score = 3;
    else if (name.startsWith(nq) || nick.startsWith(nq)) score = 2;
    else if (name.split(' ').some((w) => w.startsWith(nq))) score = 1.5;
    else if (name.includes(nq) || nick.includes(nq)) score = 1;
    if (score === 0) continue;

    const fightCount = (data.fighterFights.get(f.fighterId) || []).length;
    const division = ALL_DIVISIONS.includes(f.weightClass as (typeof ALL_DIVISIONS)[number])
      ? f.weightClass
      : null;
    scored.push({
      hit: {
        fighterId: f.fighterId,
        fullName: f.fullName,
        nickname: f.nickname,
        weightClass: f.weightClass,
        division,
        record: `${f.wins}-${f.losses}-${f.draws}`,
        fightCount,
      },
      score,
    });
  }

  scored.sort((a, b) => (b.score - a.score) || (b.hit.fightCount - a.hit.fightCount));
  return scored.slice(0, limit).map((s) => s.hit);
}
