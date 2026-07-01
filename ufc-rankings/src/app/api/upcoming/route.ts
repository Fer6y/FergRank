import { NextResponse } from 'next/server';
import { getData } from '@/lib/dataCache';
import { generateDivisionRankings } from '@/lib/scoringEngine';
import { buildEloRatings, getElo, getFighterHistory, winProbability } from '@/lib/eloEngine';
import { getAdvancedStats, formEloNudge } from '@/lib/advancedStats';
import { describeStyle } from '@/lib/fighterDisplay';
import { getFighterMedia } from '@/lib/fighterMedia';
import { getUpcomingCards } from '@/lib/loadUpcoming';
import { shortDivision } from '@/lib/divisions';
import { ALL_DIVISIONS } from '@/lib/types';
import type { RankedFighter } from '@/lib/types';

export const revalidate = 86400; // 24 hours ISR

// One enriched corner of a bout — everything the card UI needs, display-only.
export interface CardFighter {
  fighterId: string | null;
  name: string;
  flag: string | null;
  avatarUrl: string | null;
  rankLabel: string | null;   // "C", "#6 LW", or null when unranked / not in our data
  isChampion: boolean;
  description: string | null; // style + UFC record, e.g. "A knockout artist · 8-0 UFC"
  recentFights: { result: 'W' | 'L' | 'D'; label: string }[]; // up to 2, newest first
}

export interface CardBout {
  boutOrder: number;
  isMainEvent: boolean;
  weightClass: string;
  fighter1: CardFighter;
  fighter2: CardFighter;
  // Model read (display-only, derived FROM Elo — never feeds it). prob1 is the
  // validated pure-Elo probability for fighter1 (0–1); formProb1 shades each
  // side's Elo by their bounded recent-form nudge. Null when either fighter is
  // missing from our data.
  prob1: number | null;
  formProb1: number | null;
}

export interface UpcomingEvent {
  eventId: string | null;
  eventName: string;
  eventDate: string;
  bouts: CardBout[];
}

interface RankInfo {
  displayRank: number | null;
  isChampion: boolean;
  division: string;
}

function isChampion(f: RankedFighter): boolean {
  return f.officialRank === 'C' || f.belt;
}

// Compact method label: "KO R2", "SUB R1", "UD", "SD", "MD", or the raw method.
function formatMethod(method: string, round: number): string {
  const m = method.trim().toUpperCase();
  if (m === 'KO/TKO' || m.startsWith('TKO')) return `KO R${round}`;
  if (m === 'SUB') return `SUB R${round}`;
  if (m === 'U-DEC') return 'UD';
  if (m === 'S-DEC') return 'SD';
  if (m === 'M-DEC') return 'MD';
  return method.trim();
}

export async function GET() {
  const data = getData();
  const cards = getUpcomingCards();

  // Rank lookup across every division (each Elo build is cached, so this is cheap
  // under ISR). A fighter is ranked only in their own weight class, so no clash.
  const rankMap = new Map<string, RankInfo>();
  for (const division of ALL_DIVISIONS) {
    const rankings = await generateDivisionRankings(division, data);
    // Same numbering as RankingTable: champions sit above, contenders count 1..N.
    const contenderRank = new Map(
      rankings.fighters.filter((f) => !isChampion(f)).map((f, i) => [f.fighterId, i + 1]),
    );
    for (const f of rankings.fighters) {
      const champ = isChampion(f);
      rankMap.set(f.fighterId, {
        division,
        isChampion: champ,
        displayRank: champ ? null : contenderRank.get(f.fighterId) ?? null,
      });
    }
  }

  const enrich = (id: string | null, name: string): CardFighter => {
    if (!id) {
      return {
        fighterId: null, name, flag: null, avatarUrl: null,
        rankLabel: null, isChampion: false, description: null, recentFights: [],
      };
    }

    const media = getFighterMedia(id);
    const info = rankMap.get(id);
    const fighter = data.fighterMap.get(id);
    const history = getFighterHistory(data, id);

    // Rank badge.
    let rankLabel: string | null = null;
    if (info?.isChampion) rankLabel = 'C';
    else if (info?.displayRank) rankLabel = `#${info.displayRank} ${shortDivision(info.division)}`;

    // Description: style + UFC record (computed from UFC fight history).
    let description: string | null = null;
    if (fighter) {
      const style = describeStyle({
        koRate: fighter.koRate,
        subRate: fighter.subRate,
        sigStrikeAccuracy: fighter.sigStrikeAccuracy,
        finishRate: fighter.koRate + fighter.subRate,
      });
      const w = history.filter((h) => h.result === 'W').length;
      const l = history.filter((h) => h.result === 'L').length;
      const d = history.filter((h) => h.result === 'D').length;
      const rec = d > 0 ? `${w}-${l}-${d}` : `${w}-${l}`;
      const cap = style.charAt(0).toUpperCase() + style.slice(1);
      description = history.length ? `${cap} · ${rec} UFC` : cap;
    }

    const recentFights = history.slice(0, 2).map((h) => ({
      result: h.result,
      label: `${formatMethod(h.method, h.round)} vs. ${h.opponentName}`,
    }));

    return {
      fighterId: id,
      name,
      flag: media?.flag || null,
      avatarUrl: media?.avatarUrl || null,
      rankLabel,
      isChampion: info?.isChampion ?? false,
      description,
      recentFights,
    };
  };

  const ratings = buildEloRatings(data);
  const probs = (id1: string | null, id2: string | null) => {
    if (!id1 || !id2 || !data.fighterMap.has(id1) || !data.fighterMap.has(id2)) {
      return { prob1: null, formProb1: null };
    }
    const eloA = getElo(ratings, id1).rating;
    const eloB = getElo(ratings, id2).rating;
    const nudgeA = formEloNudge(getAdvancedStats(data, id1)?.drift);
    const nudgeB = formEloNudge(getAdvancedStats(data, id2)?.drift);
    return {
      prob1: winProbability(eloA, eloB),
      formProb1: nudgeA !== 0 || nudgeB !== 0 ? winProbability(eloA + nudgeA, eloB + nudgeB) : null,
    };
  };

  const events: UpcomingEvent[] = cards.map((card) => ({
    eventId: card.eventId,
    eventName: card.eventName,
    eventDate: card.eventDate,
    bouts: card.bouts.map((b) => ({
      boutOrder: b.boutOrder,
      isMainEvent: b.isMainEvent,
      weightClass: b.weightClass,
      fighter1: enrich(b.fighter1Id, b.fighter1Name),
      fighter2: enrich(b.fighter2Id, b.fighter2Name),
      ...probs(b.fighter1Id, b.fighter2Id),
    })),
  }));

  return NextResponse.json({ events });
}
