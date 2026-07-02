// ─────────────────────────────────────────────────────────────────────────
//  smokeTools.ts — grounding smoke test for the analyst agent's tool layer.
//
//  Runs every tool executor directly (no Anthropic API call, no key needed)
//  and prints trimmed output, proving the agent's data path works end to end:
//  cards list → card enrichment → name resolution → profile → head-to-head.
//
//  Run:  node_modules/.bin/jiti scripts/agent/smokeTools.ts
//  (Octagon official-rankings fetch needs network; degrades to pure Elo offline.)
// ─────────────────────────────────────────────────────────────────────────

import { executeTool } from '../../src/lib/agent/tools';

function preview(label: string, json: string, chars = 900) {
  console.log(`\n━━ ${label} ${'━'.repeat(Math.max(0, 60 - label.length))}`);
  console.log(json.length > chars ? json.slice(0, chars) + ` … [${json.length} chars total]` : json);
}

async function main() {
  // 1. Calendar
  const cardsJson = await executeTool('list_upcoming_cards', {});
  preview('list_upcoming_cards', cardsJson);
  const cards = JSON.parse(cardsJson).cards as { eventName: string }[];
  if (!cards?.length) {
    console.log('\nNo upcoming cards in data/upcoming_fights.csv — remaining checks use search only.');
  }

  // 2. Full card (first event)
  let fighterIds: string[] = [];
  if (cards?.length) {
    const cardJson = await executeTool('get_card', { event_name: cards[0].eventName });
    preview(`get_card(${cards[0].eventName})`, cardJson, 1400);
    const card = JSON.parse(cardJson);
    const main = card.bouts?.[0];
    fighterIds = [main?.fighter1?.fighterId, main?.fighter2?.fighterId].filter(Boolean);
  }

  // 3. Name → id resolution
  const searchJson = await executeTool('search_fighter', { query: 'makhachev' });
  preview('search_fighter("makhachev")', searchJson);
  if (fighterIds.length < 2) {
    const hits = JSON.parse(searchJson).hits as { fighterId: string }[];
    const alt = JSON.parse(await executeTool('search_fighter', { query: 'topuria' })).hits as {
      fighterId: string;
    }[];
    fighterIds = [hits?.[0]?.fighterId, alt?.[0]?.fighterId].filter(Boolean);
  }

  // 4. Deep profile
  if (fighterIds[0]) {
    preview(
      `get_fighter(${fighterIds[0]})`,
      await executeTool('get_fighter', { fighter_id: fighterIds[0] }),
      1600,
    );
  }

  // 5. Head-to-head
  if (fighterIds.length === 2) {
    preview(
      `compare_fighters(${fighterIds[0]}, ${fighterIds[1]})`,
      await executeTool('compare_fighters', { fighter_id_a: fighterIds[0], fighter_id_b: fighterIds[1] }),
      1400,
    );
  }

  // 6. Error paths stay JSON (the model must be able to recover)
  preview('get_card(bogus)', await executeTool('get_card', { event_name: 'UFC 9999' }), 400);
  preview('get_fighter(bogus)', await executeTool('get_fighter', { fighter_id: 'nope' }), 400);

  console.log('\n✓ smoke complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
