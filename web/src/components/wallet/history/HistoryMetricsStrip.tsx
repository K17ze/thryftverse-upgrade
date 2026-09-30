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
}

export function HistoryMetricsStrip({
  moneyInByCurrency,
  moneyOutByCurrency,
  nets,
}: HistoryMetricsStripProps) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-3 px-4 sm:grid-cols-3 sm:px-6">
      <div className="rounded-md border border-border-subtle bg-surface-alt/40 p-3.5">
        <p className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Money in (Credits)
        </p>
        {moneyInByCurrency.length > 0 ? (
          moneyInByCurrency.map((b) => (
            <p key={b.currency} className="tnum mt-1 text-section-title font-bold text-coown-up">
              +{formatLedgerMoney(b.total, b.currency, b.asset)}
            </p>
          ))
        ) : (
          <p className="mt-1 text-section-title font-bold text-text-muted">—</p>
        )}
      </div>

      <div className="rounded-md border border-border-subtle bg-surface-alt/40 p-3.5">
        <p className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Money out (Debits)
        </p>
        {moneyOutByCurrency.length > 0 ? (
          moneyOutByCurrency.map((b) => (
            <p key={b.currency} className="tnum mt-1 text-section-title font-bold text-text-primary">
              −{formatLedgerMoney(b.total, b.currency, b.asset)}
            </p>
          ))
        ) : (
          <p className="mt-1 text-section-title font-bold text-text-muted">—</p>
        )}
      </div>

      <div className="rounded-md border border-border-subtle bg-surface-alt/40 p-3.5">
        <p className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Net movement
        </p>
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
      </div>
    </div>
  );
}
