import { buildProspectWatchlist } from '@/lib/prospects';
import { RANKING_CONFIG } from '@/lib/rankingConfig';
import { loadDwcsAnalysis } from '@/lib/loadDwcsAnalysis';
import ProspectsList from '@/components/ProspectsList';
import ProspectPipelineGuide, { type PipelineNumbers } from '@/components/ProspectPipelineGuide';

export const revalidate = 86400;

export default async function ProspectsPage() {
  const { prospects, newcomers } = await buildProspectWatchlist();

  // Live numbers for the pipeline guide (nullable — guide renders em-dashes
  // if the DWCS analysis export is absent).
  const dwcs = loadDwcsAnalysis();
  const byResult = (label: string) => dwcs?.byResult.find((r) => r.label === label)?.contractRate ?? null;
  const numbers: PipelineNumbers = {
    finishContractRate: byResult('Finish win'),
    decisionContractRate: byResult('Decision win'),
    noWinContractRate: byResult('No DWCS win'),
    gradTop15Rate: dwcs?.summary.gradTop15Rate ?? null,
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl leading-none" style={{ color: 'var(--text-primary)' }}>
          PROSPECT WATCH
        </h1>
        <p className="text-xs mt-1.5 max-w-2xl" style={{ color: 'var(--text-muted)' }}>
          Fighters still inside the provisional-Elo window (≤{RANKING_CONFIG.prospects.maxUFCFights} UFC
          fights) with a winning record and a live schedule. The engine treats these ratings as
          provisional, so read them as trajectory, not destination.
        </p>
      </div>

      <ProspectPipelineGuide numbers={numbers} />

      <ProspectsList prospects={prospects} newcomers={newcomers} />
    </div>
  );
}
