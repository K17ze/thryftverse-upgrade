'use client';

/**
 * TransactionDetailDrawer — transaction inspection drawer.
 * Flat canvas, hairline dividers, strict tabular figures.
 *
 * Money truthfulness: wallet_ledger rows are committed double-entry
 * facts — id, tx_id, asset, signed amount, the leg's own currency, kind,
 * ref_type/ref_id, balance_after, created_at. This drawer renders only
 * what the row actually carries: the honest kind label, date, signed
 * amount in the leg's currency, the real references (kind/refType/refId/
 * txId — omitted when empty, never faked), the wire's running balance,
 * and a link to the underlying record when the ref type maps to a known
 * route. No minted references, no invented rails, no lifecycle theatre.
 */

import Link from 'next/link';
import { Sheet } from '@/components/ui/Sheet';
import { Badge } from '@/components/ui/Badge';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import {
  formatLedgerMoney,
  ledgerMovementLabel,
  signedLedgerMoney,
  type WalletLedgerEntry,
} from './ledgerViewModel';

interface TransactionDetailDrawerProps {
  entry: WalletLedgerEntry | null;
  open: boolean;
  onClose: () => void;
}

const KIND_DISPLAY: Record<
  WalletLedgerEntry['kind'],
  { label: string; icon: AppIconName }
> = {
  sale: { label: 'Sale proceed', icon: 'arrowUp' },
  purchase: { label: 'Order purchase', icon: 'bag' },
  topup: { label: 'Wallet deposit', icon: 'card' },
  withdrawal: { label: 'Bank withdrawal', icon: 'payout' },
  fee: { label: 'Protection fee', icon: 'receipt' },
  conversion: { label: 'Currency conversion', icon: 'sort' },
  refund: { label: 'Order refund', icon: 'repeat' },
  transfer: { label: 'Transfer', icon: 'send' },
  other: { label: 'Wallet movement', icon: 'receipt' },
};

/** Link the ledger leg's ref_id to a real route — only for ref types
 *  whose id resolves to a page that exists. Everything else renders the
 *  reference as text in the detail table. */
function sourceLink(entry: WalletLedgerEntry): { href: string; label: string } | null {
  const st = (entry.sourceType ?? '').toLowerCase();
  const id = entry.sourceId?.trim();
  if (!id) return null;
  // Order-bound legs carry the order id in ref_id.
  if (
    st === 'order_payment' ||
    st === 'order_delivery' ||
    st === 'refund' ||
    st === 'commerce_order' ||
    st === 'commerce_order_refund'
  ) {
    return { href: `/orders/${id}`, label: 'View order' };
  }
  if (st === 'payout' || st === 'withdrawal') {
    return { href: '/wallet/payouts', label: 'View payouts' };
  }
  return null;
}

export function TransactionDetailDrawer({
  entry,
  open,
  onClose,
}: TransactionDetailDrawerProps) {
  if (!entry) return null;

  // wallet_ledger legs title off their raw kind — the honest movement
  // label ('Exchanged →', 'Sent'); fixture/session legs use the category.
  const category = KIND_DISPLAY[entry.kind] ?? {
    label: 'Wallet movement',
    icon: 'receipt' as AppIconName,
  };
  const meta = entry.movementKind
    ? { label: ledgerMovementLabel(entry.movementKind), icon: category.icon }
    : category;

  const positive = entry.amount > 0;
  const isPending = entry.status === 'pending';
  const link = sourceLink(entry);

  return (
    <Sheet open={open} onClose={onClose} title="Transaction Details" maxWidth={480}>
      <div className="px-5 py-6">
        {/* Amount display header */}
        <div className="border-b border-border-subtle pb-6 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-alt">
            <Icon
              name={meta.icon}
              size={24}
              className={positive ? 'text-coown-up' : 'text-text-primary'}
            />
          </div>
          <p
            className={`tnum mt-3 text-display-small font-bold tracking-tight ${
              positive ? 'text-coown-up' : 'text-text-primary'
            }`}
          >
            {signedLedgerMoney(entry.amount, entry.currency, entry.asset)}
          </p>
          <div className="mt-2 flex items-center justify-center gap-2">
            <Badge variant={isPending ? 'warning' : 'neutral'} icon={isPending ? 'clock' : 'check'}>
              {isPending ? 'Pending' : 'Posted'}
            </Badge>
            <span className="text-caption text-text-muted">·</span>
            <span className="text-caption text-text-muted">{meta.label}</span>
          </div>
        </div>

        {/* Wire-field detail table */}
        <div className="mt-6">
          <h3 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
            Details
          </h3>
          <dl className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-body text-text-secondary">Description</dt>
              <dd className="max-w-[65%] text-right text-body font-medium text-text-primary">
                {entry.description}
              </dd>
            </div>
            <div className="flex items-baseline justify-between py-3">
              <dt className="text-body text-text-secondary">Date</dt>
              <dd className="tnum text-body text-text-primary">
                {new Date(entry.date).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </dd>
            </div>
            <div className="flex items-baseline justify-between py-3">
              <dt className="text-body text-text-secondary">Status</dt>
              <dd className="text-body text-text-primary">
                {isPending ? 'Pending' : 'Posted'}
              </dd>
            </div>
            <div className="flex items-baseline justify-between py-3">
              <dt className="text-body text-text-secondary">Currency</dt>
              <dd className="text-body text-text-primary">
                {(entry.currency ?? 'GBP').toUpperCase()}
              </dd>
            </div>
            {entry.movementKind ? (
              <div className="flex items-baseline justify-between py-3">
                <dt className="text-body text-text-secondary">Type</dt>
                <dd className="text-body text-text-primary">{entry.movementKind}</dd>
              </div>
            ) : null}
            {link ? (
              <div className="flex items-baseline justify-between py-3">
                <dt className="text-body text-text-secondary">Source</dt>
                <dd>
                  <Link
                    href={link.href}
                    onClick={onClose}
                    className="pressable inline-flex items-center gap-1.5 text-body font-medium text-text-primary underline-offset-4 hover:underline"
                  >
                    {link.label}
                    <Icon name="forward" size={14} />
                  </Link>
                </dd>
              </div>
            ) : null}
            {entry.sourceType?.trim() ? (
              <div className="flex items-baseline justify-between py-3">
                <dt className="text-body text-text-secondary">Reference type</dt>
                <dd className="text-body text-text-primary">{entry.sourceType}</dd>
              </div>
            ) : null}
            {entry.sourceId?.trim() ? (
              <div className="flex items-baseline justify-between gap-4 py-3">
                <dt className="text-body text-text-secondary">Reference</dt>
                <dd className="tnum max-w-[65%] break-all text-right text-body text-text-primary">
                  {entry.sourceId}
                </dd>
              </div>
            ) : null}
            {entry.txId?.trim() ? (
              <div className="flex items-baseline justify-between gap-4 py-3">
                <dt className="text-body text-text-secondary">Transaction ID</dt>
                <dd className="tnum max-w-[65%] break-all text-right text-body text-text-primary">
                  {entry.txId}
                </dd>
              </div>
            ) : null}
            {/* Running balance — the wire's own balanceAfterDisplay on
                live legs, the reconstructed statement walk on fixture
                rows; rendered in the leg's currency. */}
            {entry.balance != null ? (
              <div className="flex items-baseline justify-between py-3">
                <dt className="text-body text-text-secondary">Running balance</dt>
                <dd className="tnum text-body font-semibold text-text-primary">
                  {formatLedgerMoney(entry.balance, entry.currency, entry.asset)}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="mt-8 px-1 pt-1">
          <Link
            href="/support"
            className="pressable text-caption text-text-muted hover:text-text-primary"
          >
            Need help with this transaction?
          </Link>
        </div>
      </div>
    </Sheet>
  );
}
