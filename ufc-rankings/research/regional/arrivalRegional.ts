// research/regional/arrivalRegional.ts — "how good were they WHEN THEY ARRIVED".
//
// THE POINT. A prospect's settled regional rating stops describing their
// arrival the moment they start fighting in the UFC, because the regional graph
// contains UFC bouts — three UFC wins later, the number is about now, not about
// the fighter who walked in. This snapshots each fighter's regional rating
// immediately BEFORE their UFC debut: the scouting read as it stood on the day
// they arrived, frozen, and never contaminated by what happened afterwards.
//
// Companion to pitRegional.ts, which does the same at the Contender Series
// cutoff. Together they answer the two questions actually asked of a prospect
// board: how good were they entering the tryout, and how good were they
// entering the UFC.
//
// PERCENTILE is against OTHER ARRIVALS, not the whole regional pool — "stronger
// than 84% of fighters arriving in the UFC" is the comparison a scout wants,
// and it avoids flattering everyone by measuring them against 18k regional
// fighters most of whom never get near the promotion.
//
// FIREWALL: research zone → a display CSV. Feeds no rating, no ranking.
//
// Run: node_modules/.bin/jiti research/regional/arrivalRegional.ts
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { loadAllData } from '../../src/lib/loadData';

const K_BASE = 24, K_PROV = 40, PROV_FIGHTS = 4, INIT = 1500;
const MIN_PRIOR_BOUTS = 3; // below this the snapshot is mostly the 1500 prior

const tok = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');
const readCsv = (p: string) =>
  fs.existsSync(p)
    ? Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8'), { header: true, skipEmptyLines: true }).data
    : [];

function main(): void {
  // ── UFC debut date per roster fighter, from our own primary data ──
  const data = loadAllData();
  const debutByToken = new Map<string, { id: string; name: string; debut: string }>();
  const ambiguous = new Set<string>();
  for (const f of data.fighters) {
    const fights = data.fighterFights.get(f.fighterId) ?? [];
    let min: Date | null = null;
    for (const b of fights) if (b.eventDate && (!min || b.eventDate < min)) min = b.eventDate;
    if (!min) continue;
    const k = tok(f.fullName);
    if (!k) continue;
    // Two roster fighters sharing a normalized name make the join a guess.
    if (debutByToken.has(k)) { ambiguous.add(k); continue; }
    debutByToken.set(k, { id: f.fighterId, name: f.fullName, debut: min.toISOString().slice(0, 10) });
  }
  for (const k of ambiguous) debutByToken.delete(k);
  console.log(`[arrival] ${debutByToken.size} roster fighters with a UFC debut date (${ambiguous.size} ambiguous names dropped)`);

  // ── de-duplicate the regional graph into bouts ──
  const bouts = new Map<string, { date: string; a: string; b: string; sa: number }>();
  const nameOf = new Map<string, string>();
  for (const r of readCsv(path.join(process.cwd(), 'data', 'regional_fights.csv'))) {
    if (!r.fmId || !r.opponentFmId || !r.date || !/^\d{4}-/.test(r.date)) continue;
    const sa = r.result === 'W' ? 1 : r.result === 'L' ? 0 : r.result === 'D' ? 0.5 : -1;
    if (sa < 0) continue;
    nameOf.set(r.fmId, r.name);
    nameOf.set(r.opponentFmId, r.opponentName);
    const [x, y] = [r.fmId, r.opponentFmId].sort();
    const key = `${x}|${y}|${r.date}`;
    if (!bouts.has(key)) bouts.set(key, { date: r.date, a: r.fmId, b: r.opponentFmId, sa });
  }
  const ordered = [...bouts.values()].sort((p, q) => (p.date < q.date ? -1 : p.date > q.date ? 1 : 0));

  // fmId → UFC debut cutoff (by name)
  const cutoffById = new Map<string, { debut: string; ourId: string; ourName: string }>();
  for (const [id, nm] of nameOf) {
    const d = debutByToken.get(tok(nm ?? ''));
    if (d) cutoffById.set(id, { debut: d.debut, ourId: d.id, ourName: d.name });
  }
  console.log(`[arrival] ${cutoffById.size} regional fighters matched to a UFC debut`);

  // ── chronological sweep, snapshotting immediately before each debut ──
  const rating = new Map<string, number>();
  const n = new Map<string, number>();
  const snap = new Map<string, { elo: number; bouts: number; last: string }>();
  const get = (id: string) => rating.get(id) ?? INIT;
  const lastDate = new Map<string, string>();

  for (const b of ordered) {
    for (const id of [b.a, b.b]) {
      const c = cutoffById.get(id);
      if (c && !snap.has(id) && b.date >= c.debut) {
        snap.set(id, { elo: get(id), bouts: n.get(id) ?? 0, last: lastDate.get(id) ?? '' });
      }
    }
    const ra = get(b.a), rb = get(b.b);
    const na = n.get(b.a) ?? 0, nb = n.get(b.b) ?? 0;
    const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
    rating.set(b.a, ra + (na < PROV_FIGHTS ? K_PROV : K_BASE) * (b.sa - ea));
    rating.set(b.b, rb + (nb < PROV_FIGHTS ? K_PROV : K_BASE) * ((1 - b.sa) - (1 - ea)));
    n.set(b.a, na + 1);
    n.set(b.b, nb + 1);
    lastDate.set(b.a, b.date);
    lastDate.set(b.b, b.date);
  }
  // Careers entirely before the debut never tripped the snapshot above.
  for (const [id] of cutoffById) {
    if (!snap.has(id) && rating.has(id)) {
      snap.set(id, { elo: get(id), bouts: n.get(id) ?? 0, last: lastDate.get(id) ?? '' });
    }
  }

  // ── percentile among ARRIVALS (the comparison a scout actually wants) ──
  const usable = [...snap.entries()].filter(([, s]) => s.bouts >= MIN_PRIOR_BOUTS);
  const dist = usable.map(([, s]) => s.elo).sort((a, b) => a - b);
  const pctOf = (v: number) => {
    let lo = 0, hi = dist.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (dist[m] < v) lo = m + 1; else hi = m; }
    return (100 * lo) / (dist.length || 1);
  };

  const rows = usable.map(([id, s]) => {
    const c = cutoffById.get(id)!;
    return {
      ourId: c.ourId,
      name: c.ourName,
      ufcDebut: c.debut,
      arrivalElo: s.elo.toFixed(1),
      arrivalPercentile: pctOf(s.elo).toFixed(1),
      priorBouts: s.bouts,
      lastRegionalFight: s.last,
    };
  }).sort((a, b) => Number(b.arrivalElo) - Number(a.arrivalElo));

  const out = path.join(process.cwd(), 'data', 'regional_arrival.csv');
  fs.writeFileSync(out, Papa.unparse(rows) + '\n');
  console.log(`[arrival] ${rows.length} fighters with a usable arrival snapshot (${MIN_PRIOR_BOUTS}+ prior regional bouts)`);
  console.log(`[arrival] wrote ${out}`);
  console.log(`[arrival] arrival-Elo spread: p10 ${dist[Math.floor(dist.length * 0.1)]?.toFixed(0)}  median ${dist[Math.floor(dist.length * 0.5)]?.toFixed(0)}  p90 ${dist[Math.floor(dist.length * 0.9)]?.toFixed(0)}`);
  console.log('\nTop 8 arrivals on record:');
  for (const r of rows.slice(0, 8)) console.log(`  ${r.name.padEnd(24)} ${r.arrivalElo}  p${r.arrivalPercentile}  ${r.priorBouts} prior bouts  debut ${r.ufcDebut}`);
}

main();
