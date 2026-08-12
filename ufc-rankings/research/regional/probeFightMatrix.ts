// research/regional/probeFightMatrix.ts — verify the parser against live
// profiles BEFORE committing to a crawl. Prints what was extracted so the
// contract can be eyeballed, not assumed.
//
// Run: node_modules/.bin/jiti research/regional/probeFightMatrix.ts
import { politeFetch, parseFmProfile } from './fightMatrix';

const SAMPLES = [
  ['Islam Makhachev', '78816'],   // UFC champ — long history, sanity anchor
  ['Joshua Van', '227103'],       // recent UFC arrival — regional tail visible
];

async function main(): Promise<void> {
  for (const [name, id] of SAMPLES) {
    const html = await politeFetch(
      `https://www.fightmatrix.com/fighter-profile/${encodeURIComponent(name)}/${id}/`
    );
    const p = parseFmProfile(html);
    console.log(`\n${p.name || name} (fm ${p.fmId || id}) — ${p.fights.length} fights parsed`);
    const promos = new Map<string, number>();
    for (const f of p.fights) promos.set(f.promotion, (promos.get(f.promotion) ?? 0) + 1);
    console.log('  promotions:', [...promos.entries()].map(([k, v]) => `${k}:${v}`).join(' '));
    for (const f of p.fights.slice(0, 6)) {
      console.log(
        `  ${f.date}  ${f.result}  vs ${f.opponentName.padEnd(24)} ` +
          `${(f.opponentRank || '—').padEnd(20)} [${f.promotion}] ${f.method.slice(0, 34)}`
      );
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
