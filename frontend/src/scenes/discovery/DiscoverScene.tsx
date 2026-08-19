import React, { useRef, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  RefreshControl,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import {
  useSharedValue,
} from 'react-native-reanimated';
import { useScrollToTop } from '@react-navigation/native';
import { useAppTheme } from '../../theme/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Space } from '../../theme/designTokens';
import { RefreshIndicator } from '../../components/RefreshIndicator';
import { EmptyState } from '../../components/EmptyState';
import { PinterestMasonryGrid } from '../../components/discover/PinterestMasonryGrid';
import { assembleDiscoveryFeed } from '../../utils/discoveryFeedAssembly';
import type { Listing } from '../../domain';
import type { DiscoveryListingSummary } from '../../contracts/DiscoveryListingSummary';

const DISCOVER_NUM_COLUMNS = 2;

export interface DiscoverSceneProps {
  listings: Listing[];
  isSyncing: boolean;
  lastError: string | null;
  isLoadingMore: boolean;
  hasMore: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onLoadMore: () => void;
  /** Fired when a listing tile is tapped. Receives the production
   *  DiscoveryListingSummary carried by the listing feed unit. */
  onPressItem: (listing: DiscoveryListingSummary) => void;
  onPressSeller?: (listing: DiscoveryListingSummary) => void;
  onMessageSeller?: (listing: DiscoveryListingSummary) => void;
  onBrowseCategories: () => void;
}

/**
 * DiscoverScene owns the Discover feed's scroll surface.
 *
 * The FlashList (inside PinterestMasonryGrid) owns scrolling — this scene
 * must NOT wrap it in a ScrollView (that would break virtualization and
 * contradict the grid's own invariant). Refresh, pagination, scroll-to-top
 * and the custom RefreshIndicator are all driven from the FlashList's scroll
 * via an animated handler + forwarded ref.
 *
 * The feed is a heterogeneous `DiscoveryFeedUnit[]` canvas (listings +
 * full-width context breaks + hero listings), assembled from the raw
 * `Listing[]` by `assembleDiscoveryFeed`. Listings are one feed-unit type
 * among several — not the only renderable unit.
 */
export function DiscoverScene({
  listings,
  isSyncing,
  lastError,
  isLoadingMore,
  hasMore,
  refreshing,
  onRefresh,
  onLoadMore,
  onPressItem,
  onBrowseCategories,
}: DiscoverSceneProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const scrollY = useSharedValue(0);
  const scrollRef = useRef<any>(null);

  useScrollToTop(scrollRef);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        stateWrap: { flex: 1 },
      }),
    [colors],
  );

  // Assemble the heterogeneous feed units from the raw listings. This is the
  // single place where Discover's feed rhythm + span decisions are made, so
  // the grid stays a pure function of DiscoveryFeedUnit[]. Stable across
  // pagination: break positions are index-based and hero eligibility is
  // per-listing, so appending pages never reshuffles earlier units.
  const units = useMemo(
    () => assembleDiscoveryFeed(listings, DISCOVER_NUM_COLUMNS),
    [listings],
  );

  // Plain JS scroll handler drives the RefreshIndicator's shared scrollY
  // value from the FlashList's own scrolling — no enclosing ScrollView.
  //
  // Reanimated 4.x known issue: `useAnimatedScrollHandler` does NOT fire
  // scroll events from FlashList (the 3.12 fix was never backported to 4.x).
  // The proven workaround is a plain JS onScroll that sets the SharedValue's
  // `.value` directly. `RefreshIndicator` reads `scrollY.value` inside a
  // `useAnimatedStyle` worklet, which still runs on the UI thread — only the
  // event capture is JS-thread, which is the standard RN scroll path anyway.
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.value = e.nativeEvent.contentOffset.y;
    },
    [scrollY],
  );

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor="transparent"
        colors={['transparent']}
        progressBackgroundColor="transparent"
      />
    ),
    [refreshing, onRefresh],
  );

  const showLoadingSkeleton =
    isSyncing && listings.length === 0 && !lastError;
  const showError =
    lastError && listings.length === 0 && !isSyncing;
  const showEmpty =
    listings.length === 0 && !isSyncing && !lastError;

  // Error and empty states are authored here (with recovery CTAs) and render
  // as non-scrollable surfaces. The loading skeleton + populated feed are
  // owned by the grid (FlashList owns scrolling for those).
  if (showError) {
    return (
      <View style={[styles.container, styles.stateWrap]}>
        <EmptyState
          density="compact"
          icon="cloud-offline-outline"
          iconColor={colors.danger}
          title="Explore unavailable"
          subtitle="We couldn't load listings. Check your connection and try again."
          ctaLabel="Retry"
          onCtaPress={onRefresh}
        />
      </View>
    );
  }

  if (showEmpty) {
    return (
      <View style={[styles.container, styles.stateWrap]}>
        <EmptyState
          density="compact"
          icon="compass-outline"
          title="Nothing to explore yet"
          subtitle="New items are uploaded every day. Check back soon or browse categories."
          ctaLabel="Browse Categories"
          onCtaPress={onBrowseCategories}
        />
      </View>
    );
  }

  // Populated (or loading-skeleton) state: the FlashList owns scrolling.
  // The RefreshIndicator is positioned absolutely over the grid and reads
  // the shared scrollY driven by the animated scroll handler above.
  return (
    <View style={styles.container}>
      <RefreshIndicator scrollY={scrollY} isRefreshing={refreshing} topInset={20} />
      <PinterestMasonryGrid
        items={units}
        onItemPress={onPressItem}
        onEndReached={onLoadMore}
        isLoading={showLoadingSkeleton}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        numColumns={DISCOVER_NUM_COLUMNS}
        refreshControl={refreshControl}
        onScroll={handleScroll}
        scrollRef={scrollRef}
      />
    </View>
  );
}
