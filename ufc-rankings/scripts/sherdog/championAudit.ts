// Champion audit: the official "C" comes from the (stale-prone) Octagon API.
// For each division, check whether that champ LOST their most recent fight per
// the current Sherdog data — if so, the belt has likely changed hands and the
// "C" needs a divisionOverride. Run: npx tsx scripts/sherdog/championAudit.ts
import fs from 'fs';
import path from 'path';
import { loadAllData } from '../../src/lib/loadData';
import { fetchOfficialRankings, getOfficialRankingsForDivision } from '../../src/lib/fetchOfficialRankings';
import { buildNameIndex, resolveNameToId } from '../../src/lib/nameResolver';
import { parseProfile } from './parseProfile';
import { RANKING_CONFIG } from '../../src/lib/rankingConfig';
import { ALL_DIVISIONS } from '../../src/lib/types';

const CACHE = path.join(process.cwd(), 'data', '.sherdog_cache');

function crosswalk(): Map<string, string> {
  const m = new Map<string, string>();
  const f = path.join(process.cwd(), 'data', 'sherdog_crosswalk.csv');
  if (!fs.existsSync(f)) return m;
  for (const ln of fs.readFileSync(f, 'utf-8').split('\n').slice(1)) {
    const c = ln.split(',');
    if (c[0] && c[2]) m.set(c[0].trim(), c[2].trim());
  }
  return m;
}

async function main() {
  const data = loadAllData();
  const idx = buildNameIndex(data.fighters);
  const cw = crosswalk();
  const overridden = new Set(
    Object.entries(RANKING_CONFIG.divisionOverrides)
      .filter(([, o]) => o.rank === 'C')
      .map(([name]) => name)
  );

  let official;
  try { official = await fetchOfficialRankings(); }
  catch (e) { console.error('Could not fetch official rankings:', e); process.exit(1); }

  console.log('Division            Official champ          Most recent (Sherdog)        Flag');
  console.log('─'.repeat(92));

  for (const div of ALL_DIVISIONS) {
    const ranked = getOfficialRankingsForDivision(official, div) || [];
    const champ = ranked.find((r) => r.rank === 'C');
    if (!champ) { console.log(`${div.padEnd(19)} (no official champ listed)`); continue; }

    const ourId = resolveNameToId(champ.name, idx, { quiet: true });
    const sherdogId = ourId ? cw.get(ourId) : undefined;
    let recent = 'no cached profile';
    let flag = '';

    if (sherdogId) {
      const file = path.join(CACHE, `${sherdogId}.html`);
      if (fs.existsSync(file)) {
        const prof = parseProfile(fs.readFileSync(file, 'utf-8'));
        const last = prof.fights[0];
        if (last) {
          recent = `${last.result.toUpperCase()} vs ${last.opponentName} (${last.date ?? '?'})`;
          if (last.result === 'loss') flag = `⚠ STALE — ${last.opponentName} likely champ`;
        }
      }
    }
    const od = overridden.has(champ.name) ? ' [override set]' : '';
    console.log(`${div.padEnd(19)}${(champ.name + od).padEnd(24)}${recent.padEnd(29)}${flag}`);
  }
}

main();
