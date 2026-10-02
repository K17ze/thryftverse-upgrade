'use client';

/**
 * Home — port of HomeScreen, in the mobile module order: the sticky
 * control bar leads (For you / Following tabs + signal chip rail + the
 * refresh affordance), then the poster story rail, then the "Start here"
 * entry band — the single lead shelf, so the first viewport is chrome →
 * one dominant media rail → grid — then the authored feed where every
 * other shelf (fresh drops, recently viewed, looks, member edits,
 * sellers, Galleria) interleaves between masonry chunks. On ≥lg the
 * story rail demotes into the feed (the break after the first masonry
 * chunk) — an IG-story strip heading a desktop page reads as stretched
 * mobile chrome.
 *
 * Serve truth: signed-in live mode calls GET /recommendations/:userId
 * (server-ranked, reason codes + serve attribution); guests and fixture
 * mode render the baseline feed. Signal chips derive from real signals —
 * serve facets, intent topics, wishlist affinity — with the curated
 * baseline only where it matches feed content.
 */

import { useId } from 'react';
import { StoryRail } from '@/components/feed/StoryRail';
import { FeedControlsProvider } from '@/components/feed/FeedControls';
import { useMediaQuery } from '@/components/filters/useMediaQuery';
import { HomeFeed } from '@/components/home/HomeFeed';
import { EntryBand } from '@/components/home/modules/EntryBand';
import { HomeControlBar } from '@/components/home/HomeControlBar';
import { NewDropsPill } from '@/components/home/NewDropsPill';
import { BackToTop } from '@/components/home/BackToTop';
import { useHomeFeedWorkflow } from '@/components/home/useHomeFeedWorkflow';
import { tabId, tabPanelId } from '@/components/ui/Tabs';

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

  // ≥lg composition — the rail moves inside the feed (HomeFeed owns the
  // slot). useSyncExternalStore-backed, so the desktop order corrects
  // during the hydration commit — no post-paint shuffle, and the DOM
  // order always matches the visual order (tab/SR sequence stays honest).
  const desktopRail = useMediaQuery('(min-width: 1024px)');
  // Tab↔panel pairing base — the feed-mode tabs own the feed below.
  const tabsId = useId();

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
        idBase={tabsId}
      />

      <NewDropsPill
        newDrops={newDrops}
        onDismiss={() => setNewDrops(0)}
      />

      {desktopRail ? null : <StoryRail />}

      <EntryBand />

      {/* The feed is the mode tablist's panel — For you / Following swap
          the whole region. */}
      <div
        role="tabpanel"
        id={tabPanelId(tabsId, mode)}
        aria-labelledby={tabId(tabsId, mode)}
      >
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
          storyRail={desktopRail ? <StoryRail /> : undefined}
        />
      </FeedControlsProvider>
      </div>

      <BackToTop />
    </div>
  );
}
