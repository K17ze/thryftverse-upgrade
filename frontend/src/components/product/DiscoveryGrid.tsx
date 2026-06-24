import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
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
}

export function DiscoveryGrid({
  items,
  listingId,
  onPressItem,
  onEndReached,
  hasMore,
  numColumns = 2,
}: DiscoveryGridProps) {
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
      <Text style={styles.title}>Explore more</Text>
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
              <ActivityIndicator size="small" color={Colors.textMuted} />
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Space.lg,
    paddingHorizontal: Space.md,
  },
  title: {
    fontSize: 17,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    marginBottom: Space.sm,
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
