// careerStage — where a fighter is on their career arc, from three facts:
// chronological age, when they turned pro, and how many pro fights they've had.
//
// WHY THIS EXISTS. Every other prospect signal is arc-blind. Two fighters can
// carry an identical 8-0 record with an identical regional rating and be
// completely different bets: a 23-year-old who debuted at 20 has a decade of
// runway and is still adding skill, while a 36-year-old who debuted at 33 has
// the same résumé and almost none. Age alone doesn't separate them either — it
// misses that the 30-year-old who debuted at 21 is a seasoned pro while the
// 30-year-old who debuted at 29 is two fights into learning the job.
//
// The age cuts are the DWCS cohort study's MEASURED bands, not invented
// thresholds: entrants under 25 reach the current UFC top 15 at 16%, 25–28 at
// 12%, and 29+ at just 5% (mean settled Elo −14.1). PEAK_WINDOW_END = 29 is
// therefore where the observed cliff is, and `runwayYears` counts to it.
//
// DISPLAY-ONLY unless and until it clears the pre-registered bar in
// docs/plans/CAREER_STAGE_PLAN.md (ΔAUC ≥ +0.02 over age alone at both
// horizons on the cohort harness). Pure function — no I/O, no Elo, no rankings.

/** Observed cliff in the DWCS cohort: 29+ entrants rarely become contenders. */
export const PEAK_WINDOW_END = 29;
/** Below this, a young fighter's fight count is too thin to call them proven. */
const PROVEN_FIGHTS = 6;
/** Debuting at or after this age compresses the runway whatever the record. */
const LATE_DEBUT_AGE = 28;
/** Past this, remaining runway is the binding constraint, whatever the shape. */
const VETERAN_AGE = 33;

export type CareerStageBand =
  | 'blue-chip'     // young AND already experienced — the best arc in the cohort
  | 'raw-prospect'  // young but thin volume — upside with an unproven sample
  | 'prime-build'   // mid-runway, normal progression
  | 'late-starter'  // turned pro late; compressed runway regardless of record
  | 'seasoned'      // late-20s/early-30s pro who came up young
  | 'veteran';      // past the cohort's runway, still competing

export interface CareerStage {
  band: CareerStageBand;
  label: string;        // short UI label
  detail: string;       // one clause explaining the classification
  age: number;
  debutAge: number;     // age at first pro fight
  careerYears: number;  // debut → most recent fight
  fights: number;
  fightsPerYear: number | null; // activity pace; null when career is too short to divide
  runwayYears: number;  // years to the cohort's 29 cliff (negative = past it)
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const yearsBetween = (a: string, b: string) =>
  (Date.parse(b) - Date.parse(a)) / (365.25 * 86_400_000);

export interface CareerStageInput {
  dob: string;              // ISO
  proDebutDate: string;     // ISO
  fights: number;           // pro fights on record
  asOf?: string;            // ISO; defaults to today (kept injectable for backtests)
  lastFightDate?: string;   // ISO; career length ends here when known
}

/**
 * Classify a fighter's career arc. Returns null when a required fact is
 * missing or self-inconsistent — an unclassifiable fighter is reported as
 * such, never bucketed on a guess.
 */
export function careerStage(input: CareerStageInput): CareerStage | null {
  const { dob, proDebutDate, fights } = input;
  if (!dob || !proDebutDate || !Number.isFinite(fights)) return null;
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);

  const age = yearsBetween(dob, asOf);
  const debutAge = yearsBetween(dob, proDebutDate);
  // Guard the impossible rather than emitting a nonsense band: a debut before
  // age 14 or after the current age means the DOB and debut disagree.
  if (!(age > 0) || debutAge < 14 || debutAge > age + 0.5) return null;

  const careerYears = Math.max(0, yearsBetween(proDebutDate, input.lastFightDate ?? asOf));
  const fightsPerYear = careerYears >= 1 ? fights / careerYears : null;
  const runwayYears = PEAK_WINDOW_END - age;

  // Precedence is deliberate: current age binds first (runway is the thing you
  // cannot buy back), then how the career was built.
  let band: CareerStageBand;
  let detail: string;
  if (age >= VETERAN_AGE) {
    band = 'veteran';
    detail = `${round1(age)} years old, ${round1(careerYears)} years pro — past the cohort's runway`;
  } else if (debutAge >= LATE_DEBUT_AGE) {
    band = 'late-starter';
    detail = `turned pro at ${round1(debutAge)} — a compressed runway whatever the record says`;
  } else if (age <= 25) {
    band = fights >= PROVEN_FIGHTS ? 'blue-chip' : 'raw-prospect';
    detail =
      fights >= PROVEN_FIGHTS
        ? `${round1(age)} with ${fights} pro fights — young and already experienced`
        : `${round1(age)} with only ${fights} pro fights — upside on a thin sample`;
  } else if (age <= 28) {
    band = 'prime-build';
    detail = `${round1(age)}, debuted at ${round1(debutAge)} — mid-runway, normal progression`;
  } else {
    band = 'seasoned';
    detail = `${round1(age)}, pro since ${round1(debutAge)} — experienced but short on runway`;
  }

  const LABELS: Record<CareerStageBand, string> = {
    'blue-chip': 'Blue-chip',
    'raw-prospect': 'Raw prospect',
    'prime-build': 'Prime build',
    'late-starter': 'Late starter',
    seasoned: 'Seasoned',
    veteran: 'Veteran',
  };

  return {
    band,
    label: LABELS[band],
    detail,
    age: round1(age),
    debutAge: round1(debutAge),
    careerYears: round1(careerYears),
    fights,
    fightsPerYear: fightsPerYear == null ? null : round1(fightsPerYear),
    runwayYears: round1(runwayYears),
  };
}
