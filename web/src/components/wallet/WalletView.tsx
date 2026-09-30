'use client';

/**
 * Wallet surface — flagship desktop/mobile orchestrator.
 * Follows FAANG / Polymarket / Depop quality standards:
 *  - Left rail: Balance Hero with Privacy Eye toggle & USD context,
 *    quick actions, sub-balance hold breakdown (withdrawable vs reserved),
 *    seller liquidity strip, multi-currency accounts, Co-Own portfolio,
 *    and FCA safeguarding disclosures.
 *  - Right rail: Interactive recent activity center with instant search,
 *    category filter chips, month-grouped ledger, and click-to-inspect
 *    receipt drawer.
 * Pure composition, strict flat canvas + hairline borders, Anti-AI design.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { WalletBalanceHero } from './WalletBalanceHero';
import { AddMoneySheet } from './AddMoneySheet';
import { TransactionDetailDrawer } from './TransactionDetailDrawer';
import { WalletSubBalanceSection } from './WalletSubBalanceSection';
import { WalletCurrencyPockets } from './WalletCurrencyPockets';
import { walletKeys } from './walletKeys';
import { WalletSellerEarningsStrip } from './WalletSellerEarningsStrip';
import { WalletCoOwnPortfolio } from './WalletCoOwnPortfolio';
import { WalletDisclosureSection } from './WalletDisclosureSection';
import { useWalletData } from './useWalletData';
import { buildLedger, type WalletLedgerEntry, type LedgerFilter } from './ledgerViewModel';
import { EmptyState } from '@/components/ui/EmptyState';
import { StateGate } from '@/components/flagship/StateGate';
import { DATA_MODE } from '@/lib/api/client';
import { useSession } from '@/lib/session/SessionProvider';
import { WalletSkeleton } from './hub/WalletSkeleton';
import { WalletLiquidityAccounts } from './hub/WalletLiquidityAccounts';
import { WalletActivityHub } from './hub/WalletActivityHub';

const TOP_UP_AVAILABLE = DATA_MODE !== 'live';
const CONVERT_AVAILABLE = DATA_MODE !== 'live';
const PREVIEW_ROWS_LG = 10;

export function WalletView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isGuest, sessionLoading, user } = useSession();
  const { data, isLoading, isError, refetch } = useWalletData();

  // Wallet-level refresh — re-reads the balance snapshot and the currency
  // pockets in one gesture.
  const handleWalletRefresh = () => {
    void refetch();
    void queryClient.invalidateQueries({
      queryKey: walletKeys.currencyBalances(user?.id),
    });
  };

  // ── Privacy eye state with localStorage persistence ──
  const [balanceHidden, setBalanceHidden] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('thryftverse.wallet.privacy') === 'true';
    } catch {
      return false;
    }
  });

  const handleTogglePrivacy = () => {
    setBalanceHidden((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('thryftverse.wallet.privacy', String(next));
      } catch {}
      return next;
    });
  };

  const [addMoneyOpen, setAddMoneyOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<WalletLedgerEntry | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

  // ── Quick activity filter & search ──
  const [activityFilter, setActivityFilter] = useState<LedgerFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const rawLedger = useMemo(() => {
    if (!data) return [];
    return buildLedger(data.session, data.available, data.transactions);
  }, [data]);

  const filteredLedger = useMemo(() => {
    let result = rawLedger;
    if (activityFilter !== 'all') {
      result = result.filter((e) => e.kind === activityFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (e) =>
          e.description.toLowerCase().includes(q) ||
          e.amount.toString().includes(q) ||
          e.kind.toLowerCase().includes(q),
      );
    }
    return result;
  }, [rawLedger, activityFilter, searchQuery]);

  const previewEntries = useMemo(() => {
    return filteredLedger.slice(0, PREVIEW_ROWS_LG);
  }, [filteredLedger]);

  const handleSelectEntry = (entry: WalletLedgerEntry) => {
    setSelectedEntry(entry);
    setDetailDrawerOpen(true);
  };

  if (sessionLoading || isLoading) return <WalletSkeleton />;

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

  if (isError || !data || data.balanceError) {
    return (
      <StateGate
        domain="wallet"
        isLoading={false}
        isError
        onRetry={handleWalletRefresh}
      >
        {null}
      </StateGate>
    );
  }

  const isEmpty = data.available === 0 && data.pending === 0 && rawLedger.length === 0;

  if (isEmpty) {
    return (
      <>
        <EmptyState
          icon="wallet"
          title="No balance yet"
          subtitle={
            TOP_UP_AVAILABLE
              ? 'Money from your sales lands here. Add money to check out faster.'
              : 'Money from your sales lands here.'
          }
          actionLabel={TOP_UP_AVAILABLE ? 'Add money' : undefined}
          onAction={TOP_UP_AVAILABLE ? () => setAddMoneyOpen(true) : undefined}
        />
        {TOP_UP_AVAILABLE ? (
          <AddMoneySheet
            open={addMoneyOpen}
            onClose={() => setAddMoneyOpen(false)}
            currency={data.currency}
          />
        ) : null}
      </>
    );
  }

  // Derive sub-balances
  const subBalances = {
    withdrawableGbp: data.available,
    pendingProceedsGbp: data.pending,
    pendingOrders: data.pendingBreakdown,
    heldInReserveGbp: data.heldInReserve,
    payoutInFlightGbp: data.pendingWithdrawalGbp,
    ize: data.ize
      ? {
          available: data.ize.available,
          reservedForOrders: data.ize.reserved,
          redemptionInProgress: data.ize.redemptionInProgress,
          pendingDeposit: data.ize.pendingDeposit,
          unsettledSaleProceeds: data.ize.unsettledSaleProceeds,
          otherHolds: data.ize.otherHolds,
        }
      : null,
  };

  return (
    <>
      <div className="lg:grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-x-12 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:gap-x-16">
        {/* LEFT COLUMN: Financial Command Center */}
        <div className="min-w-0">
          <WalletBalanceHero
            available={data.available}
            pending={data.pending}
            currency={data.currency}
            balanceHidden={balanceHidden}
            onTogglePrivacy={handleTogglePrivacy}
            onWithdraw={() => router.push('/wallet/withdraw')}
            onTopUp={TOP_UP_AVAILABLE ? () => setAddMoneyOpen(true) : undefined}
            onConvert={CONVERT_AVAILABLE ? () => router.push('/wallet/convert') : undefined}
          />

          <WalletSubBalanceSection
            balances={subBalances}
            currency={data.currency}
            balanceHidden={balanceHidden}
          />

          <WalletSellerEarningsStrip
            available={data.available}
            pending={data.pending}
            currency={data.currency}
            balanceHidden={balanceHidden}
          />

          <WalletLiquidityAccounts
            available={data.available}
            currency={data.currency}
            ize={data.ize}
            balanceHidden={balanceHidden}
            convertAvailable={CONVERT_AVAILABLE}
            onRefresh={handleWalletRefresh}
          />

          <WalletCurrencyPockets balanceHidden={balanceHidden} />
          <WalletCoOwnPortfolio balanceHidden={balanceHidden} />

          <WalletDisclosureSection
            currencyCode={data.currency}
            safeguarded={data.ize ? data.ize.safeguarded : undefined}
            safeguardingPartner={data.ize?.safeguardingPartner ?? null}
            safeguardingEvidenceUrl={data.ize?.safeguardingEvidenceUrl ?? null}
            safeguardingTermsUrl={data.ize?.safeguardingTermsUrl ?? null}
            reconciliationState={data.ize?.reconciliationState ?? null}
          />
        </div>

        {/* RIGHT COLUMN: Interactive Activity Hub */}
        <WalletActivityHub
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activityFilter={activityFilter}
          onFilterChange={setActivityFilter}
          previewEntries={previewEntries}
          onSelectEntry={handleSelectEntry}
        />
      </div>

      {TOP_UP_AVAILABLE ? (
        <AddMoneySheet
          open={addMoneyOpen}
          onClose={() => setAddMoneyOpen(false)}
          currency={data.currency}
        />
      ) : null}

      <TransactionDetailDrawer
        entry={selectedEntry}
        open={detailDrawerOpen}
        onClose={() => setDetailDrawerOpen(false)}
      />
    </>
  );
}
