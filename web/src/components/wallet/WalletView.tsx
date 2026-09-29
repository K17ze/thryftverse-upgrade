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
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { WalletBalanceHero } from './WalletBalanceHero';
import { LedgerRow } from './LedgerList';
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
import { formatIze } from './convertViewModel';
import { formatPrice } from '@/lib/utils/format';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { Chip } from '@/components/ui/Chip';
import { StateGate } from '@/components/flagship/StateGate';
import { DATA_MODE } from '@/lib/api/client';
import { useSession } from '@/lib/session/SessionProvider';

const TOP_UP_AVAILABLE = DATA_MODE !== 'live';
const CONVERT_AVAILABLE = DATA_MODE !== 'live';

const PREVIEW_ROWS = 4;
const PREVIEW_ROWS_LG = 10;

const ACTIVITY_QUICK_FILTERS: { value: LedgerFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'sale', label: 'Sales' },
  { value: 'purchase', label: 'Purchases' },
  { value: 'topup', label: 'Deposits' },
  { value: 'withdrawal', label: 'Payouts' },
];

function WalletSkeleton() {
  return (
    <div aria-busy aria-label="Loading wallet">
      <div className="lg:grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-x-12 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:gap-x-16">
        <div>
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
          <div className="mt-8 px-4 sm:px-6">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-16 w-full" />
          </div>
          <div className="mt-8 px-4 sm:px-6">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-20 w-full" />
          </div>
        </div>
        <div className="mt-12 lg:mt-12">
          <div className="flex items-center justify-between px-4 sm:px-6">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="mt-4 flex gap-2 px-4 sm:px-6">
            <Skeleton className="h-8 w-16 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
          <div className="mt-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3.5 border-b border-border-subtle py-4">
                <Skeleton className="ml-4 h-9 w-9 rounded-full sm:ml-6" />
                <Skeleton className="h-4 flex-1" style={{ maxWidth: `${55 - i * 8}%` }} />
                <Skeleton className="mr-4 h-4 w-16 sm:mr-6" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WalletView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isGuest, sessionLoading, user } = useSession();
  const { data, isLoading, isError, refetch } = useWalletData();

  // Wallet-level refresh — re-reads the balance snapshot and the currency
  // pockets in one gesture. (Pockets already share walletKeys.root, so the
  // convert/withdraw/exchange root invalidations reach them too.)
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
    // A failed balance read renders error + retry — never a £0.00 collapse.
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

  // Derive sub-balances — GBP holds from the ledger-backed balances read,
  // 1ZE holds in 1ZE units straight off the position payload.
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

          {/* Sub-balance hold allocation (spec 17 parity) */}
          <WalletSubBalanceSection
            balances={subBalances}
            currency={data.currency}
            balanceHidden={balanceHidden}
          />

          {/* Seller liquidity operational strip */}
          <WalletSellerEarningsStrip
            available={data.available}
            pending={data.pending}
            currency={data.currency}
            balanceHidden={balanceHidden}
          />

          {/* Currency liquidity accounts */}
          <section aria-label="Balances" className="mt-8 px-4 sm:px-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
                Liquidity pockets
              </h2>
              <span className="flex items-baseline gap-4">
                <Link
                  href="/wallet/send"
                  className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
                >
                  Send
                </Link>
                <Link
                  href="/wallet/exchange"
                  className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
                >
                  Exchange
                </Link>
                {CONVERT_AVAILABLE ? (
                  <Link
                    href="/wallet/convert"
                    className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
                  >
                    Convert
                  </Link>
                ) : null}
              </span>
            </div>
            <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
              <li className="flex items-baseline justify-between gap-4 py-3">
                <div>
                  <span className="text-body font-medium text-text-primary">
                    British pound · GBP
                  </span>
                  <p className="text-meta text-text-muted">Primary settlement currency</p>
                </div>
                <span className="text-body font-semibold text-text-primary tnum">
                  {balanceHidden ? '••••••' : formatPrice(data.available, data.currency)}
                </span>
              </li>
              {data.ize ? (
                <li className="py-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <div>
                      <span className="text-body font-medium text-text-primary">
                        Thryft credit · 1ZE
                      </span>
                      <p className="text-meta text-text-muted">Co-Own &amp; checkout credits</p>
                    </div>
                    <span className="text-body font-semibold text-text-primary tnum">
                      {balanceHidden ? '••••••' : `${formatIze(data.ize.available)} 1ZE`}
                    </span>
                  </div>
                  {data.ize.pending > 0 || data.ize.reserved > 0 ? (
                    <p className="mt-1 text-right text-meta text-text-muted tnum">
                      {data.ize.pending > 0 ? `${formatIze(data.ize.pending)} pending` : ''}
                      {data.ize.pending > 0 && data.ize.reserved > 0 ? ' · ' : ''}
                      {data.ize.reserved > 0
                        ? `${formatIze(data.ize.reserved)} held for open orders`
                        : ''}
                    </p>
                  ) : null}
                </li>
              ) : (
                <li className="flex items-baseline justify-between gap-4 py-3">
                  <div>
                    <span className="text-body font-medium text-text-primary">
                      Thryft credit · 1ZE
                    </span>
                    <p className="text-meta text-text-muted">
                      Position unavailable — retry to load
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleWalletRefresh}
                    className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
                  >
                    Retry
                  </button>
                </li>
              )}
            </ul>
          </section>

          {/* Multi-currency pockets — ledger-backed fiat pockets (live
              mode only); absent when the default fiat pocket is the only
              funded one (the hero already carries it) */}
          <WalletCurrencyPockets balanceHidden={balanceHidden} />

          {/* Co-Own fractional asset holdings — real positions in live
              mode, authored demo in fixture mode */}
          <WalletCoOwnPortfolio balanceHidden={balanceHidden} />

          {/* Safeguarding disclosure — wire-backed flags only; unknown
              status renders as unknown, never as asserted */}
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
        <section aria-label="Activity hub" className="mt-10 lg:mt-10">
          <div className="flex items-baseline justify-between px-4 sm:px-6">
            <div>
              <h2 className="text-section-title font-semibold text-text-primary">
                Recent activity
              </h2>
              <p className="text-caption text-text-muted">
                Search and inspect transaction receipts
              </p>
            </div>
            <Link
              href="/wallet/history"
              className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
            >
              View full ledger →
            </Link>
          </div>

          {/* Search & Category Filter Controls */}
          <div className="mt-4 px-4 sm:px-6">
            <div className="relative flex items-center">
              <Icon
                name="search"
                size={16}
                className="pointer-events-none absolute left-3 text-text-muted"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search transactions by item or keyword…"
                className="h-10 w-full rounded-md border border-border bg-input pl-9 pr-3 text-caption text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="pressable absolute right-3 text-text-muted hover:text-text-primary"
                >
                  <Icon name="close" size={14} />
                </button>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter activity">
              {ACTIVITY_QUICK_FILTERS.map((f) => (
                <Chip
                  key={f.value}
                  selected={activityFilter === f.value}
                  onClick={() => setActivityFilter(f.value)}
                >
                  {f.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* Interactive Ledger Rows with Click-to-Inspect */}
          {previewEntries.length > 0 ? (
            <ul className="mt-4 divide-y divide-border-subtle border-t border-border-subtle">
              {previewEntries.map((entry, i) => (
                <LedgerRow
                  key={entry.id}
                  entry={entry}
                  desktopOnly={i >= PREVIEW_ROWS}
                  onSelect={handleSelectEntry}
                />
              ))}
            </ul>
          ) : (
            <div className="mt-8 px-4 py-8 text-center text-caption text-text-muted sm:px-6">
              <Icon name="search" size={24} className="mx-auto text-text-muted mb-2" />
              No transactions match &quot;{searchQuery}&quot;.
            </div>
          )}

          {/* Footer link to history for more */}
          <div className="mt-6 border-t border-border-subtle px-4 pt-4 sm:px-6">
            <Link
              href="/wallet/history"
              className="pressable inline-flex items-center gap-1.5 text-body-emphasis font-medium text-text-secondary hover:text-text-primary"
            >
              <span>Download official CSV &amp; statements</span>
              <Icon name="forward" size={15} />
            </Link>
          </div>
        </section>
      </div>

      {/* Add Money Multi-rail Modal */}
      {TOP_UP_AVAILABLE ? (
        <AddMoneySheet
          open={addMoneyOpen}
          onClose={() => setAddMoneyOpen(false)}
          currency={data.currency}
        />
      ) : null}

      {/* Transaction Detail Slide-Over Drawer */}
      <TransactionDetailDrawer
        entry={selectedEntry}
        open={detailDrawerOpen}
        onClose={() => setDetailDrawerOpen(false)}
      />
    </>
  );
}
