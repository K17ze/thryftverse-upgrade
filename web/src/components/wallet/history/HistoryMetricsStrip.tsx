import { formatLedgerMoney, signedLedgerMoney } from '../ledgerViewModel';

export interface CurrencyBucket {
  currency: string;
  asset?: '1ZE' | 'FIAT';
  total: number;
}

export interface NetBucket {
  currency: string;
  asset?: '1ZE' | 'FIAT';
  net: number;
}

interface HistoryMetricsStripProps {
  moneyInByCurrency: CurrencyBucket[];
  moneyOutByCurrency: CurrencyBucket[];
  nets: NetBucket[];
  /** Rows matching the current filters — the strip's fourth stat. */
  transactionCount: number;
}

/** One stat cell — boxed below lg, a flat hairline-divided cell at lg. */
function StatCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-alt/40 p-3.5 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-6 lg:py-4">
      <p className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
        {label}
      </p>
      {children}
    </div>
  );
}

export function HistoryMetricsStrip({
  moneyInByCurrency,
  moneyOutByCurrency,
  nets,
  transactionCount,
}: HistoryMetricsStripProps) {
  return (
    // Below lg: three boxed stats. At lg: one flat stat row — hairline
    // dividers, no card chrome (the hub grammar).
    <div className="mt-6 grid grid-cols-1 gap-3 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-border-subtle lg:border-y lg:border-border-subtle lg:px-0">
      <StatCell label="Money in (Credits)">
        {moneyInByCurrency.length > 0 ? (
          moneyInByCurrency.map((b) => (
            <p key={b.currency} className="tnum mt-1 text-section-title font-bold text-coown-up">
              +{formatLedgerMoney(b.total, b.currency, b.asset)}
            </p>
          ))
        ) : (
          <p className="mt-1 text-section-title font-bold text-text-muted">—</p>
        )}
      </StatCell>

      <StatCell label="Money out (Debits)">
        {moneyOutByCurrency.length > 0 ? (
          moneyOutByCurrency.map((b) => (
            <p key={b.currency} className="tnum mt-1 text-section-title font-bold text-text-primary">
              −{formatLedgerMoney(b.total, b.currency, b.asset)}
            </p>
          ))
        ) : (
          <p className="mt-1 text-section-title font-bold text-text-muted">—</p>
        )}
      </StatCell>

      <StatCell label="Net movement">
        {nets.length > 0 ? (
          nets.map((b) => (
            <p
              key={b.currency}
              className={`tnum mt-1 text-section-title font-bold ${
                b.net >= 0 ? 'text-coown-up' : 'text-text-primary'
              }`}
            >
              {signedLedgerMoney(b.net, b.currency, b.asset)}
            </p>
          ))
        ) : (
          <p className="mt-1 text-section-title font-bold text-text-muted">—</p>
        )}
      </StatCell>

      <StatCell label="Transactions">
        <p className="tnum mt-1 text-section-title font-bold text-text-primary">
          {transactionCount.toLocaleString()}
        </p>
      </StatCell>
    </div>
  );
}
