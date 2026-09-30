import { gbp, signedGbp, signedPct } from '../../format';

interface TradePositionHeaderProps {
  units: number;
  avgEntryPriceGbp: number;
  markPriceGbp: number;
}

export function TradePositionHeader({
  units,
  avgEntryPriceGbp,
  markPriceGbp,
}: TradePositionHeaderProps) {
  if (units <= 0) return null;

  const marketValue = units * markPriceGbp;
  const unrealised = (markPriceGbp - avgEntryPriceGbp) * units;
  const unrealisedPct = avgEntryPriceGbp > 0 ? (markPriceGbp / avgEntryPriceGbp - 1) * 100 : null;

  return (
    <div className="border-b border-border-subtle pb-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Your position
        </h3>
        <span className="tnum text-body-emphasis font-semibold text-text-primary">
          {units} {units === 1 ? 'unit' : 'units'}
        </span>
      </div>
      <div className="tnum mt-2 flex items-baseline justify-between text-meta text-text-secondary">
        <span>
          Avg entry {gbp(avgEntryPriceGbp)} · Value {gbp(marketValue)}
        </span>
        <span className={`font-semibold ${unrealised >= 0 ? 'text-coown-up' : 'text-coown-down'}`}>
          {signedGbp(unrealised)} ({signedPct(unrealisedPct)})
        </span>
      </div>
    </div>
  );
}
