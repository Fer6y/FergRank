// ─────────────────────────────────────────────────────────────────────────
//  advancedStats/trendRead.ts — the macro TREND READ + "plays like" comparable.
//
//  Split out of advancedStats/core.ts (2026-07-06): this is the prose layer —
//  ~500 lines of cautious, opponent-aware, deterministically-varied narration
//  that turns the numeric pace/durability/schedule stats into the "why this
//  rank" trend insights and the named statistical neighbour. Depends on core
//  one-directionally (types + ratioOf/classifyStyle/getAdvancedStats); core
//  never imports back, so the split is acyclic. Display-only, like all of
//  advancedStats — nothing here feeds eloEngine / scoringEngine.
// ─────────────────────────────────────────────────────────────────────────

import type { LoadedData } from '../loadData';
import type { FightTrace } from '../eloEngine';
import type { AdvancedStats, OpponentStyle, ScheduleContext } from './core';
import { ratioOf, classifyStyle, getAdvancedStats, TREND_WINDOW } from './core';

// ── Macro trend read ─────────────────────────────────────────────────────
// Plain-English interpretation of the numbers, written deliberately cautious:
// fights are rare events and stat lines are matchup-dependent, so a "trend"
// only gets called when the macro picture supports it (mileage, opposition
// level, damage history) — and even then it's phrased as a lean for the next
// fight, not a verdict.

export interface TrendInsight {
  kind: 'positive' | 'negative' | 'caution' | 'neutral';
  text: string;
}

export interface TrendContext {
  age: number | null;           // real age from the DOB pipeline, when resolved
  tenureYears: number;          // years since UFC debut (the fallback aging proxy)
  monthsSinceLastFight: number;
  eloRating: number;
  eloPeak: number;
  history: FightTrace[];        // newest first (for opponent-quality context)
  scheduleContext: ScheduleContext | null; // recent opponent style mix / step-up
  comparable: Comparable | null;           // named "plays like" statistical neighbour
}

// Deterministic per-fighter variation. Same fighter → same phrasing on every
// load (seeded off their own fight ids, which are stable and unique), but two
// different fighters tripping the SAME branch read differently. Nothing here is
// random — it's a stable hash, so the golden master and the agent stay stable.
function trendSeed(a: AdvancedStats): number {
  let h = 2166136261;
  const key = a.timeline.map((p) => p.fightId).join('|');
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Pick one phrasing from a pool. `salt` is a per-branch constant so a given
// fighter doesn't land on the same index in every branch they trip.
function pickVariant<T>(seed: number, salt: number, arr: T[]): T {
  const x = (seed ^ Math.imul(salt >>> 0, 2654435761)) >>> 0;
  return arr[x % arr.length];
}

// The dominant archetype of the recent slate, from the style mix the schedule
// context already computed. This is what lets a lean name a real opponent type
// ("a grappling-led run", "a striker who'll trade") instead of hand-waving at a
// vague "pressure matchup". `unknown` opponents are excluded from the vote.
interface StyleLean { faced: OpponentStyle; n: number; total: number; }
function styleLean(sc: ScheduleContext | null): StyleLean | null {
  if (!sc) return null;
  const { striker, grappler, balanced } = sc.styleMix;
  const total = striker + grappler + balanced;
  if (total < 2) return null;
  if (grappler >= 2 && grappler >= striker && grappler >= balanced) return { faced: 'grappler', n: grappler, total };
  if (striker >= 2 && striker >= grappler && striker >= balanced) return { faced: 'striker', n: striker, total };
  return { faced: 'balanced', n: balanced, total };
}

// ── "Plays like" comparable ───────────────────────────────────────────────
// The named statistical neighbour: the ranked fighter whose style-defining
// career profile (pace, defence, grappling load, power, margin, level) sits
// closest to this one's. Features are z-scored across the candidate pool so a
// big-unit stat (strikes/15) can't dominate a small-unit one (takedowns/15).
// Display-only — a colour comment, never a scoring input.
export interface Comparable {
  id: string;
  name: string;
  sharedTrait: string;   // short "why they're alike" phrase for the prose
}

function comparableFeatures(a: AdvancedStats, elo: number): number[] {
  const c = a.career;
  return [
    c.landedPer15,                 // volume
    c.absorbedPer15,               // porousness
    c.tdPer15,                     // takedown pressure
    c.ctrlSharePct,                // control grind
    c.kdPer15,                     // power
    ratioOf(c) ?? 1,               // margin
    elo,                           // level
  ];
}

function sharedTraitOf(self: AdvancedStats): string {
  switch (classifyStyle(self.career)) {
    case 'grappler': return 'both live on takedowns and control time';
    case 'striker':  return 'both are high-volume distance strikers';
    default:         return 'a near-identical pace, power and margin profile';
  }
}

export function findComparable(
  data: LoadedData,
  selfId: string,
  selfStats: AdvancedStats,
  candidateIds: string[],
  eloOf: (id: string) => number,
): Comparable | null {
  // Don't let a mid-tier fighter get compared UP to a legend. A comparable can
  // sit at or below the subject's level (and reaching down is fine — the style
  // distance already keeps it honest), but never more than this far above it.
  const REACH_UP_CAP = 80; // Elo
  const selfElo = eloOf(selfId);

  const rows: { id: string; f: number[] }[] = [];
  for (const id of candidateIds) {
    if (id === selfId) continue;
    const a = getAdvancedStats(data, id);
    if (!a || a.sampleFights < 4) continue;
    if (!data.fighterMap.get(id)?.fullName) continue;
    if (eloOf(id) - selfElo > REACH_UP_CAP) continue; // no reaching up the legends list
    rows.push({ id, f: comparableFeatures(a, eloOf(id)) });
  }
  if (rows.length < 3) return null;

  const selfRow = comparableFeatures(selfStats, eloOf(selfId));
  const dim = selfRow.length;
  const all = [selfRow, ...rows.map((r) => r.f)];
  const meanV: number[] = [];
  const stdV: number[] = [];
  for (let k = 0; k < dim; k++) {
    const col = all.map((v) => v[k]);
    const m = col.reduce((s, x) => s + x, 0) / col.length;
    const sd = Math.sqrt(col.reduce((s, x) => s + (x - m) ** 2, 0) / col.length) || 1;
    meanV[k] = m; stdV[k] = sd;
  }
  const z = (v: number[]) => v.map((x, k) => (x - meanV[k]) / stdV[k]);
  // Weight the style-defining axes above the level axis — we want the fighter
  // who moves like them, not merely one rated the same.
  const w = [1.1, 1.0, 1.2, 1.1, 0.9, 1.0, 0.6];
  const zs = z(selfRow);

  let best: { id: string; d: number } | null = null;
  for (const r of rows) {
    const zr = z(r.f);
    let d = 0;
    for (let k = 0; k < dim; k++) { const diff = (zs[k] - zr[k]) * w[k]; d += diff * diff; }
    if (!best || d < best.d) best = { id: r.id, d };
  }
  if (!best) return null;
  const name = data.fighterMap.get(best.id)!.fullName;
  return { id: best.id, name, sharedTrait: sharedTraitOf(selfStats) };
}

export function buildTrendRead(a: AdvancedStats, ctx: TrendContext): TrendInsight[] {
  const out: TrendInsight[] = [];
  const { career, last3, ratioCareer, ratioLast3 } = a;

  if (!last3 || ratioCareer == null || ratioLast3 == null) {
    return [{ kind: 'neutral', text: 'Fewer than 3 charted fights — not enough for a trend read yet.' }];
  }

  const seed = trendSeed(a);
  const lean = styleLean(ctx.scheduleContext);

  // Opposition context: was the last-3 schedule a step up from the career norm?
  const traced = ctx.history.filter((h) => h.opponentRating > 0);
  const oppRecent = traced.slice(0, TREND_WINDOW);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const oppRecentElo = mean(oppRecent.map((h) => h.opponentRating));
  const oppCareerElo = mean(traced.map((h) => h.opponentRating));
  const oppStep = Math.round(oppRecentElo - oppCareerElo);
  const stepUp = oppStep >= 40;

  const ratioChange = ratioLast3 / ratioCareer - 1;           // margin trend
  const outputChange = career.landedPer15 >= 5 ? last3.landedPer15 / career.landedPer15 - 1 : 0;
  // Real age leads the mileage judgement (34+ is where MMA age curves bend);
  // tenure/fight-count carry it when no DOB resolved.
  const deepMileage = (ctx.age != null && ctx.age >= 34) || ctx.tenureYears >= 9 || a.sampleFights >= 18;
  const mileageNote = ctx.age != null
    ? `at age ${ctx.age} with ${a.sampleFights} charted fights`
    : ctx.tenureYears >= 1
      ? `${Math.round(ctx.tenureYears)} years and ${a.sampleFights} charted fights into the UFC run`
      : `${a.sampleFights} charted fights in`;
  const pctFmt = (x: number) => `${Math.abs(Math.round(x * 100))}%`;

  const rl = ratioLast3.toFixed(2);
  const rc = ratioCareer.toFixed(2);

  // Named "plays like" comparable + a helper that only appends comp-referencing
  // variants when a neighbour actually resolved (keeps pools valid otherwise).
  const cmp = ctx.comparable;
  const cmpName = cmp?.name ?? null;
  const cmpTrait = cmp?.sharedTrait ?? '';
  const withComp = (base: string[], extra: (name: string, trait: string) => string[]) =>
    cmpName ? [...base, ...extra(cmpName, cmpTrait)] : base;

  // Schedule direction (the SoS half of the SoS×form combinations below) and a
  // plain noun for the recent archetype (the style half).
  const stepDown = oppStep <= -40;
  const stepDownAbs = Math.abs(oppStep);
  const facedNoun = lean?.faced === 'grappler' ? 'grapplers' : lean?.faced === 'striker' ? 'strikers' : null;

  // Beating the schedule — the SoS-balancer for a misleading raw drift.
  // A fighter climbing through better competition sees their raw output/margin
  // fall (better opponents don't let you tee off), which the drift column reads
  // as "decline". If they're still out-landing what this tougher slate normally
  // concedes, that's dominance, not erosion — say so, and lead with it.
  const sc = ctx.scheduleContext;
  const offDom = sc?.landedVsExpected ?? null;   // >1 = out-landing what slate allows
  const defDom = sc?.absorbedVsExpected ?? null; // <1 = absorbing less than slate lands
  const rawLooksDown = outputChange <= -0.08 || ratioChange <= -0.1;
  const schedHarder = oppStep >= 25;
  let dominanceFired = false;
  if (offDom != null && offDom >= 1.15 && (rawLooksDown || schedHarder)) {
    const overLand = Math.round((offDom - 1) * 100);
    const defNote =
      defDom != null && defDom <= 0.95
        ? ` while absorbing ${Math.round((1 - defDom) * 100)}% under what they normally land`
        : defDom != null && defDom <= 1.05
          ? ' while holding them to roughly their usual output'
          : '';
    const stepNote = oppStep >= 15 ? `the opposition stepped up ${oppStep > 0 ? '+' : ''}${oppStep} Elo and ` : '';
    out.push({
      kind: 'positive',
      text: pickVariant(seed, 0x09, [
        `The raw drift reads down, but that's the schedule, not the fighter — ${stepNote}against that level they're still landing ${overLand}% more than these opponents normally give up${defNote}. Out-performing a rising slate is dominance, not decline.`,
        `Don't misread the drift: ${stepNote}the recent slate is better, yet they're out-landing what these opponents usually concede by ${overLand}%${defNote}. Falling raw volume against rising competition is a step up, not a slide.`,
        `Output is "down" only against their own soft-schedule early career — measured against who they've actually faced, they're landing ${overLand}% above what this slate normally allows${defNote}. ${stepNote ? 'The competition climbed; the dominance held.' : 'That’s the number that matters.'}`,
        `Read the drift the right way: ${stepNote}he's landing ${overLand}% more than this slate normally allows${defNote}. When the raw number dips because the opponents got better, that's a promotion, not a problem.`,
        `The last-3 volume looks soft only next to a padded early record — against who he's actually shared the cage with, he's ${overLand}% above what they usually concede${defNote}. ${stepNote ? 'Tougher room, same control.' : 'That’s the signal.'}`,
        `Ignore the headline drift: ${stepNote}the fighters in front of him got harder to hit, yet he's still out-landing their norm by ${overLand}%${defNote}. Doing more against more is the definition of trending up.`,
      ]),
    });
    dominanceFired = true;
  }

  // Margin tightening — the aging-pattern read, but opposition-aware.
  if (ratioChange <= -0.15 && !dominanceFired) {
    if (stepUp) {
      // SoS × form (× style, × comp): the margin fell as the schedule climbed.
      const styleLines = facedNoun
        ? [
            `The margin tightened ${pctFmt(ratioChange)} (${rl} vs ${rc}) as the schedule jumped ~+${oppStep} Elo — and the recent slate leaned on ${facedNoun}. Tougher names and a stickier style at once compress the numbers twice over; judge it against level competition, not the raw drift.`,
            `Ratio down ${pctFmt(ratioChange)} (${rl} vs ${rc}) into a ~+${oppStep} Elo tougher, ${facedNoun}-heavy run — exactly the kind of slate that shrinks a stat line without shrinking the fighter. Context first, decline a distant last.`,
            `Tighter margins (${rl} vs ${rc}, off ${pctFmt(ratioChange)}) against a ~+${oppStep} Elo tougher, ${facedNoun}-led run — the schedule got harder and the style got stickier at the same time. Two headwinds, one dip; don't read it as decline.`,
            `The ${pctFmt(ratioChange)} compression came against better ${facedNoun} (~+${oppStep} Elo) — exactly the matchup that shrinks a stat line honestly. Context first; the next level test writes the verdict.`,
          ]
        : [];
      out.push({
        kind: 'caution',
        text: pickVariant(seed, 0x11, withComp([
          `Landed:absorbed tightened ${pctFmt(ratioChange)} over the last 3 (${rl} vs ${rc} career), but the opposition jumped ~+${oppStep} Elo across the same stretch — the margin narrowed because the room got tougher, not because the fighter did. The next fight at this level is the real referee.`,
          `The ratio slipped ${pctFmt(ratioChange)} across the last 3 (${rl} vs ${rc}), and so did the difficulty of the draw — opponents ~+${oppStep} Elo above the career norm. Tighter numbers against better names is context first, decline a distant second.`,
          `Margins are down ${pctFmt(ratioChange)} lately (${rl} vs ${rc} career), but that's what a ~+${oppStep} Elo step up in competition looks like on the stat sheet. Judge it on whether it holds once the schedule levels back off.`,
          `The ${pctFmt(ratioChange)} dip (${rl} vs ${rc}) rode a ~+${oppStep} Elo jump in competition — you don't out-land elite opposition the way you out-land gatekeepers. Read it as a class test he's still passing, not a fade.`,
          `Landed:absorbed slipped ${pctFmt(ratioChange)} (${rl} vs ${rc}) as the competition climbed ~+${oppStep} Elo — the kind of dip that says "harder opponents," not "declining fighter." The next same-tier fight is where you learn which.`,
          `Margin down ${pctFmt(ratioChange)} (${rl} vs ${rc}), but every point of it tracks a ~+${oppStep} Elo tougher draw. Elite opponents don't hand over clean numbers; hold the read until the schedule eases.`,
          `The ratio gave back ${pctFmt(ratioChange)} (${rl} vs ${rc}) while the names on the other side got ~+${oppStep} Elo better — a tax on the schedule, not the fighter. Judge it against level competition, not the trendline.`,
          `A ${pctFmt(ratioChange)} tightening (${rl} vs ${rc}) against a ~+${oppStep} Elo step up reads as a fighter being stress-tested, not slipping. What he does in the next one at this level is the tell.`,
          ...styleLines,
        ], (name, trait) => [
          `Ratio off ${pctFmt(ratioChange)} (${rl} vs ${rc}) as competition rose ~+${oppStep} Elo — tighter margins against better names. For scale, his nearest stylistic comp is ${name} (${trait}); the read is a step up in class, not a step down in form.`,
          `The ${pctFmt(ratioChange)} compression tracks a ~+${oppStep} Elo tougher schedule, not a fade — think of ${name} as the profile neighbour, and judge both on the next level-competition test.`,
          `The margin is off ${pctFmt(ratioChange)} (${rl} vs ${rc}) into a ~+${oppStep} Elo tougher slate — a class jump, not a fade. ${name} is the closest stylistic comp for scale (${trait}); measure him there, not on the raw drift.`,
          `Down ${pctFmt(ratioChange)} on the ratio (${rl} vs ${rc}) as opponents rose ~+${oppStep} Elo — read it as difficulty, not decline. For a like-for-like yardstick, ${name} (${trait}) is the nearest neighbour.`,
        ])),
      });
    } else if (deepMileage) {
      out.push({
        kind: 'negative',
        text: pickVariant(seed, 0x12, [
          `Landed:absorbed has tightened ${pctFmt(ratioChange)} over the last 3 (${rl} vs ${rc} career) against similar-level opposition, ${mileageNote} — the textbook wear curve. It means a thinner margin for error next time, most of all if the pace holds into the deep rounds.`,
          `The margin compressed ${pctFmt(ratioChange)} across the last 3 (${rl} vs ${rc}), same tier of opponent, ${mileageNote}. That's the shape of accumulated mileage, not one off night — expect less room to absorb a mistake as a fight gets late.`,
          `Ratio off ${pctFmt(ratioChange)} over the last 3 (${rl} vs ${rc} career) with no jump in opponent quality to explain it, ${mileageNote} — reads as the tank, not the matchup. The tell to watch is whether the sharpness fades in the back half.`,
          `Landed:absorbed down ${pctFmt(ratioChange)} (${rl} vs ${rc}) with the opponent quality flat, ${mileageNote}. When the schedule didn't get harder but the margin still shrank, mileage is the usual culprit — the sharpness fades late before it fades early.`,
          `The ${pctFmt(ratioChange)} compression comes ${mileageNote}, against the same tier of names — the reflexes-first read. It won't show on a highlight reel; it shows in the championship rounds. Weigh it against a fast starter.`,
          `Landed:absorbed off ${pctFmt(ratioChange)} (${rl} vs ${rc}) against the same tier he's always faced, ${mileageNote} — the ratio, not the opponent, is doing the moving. That's usually the odometer talking.`,
          `The margin has thinned ${pctFmt(ratioChange)} (${rl} vs ${rc}) with no bump in competition to blame it on, ${mileageNote}. Reflexes go before records do; the back half of the next fight is where it'd show.`,
          `Ratio down ${pctFmt(ratioChange)} (${rl} vs ${rc}) ${mileageNote}, level opposition throughout — a slow compression, not a bad night. Expect a tighter margin for error the deeper a fight goes.`,
          `A ${pctFmt(ratioChange)} give-back on the margin (${rl} vs ${rc}), ${mileageNote}, against familiar-level names — the shape wear leaves before decline is obvious. Weigh it against a fast, high-volume start.`,
          `The ${pctFmt(ratioChange)} tightening (${rl} vs ${rc}) lands ${mileageNote} with the schedule flat — the miles, not the matchups. It rarely shows early; it shows when the pace has to hold five rounds.`,
        ]),
      });
    } else {
      out.push({
        kind: 'caution',
        text: pickVariant(seed, 0x13, [
          `Ratio is off ${pctFmt(ratioChange)} across the last 3, but on a short career sample with no mileage flags this is a wobble, not a pattern — one more fight tells you which.`,
          `The margin dipped ${pctFmt(ratioChange)} over the last 3, though with this few fights logged and nothing pointing to wear it's noise until proven otherwise. Treat it as a lean and let the next result settle it.`,
          `Down ${pctFmt(ratioChange)} on the margin over three fights, but too early and too clean to call a trend — no mileage flags, small book. The next result is worth more than this dip.`,
          `The margin dipped ${pctFmt(ratioChange)} over three, but the book's too thin and too clean to call it anything but variance. Let the next fight vote before you do.`,
          `Ratio off ${pctFmt(ratioChange)} lately — on this few fights, that's inside the noise band, not a signal. No mileage, no red flags; treat it as a shrug.`,
          `Down ${pctFmt(ratioChange)} on the margin, but with a short sample and a clean bill of health this is a wobble a single good performance erases. One more data point settles it.`,
        ]),
      });
    }
  }

  // Margin widening — ascending read, sample-aware.
  if (ratioChange >= 0.15 && outputChange >= -0.05) {
    out.push({
      kind: 'positive',
      text: stepUp
        ? pickVariant(seed, 0x21, withComp([
            `Margins are widening — ${rl} landed per absorbed over the last 3 vs ${rc} career — and the opponents got ~+${oppStep} Elo tougher while it happened. That's the most convincing shape an ascending fighter can have.`,
            `Out-landing opponents by more, not less: ${rl} vs ${rc} career, against a slate ~+${oppStep} Elo above the norm. Better margins against rising competition is the real up-arrow.`,
            `The gap opened to ${rl} (from ${rc}) as the schedule climbed ~+${oppStep} Elo${facedNoun ? ` and leaned on ${facedNoun}` : ''} — he's not padding a record, he's beating up better opponents. Ascending, with the usual three-fight caveat.`,
            `Margins widening into a ~+${oppStep} Elo tougher slate (${rl} vs ${rc}) — improving where it's hardest to improve. This is the cleanest up-arrow the numbers offer.`,
            `The margin widened to ${rl} (from ${rc}) as opponents climbed ~+${oppStep} Elo — better competition, better numbers, same fighter getting sharper. About as clean an up-arrow as the data draws.`,
            `Out-landing a ~+${oppStep} Elo tougher slate by a wider margin (${rl} vs ${rc}) — this isn't stat-padding, it's a level-up in real time. Small sample, big signal.`,
            `Rising bar, rising margins: ${rl} landed per absorbed lately vs ${rc} career, against a ~+${oppStep} Elo harder draw${facedNoun ? ` of ${facedNoun}` : ''}. Improvement against improvement is the read that actually holds.`,
            `He's pulling ahead where it's hardest — ${rl} vs ${rc} while the schedule jumped ~+${oppStep} Elo. Ascending, and doing it against the kind of names that expose fakes.`,
          ], (name, trait) => [
            `Out-landing a ~+${oppStep} Elo tougher slate by more (${rl} vs ${rc}) — a genuine climb. His closest stylistic comp is ${name} (${trait}); the difference lately is he's doing it against a rising bar.`,
            `Margins widening (${rl} vs ${rc}) into a ~+${oppStep} Elo tougher slate — a genuine climb. His nearest stylistic comp is ${name} (${trait}); right now he's out-performing the profile.`,
          ]))
        : pickVariant(seed, 0x22, withComp([
            `Margins are widening — ${rl} landed per absorbed over the last 3, vs ${rc} career. Trajectory points up, with the standard 3-fight caveat.`,
            `The gap is opening: ${rl} landed per absorbed lately against ${rc} for the career. Reads as a fighter rounding into form — just hold it lightly on three fights.`,
            `Margins are opening — ${rl} landed per absorbed lately vs ${rc} career, a fighter finding another gear. Three fights is a small book, but the arrow points up.`,
            `The margin opened to ${rl} from ${rc} — a fighter trending up, even if three fights is a small ledger to bank on. The direction's encouraging.`,
            `Out-landing opponents by a wider gap lately (${rl} vs ${rc} career) — form arrow up. Hold it lightly on the sample, but it's the good kind of drift.`,
            `${rl} landed per absorbed over the last 3 against ${rc} for the career — the numbers are moving the right way. Momentum, with the standard small-sample asterisk.`,
          ], (name, trait) => [
            `The gap widened to ${rl} from ${rc} — trending up. Stylistically his nearest neighbour is ${name} (${trait}); right now he's the one with the momentum.`,
            `The gap's opened to ${rl} from ${rc} — pointing up. For a form yardstick, his closest stylistic comp is ${name} (${trait}); he's the one with the wind at his back lately.`,
          ])),
    });
  }

  // Schedule SOFTENED (the other SoS×form combination): read the recent numbers
  // through the lower level of competition before calling them form. Gated to
  // the not-already-tightening lane so it never doubles the block above.
  if (stepDown && !stepUp && !dominanceFired && ratioChange > -0.15) {
    out.push({
      kind: 'caution',
      text: pickVariant(seed, 0x23, withComp(
        ratioChange >= 0.05
          ? [
              `Margins look healthy (${rl} vs ${rc}), but the recent slate eased ~${stepDownAbs} Elo below the career norm — softer names inflate a stat line. The read gets real again the next time the competition steps up.`,
              `The last-3 numbers are up (${rl} vs ${rc}), against a schedule ~${stepDownAbs} Elo softer than usual${facedNoun ? ` and heavy on ${facedNoun}` : ''}. Encouraging, but discount for the level — a step back up in class is the actual test.`,
              `Out-landing lately (${rl} vs ${rc}), yet the opponents ran ~${stepDownAbs} Elo under his career average. Dominance over a soft patch is still just a soft patch; hold the verdict for a ranked opponent.`,
              `The last-3 line looks strong (${rl} vs ${rc}), but the opponents came in ~${stepDownAbs} Elo below his career norm — good numbers against a soft patch. The verdict waits for a ranked name.`,
              `Margins up (${rl} vs ${rc}), competition down ~${stepDownAbs} Elo — read the two together, not the first alone. Beating who you're supposed to beat is maintenance, not a climb.`,
              `Healthy on paper (${rl} vs ${rc}), but the recent slate eased ~${stepDownAbs} Elo${facedNoun ? ` and leaned on ${facedNoun}` : ''}. Discount the form for the level; the real test is a step back up in class.`,
            ]
          : [
              `Steady numbers (${rl} vs ${rc}), but against a schedule ~${stepDownAbs} Elo softer than the career norm — holding serve at a lower level isn't the same as climbing. A step back up in class is the test.`,
              `The recent slate ran ~${stepDownAbs} Elo below the career norm — before reading the last-3 line as form, discount for the softer competition. The next ranked opponent tells the real story.`,
              `Numbers held (${rl} vs ${rc}), but against a ~${stepDownAbs} Elo softer slate — treading water at a lower level, not gaining ground. A tougher draw is the one that tells you something.`,
              `The recent competition ran ~${stepDownAbs} Elo under his norm, and the last-3 line is flat — par for the softer course. Reserve judgement for the next ranked opponent.`,
            ],
        (name, trait) => [
          `Recent opponents sat ~${stepDownAbs} Elo under his career average — solid numbers, softer names. For a level check, his nearest stylistic comp is ${name} (${trait}); judge the form against a comparable step back up.`,
          `Solid last-3 numbers, but the opponents sat ~${stepDownAbs} Elo below his average — grade on a curve. His closest stylistic comp for a level check is ${name} (${trait}).`,
        ])),
    });
  }

  // Age risk that the stat line hasn't shown yet — MMA age curves bend fast.
  if (ctx.age != null && ctx.age >= 36 && ratioChange > -0.15) {
    out.push({
      kind: 'caution',
      text: pickVariant(seed, 0x31, [
        `At ${ctx.age}, the risk is live even with the numbers holding — MMA age curves bend hard past the mid-30s, and the drop usually shows up all at once rather than sliding in.`,
        `${ctx.age} is the range where the floor can fall out overnight. The stat line looks intact, but late-30s decline in this sport tends to arrive as a cliff, not a slope — worth pricing in against a live opponent.`,
        `${ctx.age} isn't old on a calendar, but it's late for this sport — the numbers can hold right up until the night they don't. Price in a little more variance than the stat line suggests.`,
        `At ${ctx.age}, the read isn't "declining," it's "closer to the edge than the numbers show." Mid-30s falloffs in MMA tend to arrive between fights, not during a slow slide.`,
      ]),
    });
  }

  // Output falling with the margin holding → pace, not damage. Ground the lean
  // in the archetype the slow fights came against, and name the archetype the
  // number should rebound against — not a vague "pressure matchup".
  if (outputChange <= -0.2 && ratioChange > -0.15 && !dominanceFired) {
    const down = pctFmt(outputChange);
    const n = lean?.n ?? 0;
    let variants: string[];
    if (lean?.faced === 'grappler') {
      variants = withComp([
        `Volume is off ${down} over the last 3, but the landed:absorbed line barely moved — pace, not decline. ${n} of those opponents were grappling-led, and clinch-and-control fights flatten everyone's strike count. Pencil it back up against someone who keeps it standing.`,
        `Strikes-per-15 dropped ${down} across the last 3 while the ratio held — a control-heavy stretch, not a fighter getting outgunned. Wrestlers dragged these fights to the mat; expect the output to rebound against a striker who trades in open space.`,
        `The pace fell ${down} over the last 3, yet the margin didn't budge. That's what a grappler-heavy slate does to a strike count — time on the fence and on the floor isn't time throwing. A stand-and-bang opponent flips it back.`,
        `Fewer strikes, same dominance: output down ${down}, ratio flat. ${n} recent opponents wanted the fight on the ground, so the volume dip is the venue, not the fighter. Watch the number spike the next time someone stands with him.`,
        `Output slid ${down} across the last 3 with the ratio intact — read the schedule before reading decline. Grapplers turn rounds into grinds; the strikes-per-15 will climb the moment the matchup is a kickboxer, not a wrestler.`,
        `The count is down ${down}, the margin isn't — a classic grappler-slate signature. When most of a round is spent breaking grips, nobody's volume looks pretty. Against a distance striker the tempo resets upward.`,
        `Landed volume off ${down} over three fights, ratio holding firm. Control-first opponents suppress output on both sides of the cage, so this is a pace artifact. A pocket-brawler next would pull the number right back.`,
        `Activity dipped ${down} while the strike differential kept its shape — the tell of a run against grinders, not a fade. Expect the volume to bounce against an opponent content to keep it on the feet.`,
        `His output reads ${down} over the last 3, but the margin says he's still winning the exchanges he's in — there are just fewer of them against clinch-and-control types. A stand-up matchup is where the number recovers.`,
        `Tempo down ${down}, quality steady: ${n} of the recent opponents fought a grappling game, and mat time is quiet time on a strike sheet. This isn't erosion; it's the draw. A striker forces the pace back up.`,
        `The strike count dropped ${down} while the margin sat still — a run against grapplers reads exactly like this. Grip-fighting and mat time don't score on a volume sheet. A striker resets it upward.`,
        `Volume off ${down}, differential flat: ${n} of the recent opponents made it a wrestling match, and wrestling matches are quiet on the strike log. Nothing here says slowing down; it says style.`,
        `Output down ${down} across three fights, ratio unmoved — the fingerprint of a control-heavy slate. Time spent stuffing takedowns is time not throwing. Expect a busier line against a pure striker.`,
        `Fewer strikes landed, same edge kept — the pace fell ${down} because ${n} opponents wanted the clinch, not because he lost a step. A stand-up matchup is where the numbers breathe again.`,
        `The tempo reads ${down} slower, but the margin says he's still on top of every exchange there was — there were just fewer, against grinders. Read the venue, not the volume.`,
        `Landed volume dipped ${down} into a grappling-led run, ratio holding — clinch fights compress both fighters' output. This is matchup math, not a fade; a kickboxer flips it back.`,
        `He threw less over the last 3 (${down} down), but the differential never wavered — that's what happens when the fight keeps hitting the mat. The strike count rebounds the moment it stays standing.`,
        `A ${down} drop in pace with a flat margin is the classic anti-grappler stat line — you can't rack up strikes while breaking grips and defending shots. Expect the number to climb against a stand-and-trade type.`,
        `Output's down ${down}, quality isn't — ${n} recent foes turned it into a grind, and grinds bury volume for everyone involved. Nothing structural; a pressure striker pulls the pace back up.`,
        `The pace sagged ${down} over three grappling-heavy fights while the ratio held firm — mat time is dead time on a strike chart. Read it as the draw he got, not the fighter he's become.`,
      ], (name, trait) => [
        `Down ${down} in volume with the ratio steady — the grappling-led slate explains the quiet, not decline. Stylistically his closest comp is ${name} (${trait}); the next stand-up matchup is where the output rebounds.`,
        `The ${down} dip is a control-fight artifact, not a slide — those opponents wanted the mat. Read a fighter like ${name} (${trait}) as the profile comp; against someone willing to strike, the number should climb back.`,
        `Down ${down} in volume, margin intact — the grappling slate is the whole story, not decline. Stylistically his closest comp is ${name} (${trait}); the next stand-up night is where the output rebounds.`,
        `The ${down} dip is a wrestling-match artifact — those opponents wanted the floor. ${name} (${trait}) is the nearest profile neighbour; against a striker, expect the count to climb back.`,
      ]);
    } else if (lean?.faced === 'striker') {
      variants = withComp([
        `Output is down ${down} over the last 3 with the ratio intact — fewer strikes, not worse ones. Against a striker-heavy run that's usually a range-and-timing battle, not a volume war; the count climbs if the next opponent forces exchanges.`,
        `The ${down} dip in volume sits next to a steady ratio — tighter, more measured fights, not erosion. Two strikers managing distance keeps totals low; a come-forward wrestler who closes the gap drags the pace back up.`,
        `Strikes-per-15 off ${down}, margin flat — the shape of careful kickboxing matches. When both fighters respect the counter, nobody empties the tank. A grappler forcing scrambles would spike the activity.`,
        `Volume down ${down} across the last 3, ratio holding — this reads as patience against fellow strikers, not a fading motor. Expect a busier night the moment someone pressures him into a phone-booth fight.`,
        `Fewer exchanges, same edge: output ${down}, ratio unchanged. ${n} recent opponents were strikers who fight at range, so the low count is mutual respect, not decline. A level-changer messes that math up in his favor.`,
        `The count fell ${down} while the differential held — a range-management stretch against other strikers. It's tempo, not trouble. A pressure fighter who refuses to let it breathe would push the volume back north.`,
        `Activity is off ${down} over three fights with the margin steady — the hallmark of technical striker-vs-striker chess. Read it as style, and expect it to reverse against an opponent who forces the scrap.`,
        `Landed volume down ${down}, quality intact — against a striker-first slate that's a distance duel, not a downturn. The number rebounds the instant the matchup rewards pressure over patience.`,
        `His output reads ${down} lower, but he's still winning his exchanges — there are just fewer of them when both men fight off the back foot. A come-forward opponent turns it into a firefight and lifts the count.`,
        `Tempo down ${down}, margin flat: careful work against careful strikers. Nothing here says decline; it says matchup. Expect the volume to climb against someone who drags him into the trenches.`,
        `The count fell ${down} with the margin flat — two rangy strikers rarely make a volume fight. It's timing and feints, not a fading engine. A pressure grappler would force the pace up.`,
        `Output down ${down}, ratio unmoved: ${n} recent opponents fought at distance, so low totals are the format, not a warning. Someone who closes the distance turns it into a brawl and lifts the number.`,
        `Fewer strikes, same command — a ${down} dip against strikers who respect the counter. Nobody empties the clip in a chess match. Expect a busier line when the next foe forces exchanges.`,
        `Volume slid ${down} while he kept winning the exchanges he took — the mark of careful striker-vs-striker fights. It reads as patience, and it reverses against a come-forward opponent.`,
        `The tempo eased ${down} over three fights against fellow strikers, margin holding — measured range work, not erosion. A grappler dragging it into scrambles would spike the activity.`,
        `He landed ${down} less over the last 3, but the differential says he's still on top — there were simply fewer exchanges in a distance duel. Read the matchup, then wait for a firefight.`,
        `A ${down} drop in output against a striker-first slate, ratio flat — that's mutual respect on the feet, not a slowing motor. The count climbs the instant someone makes it ugly.`,
        `Output's off ${down}, quality intact — ${n} of the recent names were counter-strikers, and counter-fights stay quiet. Nothing here says decline; a pressure fighter rewrites the tempo.`,
        `The pace reads ${down} slower against careful strikers while the margin holds — a range battle, not a downturn. Expect the volume to jump when the matchup rewards aggression.`,
        `Landed volume down ${down}, differential steady — the signature of technical kickboxing exchanges. It's style, not slippage; a level-changer forcing the clinch pulls the number up.`,
      ], (name, trait) => [
        `Down ${down} in volume with the ratio holding — a measured run against strikers, not a fade. His nearest stylistic comp is ${name} (${trait}); the count should rebound in a fight that forces exchanges.`,
        `The ${down} dip is distance-management against fellow strikers, not erosion. Read ${name} (${trait}) as the profile neighbour here; a pressure-heavy matchup is where the activity climbs back.`,
        `Down ${down} in volume, ratio holding — a measured run against strikers, not a fade. His nearest stylistic comp is ${name} (${trait}); the count rebounds in a fight that forces exchanges.`,
        `The ${down} dip is distance-management, not decline. ${name} (${trait}) is the closest profile neighbour; a pressure-heavy matchup is where the activity climbs back.`,
      ]);
    } else {
      variants = withComp([
        `Volume slid ${down} over the last 3 but the ratio held — slower fights, not one-sided ones. Read it as tempo; it can swing right back the moment an opponent forces a firefight.`,
        `Strikes-per-15 are off ${down} with the margin steady — a quieter stretch, not a downturn. The number is opponent-driven; a high-engagement opponent pulls it back up on its own.`,
        `Output down ${down}, quality intact — the fights got slower, not more lopsided. Tempo like this is a matchup story; expect the count to rise against someone who pushes the pace.`,
        `The count fell ${down} while the differential held — a low-volume stretch that says pace, not decline. A come-forward opponent would drag the activity back up.`,
        `Fewer strikes, same edge: output ${down}, ratio flat. This is the rhythm of the recent matchups, not a fading engine. It rebounds when the next fight is a scrap, not a chess match.`,
        `Activity is off ${down} over three fights with the margin unchanged — a quieter run, nothing structural. The number tends to snap back against a pressure fighter.`,
        `Landed volume down ${down}, quality holding — read the tempo, not decline. A high-output opponent is usually all it takes to reset the pace upward.`,
        `His output reads ${down} lower with the ratio intact — slower fights, still winning them. Expect the volume to climb the moment a matchup forces exchanges.`,
        `Tempo down ${down}, margin flat — a low-key stretch rather than a slide. The count is opponent-dependent and should bounce against someone who brings it.`,
        `Volume off ${down} across the last 3 while the differential held firm — pace, not problems. A firefight is all it takes to pull the number back north.`,
        `The count eased ${down} while the margin held — a quiet stretch, not a downturn. Volume follows the matchup, and this one just didn't ask for it. A pressure opponent brings it back.`,
        `Output's down ${down}, ratio flat — the fights got slower without getting closer. That's tempo, and tempo swings back the moment someone forces a firefight.`,
        `Fewer strikes over the last 3 (${down} down), same edge — nothing structural, just a lower-gear run. Expect the number to climb against a higher-output opponent.`,
        `Volume off ${down}, differential unmoved — read it as pace, not problems. The next busy opponent usually resets the whole line upward.`,
        `The tempo sagged ${down} while he kept winning his exchanges — a low-key three fights, not a slide. It rebounds when the matchup turns into a scrap.`,
        `He threw ${down} less lately with the margin intact — opponent-driven quiet, not a fading engine. A come-forward type drags the activity right back.`,
        `A ${down} dip in output against a flat ratio is the shape of slow matchups, not decline. Give it a high-tempo opponent and the count returns to form.`,
        `Landed volume down ${down}, quality holding — the fights simply ran cooler. Tempo like this is a matchup story; expect a livelier line next time out.`,
        `Output reads ${down} lower, differential steady — a measured stretch rather than a downturn. The number tends to bounce against someone who pushes the pace.`,
        `The pace fell ${down} over three fights while the margin stayed put — quiet, not concerning. A firefight is usually all it takes to pull it back north.`,
      ], (name, trait) => [
        `Down ${down} in volume with the ratio steady — quieter fights, not worse ones. Statistically his closest neighbour is ${name} (${trait}); the count should rebound against a higher-tempo opponent.`,
        `The ${down} dip is tempo, not decline — the margin never moved. Read ${name} (${trait}) as the profile comp; expect the activity to climb in a fight that forces exchanges.`,
        `Down ${down} in volume, margin steady — quieter fights, not worse ones. Statistically his closest comp is ${name} (${trait}); the count should rebound against a higher-tempo opponent.`,
        `The ${down} dip is tempo, not decline — the margin never budged. ${name} (${trait}) is the nearest profile neighbour; expect the activity to climb in a fight that forces exchanges.`,
      ]);
    }
    out.push({ kind: 'caution', text: pickVariant(seed, 0x41, variants) });
  }

  // Durability: heavy damage history on a worn fighter.
  if (a.durability.timesFinished >= 4 || (a.durability.kdAbsorbedPer15 >= 0.3 && deepMileage)) {
    const tf = a.durability.timesFinished;
    const times = tf === 1 ? 'once' : `${tf} times`;
    const yr = a.durability.lastFinishedYear ? ` (last ${a.durability.lastFinishedYear})` : '';
    const kd = a.durability.kdAbsorbedPer15.toFixed(2);
    out.push({
      kind: 'negative',
      text: pickVariant(seed, 0x51, [
        `Damage history is real: finished ${times}${yr}, absorbing ${kd} knockdowns/15 for the career. Late-career chins rarely improve — factor it against heavy hitters.`,
        `Been finished ${times}${yr} and taking ${kd} knockdowns/15 across the career — that ledger doesn't reverse with age. Against a one-shot puncher it's the first variable to weigh.`,
        `The chin ledger is the flag here: finished ${times}${yr}, ${kd} knockdowns absorbed per 15 over the career. That number tends to worsen, not heal, with mileage — respect it against real power.`,
        `Finished ${times}${yr}, ${kd} knockdowns/15 for the career — a durability line that doesn't rebuild once it's cracked. Against a heavy hitter it's the variable that decides the night.`,
      ]),
    });
  }

  // Layoff.
  if (ctx.monthsSinceLastFight >= 12) {
    const m = Math.round(ctx.monthsSinceLastFight);
    out.push({
      kind: 'caution',
      text: pickVariant(seed, 0x61, [
        `${m} months since the last walk to the cage — the rating already docks the inactivity, but first-fight-back rust stacks on top and rarely shows in the numbers beforehand.`,
        `It's been ${m} months out — the engine has regressed the rating for it, yet ring rust is its own tax on the comeback fight, independent of what the layoff did to the number.`,
        `${m} months between fights — the rating's already paid the inactivity tax, but timing and reads are the first things to go rusty, and they don't show on a stat sheet until the cage door shuts.`,
        `A ${m}-month layoff sits on top of whatever the engine already regressed — cage rust is real, hits hardest in round one, and tends to lift once the fighter takes a clean shot and settles.`,
      ]),
    });
  }

  // Far below peak — the chart usually shows why.
  if (ctx.eloPeak - ctx.eloRating >= 120 && deepMileage) {
    const gap = Math.round(ctx.eloPeak - ctx.eloRating);
    out.push({
      kind: 'neutral',
      text: pickVariant(seed, 0x71, [
        `Current rating sits ${gap} Elo under the career peak — the engine has already booked the slide; the timeline above pins when it turned.`,
        `${gap} Elo off the peak, and already priced in — not new information the rating is missing, but a slope the chart above lays out fight by fight.`,
        `The rating's ${gap} Elo off its peak, and that gap is information the model already carries — the profile chart shows the fights where it slipped, not a surprise waiting to happen.`,
        `${gap} Elo below the high-water mark — a decline that's already in the number, not hiding from it. The timeline above is the receipt for when the peak passed.`,
      ]),
    });
  }

  if (out.length === 0) {
    out.push({
      kind: 'neutral',
      text: pickVariant(seed, 0x81, withComp([
        'Output, margins and durability are all tracking near the career baseline — nothing here worth pricing into the next fight beyond the matchup itself.',
        'No macro signal to call: pace, strike margin and damage history all sit close to this fighter’s own norm. The next fight is a matchup read, not a trend read.',
        'Nothing jumps off the page — output, margins, durability and pace all sit inside this fighter’s normal range. Read the next fight as a matchup, not a trend.',
        'The macro picture is quiet: no volume swing, no margin drift, no damage flag beyond the career baseline. Whatever decides the next fight, it won’t be a trend in these numbers.',
      ], (name, trait) => [
        `Everything sits near this fighter's own baseline — no macro trend to price in. If you want a form yardstick, his closest stylistic neighbour is ${name} (${trait}).`,
        `Pace, margins and durability all track the career norm — quiet by design. Statistically his nearest comp is ${name} (${trait}), for a like-for-like reference point.`,
        `No macro trend to price in — everything tracks the career norm. If you want a form reference point, his closest stylistic comp is ${name} (${trait}).`,
        `Pace, margin and durability all read baseline — a quiet profile by design. For a like-for-like yardstick, ${name} (${trait}) is the nearest neighbour.`,
      ])),
    });
  }
  return out.slice(0, 4);
}
