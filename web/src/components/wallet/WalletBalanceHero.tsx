'use client';

/**
 * Balance hero — flat canvas, largest number on the screen, tabular figures.
 * Includes Polymarket/Mobile-grade Privacy Eye toggle (balanceHidden),
 * quick action bar, and connected bank verification badge.
 * No FX approximation is rendered — a static conversion would present an
 * indicative rate as fact, and there is no USD balance in this build.
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import { CURRENCIES } from '@/lib/constants/currencies';
import { usePayoutAccounts } from './withdraw/usePayoutAccounts';

/** Currency symbol for the masked state — never a hardcoded £; unknown
 *  codes render as the bare mask rather than a guessed glyph. */
function currencySymbolFor(currency: string): string | null {
  const code = currency.trim().toUpperCase();
  const meta = (CURRENCIES as Record<string, { symbol?: string }>)[code];
  if (meta?.symbol) return meta.symbol;
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
        .formatToParts(0)
        .find((p) => p.type === 'currency')?.value ?? null
    );
  } catch {
    return null;
  }
}

interface WalletBalanceHeroProps {
  available: number;
  pending: number;
  currency: string;
  balanceHidden?: boolean;
  onTogglePrivacy?: () => void;
  onWithdraw: () => void;
  /** Fixture-mode demo only — omitted in live mode (no top-up endpoint). */
  onTopUp?: () => void;
  /** Omitted in live mode — no convert endpoint is wired in this build. */
  onConvert?: () => void;
}

export function WalletBalanceHero({
  available,
  pending,
  currency,
  balanceHidden = false,
  onTogglePrivacy,
  onWithdraw,
  onTopUp,
  onConvert,
}: WalletBalanceHeroProps) {
  const { defaultDestination, isLoading: payoutsLoading, isError: payoutsError } =
    usePayoutAccounts();

  return (
    <section aria-label="Balance" className="px-4 pt-8 sm:px-6 md:pt-10">
      {/* Header row with eyebrow and Privacy Eye toggle */}
      <div className="flex items-center justify-between">
        <p className="text-label text-text-muted">Available balance</p>
        {onTogglePrivacy ? (
          <button
            type="button"
            onClick={onTogglePrivacy}
            className="pressable flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:text-text-primary focus:outline-none"
            aria-label={balanceHidden ? 'Show balance' : 'Hide balance'}
            title={balanceHidden ? 'Show balance' : 'Hide balance'}
          >
            <Icon name={balanceHidden ? 'eyeOff' : 'eye'} size={18} />
          </button>
        ) : null}
      </div>

      {/* Primary Display Balance */}
      <div className="mt-2 flex items-baseline gap-3">
        <p className="tnum text-display-large font-bold tracking-tight text-text-primary">
          {balanceHidden
            ? `${currencySymbolFor(currency) ?? currency} ••••••`
            : formatPrice(available, currency)}
        </p>
      </div>

      {/* Connected Payout Method Strip */}
      {!payoutsLoading && !payoutsError ? (
        <div className="mt-2.5 flex items-center gap-2 text-caption text-text-muted">
          <Icon name="card" size={14} className="shrink-0" />
          {defaultDestination ? (
            <span className="flex items-center gap-1.5">
              <span>{defaultDestination.title}</span>
              <span aria-hidden="true">·</span>
              <span className="text-meta">
                {defaultDestination.status === 'active'
                  ? `${defaultDestination.currency} account verified`
                  : 'verification pending'}
              </span>
            </span>
          ) : (
            <span>No payout method connected yet</span>
          )}
        </div>
      ) : null}

      {/* Pending Delivery Clearance Notice */}
      {pending > 0 && !balanceHidden ? (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-warning-border/30 bg-warning-subtle/20 px-3 py-2 text-caption text-warning-text">
          <Icon name="clock" size={15} className="shrink-0 text-warning-text" />
          <span>
            <strong className="tnum font-semibold">{formatPrice(pending, currency)}</strong> pending — clears into available balance upon delivery confirmation
          </span>
        </div>
      ) : null}

      {/* Quick Action Button Bar */}
      <div
        className={`mt-6 grid gap-2.5 ${
          onTopUp && onConvert
            ? 'grid-cols-3'
            : onTopUp || onConvert
              ? 'grid-cols-2'
              : 'grid-cols-1'
        }`}
        role="group"
        aria-label="Quick actions"
      >
        {onTopUp ? (
          <button
            type="button"
            onClick={onTopUp}
            className="pressable flex h-11 items-center justify-center gap-2 rounded-md bg-brand font-semibold text-text-inverse transition-transform active:scale-[0.98]"
          >
            <Icon name="plus" size={19} />
            <span className="text-body-emphasis font-medium">Add money</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={onWithdraw}
          className="pressable flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface-alt font-semibold text-text-primary transition-transform hover:bg-surface-raised active:scale-[0.98]"
        >
          <Icon name="payout" size={19} />
          <span className="text-body-emphasis font-medium">Withdraw</span>
        </button>
        {onConvert ? (
          <button
            type="button"
            onClick={onConvert}
            className="pressable flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface-alt font-semibold text-text-primary transition-transform hover:bg-surface-raised active:scale-[0.98]"
          >
            <Icon name="sort" size={19} />
            <span className="text-body-emphasis font-medium">Convert</span>
          </button>
        ) : null}
      </div>

      {/* Navigation rows for tools */}
      <nav aria-label="Wallet tools" className="mt-6 border-t border-border-subtle">
        <Link
          href="/wallet/payouts"
          className="pressable flex min-h-[50px] items-center gap-3 text-left transition-colors hover:text-text-primary"
        >
          <span className="flex h-10 w-9 shrink-0 items-center text-text-secondary">
            <Icon name="store" size={18} />
          </span>
          <span className="flex-1 text-body-emphasis text-text-primary">
            Payout destinations &amp; schedules
          </span>
          <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
        </Link>
        <Link
          href="/wallet/history"
          className="pressable flex min-h-[50px] items-center gap-3 border-t border-border-subtle text-left transition-colors hover:text-text-primary"
        >
          <span className="flex h-10 w-9 shrink-0 items-center text-text-secondary">
            <Icon name="receipt" size={18} />
          </span>
          <span className="flex-1 text-body-emphasis text-text-primary">
            Full ledger statements &amp; CSV export
          </span>
          <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
        </Link>
      </nav>
    </section>
  );
}
