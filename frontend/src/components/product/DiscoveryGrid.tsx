import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { Listing } from '../../domain';
import { ProductCard } from '../ProductCard';
import { ProductAnalytics } from '../../platform/product';

export interface DiscoveryGridProps {
  items: Listing[];
  listingId: string;
  onPressItem: (item: Listing) => void;
  onEndReached?: () => void;
  hasMore?: boolean;
  numColumns?: number;
  title?: string;
  subtitle?: string;
  /** Optional "See all" affordance — only render when a real destination exists. */
  onSeeAll?: () => void;
}

export function DiscoveryGrid({
  items,
  listingId,
  onPressItem,
  onEndReached,
  hasMore,
  numColumns = 2,
  title = 'More like this',
  subtitle,
  onSeeAll }: DiscoveryGridProps) {
  const { colors } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Image resolution policy: compute the pixel width of each grid tile so
  // CachedImage can downscale CDN images for thumbnails. This avoids
  // downloading full-resolution images for small grid tiles.
  // (LIST_RENDERING_POLICY.md §5.1 / audit §Caching/prefetch)
  const tileDownscaleWidth = Math.round(
    (screenWidth - Space.md * (numColumns + 1)) / numColumns,
  );

  const handlePress = useCallback(
    (item: Listing, index: number) => {
      ProductAnalytics.recommendationClick(listingId, 'continue_exploring', index);
      onPressItem(item);
    },
    [listingId, onPressItem]
  );

  // FlashList v2 performance: memoized renderItem prevents full re-render of
  // all visible items on every parent state change.
  // (Audit §FlashList v2 / LIST_RENDERING_POLICY.md §3.1)
  const renderItem = useCallback(
    ({ item, index }: { item: Listing; index: number }) => (
      <View style={styles.gridItem}>
        <ProductCard
          item={item}
          onPress={() => handlePress(item, index)}
          showSaveButton
          enableEntranceAnimation={false}
          downscaleWidth={tileDownscaleWidth}
        />
      </View>
    ),
    [styles, handlePress, tileDownscaleWidth],
  );

  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {onSeeAll && items.length > 3 ? (
          <Pressable
            onPress={onSeeAll}
            hitSlop={8}
            accessibilityLabel={`See all in ${title}`}
            accessibilityRole="button"
          >
            <View style={styles.seeAllRow}>
              <Text style={styles.seeAll}>See all</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </View>
          </Pressable>
        ) : null}
      </View>
      <FlashList
        data={items}
        numColumns={numColumns}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: Space.sm }} />}
        onEndReached={() => {
          if (onEndReached && hasMore) onEndReached();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          hasMore ? (
            <View style={styles.footerLoading}>
              <ActivityIndicator size="small" color={colors.textMuted} />
            </View>
          ) : null
        }
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    marginTop: Space.lg,
    paddingHorizontal: Space.md },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Space.sm },
  headerLeft: {
    flex: 1,
    minWidth: 0 },
  title: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    color: colors.textPrimary },
  subtitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginTop: Space.xs },
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingTop: Space.xs },
  seeAll: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  listContent: {
    paddingBottom: Space.xl },
  gridItem: {
    flex: 1,
    paddingHorizontal: Space.xs },
  footerLoading: {
    paddingVertical: Space.lg,
    alignItems: 'center' } });
}
