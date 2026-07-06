// weeklyUpdate: Phase 3 — the one-command orchestrator for the weekly UFC
// auto-ingest pipeline. Chains the (already-built, individually-tested) steps:
//
//   1. buildRecencyFromUfcStats  discover the week's card(s) + parse bouts +
//                                regenerate data/recent_ufc_fights.csv (ufcstats) [NETWORK]
//   2. buildOfficialRankings     refresh the committed UFC-rank snapshot (ufc.com)[NETWORK, non-fatal]
//   3. buildUpcoming             next 3 cards → upcoming_fights.csv (Sherdog)      [NETWORK, non-fatal]
//   4. validate                  name-match audit + LW/WW/BW sanity (informational)[NETWORK]
//   5. goldenMaster              diff vs baseline = "what changed this week"       [NETWORK]
//   6. goldenMaster --update     re-bless the baseline so git diff is the audit    [NETWORK]
//
// Recency source moved Sherdog → ufcstats.com on 2026-07-05 (Sherdog Cloudflare-
// blocked all non-browser clients); the old fetchEvent/extendCrosswalk/
// buildRecencyPatch trio is retired from the plan (files kept for reference).
//
// The steps communicate via the on-disk Sherdog cache + the CSVs, not in-process
// state, so this is honest sequential glue (each step is also runnable alone).
//
// ⚠️  Run by YOU or CI at build time, NEVER by Claude — step 1 crawls Sherdog,
//     whose robots.txt disallows ClaudeBot. See fetchProfile.ts.
//
// ⚠️  This does NOT commit. It only regenerates files (recent_ufc_fights.csv,
//     the crosswalk, the golden-master baseline). The GitHub Action (Phase 5)
//     does `git add/commit/push`, and the push triggers the redeploy that makes
//     the new fights live. Keeping git out of here means it's safe to run locally.
//
// Run from ufc-rankings/:
//   node_modules/.bin/jiti scripts/sherdog/weeklyUpdate.ts            # full run
//   node_modules/.bin/jiti scripts/sherdog/weeklyUpdate.ts --days 14 # widen discovery
//   node_modules/.bin/jiti scripts/sherdog/weeklyUpdate.ts --skip-fetch  # reuse cache (offline-ish)
//   node_modules/.bin/jiti scripts/sherdog/weeklyUpdate.ts --no-bless    # report, don't re-baseline
//   node_modules/.bin/jiti scripts/sherdog/weeklyUpdate.ts --dry         # print the plan, run nothing
import { execSync } from 'child_process';

const JITI = 'node_modules/.bin/jiti';

interface Args { days: number; skipFetch: boolean; noBless: boolean; dry: boolean; }
function parseArgs(argv: string[]): Args {
  const args: Args = { days: 8, skipFetch: false, noBless: false, dry: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--days') args.days = Math.max(1, parseInt(argv[++i] ?? '8', 10) || 8);
    else if (a === '--skip-fetch') args.skipFetch = true;
    else if (a === '--no-bless') args.noBless = true;
    else if (a === '--dry') args.dry = true;
  }
  return args;
}

interface Step { label: string; cmd: string; network: boolean; fatal: boolean; }

function buildPlan(args: Args): Step[] {
  const steps: Step[] = [];
  // ── Recency source: ufcstats.com (2026-07-05) ──────────────────────────────
  // Replaced the Sherdog crawl (fetchEvent → extendCrosswalk → buildRecencyPatch)
  // after Sherdog's Cloudflare edge began hard-blocking non-browser clients from
  // every IP. buildRecencyFromUfcStats does discovery + parse + patch in ONE step:
  // event-oriented (a card → all its bouts) so no per-profile crawl and no id-
  // crosswalk (ufcstats names ARE our names). Clears ufcstats's transparent PoW
  // gate itself (see fetchUfcStats.ts).
  const offlineFlag = args.skipFetch ? 'UFCSTATS_OFFLINE=1 ' : '';
  steps.push({ label: '1/6 buildRecencyFromUfcStats (discover + parse + patch)', cmd: `${offlineFlag}${JITI} scripts/ufcstats/buildRecencyFromUfcStats.ts --days ${args.days}`, network: true, fatal: true });
  // Refresh the committed official-rankings snapshot from live Octagon. NON-FATAL:
  // if Octagon is down/empty the build script keeps the last-known-good file, so a
  // rankings-source hiccup never blocks the fight-data ingest. This is what keeps
  // the displayed "UFC Rank" current without a live request-time fetch.
  steps.push({ label: '2/6 buildOfficialRankings (refresh UFC-rank snapshot)', cmd: `${JITI} scripts/buildOfficialRankings.ts`, network: true, fatal: false });
  // Display-only upcoming-fights snapshot (ported to ufcstats 2026-07-06). NON-FATAL:
  // upcoming bouts don't affect Elo, so a schedule-scrape hiccup never blocks the ingest.
  steps.push({ label: '3/6 buildUpcoming (next 3 cards, display-only — ufcstats)', cmd: `${JITI} scripts/ufcstats/buildUpcomingFromUfcStats.ts --cards 3`, network: true, fatal: false });
  // Informational — a bad name-match audit shouldn't block the data update.
  steps.push({ label: '4/6 validate (name-match + sanity, informational)', cmd: `${JITI} scripts/validate.ts`, network: true, fatal: false });
  // The diff IS the report: new fights are EXPECTED to move rankings, so a
  // non-zero exit here is normal — never fatal in the weekly context.
  steps.push({ label: '5/6 goldenMaster (what-changed report)', cmd: `${JITI} scripts/goldenMaster.ts`, network: true, fatal: false });
  if (!args.noBless)
    steps.push({ label: '6/6 goldenMaster --update (re-bless baseline)', cmd: `${JITI} scripts/goldenMaster.ts --update`, network: true, fatal: true });
  return steps;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const plan = buildPlan(args);
  const t0 = Date.now();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  WEEKLY UFC AUTO-INGEST');
  console.log(`  days=${args.days} skipFetch=${args.skipFetch} noBless=${args.noBless} dry=${args.dry}`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (args.dry) {
    console.log('  --dry: plan only, nothing executed.\n');
    plan.forEach((s) => console.log(`   ${s.label}${s.network ? '  [network]' : ''}${s.fatal ? '' : '  (non-fatal)'}\n      $ ${s.cmd}`));
    console.log('\n  (the GitHub Action commits the regenerated files afterward — not this script)');
    return;
  }

  const ran: string[] = [];
  const softFailed: string[] = [];
  for (const step of plan) {
    console.log(`\n━━━ ${step.label} ━━━`);
    console.log(`$ ${step.cmd}`);
    try {
      execSync(step.cmd, { stdio: 'inherit' });
      ran.push(step.label);
    } catch {
      if (step.fatal) {
        console.error(`\n✗ ABORTED — "${step.label}" failed. No further steps run.`);
        process.exit(1);
      }
      console.warn(`\n⚠ "${step.label}" exited non-zero (non-fatal) — continuing.`);
      softFailed.push(step.label);
      ran.push(step.label);
    }
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  WEEKLY UPDATE COMPLETE in ${secs}s — ${ran.length} step(s) ran.`);
  if (softFailed.length) console.log(`  non-fatal issues: ${softFailed.join(' | ')}`);
  console.log('  Regenerated: data/recent_ufc_fights.csv, data/official_rankings.csv, the crosswalk' +
    (args.noBless ? '' : ', data/golden/rankings_snapshot.json'));
  console.log('  NEXT: the GitHub Action commits these → push → redeploy → live.');
  console.log('  (running locally? `git diff data/golden/rankings_snapshot.json` shows the ranking changes.)');
  console.log('═══════════════════════════════════════════════════════════════');
}

main();
