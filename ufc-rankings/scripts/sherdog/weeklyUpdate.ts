// weeklyUpdate: Phase 3 — the one-command orchestrator for the weekly UFC
// auto-ingest pipeline. Chains the (already-built, individually-tested) steps:
//
//   1. fetchEvent       discover the past week's UFC card(s), refresh roster     [NETWORK]
//   2. extendCrosswalk  map any new card fighters → our ids                      [offline]
//   3. buildRecencyPatch regenerate data/recent_ufc_fights.csv from cache        [offline]
//   4. buildUpcoming    snapshot the next 3 cards → upcoming_fights.csv (display) [NETWORK, non-fatal]
//   5. validate         name-match audit + LW/WW/BW sanity (informational)       [NETWORK]
//   6. goldenMaster     diff vs baseline = "what changed this week" report       [NETWORK]
//   7. goldenMaster --update  re-bless the baseline so git diff is the audit     [NETWORK]
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
  if (!args.skipFetch)
    steps.push({ label: '1/6 fetchEvent (discover + refresh roster)', cmd: `${JITI} scripts/sherdog/fetchEvent.ts --days ${args.days}`, network: true, fatal: true });
  steps.push({ label: '2/6 extendCrosswalk (map new fighters)', cmd: `${JITI} scripts/sherdog/extendCrosswalk.ts`, network: false, fatal: true });
  steps.push({ label: '3/7 buildRecencyPatch (regenerate recency CSV)', cmd: `${JITI} scripts/sherdog/buildRecencyPatch.ts`, network: false, fatal: true });
  // Display-only upcoming-fights snapshot. NON-FATAL: a schedule-scrape hiccup
  // must never block the core results ingest (upcoming bouts don't affect Elo).
  steps.push({ label: '4/7 buildUpcoming (next 3 cards, display-only)', cmd: `${JITI} scripts/sherdog/buildUpcoming.ts --cards 3`, network: true, fatal: false });
  // Informational — a bad name-match audit shouldn't block the data update.
  steps.push({ label: '5/7 validate (name-match + sanity, informational)', cmd: `${JITI} scripts/validate.ts`, network: true, fatal: false });
  // The diff IS the report: new fights are EXPECTED to move rankings, so a
  // non-zero exit here is normal — never fatal in the weekly context.
  steps.push({ label: '6/7 goldenMaster (what-changed report)', cmd: `${JITI} scripts/goldenMaster.ts`, network: true, fatal: false });
  if (!args.noBless)
    steps.push({ label: '7/7 goldenMaster --update (re-bless baseline)', cmd: `${JITI} scripts/goldenMaster.ts --update`, network: true, fatal: true });
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
  console.log('  Regenerated: data/recent_ufc_fights.csv, the crosswalk' +
    (args.noBless ? '' : ', data/golden/rankings_snapshot.json'));
  console.log('  NEXT: the GitHub Action commits these → push → redeploy → live.');
  console.log('  (running locally? `git diff data/golden/rankings_snapshot.json` shows the ranking changes.)');
  console.log('═══════════════════════════════════════════════════════════════');
}

main();
