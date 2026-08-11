// dwcsScout — the pre-UFC scouting read for Contender Series entrants.
//
// DISPLAY-ONLY, evidence-derived: every threshold below is a measured bucket
// from the nine-season DWCS cohort study (research/dwcs/recordShape.ts,
// docs/plans/DWCS_PLAN.md), not an opinion — this is the prospect system's
// grading applied BEFORE a fighter has any UFC rank:
//   • losses: undefeated grads reach the current top 15 at 14% (+0.9 mean
//     settled Elo); 1–2 losses ≈ 9–10%; 3+ losses 7% (−8.8 Elo). Experience
//     VOLUME adds nothing once win rate is known (H1 refuted).
//   • age: <25 → 16% top-15 (+2.4 Elo); 25–28 → 12%; 29+ → 5% (−14.1 Elo) —
//     the strongest single signal we measured (AUC 0.630).
//   • promotion: tier ladder + empirical graduate grades (rankingConfig) —
//     shown as provenance; the grade nudge is small by design.
// Never touches Elo, scoring, or predictions — these fighters aren't in the
// data at all yet.

export interface DwcsScoutCorner {
  record: string | null;  // "8-0" / "9-1" — null when unknown
  age: number | null;
  org: string | null;     // feeder promotion when known
}

export interface ScoutRead {
  grade: 'A' | 'B' | 'C' | null; // null = not enough data to grade
  line: string;                  // the evidence sentence shown in the UI
}

function parseRecord(record: string | null): { wins: number; losses: number } | null {
  const m = record?.match(/^(\d+)-(\d+)/);
  return m ? { wins: parseInt(m[1], 10), losses: parseInt(m[2], 10) } : null;
}

export function gradeDwcsEntrant(c: DwcsScoutCorner): ScoutRead {
  const rec = parseRecord(c.record);
  if (!rec && c.age == null) {
    return { grade: null, line: 'No verified record on file — ungraded.' };
  }

  const parts: string[] = [];
  let plus = 0;
  let minus = 0;

  if (rec) {
    if (rec.losses === 0 && rec.wins >= 4) {
      plus++;
      parts.push(`undefeated — the cohort's best record profile (14% of undefeated grads reach the top 15)`);
    } else if (rec.losses >= 3) {
      minus++;
      parts.push(`${rec.losses} losses — 3+-loss entrants run 7% top-15, −8.8 Elo`);
    } else {
      parts.push(`${rec.losses === 1 ? 'one loss' : `${rec.losses} losses`} — near the cohort average (9–10% top-15)`);
    }
  }

  if (c.age != null) {
    if (c.age < 25) {
      plus++;
      parts.push(`under 25 — the strongest signal we measured (16% top-15, +2.4 Elo)`);
    } else if (c.age >= 29) {
      minus++;
      parts.push(`age ${c.age} — 29+ entrants almost never become contenders (5% top-15, −14.1 Elo)`);
    } else {
      parts.push(`age ${c.age} — mid-runway (12% top-15)`);
    }
  } else {
    parts.push('age unverified');
  }

  const grade: ScoutRead['grade'] = minus > 0 ? 'C' : plus > 0 ? (plus >= 2 ? 'A' : 'B') : 'B';
  return { grade, line: parts.join(' · ') };
}
