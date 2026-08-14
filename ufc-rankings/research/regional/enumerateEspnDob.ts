// research/regional/enumerateEspnDob.ts — DOB source, second approach:
// ENUMERATE ESPN's full MMA athlete index instead of searching name-by-name.
//
// WHY A SECOND PASS. fetchEspnDob.ts queries the SEARCH endpoint per name and
// found 7,524 of 18,259 (41%). Search failures are not the same as absences:
// the endpoint ranks and truncates, so accented spellings, name-order variants
// and low-profile fighters simply never surface. Enumeration sidesteps that
// entirely — ESPN exposes all 38,013 MMA athletes as a paged index, so we pull
// every record ESPN HAS and do the matching locally, where we control it.
//
// It also fixes a subtler weakness. Searching had to decide "is this the right
// person?" from a ranked list; with the full index in hand we can see ALL
// same-name records at once and drop genuine namesakes on evidence rather than
// on the search engine's opinion.
//
// COST: 39 index pages + ~38k athlete records at 400ms ≈ 4.5h, unattended and
// resumable. Writes the raw index; joining to our pool happens in
// mergeEspnDob.ts so a re-join never needs a re-crawl.
//
// Run: node_modules/.bin/jiti research/regional/enumerateEspnDob.ts
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const OUT = path.join(process.cwd(), 'data', 'espn_mma_athletes.csv');
const HEAD = 'espnId,fullName,dob,citizenship';
const UA = 'UFergCRankings-research/1.0 (prospect age study; contact: scott.ferguson.14@hotmail.com)';
const DELAY_MS = 400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

async function getJson(url: string): Promise<any> {
  await sleep(DELAY_MS);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main(): Promise<void> {
  // ── resume ──
  const have = new Set<string>();
  if (fs.existsSync(OUT)) {
    for (const r of Papa.parse<Record<string, string>>(fs.readFileSync(OUT, 'utf-8'), {
      header: true, skipEmptyLines: true,
    }).data) if (r.espnId) have.add(r.espnId);
  } else {
    fs.writeFileSync(OUT, HEAD + '\n');
  }
  console.log(`[enum] ${have.size} athlete records already on file`);

  // ── 1. page the index for athlete ids (cheap: 39 requests) ──
  const ids: string[] = [];
  let page = 1, pageCount = 1;
  while (page <= pageCount) {
    try {
      const d = await getJson(`https://sports.core.api.espn.com/v2/sports/mma/athletes?limit=1000&page=${page}`);
      pageCount = d?.pageCount ?? 1;
      for (const it of d?.items ?? []) {
        const m: string | undefined = it?.$ref?.match(/athletes\/(\d+)/)?.[1];
        if (m) ids.push(m);
      }
      console.log(`[enum] index page ${page}/${pageCount} → ${ids.length} ids`);
    } catch (e) {
      console.error(`[enum] index page ${page} failed: ${(e as Error).message}`);
    }
    page++;
  }
  const todo = ids.filter((id) => !have.has(id));
  console.log(`[enum] ${ids.length} athletes indexed, ${todo.length} to fetch`);

  // ── 2. fetch each athlete record, appending as we go ──
  let n = 0, withDob = 0, errors = 0;
  for (const id of todo) {
    n++;
    try {
      const a = await getJson(`https://sports.core.api.espn.com/v2/sports/mma/athletes/${id}?lang=en&region=us`);
      const dob = (a?.dateOfBirth ?? '').slice(0, 10);
      if (dob) withDob++;
      fs.appendFileSync(OUT, [id, esc(a?.fullName ?? ''), dob, esc(a?.citizenship ?? '')].join(',') + '\n');
    } catch (e) {
      errors++;
      if (errors > 200 && errors > n * 0.5) { console.error('[enum] error rate too high — aborting'); break; }
    }
    if (n % 500 === 0) console.log(`[enum] ${n}/${todo.length} fetched, ${withDob} with DOB, ${errors} errors`);
  }
  console.log(`[enum] DONE ${n} fetched, ${withDob} with DOB, ${errors} errors → ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
