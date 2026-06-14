import { loadAllData } from '../src/lib/loadData';
import { generateDivisionRankings } from '../src/lib/scoringEngine';
import { auditOfficialMatches } from '../src/lib/auditOfficialMatches';
import { fetchOfficialRankings } from '../src/lib/fetchOfficialRankings';

// Champions / #1s the patch doc says MUST match (Fix 2a.3)
const MUST_MATCH = [
  'Jack Della Maddalena', 'Belal Muhammad', 'Leon Edwards', 'Merab Dvalishvili',
  'Islam Makhachev', 'Ilia Topuria', 'Petr Yan', 'Shavkat Rakhmonov',
];

const DIVISIONS = ['Lightweight', 'Welterweight', 'Bantamweight'];

function pad(s: string | number, n: number): string {
  return String(s).padStart(n);
}
function padE(s: string | number, n: number): string {
  return String(s).padEnd(n);
}

async function main() {
  console.log('Loading data...');
  const data = loadAllData();
  console.log(
    `Loaded ${data.fighters.length} fighters, ${data.fights.length} fights, ${data.events.size} events`
  );

  // ── Network check ──────────────────────────────────────────
  const official = await fetchOfficialRankings();
  const divCount = Object.keys(official).length;
  console.log(`\nOctagon API: ${divCount} divisions returned.`);
  if (divCount === 0) {
    console.log('!!! Official rankings empty — network likely blocked. Audit + seeds will be meaningless.');
  }

  // ── PART 1: Official match audit (Fix 2a) ──────────────────
  console.log('\n\n############ PART 1 — OFFICIAL NAME-MATCH AUDIT ############');
  const audit = await auditOfficialMatches(data);

  console.log('\n=== MUST-MATCH ASSERTION (Fix 2a.3) ===');
  let allMustMatch = true;
  for (const name of MUST_MATCH) {
    const row = audit.find((r) => r.officialName === name);
    const status = row ? row.status : 'NOT IN API LIST';
    if (status !== 'MATCHED') allMustMatch = false;
    console.log(`  ${padE(name, 26)} ${status}`);
  }
  console.log(allMustMatch ? '  ✅ ALL MUST-MATCH NAMES RESOLVED' : '  ❌ SOME MUST-MATCH NAMES FAILED — fix before tuning');

  // ── PART 2: Top-40 with Elo component breakdown ────────────
  console.log('\n\n############ PART 2 — TOP 40 (ELO MODEL) ############');
  for (const division of DIVISIONS) {
    const rankings = await generateDivisionRankings(division, data);
    console.log(`\n\n═══════════ ${division.toUpperCase()} — TOP 40 ═══════════`);
    console.log(
      padE('Rk', 3) + ' | ' + padE('Fighter', 24) + ' | ' + padE('Record', 8) +
      ' | ' + pad('Score', 6) + ' | ' + pad('FinalR', 7) + ' | ' + pad('Elo', 6) +
      ' | ' + pad('Peak', 6) + ' | ' + pad('Metr', 6) + ' | ' + pad('SoS+', 6) +
      ' | ' + pad('Off', 5) + ' | ' + pad('SoSelo', 6) + ' | ' + pad('moOut', 5) + ' | ' + pad('UFCrk', 5)
    );
    console.log('-'.repeat(130));
    for (const f of rankings.fighters) {
      const badge = f.belt ? ' 🏆' : '';
      console.log(
        pad(f.rank, 3) + ' | ' + padE(f.fullName, 24) + ' | ' + padE(f.record, 8) +
        ' | ' + pad(f.rankScore, 6) + ' | ' + pad(f.finalRating, 7) + ' | ' + pad(f.eloRating, 6) +
        ' | ' + pad(f.eloPeak, 6) + ' | ' + pad(f.metricsBonus, 6) + ' | ' + pad(f.sosNudge, 6) +
        ' | ' + pad(f.officialBonus, 5) + ' | ' + pad(f.sosElo, 6) + ' | ' + pad(f.monthsSinceLastFight, 5) +
        ' | ' + pad(f.officialRank ?? '-', 5) + badge
      );
    }

    let inversions = 0;
    for (let i = 1; i < rankings.fighters.length; i++) {
      if (rankings.fighters[i].finalRating > rankings.fighters[i - 1].finalRating) inversions++;
    }
    console.log(
      inversions === 0
        ? '  ✅ FinalRating strictly descending (or only intentional H2H/floor swaps logged above)'
        : `  ⚠️  ${inversions} rating inversion(s) — expected only where H2H/floor logged above`
    );
  }

  console.log('\n\nDONE.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
