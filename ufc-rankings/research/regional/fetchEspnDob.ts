// research/regional/fetchEspnDob.ts — the ESPN DOB harvest (CAREER_STAGE_PLAN).
//
// Fills the one field the regional pipeline cannot get anywhere else:
// chronological age. Source verified before building: ESPN's open core API
// (38k MMA athletes incl. pure regionals; Bilal Hasan → 2001-07-16, matching
// his hand-verified age to the day). Tapology 403s, mixedmartialarts is dead,
// Fight Matrix has no birthdate.
//
// DISCIPLINE — a wrong DOB is worse than none, so every hit passes three gates:
//   1. UNIQUENESS: the name search must yield exactly ONE MMA athlete id.
//      Multiple ids → status=ambiguous, skipped. Never guess a namesake.
//   2. NAME MATCH: the returned record's name must token-match the query.
//   3. CAREER PLAUSIBILITY (the buildAges.ts guard): with the fighter's known
//      pro-debut date, debut age must be 16–47 and last-fight age ≤ 55.
//      Namesake collisions fail exactly here.
//
// RESUMABLE: every attempt (found / miss / ambiguous / rejected) is appended to
// the output CSV immediately; a restart skips attempted names. Politeness:
// ~400ms between requests (ESPN is a large CDN API, not a small site — but we
// still don't hammer), identifying UA.
//
// Queue order = value order: DWCS entrants (upcoming + cohort + FM results),
// then the rated regional pool by rating desc. ~18k names ≈ overnight.
//
// Run:        node_modules/.bin/jiti research/regional/fetchEspnDob.ts
// Smoke test: node_modules/.bin/jiti research/regional/fetchEspnDob.ts --limit 20
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const OUT = path.join(process.cwd(), 'data', 'regional_dob.csv');
const HEAD = 'name,status,espnId,dob,citizenship,debutUsed,checkNote';
const UA = 'UFergCRankings-research/1.0 (prospect age study; contact: scott.ferguson.14@hotmail.com)';
const DELAY_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
const tokens = (s: string) => norm(s).split(' ').filter(Boolean).sort().join(' ');
const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

async function getJson(url: string): Promise<any> {
  await sleep(DELAY_MS);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const yearsBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / (365.25 * 86_400_000);

async function main(): Promise<void> {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;

  // ── queue: DWCS names first, then rated pool (already rating-desc) ──
  const queue: { name: string; debut: string; lastFight: string }[] = [];
  const seen = new Set<string>();
  const push = (name: string, debut = '', lastFight = '') => {
    const k = tokens(name);
    if (!k || seen.has(k)) return;
    seen.add(k);
    queue.push({ name, debut, lastFight });
  };
  const readCsv = (p: string) =>
    fs.existsSync(p)
      ? Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8'), { header: true, skipEmptyLines: true }).data
      : [];

  // Debut/last-fight lookups for the plausibility gate.
  const career = new Map<string, { debut: string; lastFight: string }>();
  for (const r of readCsv(path.join(process.cwd(), 'data', 'regional_ratings.csv'))) {
    if (r.name) career.set(tokens(r.name), { debut: r.debut ?? '', lastFight: r.lastFight ?? '' });
  }

  for (const r of readCsv(path.join(process.cwd(), 'data', 'dwcs_upcoming.csv'))) {
    for (const side of ['f1_name', 'f2_name']) if (r[side]) push(r[side]);
  }
  for (const r of readCsv(path.join(process.cwd(), 'data', 'dwcs_fighters.csv'))) if (r.name) push(r.name);
  for (const r of readCsv(path.join(process.cwd(), 'data', 'dwcs_bouts_fm.csv'))) {
    if (r.nameA) push(r.nameA);
    if (r.nameB) push(r.nameB);
  }
  for (const r of readCsv(path.join(process.cwd(), 'data', 'regional_ratings.csv'))) {
    if (r.name) push(r.name, r.debut ?? '', r.lastFight ?? '');
  }
  // UFC-roster fighters with no canonical DOB — prospects outside the regional
  // graph (never in the queue before) and older registry gaps. No debut date is
  // attached, so the career-plausibility gate is inert for these; uniqueness
  // and name-match still apply.
  {
    const covered = new Set<string>();
    for (const r of readCsv(path.join(process.cwd(), 'data', 'canonical', 'fighter_dob.csv'))) {
      if (r.canonical_id && r.dob) covered.add(r.canonical_id);
    }
    for (const r of readCsv(path.join(process.cwd(), 'data', 'Fighters_Stats.csv'))) {
      const id = r['Fighter_Id'];
      const nm = r['Full Name'];
      if (id && nm && !covered.has(id)) push(nm);
    }
  }
  // Attach career data where the DWCS-sourced entries matched a rated fighter.
  for (const q of queue) {
    if (!q.debut) {
      const c = career.get(tokens(q.name));
      if (c) { q.debut = c.debut; q.lastFight = c.lastFight; }
    }
  }

  // ── resume ──
  const attempted = new Set<string>();
  if (fs.existsSync(OUT)) {
    for (const r of readCsv(OUT)) if (r.name) attempted.add(tokens(r.name));
  } else {
    fs.writeFileSync(OUT, HEAD + '\n');
  }
  const todo = queue.filter((q) => !attempted.has(tokens(q.name))).slice(0, limit);
  console.log(`[espn-dob] queue ${queue.length} names, ${attempted.size} already attempted, ${todo.length} to do`);

  const append = (name: string, status: string, espnId = '', dob = '', cit = '', debutUsed = '', note = '') =>
    fs.appendFileSync(OUT, [esc(name), status, espnId, dob, esc(cit), debutUsed, esc(note)].join(',') + '\n');

  let n = 0, found = 0, miss = 0, ambiguous = 0, rejected = 0, errors = 0;
  for (const q of todo) {
    n++;
    try {
      const s = await getJson(
        `https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(q.name)}&limit=10`
      );
      const ids = new Set<string>();
      for (const grp of s?.results ?? []) {
        if (grp?.type !== 'player') continue;
        for (const it of grp?.contents ?? []) {
          const uid: string = it?.uid ?? '';
          const m = uid.match(/s:3301~a:(\d+)/); // MMA sport id
          if (m) ids.add(m[1]);
        }
      }
      if (ids.size === 0) { miss++; append(q.name, 'miss'); continue; }
      if (ids.size > 1) { ambiguous++; append(q.name, 'ambiguous', '', '', '', '', `${ids.size} MMA ids`); continue; }

      const id = [...ids][0];
      const a = await getJson(`https://sports.core.api.espn.com/v2/sports/mma/athletes/${id}?lang=en&region=us`);
      const dob: string = (a?.dateOfBirth ?? '').slice(0, 10);
      const full: string = a?.fullName ?? '';
      if (!dob) { miss++; append(q.name, 'miss', id, '', '', '', 'no dob on record'); continue; }
      if (tokens(full) !== tokens(q.name)) {
        rejected++; append(q.name, 'rejected', id, '', '', '', `name mismatch: ${full}`); continue;
      }
      // Career-plausibility gate (when we know their debut).
      if (q.debut) {
        const debutAge = yearsBetween(dob, q.debut);
        const lastAge = q.lastFight ? yearsBetween(dob, q.lastFight) : debutAge;
        if (debutAge < 16 || debutAge > 47 || lastAge > 55) {
          rejected++;
          append(q.name, 'rejected', id, dob, '', q.debut, `implausible: debut age ${debutAge.toFixed(1)}`);
          continue;
        }
      }
      found++;
      append(q.name, 'found', id, dob, a?.citizenship ?? '', q.debut, '');
    } catch (e) {
      errors++;
      append(q.name, 'error', '', '', '', '', (e as Error).message.slice(0, 60));
      if (errors > 50 && errors > n * 0.5) { console.error('[espn-dob] error rate too high — aborting'); break; }
    }
    if (n % 100 === 0) {
      console.log(`[espn-dob] ${n}/${todo.length}  found ${found}  miss ${miss}  ambiguous ${ambiguous}  rejected ${rejected}  errors ${errors}`);
    }
  }
  console.log(`[espn-dob] DONE ${n} attempted: found ${found}, miss ${miss}, ambiguous ${ambiguous}, rejected ${rejected}, errors ${errors} → ${OUT}`);

  // ── cross-validation vs our canonical UFC DOBs ──
  const canon = new Map<string, string>();
  const reg = readCsv(path.join(process.cwd(), 'data', 'canonical', 'fighter_dob.csv'));
  const fighters = readCsv(path.join(process.cwd(), 'data', 'Fighters_Stats.csv'));
  const idToName = new Map(fighters.map((f) => [f['Fighter_Id'], f['Full Name']]));
  for (const r of reg) {
    const nm = idToName.get(r.canonical_id);
    if (nm && r.dob) canon.set(tokens(nm), r.dob);
  }
  let joined = 0, agree = 0;
  const disagreements: string[] = [];
  for (const r of readCsv(OUT)) {
    if (r.status !== 'found') continue;
    const c = canon.get(tokens(r.name));
    if (!c) continue;
    joined++;
    if (c === r.dob) agree++;
    else disagreements.push(`${r.name}: espn ${r.dob} vs ours ${c}`);
  }
  console.log(`[validate] ${joined} joined to canonical UFC DOBs; exact agreement ${agree}/${joined} (${((100 * agree) / (joined || 1)).toFixed(1)}%)`);
  for (const d of disagreements.slice(0, 8)) console.log(`  ✗ ${d}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
