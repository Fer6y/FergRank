// Presentation helpers shared by FighterCard / ChampionHero / profile.
// Pure display logic — no algorithm here.
import type { RankedFighter } from './types';
import type { FightTrace } from './eloEngine';

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface Trend {
  label: string;
  title: string;
  color: string;
  bg: string;
}

// Compare our displayed rank to the fighter's official UFC rank. This delta IS
// the product thesis (DESIGN_VISION §0) — surfaced on every contender row.
export function getTrend(fighter: RankedFighter, displayRank: number): Trend | null {
  const official = fighter.officialRank;

  // Not ranked by the UFC at all, but we rank them — the "we go deeper" case.
  if (!official || official === 'NR') {
    return {
      label: 'NR',
      title: 'Unranked by the UFC — we rank them on the data',
      color: 'var(--accent-blue)',
      bg: 'rgba(74, 158, 255, 0.12)',
    };
  }

  // Champions are pinned to the hero card, not shown as a contender row.
  if (official === 'C') return null;

  const officialNum = parseInt(official, 10);
  if (Number.isNaN(officialNum)) return null;

  const delta = officialNum - displayRank; // >0 means we rank them higher than UFC
  if (delta === 0) {
    return {
      label: '=',
      title: 'Same as the UFC official rank',
      color: 'var(--text-muted)',
      bg: 'var(--bg-elevated)',
    };
  }
  if (delta > 0) {
    return {
      label: `▲${delta}`,
      title: `We rank them ${delta} spot${delta > 1 ? 's' : ''} higher than the UFC (UFC #${officialNum})`,
      color: 'var(--accent-green)',
      bg: 'rgba(45, 212, 126, 0.12)',
    };
  }
  return {
    label: `▼${Math.abs(delta)}`,
    title: `We rank them ${Math.abs(delta)} spot${Math.abs(delta) > 1 ? 's' : ''} lower than the UFC (UFC #${officialNum})`,
    color: 'var(--accent-red-light)',
    bg: 'rgba(255, 45, 45, 0.1)',
  };
}

export interface DecompPart {
  label: string;
  value: number;
  color: string;
}

// One bullet in the "why this rank" story. `kind` drives the dot colour.
export interface RankInsight {
  kind: 'positive' | 'negative' | 'neutral';
  text: string;
}

export interface WhyThisRank {
  // Varied lead sentence — the dominant storyline for this fighter.
  headline: string;
  // Specific supporting bullets (named opponents, recent finishes, skids…).
  insights: RankInsight[];
  // Score decomposition rows (unchanged contract for the bars).
  parts: DecompPart[];
  final: number;
  // One-liner style identity, e.g. "a knockout artist".
  style: string;
}

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;

// Heavier weight class → larger index. Used only to phrase "moved up/down".
const DIVISION_ORDER: Record<string, number> = {
  Flyweight: 1, Bantamweight: 2, Featherweight: 3, Lightweight: 4,
  Welterweight: 5, Middleweight: 6, 'Light Heavyweight': 7, Heavyweight: 8,
  "Women's Strawweight": 1, "Women's Flyweight": 2, "Women's Bantamweight": 3,
};

function monthsAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / MS_PER_MONTH;
}

function yearOf(iso: string): number {
  return new Date(iso).getFullYear();
}

// 'ko' | 'sub' | null — what kind of finish a method string represents.
function finishKind(method: string): 'ko' | 'sub' | null {
  const m = method.toUpperCase();
  if (m.includes('SUB')) return 'sub';
  if (m.includes('KO') || m.includes('TKO')) return 'ko';
  return null;
}

// Deterministic per-fighter pick so phrasing is stable on a profile but varies
// across the roster — the content (names, numbers) is always real; only the
// wording rotates so every page doesn't read identically.
function seededPick<T>(seed: string, arr: T[]): T {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return arr[(h >>> 0) % arr.length];
}

function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

// Plain-English style identity from career rates. Display only.
// Accepts any object carrying the four rate fields, so it works for a full
// RankedFighter or a bare Fighter (e.g. an unranked fighter on an upcoming card).
export function describeStyle(f: {
  koRate: number;
  subRate: number;
  sigStrikeAccuracy: number;
  finishRate: number;
}): string {
  const ko = f.koRate, sub = f.subRate, acc = f.sigStrikeAccuracy, finish = f.finishRate;
  if (ko >= 0.5 && ko >= sub * 1.5) return 'a knockout artist';
  if (sub >= 0.4 && sub >= ko) return 'a submission specialist';
  if (ko >= 0.35 && sub >= 0.25) return 'an all-action finisher who can end it anywhere';
  if (finish >= 0.6) return 'a finisher who rarely lets it reach the judges';
  if (acc >= 0.55 && finish < 0.4) return 'a surgical, high-accuracy striker';
  if (sub >= 0.25) return 'a grappling-leaning technician';
  if (finish <= 0.3) return 'a tactical decision-grinder who wins on the cards';
  return 'a well-rounded operator';
}

// Plain-English "why this rank" — a varied, opponent-specific story plus the
// score decomposition. The flagship transparency feature (DESIGN_VISION §5).
// finalRating = elo + metrics + sos + official + pedigree. Pass the fighter's
// dated fight history (newest-first) to unlock named-opponent reasoning;
// without it, falls back to a stat-only narrative.
export function buildWhyThisRank(ranked: RankedFighter, history: FightTrace[] = []): WhyThisRank {
  const hist = history; // newest-first (getFighterHistory sorts it that way)
  const name = ranked.fullName.split(/\s+/).slice(-1)[0] || ranked.fullName; // last name
  const isChamp = ranked.officialRank === 'C';
  const style = describeStyle(ranked);

  // ── Mine the history for specific story beats ──
  const wins = hist.filter((f) => f.result === 'W');
  const last5 = hist.slice(0, 5);
  const rec5 = { w: last5.filter((f) => f.result === 'W').length, l: last5.filter((f) => f.result === 'L').length };

  let streak = 0;
  for (const f of hist) { if (f.result === 'W') streak++; else break; }
  let skid = 0;
  for (const f of hist) { if (f.result === 'L') skid++; else break; }

  // Best recent wins by opponent rating (last 4yr, above-average opponents).
  const qualityWins = wins
    .filter((f) => monthsAgo(f.date) <= 48 && f.opponentRating >= 1520 && f.opponentName)
    .sort((a, b) => b.opponentRating - a.opponentRating);

  // Recent finishes (last ~2.5yr).
  const recentFinishes = wins.filter((f) => monthsAgo(f.date) <= 30 && finishKind(f.method) && f.opponentName);

  // Recent setbacks (newest losses), named.
  const recentLosses = hist.filter((f) => f.result === 'L' && monthsAgo(f.date) <= 36 && f.opponentName);

  // Biggest single rating mover.
  const signature = [...wins].sort((a, b) => b.delta - a.delta)[0];

  // Weight-class move: most recent division differs from the prior settled one.
  let movedTo: { wc: string; dir: 'up' | 'down' } | null = null;
  if (hist.length >= 3) {
    const recentWc = hist[0].weightClass;
    const priorWc = (hist.slice(1, 5).find((f) => f.weightClass && f.weightClass !== recentWc) || {}).weightClass;
    const a = DIVISION_ORDER[recentWc];
    const b = priorWc ? DIVISION_ORDER[priorWc] : undefined;
    if (recentWc && priorWc && a && b && a !== b) {
      movedTo = { wc: recentWc, dir: a > b ? 'up' : 'down' };
    }
  }

  const insights: RankInsight[] = [];
  const used = new Set<string>();
  const ko = Math.round(ranked.koRate * 100);
  const sub = Math.round(ranked.subRate * 100);
  const acc = Math.round(ranked.sigStrikeAccuracy * 100);

  // ── Headline: pick the dominant storyline ──
  let headline: string;
  if (isChamp) {
    headline = seededPick(ranked.fighterId + 'c', [
      `Reigning champion — ${name} holds the top slot until someone takes the belt in the cage.`,
      `The belt sits with ${name}. As champion they anchor the top of the division by right of the wins that earned it.`,
      `Champion. ${name} stays #1 here on the strength of a title reign, not a poll.`,
    ]);
  } else if (skid >= 2 || (rec5.l > rec5.w && last5.length >= 4)) {
    const loserNames = joinNames(recentLosses.slice(0, 2).map((f) => f.opponentName));
    headline = seededPick(ranked.fighterId + 's', [
      `A ${rec5.w}-${rec5.l} run over the last ${last5.length} is the story — that recent skid pulls the rating below where the name alone might land them.`,
      `Skidding: ${skid >= 2 ? `back-to-back losses${loserNames ? ` to ${loserNames}` : ''}` : `a ${rec5.w}-${rec5.l} recent stretch`} have eaten into ${name}'s Elo, which is why they sit lower than you might expect.`,
      `Recent form drags here — ${name} is ${rec5.w}-${rec5.l} in their last ${last5.length}, and the algorithm weighs those losses heavily.`,
    ]);
    used.add('skid');
  } else if (streak >= 3 && recentFinishes.length >= 2) {
    headline = seededPick(ranked.fighterId + 'h', [
      `Red-hot: ${name} is on a ${streak}-fight win streak with ${recentFinishes.length} finishes — exactly the kind of active, decisive run the rating rewards.`,
      `${name} is surging — ${streak} straight wins, ${recentFinishes.length} of them stoppages. Recent finishes move Elo more than any decision can.`,
    ]);
    used.add('streak'); used.add('finishes');
  } else if (streak >= 3) {
    headline = seededPick(ranked.fighterId + 'w', [
      `${name} is riding a ${streak}-fight win streak — active and climbing, which the recency-weighted rating rewards.`,
      `Momentum: ${streak} consecutive wins keep ${name} trending up the division.`,
    ]);
    used.add('streak');
  } else if (qualityWins.length >= 1) {
    const qn = joinNames(qualityWins.slice(0, 2).map((f) => f.opponentName));
    headline = seededPick(ranked.fighterId + 'q', [
      `${name}'s ${Math.round(ranked.eloRating)} Elo is earned the hard way — wins over ${qn} are what beating the best looks like.`,
      `Built on quality: the rating is propped up by real scalps — ${qn} — not a padded record.`,
      `Who you beat is the rating. For ${name} that means ${qn}, and the Elo reflects it.`,
    ]);
    used.add('quality');
  } else if (ranked.monthsSinceLastFight >= 14) {
    headline = seededPick(ranked.fighterId + 'i', [
      `${Math.round(ranked.monthsSinceLastFight)} months out of the cage — inactivity has regressed ${name}'s rating toward the pack, which caps the rank.`,
      `Rust factor: ${name} hasn't competed in ${Math.round(ranked.monthsSinceLastFight)} months, and the rating fades toward the mean the longer that runs.`,
    ]);
    used.add('inactive');
  } else {
    headline = seededPick(ranked.fighterId + 'd', [
      `A ${Math.round(ranked.eloRating)} Elo anchors the rank — earned by who ${name} has beaten, weighted toward recent fights.`,
      `${name} grades out as ${style}; the ${Math.round(ranked.eloRating)} Elo reflects a steady body of work against the division.`,
      `No single highlight drives this one — ${name}'s rank is a ${Math.round(ranked.eloRating)} Elo built on consistent, balanced results.`,
    ]);
  }

  // ── Supporting bullets (specific, in priority order) ──
  if (!used.has('quality') && qualityWins.length >= 1) {
    const top = qualityWins.slice(0, 2);
    const names = top.map((f) => `${f.opponentName} (${yearOf(f.date)})`);
    insights.push({
      kind: 'positive',
      text: `Signature wins over ${joinNames(names)} — beating high-rated opponents is what drives the Elo, not the win count.`,
    });
  }

  if (!used.has('finishes') && recentFinishes.length >= 1) {
    const shown = recentFinishes.slice(0, 3);
    const names = shown.map((f) => f.opponentName);
    const kos = shown.filter((f) => finishKind(f.method) === 'ko').length;
    const subs = shown.length - kos;
    // "by KO/TKO" for a single finish; "all by …" only when there are several.
    const all = shown.length > 1 ? 'all ' : '';
    const breakdown = kos && subs ? `${kos} by KO/TKO, ${subs} by submission` : kos ? `${all}by KO/TKO` : `${all}by submission`;
    insights.push({
      kind: 'positive',
      text: `Active and dangerous — recently finished ${joinNames(names)} (${breakdown}). Stoppages swing the rating more than decisions do.`,
    });
  }

  if (!used.has('streak') && streak >= 2) {
    insights.push({ kind: 'positive', text: `On a ${streak}-fight win streak, keeping the rating fresh and trending up.` });
  }

  if (!used.has('skid') && skid >= 1 && recentLosses.length >= 1) {
    const l = recentLosses[0];
    insights.push({
      kind: 'negative',
      text: skid >= 2
        ? `Two straight setbacks (latest: ${recentLosses[0].opponentName}, ${yearOf(recentLosses[0].date)}) have trimmed the rating.`
        : `A recent loss to ${l.opponentName} (${yearOf(l.date)}) cost rating points and caps how high this lands.`,
    });
  }

  if (movedTo) {
    insights.push({
      kind: 'neutral',
      text: `Recently moved ${movedTo.dir} to ${movedTo.wc} — the Elo carried across with a weight-move discount, so they're still re-proving it at the new weight.`,
    });
  }

  if (!used.has('inactive') && ranked.monthsSinceLastFight >= 14) {
    insights.push({
      kind: 'negative',
      text: `${Math.round(ranked.monthsSinceLastFight)} months since the last fight — inactivity regresses the rating toward the mean.`,
    });
  } else if (ranked.monthsSinceLastFight <= 6 && !used.has('streak') && !used.has('skid')) {
    const m = Math.round(ranked.monthsSinceLastFight);
    insights.push({ kind: 'positive', text: `Active — fought within the last ${m <= 1 ? 'month' : `${m} months`}, so the rating is current.` });
  }

  if (ranked.sosNudge >= 2) {
    insights.push({
      kind: 'positive',
      text: `Tough schedule: an average recent opponent Elo of ${Math.round(ranked.sosElo)} runs hotter than the raw rating, worth +${ranked.sosNudge.toFixed(0)}.`,
    });
  } else if (ranked.sosNudge <= -2) {
    insights.push({
      kind: 'negative',
      text: `Soft recent schedule (avg opponent Elo ${Math.round(ranked.sosElo)}) trims ${ranked.sosNudge.toFixed(0)} — the wins haven't come against the division's best.`,
    });
  }

  if (ranked.metricsBonus >= 3) {
    insights.push({
      kind: 'positive',
      text: `The underlying fight metrics — strike volume, accuracy, knockdowns, takedowns — grade out strongly, adding +${ranked.metricsBonus.toFixed(0)}.`,
    });
  } else if (ranked.metricsBonus <= -3) {
    insights.push({
      kind: 'negative',
      text: `Soft underlying metrics (out-struck or out-grappled in recent fights) cost ${ranked.metricsBonus.toFixed(0)}.`,
    });
  }

  if (signature && signature.delta >= 25 && !used.has('quality')) {
    insights.push({
      kind: 'neutral',
      text: `Biggest career mover: the win over ${signature.opponentName} (${yearOf(signature.date)}) swung the rating +${signature.delta.toFixed(0)} in a single night.`,
    });
  }

  if (!isChamp && ranked.officialBonus > 0 && ranked.officialRank) {
    insights.push({ kind: 'neutral', text: `The UFC currently ranks them #${ranked.officialRank}, seeding +${ranked.officialBonus.toFixed(0)} into the rating.` });
  }

  // Always anchor with a style identity so even thin profiles read distinctly —
  // reserved as the final slot so it survives the cap.
  const styleInsight: RankInsight = {
    kind: 'neutral',
    text: `Stylistically ${style}${ko || sub || acc ? ` — ${[ko ? `${ko}% KO` : '', sub ? `${sub}% sub` : '', acc ? `${acc}% strike accuracy` : ''].filter(Boolean).join(', ')}` : ''}.`,
  };

  const parts: DecompPart[] = [
    { label: 'Base Elo', value: ranked.eloRating, color: 'var(--accent-red)' },
    { label: 'Metrics', value: ranked.metricsBonus, color: 'var(--accent-green)' },
    { label: 'SoS', value: ranked.sosNudge, color: 'var(--accent-blue)' },
    { label: 'Official', value: ranked.officialBonus, color: 'var(--accent-gold)' },
  ];
  if (ranked.pedigreeBonus) parts.push({ label: 'Pedigree', value: ranked.pedigreeBonus, color: 'var(--text-secondary)' });

  return { headline, insights: [...insights.slice(0, 5), styleInsight], parts, final: ranked.finalRating, style };
}

export interface Highlight {
  label: string;
  value: string;
  color: string;
}

// Up to 3 most notable stats, semantic colours per DESIGN_VISION §2.1
// (red = striking/finishing, green = accuracy, blue = grappling).
export function getHighlights(fighter: RankedFighter): Highlight[] {
  const stats: Highlight[] = [];

  if (fighter.finishRate > 0) {
    stats.push({
      label: 'Finish',
      value: `${Math.round(fighter.finishRate * 100)}%`,
      color: fighter.finishRate > 0.6 ? 'var(--accent-red-light)' : 'var(--text-secondary)',
    });
  }
  if (fighter.koRate > 0) {
    stats.push({
      label: 'KO',
      value: `${Math.round(fighter.koRate * 100)}%`,
      color: fighter.koRate > 0.4 ? 'var(--accent-red-light)' : 'var(--text-secondary)',
    });
  }
  if (fighter.sigStrikeAccuracy > 0) {
    stats.push({
      label: 'Acc',
      value: `${Math.round(fighter.sigStrikeAccuracy * 100)}%`,
      color: fighter.sigStrikeAccuracy > 0.5 ? 'var(--accent-green)' : 'var(--text-secondary)',
    });
  }
  if (fighter.subRate > 0) {
    stats.push({
      label: 'Sub',
      value: `${Math.round(fighter.subRate * 100)}%`,
      color: fighter.subRate > 0.3 ? 'var(--accent-blue)' : 'var(--text-secondary)',
    });
  }

  return stats.slice(0, 3);
}
