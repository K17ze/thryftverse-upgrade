'use client';

/**
 * Wallet surface — orchestrator. Balance hero + a three-row recent-activity
 * preview over the canonical ledger (same build as /wallet/history, so the
 * preview and the history page never disagree). Skeleton mirrors final
 * geometry; empty state is a real state (zero balance, zero activity).
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { WalletBalanceHero } from './WalletBalanceHero';
import { LedgerRow } from './LedgerList';
import { TopUpSheet } from './WalletSheets';
import { useWalletData } from './useWalletData';
import { buildLedger } from './ledgerViewModel';
import { formatIze } from './convertViewModel';
import { formatPrice } from '@/lib/utils/format';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StateGate } from '@/components/flagship/StateGate';
import { DATA_MODE } from '@/lib/api/client';
import { useSession } from '@/lib/session/SessionProvider';

// Top-up is a fixture-mode demo — no endpoint exists, so live mode hides it.
const TOP_UP_AVAILABLE = DATA_MODE !== 'live';
// Conversion is hidden in live the same way — ConvertView renders the
// honest capability notice; the entry points simply don't promise it.
const CONVERT_AVAILABLE = DATA_MODE !== 'live';

const PREVIEW_ROWS = 3;

function WalletSkeleton() {
  return (
    <div aria-busy aria-label="Loading wallet">
      <div className="px-4 pt-8 sm:px-6 md:pt-12">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-4 h-12 w-56" />
        <Skeleton className="mt-4 h-5 w-72" />
        <div className="mt-6 grid grid-cols-3 gap-2">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      </div>
      <div className="mt-12 px-4 sm:px-6">
        <Skeleton className="h-6 w-36" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3.5 border-b border-border-subtle py-4">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-4 flex-1" style={{ maxWidth: `${55 - i * 8}%` }} />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function WalletView() {
  const router = useRouter();
  const { isGuest, sessionLoading } = useSession();
  const { data, isLoading, isError, refetch } = useWalletData();
  const [topUpOpen, setTopUpOpen] = useState(false);

  const recent = useMemo(() => {
    if (!data) return [];
    // Live mode renders the real fetched rows; fixture mode ignores them
    // and reconstructs the statement from the commerce seed.
    return buildLedger(data.session, data.available, data.transactions).slice(0, PREVIEW_ROWS);
  }, [data]);

  if (sessionLoading || isLoading) return <WalletSkeleton />;

  // The wallet is account-bound — guests get a sign-in prompt, never the
  // fixture balance that belongs to the demo identity.
  if (isGuest) {
    return (
      <EmptyState
        icon="wallet"
        title="Sign in to see your wallet"
        subtitle="Your balance, payouts and activity live behind your account."
        actionLabel="Sign in"
        onAction={() => router.push('/auth')}
      />
    );
  }

  // Registry copy via StateGate — offline reads "You're offline" with the
  // wallet offline line rather than a generic failure. The zero-balance
  // state below stays bespoke (it carries the top-up affordance).
  if (isError || !data) {
    return (
      <StateGate
        domain="wallet"
        isLoading={false}
        isError
        onRetry={() => void refetch()}
      >
        {null}
      </StateGate>
    );
  }

  const isEmpty = data.available === 0 && data.pending === 0 && recent.length === 0;

  if (isEmpty) {
    return (
      <>
        <EmptyState
          icon="wallet"
          title="No balance yet"
          subtitle={
            TOP_UP_AVAILABLE
              ? 'Money from your sales lands here. Top up to check out faster.'
              : 'Money from your sales lands here.'
          }
          actionLabel={TOP_UP_AVAILABLE ? 'Top up' : undefined}
          onAction={TOP_UP_AVAILABLE ? () => setTopUpOpen(true) : undefined}
        />
        {TOP_UP_AVAILABLE ? (
          <TopUpSheet open={topUpOpen} onClose={() => setTopUpOpen(false)} currency={data.currency} />
        ) : null}
      </>
    );
  }

  return (
    <>
      <WalletBalanceHero
        available={data.available}
        pending={data.pending}
        currency={data.currency}
        onWithdraw={() => router.push('/wallet/withdraw')}
        onTopUp={TOP_UP_AVAILABLE ? () => setTopUpOpen(true) : undefined}
        onConvert={CONVERT_AVAILABLE ? () => router.push('/wallet/convert') : undefined}
      />

      {/* Currency pockets — mirrors mobile WalletCurrencyBalances: fiat
          pocket first, the 1ZE co-own pocket second. Same hairline grammar,
          Convert rides the section header. */}
      <section aria-label="Balances" className="mt-8 px-4 sm:px-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
            Balances
          </h2>
          {CONVERT_AVAILABLE ? (
            <Link
              href="/wallet/convert"
              className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
            >
              Convert
            </Link>
          ) : null}
        </div>
        <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
          <li className="flex items-baseline justify-between gap-4 py-3">
            <span className="text-body text-text-secondary">British pound · GBP</span>
            <span className="text-body font-semibold text-text-primary tnum">
              {formatPrice(data.available, data.currency)}
            </span>
          </li>
          {/* The 1ZE pocket renders only when a real balance was read —
              in live mode a failed position lookup stays absent rather
              than showing the demo pocket as the user's credit. */}
          {data.ize ? (
            <li className="py-3">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-body text-text-secondary">Thryft credit · 1ZE</span>
                <span className="text-body font-semibold text-text-primary tnum">
                  {formatIze(data.ize.settled)} 1ZE
                </span>
              </div>
              {data.ize.pending > 0 || data.ize.reserved > 0 ? (
                <p className="mt-0.5 text-right text-meta text-text-muted tnum">
                  {data.ize.pending > 0 ? `${formatIze(data.ize.pending)} pending` : ''}
                  {data.ize.pending > 0 && data.ize.reserved > 0 ? ' · ' : ''}
                  {data.ize.reserved > 0 ? `${formatIze(data.ize.reserved)} held for open orders` : ''}
                </p>
              ) : null}
            </li>
          ) : null}
        </ul>
      </section>

      <section aria-label="Recent activity" className="mt-10">
        <div className="flex items-baseline justify-between px-4 sm:px-6">
          <h2 className="text-section-title font-semibold text-text-primary">Recent activity</h2>
          <Link
            href="/wallet/history"
            className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
          >
            View all
          </Link>
        </div>
        {recent.length > 0 ? (
          <ul className="mt-2 divide-y divide-border-subtle border-t border-border-subtle">
            {recent.map((entry) => (
              <LedgerRow key={entry.id} entry={entry} />
            ))}
          </ul>
        ) : (
          <p className="mt-3 px-4 text-body text-text-secondary sm:px-6">
            Your sales, purchases and withdrawals will appear here.
          </p>
        )}
      </section>

      {TOP_UP_AVAILABLE ? (
        <TopUpSheet open={topUpOpen} onClose={() => setTopUpOpen(false)} currency={data.currency} />
      ) : null}
    </>
  );
}
