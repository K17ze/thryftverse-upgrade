'use client';

/**
 * LedgerList — flat transaction ledger grouped by calendar month with
 * sticky month rails, hairline separators. Signed tabular amounts with
 * the running balance beneath; pending rows show a quiet badge and an
 * em-dash balance until they settle.
 * Clicking any row triggers onSelect to inspect the full Polymarket/eBay-standard
 * TransactionDetailDrawer.
 */

import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import {
  formatLedgerMoney,
  formatMonthLabel,
  groupByMonth,
  netsByCurrency,
  signedLedgerMoney,
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
  transfer: { icon: 'send', iconClass: 'text-text-secondary' },
  other: { icon: 'receipt', iconClass: 'text-text-muted' },
};

/** Day-of-month for the desktop date column — the month group header
 *  already carries month + year, so the cell stays a bare day number. */
function dayOfMonth(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? String(d.getDate()) : '—';
}

/** One ledger row — type icon, day column (lg+), description, signed
 *  amount + running balance, with click inspection. */
export function LedgerRow({
  entry,
  desktopOnly = false,
  onSelect,
}: {
  entry: WalletLedgerEntry;
  /** Renders at lg+ only — the wallet home preview keeps three rows on
   *  mobile and deepens the ledger column on desktop. */
  desktopOnly?: boolean;
  onSelect?: (entry: WalletLedgerEntry) => void;
}) {
  const meta = KIND_META[entry.kind] ?? {
    icon: 'receipt',
    iconClass: 'text-text-secondary',
  };
  const positive = entry.amount > 0;

  return (
    <li
      onClick={() => onSelect?.(entry)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.(entry);
        }
      }}
      tabIndex={onSelect ? 0 : undefined}
      role={onSelect ? 'button' : undefined}
      aria-label={`${entry.description}, ${signedLedgerMoney(
        entry.amount,
        entry.currency,
        entry.asset,
      )}`}
      className={`${
        desktopOnly ? 'hidden lg:flex' : 'flex'
      } items-center gap-3.5 px-4 py-3.5 sm:px-6 transition-colors ${
        onSelect
          ? 'cursor-pointer hover:bg-surface-raised/70 active:bg-surface-raised focus:outline-none focus:bg-surface-raised/50'
          : ''
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-alt/70">
        <Icon name={meta.icon} size={18} className={meta.iconClass} />
      </span>
      <span className="hidden w-8 shrink-0 text-right text-meta text-text-muted tnum lg:block">
        {dayOfMonth(entry.date)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="clamp-1 text-body text-text-primary">{entry.description}</p>
        {entry.status === 'pending' ? (
          <div className="mt-1 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
            <Badge variant="warning" className="py-0 text-[10px]">
              Pending clearance
            </Badge>
          </div>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <p
          className={`tnum text-body-emphasis font-semibold ${
            positive ? 'text-coown-up' : 'text-text-primary'
          }`}
        >
          {signedLedgerMoney(entry.amount, entry.currency, entry.asset)}
        </p>
        <p className="tnum text-caption text-text-muted">
          {entry.balance == null
            ? '—'
            : formatLedgerMoney(entry.balance, entry.currency, entry.asset)}
        </p>
      </div>
      {onSelect ? (
        <span className="hidden text-text-muted opacity-0 group-hover:opacity-100 sm:block">
          <Icon name="forward" size={14} />
        </span>
      ) : null}
    </li>
  );
}

interface LedgerListProps {
  entries: WalletLedgerEntry[];
  emptyTitle: string;
  emptySubtitle: string;
  onSelectEntry?: (entry: WalletLedgerEntry) => void;
}

export function LedgerList({
  entries,
  emptyTitle,
  emptySubtitle,
  onSelectEntry,
}: LedgerListProps) {
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
        // Per-currency month nets — one segment per currency present,
        // never a blended figure across currencies (mirrors native's
        // formatLedgerNets " · "-joined segments).
        const nets = netsByCurrency(items);
        return (
          <section key={month} aria-label={formatMonthLabel(month)}>
            {/* Sticky month rail — rides under the global header */}
            <h3 className="sticky top-16 z-sticky flex items-baseline justify-between gap-3 border-b border-border-subtle bg-background px-4 pb-2 pt-4 sm:px-6">
              <span className="text-label text-text-muted">
                {formatMonthLabel(month)}
              </span>
              <span className="tnum text-caption font-semibold text-text-muted">
                {nets.map((seg, i) => (
                  <span
                    key={seg.currency}
                    className={
                      seg.net > 0
                        ? 'text-coown-up'
                        : seg.net < 0
                          ? 'text-text-secondary'
                          : 'text-text-muted'
                    }
                  >
                    {i > 0 ? <span className="text-text-muted"> · </span> : null}
                    {signedLedgerMoney(seg.net, seg.currency, seg.asset)}
                  </span>
                ))}
              </span>
            </h3>
            <ul className="divide-y divide-border-subtle">
              {items.map((entry) => (
                <LedgerRow
                  key={entry.id}
                  entry={entry}
                  onSelect={onSelectEntry}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
