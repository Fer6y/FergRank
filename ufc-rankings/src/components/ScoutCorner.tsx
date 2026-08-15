import type { ScoutRead } from '@/lib/dwcsScout';

// One Contender Series corner, FORM FIRST (2026-08-15 hierarchy): the
// current-form grade leads, then the basics, with the top-15 ceiling forecast
// demoted to a secondary PROSPECT line. Shared by the /upcoming scout band
// and the /contender-series card breakdowns — one component, so the two
// surfaces cannot drift (the CompareGauntlet lesson). No hooks: renders in
// both server and client components.

export const familyColor = (g: string | null | undefined) =>
  !g ? 'var(--text-muted)'
  : g[0] === 'A' ? 'var(--accent-green)'
  : g[0] === 'B' ? 'var(--accent-gold)'
  : 'var(--accent-red-light)';

export function ScoutCorner({ label, s }: { label: string; s: ScoutRead }) {
  const r = s.rating;
  const form = s.form ?? null;
  const color = familyColor(form?.grade);
  const prob = r ? Math.round(r.topFifteenProb * 100) : null;
  return (
    <div className="min-w-0">
      {/* CURRENT FORM — the headline. Graded vs fighters entering the UFC. */}
      <div className="flex items-baseline gap-2 text-[11px]">
        <span
          className="font-display text-base leading-none px-1.5 py-0.5 rounded shrink-0"
          style={{ color, border: `1px solid ${color}` }}
          title="Current-form grade — where this fighter's level TODAY sits among fighters entering the UFC, measured from cross-promotion results (who they actually beat). Not a projection."
        >
          {form?.grade ?? '—'}
        </span>
        <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{label}</span>
        <span className="text-[9px] tracking-widest uppercase shrink-0" style={{ color: 'var(--text-muted)' }}>form now</span>
      </div>
      {/* The basics — record, style, age, provenance. */}
      {r && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 font-mono text-[10px]" style={{ color: 'var(--text-secondary)' }}>
          <span>{r.fights - Math.round(r.fights * (1 - r.winRate))}-{Math.round(r.fights * (1 - r.winRate))}</span>
          {r.finishRate != null && (
            <span title="Finish rate — a style read; the cohort says it doesn't predict a UFC ceiling once win rate is known" style={{ color: 'var(--accent-red-light)' }}>
              {Math.round(r.finishRate * 100)}% FIN
            </span>
          )}
          {r.age != null && <span>{r.age} yrs</span>}
          {s.regional?.careerYears != null && <span>{s.regional.careerYears}y pro</span>}
          {r.org && <span style={{ color: 'var(--text-muted)' }}>{r.org}</span>}
        </div>
      )}
      {!form && (
        <p className="text-[10px] mt-1 leading-snug" style={{ color: 'var(--text-muted)' }}>
          Off the graded circuit — no verified form read. Ungraded, not zero.
        </p>
      )}
      {!r && (
        <p className="text-[10px] mt-1 leading-snug" style={{ color: 'var(--text-muted)' }}>{s.line}</p>
      )}
      {/* Career arc from a VERIFIED birthdate + pro-debut date — the read
          age alone can't make. */}
      {s.stage && (
        <p className="text-[10px] mt-1 leading-snug">
          <span
            className="font-mono px-1 py-px rounded mr-1.5"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color:
                s.stage.band === 'blue-chip' ? 'var(--accent-green)'
                : s.stage.band === 'veteran' ? 'var(--accent-red-light)'
                : 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
            title="Career stage — from a verified birthdate and pro-debut date. Display context; it did not clear the bar to affect any score."
          >
            {s.stage.label.toUpperCase()}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            {s.stage.detail}
            {s.stage.fightsPerYear != null && ` · ${s.stage.fightsPerYear} fights/yr`}
          </span>
        </p>
      )}
      {/* The runway verdict — elite form read against the cohort's measured
          age bands (29+ entrants: 5% top-15). */}
      {r?.age != null && s.regional && s.regional.percentile >= 85 && (
        <p className="text-[10px] mt-0.5 leading-snug" style={{ color: r.age <= 28 ? 'var(--accent-green)' : 'var(--accent-red-light)' }}>
          {r.age <= 28
            ? `Elite current form at ${r.age} — the young-stud profile the cohort's best outcomes come from.`
            : `Elite current form at ${r.age} — a late surge; the cohort discounts short runways (29+: 5% reach the top 15).`}
        </p>
      )}
      {/* PROSPECT GRADE — the ceiling forecast, deliberately second. */}
      {r && (
        <p className="text-[10px] mt-1.5 leading-snug">
          <span
            className="font-mono px-1 py-px rounded mr-1.5"
            style={{ color: familyColor(r.fineGrade), border: `1px solid ${familyColor(r.fineGrade)}` }}
            title={`Prospect grade — the modeled chance this résumé reaches the UFC top 15 (win rate + age + promotion, fitted on nine Contender Series seasons; score ${r.score}/100 vs the cohort). A ceiling forecast, not a read on who wins tonight.`}
          >
            {r.fineGrade}
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            prospect · ~{prob! < 1 ? '<1' : prob}% shot at the top 15
          </span>
        </p>
      )}
    </div>
  );
}
