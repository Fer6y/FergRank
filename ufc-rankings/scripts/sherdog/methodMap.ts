// Sherdog method string → OUR Fights.csv Method vocabulary.
//
// Built against the real vocabularies on both sides:
//   Our DB:  KO/TKO, SUB, U-DEC, S-DEC, M-DEC, "TKO - Doctor's Stoppage",
//            OVERTURNED, CNC, DQ, Other
//   Sherdog: KO, K.O, TKO, "TKO (Doctor Stoppage)", Submission,
//            "Technical Submission", "Decision (Unanimous|Split|Majority)",
//            "Technical Decision (...)", Draw, "No Contest"/N/A, Disqualification
//
// Why match OUR exact strings (not just the 5 finish codes): the Elo K-factor
// comes from finishK(method), which treats "TKO - Doctor's Stoppage" as neutral
// (1.0), NOT as a KO/TKO (1.4). Mapping a Sherdog doctor stoppage to the same
// string keeps a 2026 patched fight consistent with a 2020 Fights.csv fight of
// the same type — no source-dependent K. Unknown strings → "Other" (neutral)
// and are reported by methodMap.test.ts rather than silently mislabeled.

export interface MappedMethod {
  method: string;   // a value from our DB vocabulary
  matched: boolean; // false = fell through to "Other" (surfaces in the audit)
}

const M = (method: string): MappedMethod => ({ method, matched: true });

export function mapMethod(sherdog: string): MappedMethod {
  const s = (sherdog || '').trim();
  if (!s) return { method: 'Other', matched: false };

  // Doctor's stoppage is its own category in our DB — check BEFORE generic TKO.
  if (/doctor/i.test(s) && /tko|stoppage/i.test(s)) return M("TKO - Doctor's Stoppage");

  // Knockout / technical knockout (incl. retirement, corner, punches, "K.O", "Tko").
  if (/^k\.?o\b|^tko\b|knockout/i.test(s)) return M('KO/TKO');

  // Submissions (incl. "Technical Submission") — before decisions.
  if (/submission/i.test(s)) return M('SUB');

  // Decisions — split/majority must be checked before the generic unanimous.
  // Covers "Decision (Split)" and "Technical Decision (Split)" alike.
  if (/split/i.test(s)) return M('S-DEC');
  if (/majority/i.test(s)) return M('M-DEC');
  if (/decision|unanimous/i.test(s)) return M('U-DEC');

  // Draws are decisions for K purposes (result handles the 0.5/0.5).
  if (/^draw/i.test(s)) return M('U-DEC');

  // Disqualification and no-contest categories.
  if (/disqualif|^dq\b/i.test(s)) return M('DQ');
  if (/no contest|^nc\b|^n\/a\b/i.test(s)) return M('CNC');

  // Bare submission names (Sherdog occasionally drops the "Submission" prefix,
  // e.g. "Triangle Choke"). These terms appear ONLY on submissions, so this is
  // a safe last-resort catch before giving up.
  if (/choke|armbar|kimura|guillotine|triangle|omoplata|heel hook|knee ?bar|ankle lock|americana|anaconda|d.?arce|ezekiel|twister|crank|crucifix|necktie|gogoplata|suloev|von flue/i.test(s)) {
    return M('SUB');
  }

  return { method: 'Other', matched: false };
}
