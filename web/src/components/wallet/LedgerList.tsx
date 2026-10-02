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
  { icon: AppIconName; iconClass: string; label: string }
> = {
  topup: { icon: 'card', iconClass: 'text-text-secondary', label: 'Top-up' },
  withdrawal: { icon: 'payout', iconClass: 'text-text-secondary', label: 'Payout' },
  sale: { icon: 'arrowUp', iconClass: 'text-coown-up', label: 'Sale' },
  purchase: { icon: 'bag', iconClass: 'text-text-secondary', label: 'Purchase' },
  fee: { icon: 'receipt', iconClass: 'text-text-muted', label: 'Fee' },
  conversion: { icon: 'sort', iconClass: 'text-text-secondary', label: 'Conversion' },
  refund: { icon: 'repeat', iconClass: 'text-text-secondary', label: 'Refund' },
  transfer: { icon: 'send', iconClass: 'text-text-secondary', label: 'Transfer' },
  other: { icon: 'receipt', iconClass: 'text-text-muted', label: 'Movement' },
};

/** The lg table grid — date | type | description | amount | status |
 *  chevron. Header and rows share this template so columns align. */
const LEDGER_GRID =
  'lg:grid-cols-[2.5rem_minmax(0,8.5rem)_minmax(0,1fr)_minmax(0,9rem)_minmax(0,6.5rem)_1.25rem]';

/** Day-of-month for the desktop date column — the month group header
 *  already carries month + year, so the cell stays a bare day number. */
function dayOfMonth(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? String(d.getDate()) : '—';
}

/** One ledger row — type icon, day column (lg+), description, signed
 *  amount + running balance, with click inspection. With `table` the row
 *  becomes a real grid at lg (date | type | description | amount |
 *  status) — the history surface's column grammar; the wallet-home
 *  preview keeps the compact row. */
export function LedgerRow({
  entry,
  desktopOnly = false,
  table = false,
  onSelect,
}: {
  entry: WalletLedgerEntry;
  /** Renders at lg+ only — the wallet home preview keeps three rows on
   *  mobile and deepens the ledger column on desktop. */
  desktopOnly?: boolean;
  table?: boolean;
  onSelect?: (entry: WalletLedgerEntry) => void;
}) {
  const meta = KIND_META[entry.kind] ?? {
    icon: 'receipt',
    iconClass: 'text-text-secondary',
    label: 'Movement',
  };
  const positive = entry.amount > 0;
  // lg:grid never doubles up with lg:flex — the two display utilities
  // would be order-dependent, so the class resolves once here.
  const display = desktopOnly
    ? table
      ? 'hidden lg:grid'
      : 'hidden lg:flex'
    : 'flex';

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
      className={`group ${display} items-center gap-3.5 px-4 py-3.5 sm:px-6 transition-colors ${
        table ? `lg:grid ${LEDGER_GRID} lg:items-center lg:gap-x-5` : ''
      } ${
        onSelect
          ? 'cursor-pointer hover:bg-surface-raised/70 active:bg-surface-raised focus:outline-none focus:bg-surface-raised/50'
          : ''
      }`}
    >
      {/* Date — the month group carries month + year, so the cell stays
          a bare day number. Table mode only: `lg:w-full` would seize the
          whole flex row in the compact preview and push siblings
          off-canvas. */}
      {table ? (
        <span className="hidden w-8 shrink-0 text-right text-meta text-text-muted tnum lg:block lg:w-full lg:justify-self-end">
          {dayOfMonth(entry.date)}
        </span>
      ) : null}
      {/* Type — bare icon at every size (no chrome well on flat canvas);
          the label is the lg column text. */}
      <span className="flex min-w-0 shrink-0 items-center gap-2.5">
        <Icon name={meta.icon} size={18} className={`shrink-0 ${meta.iconClass}`} />
        {table ? (
          <span className="clamp-1 hidden text-meta text-text-secondary lg:inline">
            {meta.label}
          </span>
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="clamp-1 text-body text-text-primary">{entry.description}</p>
        {entry.status === 'pending' ? (
          // In table rows the pending badge files under Status at lg.
          <div className={`mt-1 flex items-center gap-1.5 ${table ? 'lg:hidden' : ''}`}>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
            <Badge variant="warning" className="py-0 text-micro">
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
      {table ? (
        <span className="hidden min-w-0 lg:block">
          {entry.status === 'pending' ? (
            <Badge variant="warning" className="py-0 text-micro">
              Pending
            </Badge>
          ) : (
            <span className="text-meta text-text-muted">—</span>
          )}
        </span>
      ) : null}
      {onSelect ? (
        <span className="hidden text-text-muted opacity-0 group-hover:opacity-100 sm:block lg:justify-self-end">
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
      {/* Column header — desktop table grammar; mirrors the row grid.
          Visual signpost only (month rails carry the grouping). */}
      <div
        aria-hidden="true"
        className={`hidden border-b border-border-subtle px-4 pb-2 pt-3 sm:px-6 lg:grid ${LEDGER_GRID} lg:gap-x-5`}
      >
        <span className="text-right text-label text-text-muted">Date</span>
        <span className="text-label text-text-muted">Type</span>
        <span className="text-label text-text-muted">Description</span>
        <span className="text-right text-label text-text-muted">Amount</span>
        <span className="text-label text-text-muted">Status</span>
        <span />
      </div>
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
                  table
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
