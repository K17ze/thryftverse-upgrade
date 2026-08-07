import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Space, Radius, Type } from '../../theme/designTokens';
import { Listing } from '../../data/mockData';
import { ProductCardV2 } from '../ProductCardV2';
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
  onSeeAll,
}: DiscoveryGridProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const handlePress = useCallback(
    (item: Listing, index: number) => {
      ProductAnalytics.recommendationClick(listingId, 'continue_exploring', index);
      onPressItem(item);
    },
    [listingId, onPressItem]
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
        renderItem={({ item, index }) => (
          <View style={styles.gridItem}>
            <ProductCardV2
              item={item}
              onPress={() => handlePress(item, index)}
              showSaveButton
              enableEntranceAnimation={false}
            />
          </View>
        )}
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
    paddingHorizontal: Space.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    marginTop: Space.xs,
  },
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingTop: Space.xs,
  },
  seeAll: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
  },
  listContent: {
    paddingBottom: Space.xl,
  },
  gridItem: {
    flex: 1,
    paddingHorizontal: Space.xs,
  },
  footerLoading: {
    paddingVertical: Space.lg,
    alignItems: 'center',
  },
  });
}
