import React, { useRef, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  RefreshControl,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { useScrollToTop } from '@react-navigation/native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { RefreshIndicator } from '../../components/RefreshIndicator';
import { EmptyState } from '../../components/EmptyState';
import { MasonrySkeleton } from '../../components/skeletons/MasonrySkeleton';
import { PinterestMasonryGrid } from '../../components/discover/PinterestMasonryGrid';
import type { Listing } from '../../domain';

export interface DiscoverSceneProps {
  listings: Listing[];
  isSyncing: boolean;
  lastError: string | null;
  isLoadingMore: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onLoadMore: () => void;
  onPressItem: (item: Listing) => void;
  onPressSeller?: (item: Listing) => void;
  onMessageSeller?: (item: Listing) => void;
  onBrowseCategories: () => void;
}

/**
 * DiscoverScene owns the Discover feed's scroll surface.
 *
 * The parent (SearchScreen) still owns the data contracts via
 * BackendDataContext, but the scroll, refresh, pagination, loading,
 * empty and error states live here so that switching tabs preserves
 * the Discover scroll position independently of Pulse and Looks.
 */
export function DiscoverScene({
  listings,
  isSyncing,
  lastError,
  isLoadingMore,
  refreshing,
  onRefresh,
  onLoadMore,
  onPressItem,
  onPressSeller,
  onMessageSeller,
  onBrowseCategories,
}: DiscoverSceneProps) {
  const { colors } = useAppTheme();
  const scrollY = useSharedValue(0);
  const scrollRef = useRef<Reanimated.ScrollView>(null);
  // Track content size so we only trigger pagination once per threshold.
  const lastLoadMoreY = useRef(0);

  useScrollToTop(scrollRef);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        scrollContent: {
          paddingHorizontal: Space.md,
          paddingBottom: Space.xxl * 2 + Space.lg,
        },
        loadingWrap: { paddingHorizontal: Space.md, paddingTop: Space.sm },
        stateWrap: { flex: 1 },
        footer: { alignItems: 'center', paddingVertical: Space.lg },
      }),
    [colors],
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      const distanceFromBottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y;
      // Trigger pagination when within 400px of the end, debounced by a
      // minimum scroll delta to avoid duplicate calls.
      if (
        distanceFromBottom < 400 &&
        Math.abs(contentOffset.y - lastLoadMoreY.current) > 200 &&
        !isLoadingMore &&
        !isSyncing &&
        listings.length > 0
      ) {
        lastLoadMoreY.current = contentOffset.y;
        onLoadMore();
      }
    },
    [isLoadingMore, isSyncing, listings.length, onLoadMore],
  );

  const showLoadingSkeleton =
    isSyncing && listings.length === 0 && !lastError;
  const showError =
    lastError && listings.length === 0 && !isSyncing;
  const showEmpty =
    listings.length === 0 && !isSyncing && !lastError;

  return (
    <View style={styles.container}>
      <RefreshIndicator scrollY={scrollY} isRefreshing={refreshing} topInset={20} />

      <Reanimated.ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        onScrollBeginDrag={() => {
          // Reset pagination debounce anchor when a new gesture starts.
          lastLoadMoreY.current = 0;
        }}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="transparent"
            colors={['transparent']}
            progressBackgroundColor="transparent"
          />
        }
      >
        {showLoadingSkeleton ? (
          <View style={styles.loadingWrap}>
            <MasonrySkeleton itemCount={6} />
          </View>
        ) : showError ? (
          <View style={styles.stateWrap}>
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
        ) : showEmpty ? (
          <View style={styles.stateWrap}>
            <EmptyState
              density="compact"
              icon="compass-outline"
              title="Nothing to explore yet"
              subtitle="New items are uploaded every day. Check back soon or browse categories."
              ctaLabel="Browse Categories"
              onCtaPress={onBrowseCategories}
            />
          </View>
        ) : (
          <>
            <PinterestMasonryGrid
              items={listings}
              onPressItem={onPressItem}
              onPressSeller={onPressSeller}
              onMessageSeller={onMessageSeller}
              enableEntranceAnimation
            />
            {isLoadingMore ? (
              <View style={styles.footer}>
                <MasonrySkeleton itemCount={2} horizontalPadding={0} />
              </View>
            ) : null}
          </>
        )}

        <View style={styles.footer} />
      </Reanimated.ScrollView>
    </View>
  );
}
