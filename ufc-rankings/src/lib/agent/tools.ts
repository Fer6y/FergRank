// ─────────────────────────────────────────────────────────────────────────
//  agent/tools.ts — the analyst agent's tool layer.
//
//  Each tool is a thin wrapper over a function that already exists in src/lib
//  (the same display-path accessors the UI reads). The model starts with ZERO
//  fight facts and obtains them only here, so every claim traces to a real
//  number. Outputs are compact JSON — ids, numbers, short labels — with
//  presentation cruft (avatar URLs, radar SVG coords) stripped.
//
//  Display-path ONLY: nothing here touches eloEngine/scoringEngine write
//  paths, and rankingConfig tunables are never exposed.
// ─────────────────────────────────────────────────────────────────────────

import type Anthropic from '@anthropic-ai/sdk';
import { getData } from '../dataCache';
import { getUpcomingCards } from '../loadUpcoming';
import { enrichCards, type CardFighter } from '../upcomingEnrich';
import { getFighterProfile } from '../fighterProfile';
import { getAdvancedStats, formEloNudge, type PaceWindow } from '../advancedStats';
import { buildEloRatings, getElo, winProbability } from '../eloEngine';
import { searchFighters } from '../searchFighters';
import { getReach } from '../fighterPhysical';
import { getFighterAge } from '../fighterAges';

// ── Tool definitions (deterministic order — part of the prompt-cache prefix) ──

export const ANALYST_TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_upcoming_cards',
    description:
      'List every announced upcoming UFC card: event name, date, bout count, and the main event. ' +
      'Call this first when the user asks about upcoming fights without naming a specific event.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'get_card',
    description:
      'Get the full enriched card for one upcoming event: every bout with each corner\'s rank, ' +
      'style, age, last-5 results (title fights flagged), reach, finish rate, schedule strength, ' +
      'plus the model\'s win probability (pure-Elo and form-adjusted) for every matchup. ' +
      'Call this before discussing any specific card or bout.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        event_name: {
          type: 'string',
          description: 'Event name or a distinctive fragment of it, e.g. "UFC 330" or "McGregor vs. Holloway".',
        },
      },
      required: ['event_name'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_fighter',
    description:
      'Deep profile for one fighter by id: rank + score breakdown (why this rank), Elo vs peak, ' +
      'strength of schedule, per-15-minute pace rates (career vs recent), form drift, durability, ' +
      'finish anatomy, cautious trend read, last fights with per-fight Elo swings, and next booked fight. ' +
      'Resolve a name to an id with search_fighter first if needed.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        fighter_id: { type: 'string', description: 'Canonical fighter id (from search_fighter or get_card).' },
      },
      required: ['fighter_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'compare_fighters',
    description:
      'Head-to-head model read for two fighters by id: pure-Elo win probability, experimental ' +
      'form-adjusted probability, and key stat deltas (Elo, strike differential per 15, ' +
      'landed:absorbed ratio, finish rate, reach, age, schedule strength).',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        fighter_id_a: { type: 'string', description: 'First fighter\'s canonical id.' },
        fighter_id_b: { type: 'string', description: 'Second fighter\'s canonical id.' },
      },
      required: ['fighter_id_a', 'fighter_id_b'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_fighter',
    description:
      'Resolve a fighter name (or fragment) to their canonical id, record, and division. ' +
      'Use this whenever the user mentions a fighter you don\'t have an id for yet.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Fighter name or fragment, e.g. "prates" or "Ilia Topuria".' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
];

// ── Executors ─────────────────────────────────────────────────────────────

const r = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;
const pct = (p: number) => Math.round(p * 100); // 0–1 → whole %

// Strip presentation-only fields from a card corner for the model.
function trimCorner(f: CardFighter) {
  return {
    fighterId: f.fighterId,
    name: f.name,
    rank: f.rankLabel,          // "C", "#6 LW", or null = unranked
    age: f.age,
    style: f.description,
    last5: f.recentFights.map((rf) => ({
      result: rf.result,
      fight: rf.label,
      date: rf.date,
      titleFight: rf.isTitle || undefined,
    })),
    reachIn: f.reach,
    finishRatePct: f.finishRate != null ? pct(f.finishRate) : null,
    scheduleStrength: f.scheduleStrength != null ? Math.round(f.scheduleStrength) : null,
  };
}

function trimPace(p: PaceWindow | null) {
  if (!p) return null;
  return {
    fights: p.fights,
    landedPer15: r(p.landedPer15, 1),
    absorbedPer15: r(p.absorbedPer15, 1),
    diffPer15: r(p.diffPer15, 1),
    tdPer15: r(p.tdPer15, 1),
    kdPer15: r(p.kdPer15, 2),
    ctrlSharePct: r(p.ctrlSharePct, 1),
    sigAccuracyPct: p.sigAccuracy != null ? pct(p.sigAccuracy) : null,
  };
}

async function listUpcomingCards(): Promise<unknown> {
  const cards = getUpcomingCards();
  if (cards.length === 0) return { cards: [], note: 'No upcoming cards announced in our data.' };
  return {
    cards: cards.map((c) => {
      const main = c.bouts.find((b) => b.isMainEvent) ?? c.bouts[0];
      return {
        eventName: c.eventName,
        eventDate: c.eventDate,
        boutCount: c.bouts.length,
        mainEvent: main ? `${main.fighter1Name} vs. ${main.fighter2Name}` : null,
      };
    }),
  };
}

async function getCard(eventName: string): Promise<unknown> {
  const cards = getUpcomingCards();
  const q = eventName.trim().toLowerCase();
  const card =
    cards.find((c) => c.eventName.toLowerCase() === q) ??
    cards.find((c) => c.eventName.toLowerCase().includes(q)) ??
    cards.find((c) => q.includes(c.eventName.toLowerCase()));
  if (!card) {
    return {
      error: `No upcoming card matches "${eventName}".`,
      availableEvents: cards.map((c) => c.eventName),
    };
  }

  const [event] = await enrichCards([card]);
  return {
    eventName: event.eventName,
    eventDate: event.eventDate,
    bouts: event.bouts.map((b) => ({
      bout: b.boutOrder,
      mainEvent: b.isMainEvent || undefined,
      weightClass: b.weightClass,
      fighter1: trimCorner(b.fighter1),
      fighter2: trimCorner(b.fighter2),
      // Win probability for fighter1, whole %. formAdjusted shades each side's
      // Elo by bounded recent-form drift (experimental read).
      winProbF1Pct: b.prob1 != null ? pct(b.prob1) : null,
      formAdjWinProbF1Pct: b.formProb1 != null ? pct(b.formProb1) : null,
    })),
  };
}

async function getFighter(fighterId: string): Promise<unknown> {
  const profile = await getFighterProfile(fighterId);
  if (!profile) return { error: `No fighter with id "${fighterId}". Resolve the name with search_fighter.` };

  const a = profile.advanced;
  const ranked = profile.ranked;
  return {
    fighterId: profile.fighterId,
    name: profile.fullName,
    nickname: profile.nickname || undefined,
    record: profile.record,
    division: profile.division ?? profile.weightClass,
    age: profile.age,
    ageApproximate: profile.ageApproximate || undefined,
    height: profile.height || undefined,
    stance: profile.stance || undefined,
    ufcFights: profile.fightCount,
    // ≤5 fights = Elo provisional window; flag so the analyst hedges.
    provisionalSample: profile.fightCount <= 5 || undefined,
    rank: {
      isChampion: profile.isChampion,
      ourRank: profile.displayRank,          // contenders 1..N, null for champs/unranked
      ufcOfficialRank: ranked?.officialRank ?? null,
      rankScore: ranked ? r(ranked.rankScore, 1) : null,   // 0–100 display score
    },
    elo: {
      current: Math.round(profile.eloRating),
      peak: Math.round(profile.eloPeak),
      displayScore: r(profile.eloDisplay, 1),
    },
    // Why this rank: bounded adjustments layered on the Elo core (Elo points).
    scoreBreakdown: ranked
      ? {
          eloCore: Math.round(ranked.eloRating),
          metricsBonus: r(ranked.metricsBonus, 1),
          sosNudge: r(ranked.sosNudge, 1),
          officialSeed: r(ranked.officialBonus, 1),
          finalRating: Math.round(ranked.finalRating),
        }
      : null,
    strengthOfSchedule: profile.sos != null ? Math.round(profile.sos) : null,
    monthsSinceLastFight: r(profile.monthsSinceLastFight, 1),
    nextFight: profile.nextFight
      ? {
          opponent: profile.nextFight.opponentName,
          opponentId: profile.nextFight.opponentId,
          event: profile.nextFight.eventName,
          date: profile.nextFight.eventDate,
          weightClass: profile.nextFight.weightClass,
          mainEvent: profile.nextFight.isMainEvent || undefined,
        }
      : null,
    // Style radar, 0–1 per axis (display normalization of ranking-adjacent signals).
    radar: {
      strike: r(profile.radar.strike),
      grappling: r(profile.radar.grappling),
      finishing: r(profile.radar.finishing),
      activity: r(profile.radar.activity),
      oppQuality: r(profile.radar.oppQuality),
    },
    pace: a
      ? {
          sampleFights: a.sampleFights,
          career: trimPace(a.career),
          recent: trimPace(a.recent),
          // Landed:absorbed ratio — >1 means out-landing opponents.
          ratioCareer: a.ratioCareer != null ? r(a.ratioCareer) : null,
          ratioLast3: a.ratioLast3 != null ? r(a.ratioLast3) : null,
          drift: a.drift
            ? {
                landedPer15Delta: r(a.drift.landedPer15Delta, 1),
                landedPctChange: a.drift.landedPctChange != null ? pct(a.drift.landedPctChange) : null,
                diffPer15Delta: r(a.drift.diffPer15Delta, 1),
              }
            : null,
        }
      : null,
    durability: a
      ? {
          timesFinished: a.durability.timesFinished,
          koTkoLosses: a.durability.koTkoLosses,
          subLosses: a.durability.subLosses,
          decisionLosses: a.durability.decisionLosses,
          lastFinishedYear: a.durability.lastFinishedYear,
          strikesAbsorbedPer15: r(a.durability.strikesAbsorbedPer15, 1),
        }
      : null,
    finishAnatomy: a
      ? {
          wins: a.finishWins.slice(0, 4),
          losses: a.finishedBy.slice(0, 4),
        }
      : null,
    // Cautious plain-English macro read (mileage/opposition-aware).
    trendRead: profile.trendRead.map((t) => `[${t.kind}] ${t.text}`),
    lastFights: profile.history.slice(0, 8).map((h) => ({
      date: h.date.slice(0, 10),
      opponent: h.opponentName,
      result: h.result,
      method: h.method,
      round: h.round,
      eloSwing: r(h.delta, 1),
      opponentElo: h.opponentRating > 0 ? Math.round(h.opponentRating) : null,
    })),
  };
}

async function compareFighters(idA: string, idB: string): Promise<unknown> {
  const data = getData();
  const fA = data.fighterMap.get(idA);
  const fB = data.fighterMap.get(idB);
  if (!fA || !fB) {
    return {
      error: `Unknown fighter id: ${!fA ? idA : idB}. Resolve names with search_fighter first.`,
    };
  }

  const ratings = buildEloRatings(data);
  const eloA = getElo(ratings, idA).rating;
  const eloB = getElo(ratings, idB).rating;
  const advA = getAdvancedStats(data, idA);
  const advB = getAdvancedStats(data, idB);
  const nudgeA = formEloNudge(advA?.drift);
  const nudgeB = formEloNudge(advB?.drift);

  const side = (
    f: typeof fA,
    id: string,
    elo: number,
    adv: ReturnType<typeof getAdvancedStats>,
  ) => ({
    fighterId: id,
    name: f.fullName,
    record: `${f.wins}-${f.losses}-${f.draws}`,
    weightClass: f.weightClass,
    elo: Math.round(elo),
    age: getFighterAge(id)?.age ?? null,
    reachIn: getReach(id),
    finishRatePct: pct(f.koRate + f.subRate),
    diffPer15: adv ? r(adv.career.diffPer15, 1) : null,
    ratioCareer: adv?.ratioCareer != null ? r(adv.ratioCareer) : null,
    ratioLast3: adv?.ratioLast3 != null ? r(adv.ratioLast3) : null,
  });

  const a = { ...side(fA, idA, eloA, advA), formEloNudge: r(nudgeA, 1) };
  const b = { ...side(fB, idB, eloB, advB), formEloNudge: r(nudgeB, 1) };

  const hasForm = nudgeA !== 0 || nudgeB !== 0;
  return {
    // Validated pure-Elo probability — the headline number.
    winProbAPct: pct(winProbability(eloA, eloB)),
    // Experimental: each side's Elo shaded by bounded (±45) recent-form drift.
    formAdjWinProbAPct: hasForm ? pct(winProbability(eloA + nudgeA, eloB + nudgeB)) : null,
    fighterA: a,
    fighterB: b,
  };
}

// ── Dispatch ─────────────────────────────────────────────────────────────

// Runs one tool call; always returns a JSON string (errors included, so the
// model can recover). Inputs arrive schema-validated (strict: true).
export async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    let result: unknown;
    switch (name) {
      case 'list_upcoming_cards':
        result = await listUpcomingCards();
        break;
      case 'get_card':
        result = await getCard(String(input.event_name ?? ''));
        break;
      case 'get_fighter':
        result = await getFighter(String(input.fighter_id ?? ''));
        break;
      case 'compare_fighters':
        result = await compareFighters(String(input.fighter_id_a ?? ''), String(input.fighter_id_b ?? ''));
        break;
      case 'search_fighter':
        result = { hits: searchFighters(String(input.query ?? ''), 5) };
        break;
      default:
        result = { error: `Unknown tool: ${name}` };
    }
    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : 'Tool execution failed.' });
  }
}

// Short human label for the UI's tool-activity affordance ("🔍 checking …").
export function toolActivityLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'list_upcoming_cards':
      return 'checking the fight calendar';
    case 'get_card':
      return `pulling the ${String(input.event_name ?? 'card')} card`;
    case 'get_fighter':
      return 'reading a fighter file';
    case 'compare_fighters':
      return 'running the head-to-head numbers';
    case 'search_fighter':
      return `looking up "${String(input.query ?? '')}"`;
    default:
      return 'checking the data';
  }
}
