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
import { PAYOUT_ACCOUNTS } from '@/lib/data/fixtures';
import { usePayoutAccounts } from './withdraw/usePayoutAccounts';
import { useHydrated } from '@/lib/store/useStore';

interface WalletBalanceHeroProps {
  available: number;
  pending: number;
  currency: string;
  onWithdraw: () => void;
  onTopUp: () => void;
  onConvert: () => void;
}

export function WalletBalanceHero({
  available,
  pending,
  currency,
  onWithdraw,
  onTopUp,
  onConvert,
}: WalletBalanceHeroProps) {
  const hydrated = useHydrated();
  const { defaultAccount } = usePayoutAccounts();
  // SSR renders the fixture default; the persisted truth takes over on mount.
  const seedDefault = PAYOUT_ACCOUNTS.find((a) => a.isDefault) ?? PAYOUT_ACCOUNTS[0] ?? null;
  const account = hydrated ? defaultAccount : seedDefault;

  return (
    <section aria-label="Balance" className="px-4 pt-8 sm:px-6 md:pt-12">
      <p className="text-label font-semibold uppercase tracking-wider text-text-muted">
        Available balance
      </p>
      <p className="tnum mt-2 text-display-large font-bold tracking-tight text-text-primary">
        {formatPrice(available, currency)}
      </p>
      <p className="mt-2 flex items-center gap-1.5 text-caption text-text-muted">
        <Icon name="card" size={14} className="shrink-0" />
        {account ? (
          <span>
            {account.bankName} •••• {account.last4}
            <span aria-hidden="true" className="mx-1.5">·</span>
            {currency} account
          </span>
        ) : (
          <span>No payout account yet</span>
        )}
      </p>

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
      <div className="mt-6 grid grid-cols-3 gap-2" role="group" aria-label="Quick actions">
        <button
          type="button"
          onClick={onTopUp}
          className="pressable flex h-11 items-center justify-center gap-1.5 rounded-md bg-brand font-semibold text-text-inverse"
        >
          <Icon name="plus" size={20} />
          <span className="text-meta">Add money</span>
        </button>
        <button
          type="button"
          onClick={onWithdraw}
          className="pressable flex h-11 items-center justify-center gap-1.5 rounded-md border border-border font-semibold text-text-primary"
        >
          <Icon name="payout" size={20} />
          <span className="text-meta">Withdraw</span>
        </button>
        <button
          type="button"
          onClick={onConvert}
          className="pressable flex h-11 items-center justify-center gap-1.5 rounded-md border border-border font-semibold text-text-primary"
        >
          <Icon name="sort" size={20} />
          <span className="text-meta">Convert</span>
        </button>
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
