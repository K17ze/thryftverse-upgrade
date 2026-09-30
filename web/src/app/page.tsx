'use client';

/**
 * Home — port of HomeScreen, in the mobile module order: the sticky
 * control bar leads (For you / Following tabs + signal chip rail + the
 * refresh affordance), then the poster story rail, then the authored
 * feed — a product rail, denser masonry, and quiet editorial/members
 * breaks interleaved.
 *
 * Serve truth: signed-in live mode calls GET /recommendations/:userId
 * (server-ranked, reason codes + serve attribution); guests and fixture
 * mode render the baseline feed. Signal chips derive from real signals —
 * serve facets, intent topics, wishlist affinity — with the curated
 * baseline only where it matches feed content.
 */

import { StoryRail } from '@/components/feed/StoryRail';
import { FeedControlsProvider } from '@/components/feed/FeedControls';
import { HomeFeed } from '@/components/home/HomeFeed';
import { EntryBand } from '@/components/home/modules/EntryBand';
import { HomeControlBar } from '@/components/home/HomeControlBar';
import { NewDropsPill } from '@/components/home/NewDropsPill';
import { BackToTop } from '@/components/home/BackToTop';
import { useHomeFeedWorkflow } from '@/components/home/useHomeFeedWorkflow';

export default function HomePage() {
  const {
    columns,
    mode,
    setMode,
    signal,
    setSignal,
    newDrops,
    setNewDrops,
    signalChips,
    followingCount,
    feedSource,
    metaByListing,
    firstPage,
    followingLive,
    units,
    activeFeed,
    loadMore,
    isInitialLoad,
    fatalError,
    refreshFailed,
    loadMoreError,
    isRefreshing,
    emptyConfig,
  } = useHomeFeedWorkflow();

  return (
    <div className="mx-auto max-w-[1440px]">
      <HomeControlBar
        mode={mode}
        onSelectMode={setMode}
        followingCount={followingCount}
        signalChips={signalChips}
        activeSignal={signal}
        onSelectSignal={setSignal}
        onRefresh={() => {
          setNewDrops(0);
          void activeFeed.refetch();
        }}
        isRefreshing={isRefreshing}
      />

      <NewDropsPill
        newDrops={newDrops}
        onDismiss={() => setNewDrops(0)}
      />

      <StoryRail />

      <EntryBand />

      <FeedControlsProvider
        source={feedSource}
        metaByListing={followingLive ? {} : metaByListing}
        requestId={followingLive ? null : (firstPage?.requestId ?? null)}
        policyVersion={followingLive ? null : (firstPage?.policyVersion ?? null)}
        serveMode={followingLive ? null : (firstPage?.serveMode ?? null)}
        surface="home_feed"
      >
        <HomeFeed
          units={units}
          columns={columns}
          isLoading={isInitialLoad}
          isError={fatalError}
          onRetry={() => void activeFeed.refetch()}
          refreshError={refreshFailed}
          onRefreshRetry={() => void activeFeed.refetch()}
          hasMore={activeFeed.hasNextPage === true}
          isLoadingMore={activeFeed.isFetchingNextPage}
          loadMoreError={loadMoreError}
          onLoadMore={loadMore}
          empty={emptyConfig}
        />
      </FeedControlsProvider>

      <BackToTop />
    </div>
  );
}
