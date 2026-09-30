'use client';

/**
 * /auctions — the auction hall. One canonical scope rail matching the
 * mobile hub: Live | Upcoming | Results | Watching. Live gets the
 * editorial composition (runway + supporting tiles + continuation grid),
 * upcoming is a scheduled programme, results a settled ledger, watching
 * the viewer's compact grid. A personal attention strip surfaces the one
 * auction that needs the viewer most (outbid > won > leading into the
 * close). Countdowns tick on the board's shared now-clock.
 */

import Link from 'next/link';
import { Tabs } from '@/components/ui/Tabs';
import { Icon } from '@/components/ui/Icon';
import { AuctionAttentionStrip } from '@/components/auctions';
import { AUCTION_SCOPES } from '@/components/auctions/hub/AuctionsHubPrimitives';
import { useAuctionsHubWorkflow } from '@/components/auctions/hub/useAuctionsHubWorkflow';
import { AuctionsFilterSortBar } from '@/components/auctions/hub/AuctionsFilterSortBar';
import { AuctionsContentArea } from '@/components/auctions/hub/AuctionsContentArea';

export default function AuctionsPage() {
  const {
    router,
    isGuest,
    hydrated,
    scope,
    setScope,
    selectedCategories,
    toggleCategory,
    facets,
    liveSort,
    setLiveSort,
    isLoading,
    isError,
    refetch,
    watchedBoard,
    viewerStatus,
    scoped,
    counts,
    attention,
  } = useAuctionsHubWorkflow();

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-screen-title text-text-primary">Auctions</h1>
          <p className="mt-1 text-body text-text-secondary">
            3–24h windows · proxy bidding · anti-snipe in the last two minutes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/auctions/my-bids"
            className="pressable inline-flex h-11 items-center gap-1.5 rounded-md px-4 text-body-emphasis font-medium text-text-primary hover:bg-brand-subtle"
          >
            My bids
          </Link>
          <Link
            href="/auctions/create"
            className="pressable inline-flex h-11 items-center gap-2 rounded-md bg-brand px-5 text-body-emphasis font-semibold text-text-inverse hover:bg-brand-pressed"
          >
            <Icon name="plus" size={18} />
            Create
          </Link>
        </div>
      </header>

      <Tabs
        className="-mx-4 mt-5 sm:-mx-6"
        railClassName="px-1 sm:px-3"
        tabs={AUCTION_SCOPES.map((s) => ({
          key: s.value,
          label: s.label,
          count: counts[s.value],
        }))}
        active={scope}
        onChange={setScope}
        ariaLabel="Auction scopes"
      />

      {/* Personal strip — the single auction asking for the viewer now */}
      {attention ? (
        <div className="mt-5">
          <AuctionAttentionStrip
            kind={attention.kind}
            auction={attention.auction}
            myBid={attention.myBid}
          />
        </div>
      ) : null}

      {/* Category filter & live sort controls */}
      <AuctionsFilterSortBar
        scope={scope}
        facets={facets}
        selectedCategories={selectedCategories}
        onToggleCategory={toggleCategory}
        isLoading={isLoading}
        isError={isError}
        scopedLength={scoped.length}
        liveSort={liveSort}
        onSelectLiveSort={setLiveSort}
      />

      {/* Main content area */}
      <AuctionsContentArea
        isLoading={isLoading}
        isError={isError}
        refetch={() => void refetch()}
        scope={scope}
        isGuest={isGuest}
        hydrated={hydrated}
        watchedBoard={watchedBoard}
        scoped={scoped}
        viewerStatus={viewerStatus}
        onNavigateAuth={() => router.push('/auth')}
        onNavigateCreate={() => router.push('/auctions/create')}
        onSwitchLiveScope={() => setScope('live')}
      />
    </div>
  );
}
