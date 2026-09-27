'use client';

/**
 * Balance hero — flat canvas, largest number on the screen, tabular figures.
 * The masked payout account sits under the balance; Add money / Withdraw /
 * Convert are the three quick actions; Payout methods + Full activity stay
 * as flat hairline rows beneath. Mirrors mobile's WalletBalanceHero +
 * WalletActionRow (spec 17 viewport 1).
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import { usePayoutAccounts } from './withdraw/usePayoutAccounts';

interface WalletBalanceHeroProps {
  available: number;
  pending: number;
  currency: string;
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
  onWithdraw,
  onTopUp,
  onConvert,
}: WalletBalanceHeroProps) {
  // Live mode reads the real payout_accounts rail; fixture resolves the
  // demo overlay (seed default before hydration, persisted picks after).
  const { defaultDestination, isLoading: payoutsLoading, isError: payoutsError } =
    usePayoutAccounts();

  return (
    <section aria-label="Balance" className="px-4 pt-8 sm:px-6 md:pt-12">
      <p className="text-label font-semibold uppercase tracking-wider text-text-muted">
        Available balance
      </p>
      <p className="tnum mt-2 text-display-large font-bold tracking-tight text-text-primary">
        {formatPrice(available, currency)}
      </p>
      {/* The caption claims nothing while the rail is loading or failed —
          a guessed "no account" line would flash under a connected user. */}
      {!payoutsLoading && !payoutsError ? (
        <p className="mt-2 flex items-center gap-1.5 text-caption text-text-muted">
          <Icon name="card" size={14} className="shrink-0" />
          {defaultDestination ? (
            <span>
              {defaultDestination.title}
              <span aria-hidden="true" className="mx-1.5">·</span>
              {defaultDestination.status === 'active'
                ? `${defaultDestination.currency} account`
                : 'verification pending'}
            </span>
          ) : (
            <span>No payout method yet</span>
          )}
        </p>
      ) : null}

      {pending > 0 ? (
        <p className="mt-3 flex items-center gap-1.5 text-body text-text-secondary">
          <Icon name="clock" size={15} className="text-text-muted" />
          <span className="tnum font-medium text-text-primary">
            {formatPrice(pending, currency)}
          </span>
          pending — clears when orders are delivered
        </p>
      ) : null}

      {/* Quick actions — mirrors mobile WalletActionRow: Add money leads,
       * Withdraw / Convert ride the outline grammar. Meta-size labels keep
       * three equal targets honest at 375px. */}
      <div
        className={`mt-6 grid gap-2 ${
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
            className="pressable flex h-11 items-center justify-center gap-1.5 rounded-md bg-brand font-semibold text-text-inverse"
          >
            <Icon name="plus" size={20} />
            <span className="text-meta">Add money</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={onWithdraw}
          className="pressable flex h-11 items-center justify-center gap-1.5 rounded-md border border-border font-semibold text-text-primary"
        >
          <Icon name="payout" size={20} />
          <span className="text-meta">Withdraw</span>
        </button>
        {onConvert ? (
          <button
            type="button"
            onClick={onConvert}
            className="pressable flex h-11 items-center justify-center gap-1.5 rounded-md border border-border font-semibold text-text-primary"
          >
            <Icon name="sort" size={20} />
            <span className="text-meta">Convert</span>
          </button>
        ) : null}
      </div>

      <nav aria-label="Wallet tools" className="mt-6 border-t border-border-subtle">
        <Link
          href="/wallet/payouts"
          className="pressable flex min-h-[52px] items-center gap-3 text-left"
        >
          <span className="flex h-11 w-9 shrink-0 items-center text-text-secondary">
            <Icon name="store" size={18} />
          </span>
          <span className="flex-1 text-body-emphasis text-text-primary">Payout methods</span>
          <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
        </Link>
        <Link
          href="/wallet/history"
          className="pressable flex min-h-[52px] items-center gap-3 border-t border-border-subtle text-left"
        >
          <span className="flex h-11 w-9 shrink-0 items-center text-text-secondary">
            <Icon name="receipt" size={18} />
          </span>
          <span className="flex-1 text-body-emphasis text-text-primary">Full activity</span>
          <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
        </Link>
      </nav>
    </section>
  );
}
