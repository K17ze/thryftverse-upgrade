import React from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, DockConstants } from '../../theme/designTokens';
import type { ListingApiItem } from '../../services/listingsApi';
import type { LookApiItem } from '../../services/looksApi';
import type { SellerReviewItem } from '../../services/sellerReviewsApi';

// AnimatedFlashList crashes on web with Reanimated 4.x (issue #9266).
// Use plain FlashList on web; animated version on native for UI-thread perf.
const AnimatedFlashList: any = Platform.OS === 'web'
  ? FlashList
  : Reanimated.createAnimatedComponent(FlashList);

type ProfileListItem = ListingApiItem | LookApiItem | SellerReviewItem;

interface UserProfileListProps {
  listRef: React.MutableRefObject<any>;
  data: ProfileListItem[];
  renderItem: ({ item }: { item: ProfileListItem }) => React.ReactElement | null;
  header: React.ReactNode;
  emptyContent: React.ReactNode;
  numColumns: number;
  gridGap: number;
  cellWidth: number;
  currentDestination: string;
  reducedMotion: boolean;
  /** Animated worklet on native, plain JS handler on web (issue #9266). */
  scrollHandler: any;
  isRefreshing: boolean;
  isFetchingNextPage: boolean;
  onRefresh: () => void;
  onLoadMore: () => void;
  onContentSizeChange: () => void;
}

/**
 * Content list — cover scrolls naturally as first header item.
 * On native: FlashList for virtualization + recycling.
 * On web: ScrollView + map because FlashList v2 crashes on web
 * ("Changing onViewableItemsChanged on the fly is not supported"
 * - FlashList v2 internally passes a new callback to FlatList).
 */
export function UserProfileList({
  listRef,
  data,
  renderItem,
  header,
  emptyContent,
  numColumns,
  gridGap,
  cellWidth,
  currentDestination,
  reducedMotion,
  scrollHandler,
  isRefreshing,
  isFetchingNextPage,
  onRefresh,
  onLoadMore,
  onContentSizeChange,
}: UserProfileListProps) {
  const { colors } = useAppTheme();
  const MUTED = colors.textMuted;

  const listFooter = isFetchingNextPage ? (
    <View style={styles.loadMoreIndicator}><ActivityIndicator size="small" color={MUTED} /></View>
  ) : <View style={{ height: DockConstants.singleActionHeight }} />;

  if (Platform.OS === 'web') {
    return (
      <ScrollView
        ref={(r: any) => { if (r && listRef.current !== r) listRef.current = r; }}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler as any}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={MUTED} colors={[MUTED]} />}
        onContentSizeChange={onContentSizeChange}
      >
        {header}
        {emptyContent && (
          <Reanimated.View
            key={currentDestination}
            entering={reducedMotion ? undefined : FadeIn.duration(200)}
          >
            {emptyContent}
          </Reanimated.View>
        )}
        {data.length > 0 && (
          numColumns > 1 ? (
            <View style={{ paddingHorizontal: Space.md, flexDirection: 'row', flexWrap: 'wrap', gap: gridGap }}>
              {data.map((item, index) => {
                const rendered = renderItem({ item });
                return rendered ? <View key={(item as { id?: string }).id ?? `item-${index}`} style={{ width: cellWidth }}>{rendered}</View> : null;
              })}
            </View>
          ) : (
            <View>
              {data.map((item, index) => {
                const rendered = renderItem({ item });
                return rendered ? <View key={(item as { id?: string }).id ?? `item-${index}`}>{rendered}</View> : null;
              })}
            </View>
          )
        )}
        {listFooter}
      </ScrollView>
    );
  }

  return (
    <AnimatedFlashList
      ref={listRef}
      data={data}
      renderItem={renderItem}
      keyExtractor={(item: ProfileListItem, index: number) => (item as { id?: string }).id ?? `item-${index}`}
      ListHeaderComponent={header}
      ListEmptyComponent={emptyContent ? (
        <Reanimated.View
          key={currentDestination}
          entering={reducedMotion ? undefined : FadeIn.duration(200)}
        >
          {emptyContent}
        </Reanimated.View>
      ) : null}
      ListFooterComponent={listFooter}
      numColumns={numColumns}
      {...(numColumns > 1 ? { columnWrapperStyle: { paddingHorizontal: Space.md, gap: gridGap } } : {})}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.5}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={MUTED} colors={[MUTED]} />}
      key={`list-${currentDestination}`}
      onContentSizeChange={onContentSizeChange}
    />
  );
}

const styles = StyleSheet.create({
  loadMoreIndicator: { paddingVertical: Space.md, alignItems: 'center' },
});
