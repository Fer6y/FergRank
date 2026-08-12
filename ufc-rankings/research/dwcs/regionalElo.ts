// research/dwcs/regionalElo.ts — measure PROMOTION STRENGTH from the regional
// fight graph, so promotion tiers can be graded on evidence instead of a
// hand-made ladder.
//
// THE IDEA. data/sherdog_fights.csv holds every pre-UFC fight of the 2,229
// fighters who eventually reached the UFC, against 17,564 opponents who mostly
// never did. Run one chronological Elo sweep over that whole graph and
// promotions become comparable *without* assuming anything about them: fighters
// who move between orgs (and opponents shared across orgs) stitch the pools
// together, exactly as inter-division play links conferences in a sports rating.
//
// THE SELECTION TRAP, handled explicitly. Every "subject" in this file reached
// the UFC — they are selected on success. Judging a promotion by its subjects
// would mostly measure how many future UFC fighters we happen to hold for it.
// So the headline metric is FIELD STRENGTH: the mean rating of the NON-GRADUATE
// participants — the guys you actually have to beat there if you're a prospect.
// Graduate-side numbers are printed beside it, never mixed in.
//
// FIREWALL: research-zone, reads a frozen CSV, writes a CSV + console. Touches
// no Elo, no rankings. Output feeds the promotion-tier review, not the engine.
//
// Run: node_modules/.bin/jiti research/dwcs/regionalElo.ts
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { RANKING_CONFIG } from '../../src/lib/rankingConfig';
import { spearman } from '../backtest/metrics';

const K = 32;                 // regional sweep is standalone — not the UFC engine's K
const INIT = 1500;
const MIN_FIGHTS_RATED = 3;   // a fighter needs this many bouts to count in a pool mean
const MIN_POOL = 25;          // a promotion needs this many rated participants to report

interface Row {
  sherdogId: string;
  fullName: string;
  date: string;
  canonicalOrg: string;
  tier: string;
  tierMultiplier: string;
  opponentSherdogId: string;
  opponentName: string;
  result: string;
}

interface Bout {
  date: string;
  org: string;
  a: string;   // subject sherdogId
  b: string;   // opponent sherdogId
  resA: 'win' | 'loss' | 'draw';
}

function main(): void {
  const rows = Papa.parse<Row>(
    fs.readFileSync(path.join(process.cwd(), 'data', 'sherdog_fights.csv'), 'utf-8'),
    { header: true, skipEmptyLines: true }
  ).data;

  // ── de-duplicate into bouts (both corners present when both reached the UFC) ──
  const subjects = new Set(rows.map((r) => r.sherdogId).filter(Boolean));
  const bouts = new Map<string, Bout>();
  let undated = 0;
  for (const r of rows) {
    if (!r.sherdogId || !r.opponentSherdogId) continue;
    if (!r.date) { undated++; continue; }
    const res = r.result === 'win' ? 'win' : r.result === 'loss' ? 'loss' : r.result === 'draw' ? 'draw' : null;
    if (!res) continue; // NC has no rating information
    const [x, y] = [r.sherdogId, r.opponentSherdogId].sort();
    const key = `${x}|${y}|${r.date}`;
    if (bouts.has(key)) continue;
    bouts.set(key, { date: r.date, org: r.canonicalOrg || 'Unknown', a: r.sherdogId, b: r.opponentSherdogId, resA: res });
  }
  const ordered = [...bouts.values()].sort((p, q) => (p.date < q.date ? -1 : p.date > q.date ? 1 : 0));

  // ── chronological sweep ──
  const rating = new Map<string, number>();
  const fights = new Map<string, number>();
  const get = (id: string) => rating.get(id) ?? INIT;
  const bump = (id: string) => fights.set(id, (fights.get(id) ?? 0) + 1);

  // Per-org accumulators of FIGHT-TIME opponent quality (what the field was
  // worth on the night, not what anyone later became).
  const orgFightTime = new Map<string, number[]>();

  for (const b of ordered) {
    const ra = get(b.a);
    const rb = get(b.b);
    const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
    const sa = b.resA === 'win' ? 1 : b.resA === 'draw' ? 0.5 : 0;
    rating.set(b.a, ra + K * (sa - ea));
    rating.set(b.b, rb + K * ((1 - sa) - (1 - ea)));
    bump(b.a);
    bump(b.b);
    const arr = orgFightTime.get(b.org) ?? [];
    arr.push(ra, rb);
    orgFightTime.set(b.org, arr);
  }

  // ── per-promotion pools ──
  const orgParticipants = new Map<string, Set<string>>();
  const orgTier = new Map<string, string>();
  const orgMult = new Map<string, number>();
  for (const r of rows) {
    if (!r.canonicalOrg) continue;
    const set = orgParticipants.get(r.canonicalOrg) ?? new Set<string>();
    if (r.sherdogId) set.add(r.sherdogId);
    if (r.opponentSherdogId) set.add(r.opponentSherdogId);
    orgParticipants.set(r.canonicalOrg, set);
    orgTier.set(r.canonicalOrg, r.tier);
    orgMult.set(r.canonicalOrg, Number(r.tierMultiplier) || 0);
  }

  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : NaN);
  const pctl = (xs: number[], p: number) => {
    if (!xs.length) return NaN;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(p * s.length))];
  };

  interface OrgStat {
    org: string; tier: string; mult: number;
    participants: number; rated: number; graduates: number;
    fieldElo: number;      // ← headline: mean settled Elo of NON-graduate participants
    fieldP75: number;      // the level of a good (not elite) fighter in that pool
    gradElo: number;       // graduates' mean settled regional Elo (selected — context only)
    fightTimeElo: number;  // mean pre-fight rating across the org's bouts
    bouts: number;
  }
  const stats: OrgStat[] = [];
  for (const [org, set] of orgParticipants) {
    const ids = [...set].filter((id) => (fights.get(id) ?? 0) >= MIN_FIGHTS_RATED);
    if (ids.length < MIN_POOL) continue;
    const field = ids.filter((id) => !subjects.has(id)).map(get);
    const grads = ids.filter((id) => subjects.has(id)).map(get);
    stats.push({
      org,
      tier: orgTier.get(org) ?? '?',
      mult: orgMult.get(org) ?? 0,
      participants: set.size,
      rated: ids.length,
      graduates: grads.length,
      fieldElo: mean(field),
      fieldP75: pctl(field, 0.75),
      gradElo: mean(grads),
      fightTimeElo: mean(orgFightTime.get(org) ?? []),
      bouts: (orgFightTime.get(org)?.length ?? 0) / 2,
    });
  }
  stats.sort((a, b) => b.fieldElo - a.fieldElo);

  console.log(`REGIONAL ELO — ${ordered.length} de-duplicated bouts, ${rating.size} fighters`);
  console.log(`(${undated} undated rows skipped; ${subjects.size} reached the UFC, ${rating.size - subjects.size} did not)\n`);
  console.log(`FIELD STRENGTH BY PROMOTION — mean settled regional Elo of NON-graduate`);
  console.log(`participants with ${MIN_FIGHTS_RATED}+ rated bouts. This is "who you actually have to beat".\n`);
  console.log('  promotion                  tier   mult  bouts  pool  grads   FIELD   p75   (grads)');
  for (const s of stats) {
    console.log(
      `  ${s.org.slice(0, 24).padEnd(24)} ${s.tier.padEnd(6)} ${s.mult.toFixed(2)} ${String(s.bouts).padStart(6)} ` +
        `${String(s.rated).padStart(5)} ${String(s.graduates).padStart(6)}  ${s.fieldElo.toFixed(0).padStart(6)} ${s.fieldP75.toFixed(0).padStart(5)}   ${s.gradElo.toFixed(0).padStart(6)}`
    );
  }

  // ── validation: does field strength predict graduate UFC success? ──
  const gradesPath = path.join(process.cwd(), 'data', 'promotion_grades.csv');
  if (fs.existsSync(gradesPath)) {
    const grades = Papa.parse<Record<string, string>>(fs.readFileSync(gradesPath, 'utf-8'), {
      header: true, skipEmptyLines: true,
    }).data;
    const byOrg = new Map(grades.map((g) => [g.canonicalOrg, g]));
    const paired = stats
      .map((s) => ({ s, g: byOrg.get(s.org) }))
      .filter((p) => p.g && Number(p.g!.graduates) >= RANKING_CONFIG.preUFCPedigree.gradeMinGraduates);
    if (paired.length >= 8) {
      const rho = spearman(
        paired.map((p) => p.s.fieldElo),
        paired.map((p) => Number(p.g!.shrunkEloGain))
      );
      const rhoStatic = spearman(
        paired.map((p) => p.s.mult),
        paired.map((p) => Number(p.g!.shrunkEloGain))
      );
      console.log(`\nVALIDATION (n=${paired.length} orgs with ${RANKING_CONFIG.preUFCPedigree.gradeMinGraduates}+ graduates):`);
      console.log(`  Spearman ρ(FIELD strength, graduates' settled UFC Elo gain) = ${rho.toFixed(3)}`);
      console.log(`  Spearman ρ(current static tier multiplier, same)            = ${rhoStatic.toFixed(3)}`);
      console.log(`  → the higher |ρ| is the better basis for a tier ladder.`);
    }
  }

  const out = path.join(process.cwd(), 'data', 'promotion_strength.csv');
  fs.writeFileSync(
    out,
    Papa.unparse(
      stats.map((s) => ({
        canonicalOrg: s.org, tier: s.tier, staticMultiplier: s.mult.toFixed(2),
        bouts: s.bouts, ratedPool: s.rated, graduates: s.graduates,
        fieldElo: s.fieldElo.toFixed(1), fieldP75: s.fieldP75.toFixed(1),
        graduateElo: s.gradElo.toFixed(1), fightTimeElo: s.fightTimeElo.toFixed(1),
      }))
    ) + '\n'
  );
  console.log(`\nwrote ${out} (${stats.length} promotions)`);
}

main();
