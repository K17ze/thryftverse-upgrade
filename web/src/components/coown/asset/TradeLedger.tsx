'use client';

/**
 * TradeLedger — the public tape for one market. Flat rows, newest first:
 * time · side + price · units. The contract carries a `side` field, so
 * the aggressor side colours the print; counterparties stay masked (like
 * the mobile MarketLedger tape view).
 */

import type { TradeLedgerEntry } from '@/lib/contracts/coown';
import { gbp } from '../format';

function tapeTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${date} · ${time}`;
}

/**
 * TradeTape — the row set, unwrapped. Reused inside the order-book
 * panel's Trades view; TradeLedger adds the section chrome around it.
 */
export function TradeTape({
  entries,
  limit,
}: {
  entries: TradeLedgerEntry[];
  limit?: number;
}) {
  const rows = limit != null ? entries.slice(0, limit) : entries;
  return (
    <ul className="divide-y divide-border-subtle">
      {rows.map((t) => (
        <li key={t.id} className="flex items-baseline gap-4 py-2.5">
          <time
            dateTime={t.executedAt}
            className="w-20 shrink-0 text-meta text-text-muted tnum"
          >
            {tapeTime(t.executedAt)}
          </time>
          <span
            className={`min-w-0 flex-1 text-body font-medium tnum ${
              t.side === 'buy' ? 'text-coown-up' : 'text-coown-down'
            }`}
          >
            {t.side === 'buy' ? 'Buy' : 'Sell'} {gbp(t.unitPriceGbp)}
          </span>
          <span className="shrink-0 text-right text-meta text-text-secondary tnum">
            {t.units} {t.units === 1 ? 'unit' : 'units'}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TradeLedger({ entries }: { entries: TradeLedgerEntry[] | undefined }) {
  return (
    <section aria-labelledby="ledger-heading">
      <div className="flex items-baseline justify-between">
        <h3
          id="ledger-heading"
          className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
        >
          Trade ledger
        </h3>
        <p className="text-meta text-text-muted">Public tape · counterparties masked</p>
      </div>

      {entries === undefined ? (
        <div className="mt-3 space-y-1.5" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-8 rounded-sm" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="mt-3 text-body text-text-secondary">
          Nothing has printed yet — executions land here as they clear.
        </p>
      ) : (
        <div className="mt-1 border-b border-border-subtle">
          <TradeTape entries={entries} />
        </div>
      )}
    </section>
  );
}
