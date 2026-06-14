import { loadOddsAnalysis, type OddsRecord } from '@/lib/loadOddsAnalysis';
import { shortDivision } from '@/lib/divisions';

export const revalidate = 86400;

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function OddsPage() {
  const data = loadOddsAnalysis();

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="font-display text-3xl" style={{ color: 'var(--text-primary)' }}>MODEL vs MARKET</h1>
        <p className="text-sm mt-3" style={{ color: 'var(--text-muted)' }}>
          No analysis yet. Run <code>node_modules/.bin/jiti research/backtest/exportAnalysis.ts</code> to generate it.
        </p>
      </div>
    );
  }

  const { summary, records } = data;
  // Biggest disagreements between the model and the market, among bouts where
  // BOTH fighters were established (no debutant noise), with a settled result.
  const top = records
    .filter((r) => r.bothEstablished)
    .sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge))
    .slice(0, 40);

  // Model's pick = the side it gave >50%. Market favourite is the lower-odds side.
  const modelPickedDog = (r: OddsRecord) => r.modelFavProb < 0.5;
  const modelHit = (r: OddsRecord) => (modelPickedDog(r) ? !r.favWon : r.favWon);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl leading-none" style={{ color: 'var(--text-primary)' }}>
          MODEL vs MARKET
        </h1>
        <p className="text-xs mt-1.5 max-w-2xl" style={{ color: 'var(--text-muted)' }}>
          Every UFC fight {summary.span} where we have a closing line ({summary.n.toLocaleString()} bouts), with the
          model&rsquo;s point-in-time win probability beside the market&rsquo;s. The market is the sharper predictor —
          this is a lens on where our read diverges from it, not a betting-edge generator.
        </p>
      </div>

      {/* headline track record */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Sample" value={summary.n.toLocaleString()} sub={summary.span} />
        <Stat label="Model accuracy" value={pct(summary.model.accuracy)} sub={`logloss ${summary.model.logLoss}`} />
        <Stat label="Market accuracy" value={pct(summary.market.accuracy)} sub={`logloss ${summary.market.logLoss}`} accent />
        <Stat label="Model’s dog picks" value={pct(summary.modelDogWinRate)} sub={`won, of ${summary.disagreements}`} />
      </div>

      <div
        className="rounded-lg px-3 py-2 text-[11px] leading-snug"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
      >
        The closing line beats the model on accuracy and log-loss — it carries information the model doesn&rsquo;t.
        When the model disagrees and backs the underdog, that dog wins {pct(summary.modelDogWinRate)} of the time
        (at plus-money). Use these disagreements as research leads, strongest against early/soft lines.
      </div>

      {/* biggest disagreements */}
      <div>
        <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
          Biggest disagreements (both fighters established)
        </div>
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          {top.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-3 py-2.5"
              style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}
            >
              <div className="min-w-0">
                <div className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                  <span style={{ fontWeight: r.favWon ? 600 : 400 }}>{r.favName}</span>
                  <span style={{ color: 'var(--text-muted)' }}> vs </span>
                  <span style={{ fontWeight: !r.favWon ? 600 : 400 }}>{r.dogName}</span>
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {r.date} · {shortDivision(r.division)} · won by {r.favWon ? r.favName : r.dogName}
                </div>
              </div>

              <div className="text-right font-mono text-xs hidden sm:block min-w-[88px]">
                <div style={{ color: 'var(--text-secondary)' }}>model {pct(r.modelFavProb)}</div>
                <div style={{ color: 'var(--text-muted)' }}>mkt {pct(r.marketFavProb)}</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>on {r.favName.split(' ').slice(-1)[0]}</div>
              </div>

              <div className="text-right font-mono text-xs min-w-[52px]" style={{ color: r.edge > 0 ? 'var(--accent-green)' : 'var(--accent-red-light)' }}>
                {r.edge > 0 ? '+' : ''}{Math.round(r.edge * 100)}
                <div className="text-[9px] uppercase" style={{ color: 'var(--text-muted)' }}>edge</div>
              </div>

              <div
                className="text-center text-xs font-medium min-w-[64px] px-2 py-1 rounded"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: modelHit(r) ? 'var(--accent-green)' : 'var(--text-muted)',
                }}
                title={modelPickedDog(r) ? 'Model backed the underdog' : 'Model agreed with the favourite, more strongly or less'}
              >
                {modelPickedDog(r) ? (modelHit(r) ? 'dog ✓' : 'dog ✗') : (modelHit(r) ? 'fav ✓' : 'fav ✗')}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="font-display text-2xl leading-none mt-1" style={{ color: accent ? 'var(--accent-red-light)' : 'var(--text-primary)' }}>
        {value}
      </div>
      {sub && <div className="text-[10px] mt-1 font-mono" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
}
