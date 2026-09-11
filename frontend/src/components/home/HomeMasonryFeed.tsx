import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Reanimated, {
  useAnimatedStyle,
  type SharedValue } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { HomeDiscoveryCard } from '../discover/HomeDiscoveryCard';
import type { HomeDiscoveryItemVM } from '../../presentation/homeDiscoveryViewModel';
import { HomeLookBreak } from './HomeLookBreak';

/**
 * Look feed marker — an authored interruption rail of Looks interspersed
 * into the product grid based on real content semantics (not a flat list).
 * Carries the resolved Look thumbnails so the FlashList can render the rail
 * inline without re-fetching.
 */
export interface LookFeedMarker {
  id: string;
  type: 'looks';
  looks: Array<{
    id: string;
    mediaUri: string;
    title?: string;
    sellerUsername?: string;
    sellerAvatar?: string;
    taggedCount?: number;
  }>;
}

export type FeedDataItem = HomeDiscoveryItemVM | LookFeedMarker;

export function isLookMarker(item: FeedDataItem): item is LookFeedMarker {
  return (item as LookFeedMarker).type === 'looks';
}

export function extractFeedImageUri(item: FeedDataItem): string | null {
  if (isLookMarker(item)) {
    return item.looks[0]?.mediaUri ?? null;
  }
  return item.media.posterUri || item.media.uri || null;
}

// Design.md Component B: 8pt gutters for dense media/discovery surfaces.
const GRID_GAP = Space.sm;

// On web: use plain FlashList (Reanimated 4.x crashes with createAnimatedComponent
// on web — issue #9266). LIST_RENDERING_POLICY.md §2.5 web fallback.
const AnimatedFlashList: any = Platform.OS === 'web'
  ? FlashList
  : Reanimated.createAnimatedComponent(FlashList) as unknown as React.ComponentClass<
      React.ComponentProps<typeof FlashList<FeedDataItem>> & { ref?: React.Ref<any> }
    >;

export interface HomeMasonryFeedProps {
  feedOpacity: SharedValue<number>;
  data: FeedDataItem[];
  contentContainerStyle: import('react-native').StyleProp<import('react-native').ViewStyle>;
  onScroll: any;
  scrollEventThrottle?: number;
  viewabilityConfig?: any;
  onViewableItemsChanged?: (info: { changed: import('react-native').ViewToken[]; viewableItems: import('react-native').ViewToken[] }) => void;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  ListHeaderComponent?: React.ReactNode;
  ListFooterComponent?: React.ReactNode;
  refreshControl?: React.ReactNode;
  gridTileWidth: number;
  windowWidth: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formatPrice: (...args: any[]) => string;
  onTilePress: (routeId: string | undefined) => void;
  onTileLongPress: (item: HomeDiscoveryItemVM) => void;
  activePlaybackIndex: number;
}

export const HomeMasonryFeed = React.forwardRef<any, HomeMasonryFeedProps>(function HomeMasonryFeed({
  feedOpacity,
  data,
  contentContainerStyle,
  onScroll,
  scrollEventThrottle = 16,
  viewabilityConfig,
  onViewableItemsChanged,
  onEndReached,
  onEndReachedThreshold = 0.5,
  ListHeaderComponent,
  ListFooterComponent,
  refreshControl,
  gridTileWidth,
  windowWidth,
  formatPrice,
  onTilePress,
  onTileLongPress,
  activePlaybackIndex }, ref) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const feedOpacityStyle = useAnimatedStyle(() => ({
    opacity: feedOpacity.value }));

  // FlashList v2 performance: getItemType for heterogeneous row recycling.
  const getItemType = React.useCallback(
    (item: FeedDataItem) => (isLookMarker(item) ? 'looks' : 'listing'),
    [],
  );

  // FlashList v2 performance: memoized renderItem prevents full re-render of
  // all visible items on every parent state change.
  const renderFeedItem = React.useCallback(
    ({ item, index }: { item: FeedDataItem; index: number }) => {
      if (isLookMarker(item)) {
        return <HomeLookBreak looks={item.looks} windowWidth={windowWidth} />;
      }
      // Featured tiles span both columns — pass the full row width so the
      // media and identity/price scale up for the editorial rhythm break.
      const tileWidth = item.featured
        ? Math.floor(windowWidth - Space.sm * 2)
        : gridTileWidth;
      return (
        <View style={styles.flashListItem}>
          <HomeDiscoveryCard
            item={item}
            tileWidth={tileWidth}
            formatPrice={formatPrice}
            onPress={onTilePress}
            onLongPress={onTileLongPress}
            shouldPlay={activePlaybackIndex === index}
          />
        </View>
      );
    },
    [gridTileWidth, windowWidth, formatPrice, onTilePress, onTileLongPress, activePlaybackIndex, styles.flashListItem],
  );

  return (
    <Reanimated.View testID="home-feed-container" style={[styles.feedShell, feedOpacityStyle]}>
      <AnimatedFlashList
        ref={ref}
        data={data}
        masonry
        numColumns={2}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={contentContainerStyle}
        onScroll={onScroll}
        scrollEventThrottle={scrollEventThrottle}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        onEndReached={onEndReached}
        onEndReachedThreshold={onEndReachedThreshold}
        keyExtractor={(item: FeedDataItem) => item.id}
        getItemType={getItemType}
        renderItem={renderFeedItem}
        overrideItemLayout={(layout: { span?: number }, item: FeedDataItem) => {
          // Featured tiles and looks rail span both columns
          if (isLookMarker(item)) {
            layout.span = 2;
          } else {
            layout.span = item.featured ? 2 : 1;
          }
        }}
        ListHeaderComponent={ListHeaderComponent}
        ListFooterComponent={ListFooterComponent}
        refreshControl={refreshControl}
      />
    </Reanimated.View>
  );
});

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  feedShell: {
    flex: 1 },
  flashListItem: {
    paddingHorizontal: Space.xs,
    paddingBottom: GRID_GAP },
});
