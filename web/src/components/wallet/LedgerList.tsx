'use client';

/**
 * LedgerList — flat transaction ledger grouped by calendar month with
 * sticky month rails, hairline separators. Signed tabular amounts with
 * the running balance beneath; pending rows show a quiet badge and an
 * em-dash balance until they settle. LedgerRow is exported so the wallet
 * preview renders the exact same row grammar.
 */

import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import {
  formatMonthLabel,
  groupByMonth,
  monthNet,
  type WalletLedgerEntry,
} from './ledgerViewModel';

const KIND_META: Record<
  WalletLedgerEntry['kind'],
  { icon: AppIconName; iconClass: string }
> = {
  topup: { icon: 'card', iconClass: 'text-text-secondary' },
  withdrawal: { icon: 'payout', iconClass: 'text-text-secondary' },
  sale: { icon: 'arrowUp', iconClass: 'text-coown-up' },
  purchase: { icon: 'bag', iconClass: 'text-text-secondary' },
  fee: { icon: 'receipt', iconClass: 'text-text-muted' },
  conversion: { icon: 'sort', iconClass: 'text-text-secondary' },
  refund: { icon: 'repeat', iconClass: 'text-text-secondary' },
};

/** One ledger row — type icon, description, signed amount + running balance. */
export function LedgerRow({ entry }: { entry: WalletLedgerEntry }) {
  const meta = KIND_META[entry.kind];
  const positive = entry.amount > 0;
  return (
    <li className="flex items-center gap-3.5 px-4 py-3.5 sm:px-6">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center">
        <Icon name={meta.icon} size={19} className={meta.iconClass} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="clamp-1 text-body text-text-primary">{entry.description}</p>
        {entry.status === 'pending' ? (
          <Badge variant="warning" icon="clock" className="mt-1.5">
            Pending
          </Badge>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <p
          className={`tnum text-body-emphasis font-semibold ${
            positive ? 'text-coown-up' : 'text-text-primary'
          }`}
        >
          {positive ? '+' : ''}
          {formatPrice(entry.amount, 'GBP')}
        </p>
        <p className="tnum text-caption text-text-muted">
          {entry.balance == null ? '—' : formatPrice(entry.balance, 'GBP')}
        </p>
      </div>
    </li>
  );
}

interface LedgerListProps {
  entries: WalletLedgerEntry[];
  emptyTitle: string;
  emptySubtitle: string;
}

export function LedgerList({ entries, emptyTitle, emptySubtitle }: LedgerListProps) {
  if (entries.length === 0) {
    return (
      <EmptyState
        compact
        icon="receipt"
        title={emptyTitle}
        subtitle={emptySubtitle}
      />
    );
  }

  const groups = groupByMonth(entries);

  return (
    <div className="border-t border-border-subtle">
      {groups.map(([month, items]) => {
        const net = monthNet(items);
        return (
          <section key={month} aria-label={formatMonthLabel(month)}>
            {/* Sticky month rail — rides under the global header */}
            <h3 className="sticky top-16 z-sticky flex items-baseline justify-between gap-3 border-b border-border-subtle bg-background px-4 pb-2 pt-4 sm:px-6">
              <span className="text-label font-semibold uppercase tracking-wider text-text-muted">
                {formatMonthLabel(month)}
              </span>
              <span
                className={`tnum text-caption font-semibold ${
                  net > 0 ? 'text-coown-up' : net < 0 ? 'text-text-secondary' : 'text-text-muted'
                }`}
              >
                {net > 0 ? '+' : net < 0 ? '−' : ''}
                {formatPrice(Math.abs(net), 'GBP')}
              </span>
            </h3>
            <ul className="divide-y divide-border-subtle">
              {items.map((entry) => (
                <LedgerRow key={entry.id} entry={entry} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
