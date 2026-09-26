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
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

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
  const { data, isLoading, isError, refetch } = useWalletData();
  const [topUpOpen, setTopUpOpen] = useState(false);

  const recent = useMemo(() => {
    if (!data) return [];
    return buildLedger(data.session, data.available).slice(0, PREVIEW_ROWS);
  }, [data]);

  if (isLoading) return <WalletSkeleton />;

  if (isError || !data) {
    return (
      <EmptyState
        icon="wallet"
        title="Wallet unavailable"
        subtitle="We couldn't load your balance. Check your connection and try again."
        actionLabel="Retry"
        onAction={() => void refetch()}
      />
    );
  }

  const isEmpty = data.available === 0 && data.pending === 0 && recent.length === 0;

  if (isEmpty) {
    return (
      <>
        <EmptyState
          icon="wallet"
          title="No balance yet"
          subtitle="Money from your sales lands here. Top up to check out faster."
          actionLabel="Top up"
          onAction={() => setTopUpOpen(true)}
        />
        <TopUpSheet open={topUpOpen} onClose={() => setTopUpOpen(false)} currency={data.currency} />
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
        onTopUp={() => setTopUpOpen(true)}
        onConvert={() => router.push('/wallet/convert')}
      />

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

      <TopUpSheet open={topUpOpen} onClose={() => setTopUpOpen(false)} currency={data.currency} />
    </>
  );
}
