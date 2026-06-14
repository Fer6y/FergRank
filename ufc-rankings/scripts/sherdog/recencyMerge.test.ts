// Unit tests for the recency-patch accumulate-merge helpers.
// Run: npx tsx scripts/sherdog/recencyMerge.test.ts
import { splitCsvLine, recencyKey } from './buildRecencyPatch';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); failures++; };
};

// ── splitCsvLine: quote-aware (event names carry commas/colons) ──────────────
console.log('\n=== splitCsvLine ===');
{
  const plain = splitCsvLine('a1,Alice,b2,Bob,2026-06-14,W,L,KO/TKO,1,Lightweight,UFC 1,sherdog');
  ok(plain.length === 12, `plain row → 12 cols (got ${plain.length})`);
  ok(plain[0] === 'a1' && plain[2] === 'b2' && plain[4] === '2026-06-14', 'id/date columns located');
}
{
  // Event name with an embedded comma must stay one field and not shift cols 0/2/4.
  const quoted = splitCsvLine('a1,Alice,b2,Bob,2026-06-14,W,L,U-DEC,3,Lightweight,"UFC 300, Vegas",sherdog');
  ok(quoted[10] === 'UFC 300, Vegas', `quoted comma field intact (got "${quoted[10]}")`);
  ok(quoted[4] === '2026-06-14', 'date column still correct despite quoted comma');
}
{
  const escaped = splitCsvLine('a1,Alice,b2,Bob,2026-06-14,W,L,SUB,2,LW,"He said ""hi""",sherdog');
  ok(escaped[10] === 'He said "hi"', `escaped doubled-quote unescaped (got "${escaped[10]}")`);
}

// ── recencyKey: order-independent pair + date ────────────────────────────────
console.log('\n=== recencyKey ===');
ok(recencyKey('a', 'b', '2026-06-14') === recencyKey('b', 'a', '2026-06-14'), 'pair order does not matter');
ok(recencyKey('a', 'b', '2026-06-14') !== recencyKey('a', 'b', '2026-06-07'), 'different date → different key');

// ── merge semantics: fresh wins, prior rows carried, dups collapsed ──────────
console.log('\n=== accumulate-merge semantics ===');
{
  // Simulate the merge loop: `seen` seeded with fresh rows; carry prior rows
  // whose key isn't already present.
  const freshRows = [
    'isl,Islam,jdm,JDM,2026-06-14,W,L,U-DEC,5,Welterweight,UFC X,sherdog', // this week
  ];
  const seen = new Set(freshRows.map((r) => {
    const c = splitCsvLine(r); return recencyKey(c[0], c[2], c[4]);
  }));
  const prior = [
    'isl,Islam,jdm,JDM,2026-06-14,W,L,U-DEC,5,Welterweight,UFC X,sherdog', // SAME bout → fresh wins, skip
    'top,Topuria,gae,Gaethje,2026-05-31,W,L,KO/TKO,2,Lightweight,UFC Y,sherdog', // prior week → carried
  ];
  const carried: string[] = [];
  for (const ln of prior) {
    const c = splitCsvLine(ln);
    const k = recencyKey(c[0], c[2], c[4]);
    if (seen.has(k)) continue;
    seen.add(k); carried.push(ln);
  }
  ok(carried.length === 1, `1 prior row carried (the duplicate collapsed) (got ${carried.length})`);
  ok(carried[0].startsWith('top,'), 'the non-duplicate prior week was carried');
  ok(freshRows.length + carried.length === 2, 'union total = fresh + carried, no double-count');
}

console.log(failures === 0 ? '\n✅ ALL ASSERTIONS PASSED' : `\n❌ ${failures} assertion(s) failed`);
process.exit(failures === 0 ? 0 : 1);
