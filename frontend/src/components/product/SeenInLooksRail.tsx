import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
import { Listing } from '../../data/mockData';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';

export interface SeenInLooksRailProps {
  items: Listing[];
  onPressItem: (item: Listing) => void;
}

export function SeenInLooksRail({ items, onPressItem }: SeenInLooksRailProps) {
  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={16} color={Colors.textMuted} />
        <Text style={styles.title}>Seen in Looks</Text>
      </View>
      <Text style={styles.subtitle}>Styled by the community</Text>

      <FlashList
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AnimatedPressable
            style={styles.lookCard}
            onPress={() => onPressItem(item)}
            {...PressPresets.card}
            accessibilityLabel={`Look: ${item.title}`}
            accessibilityRole="button"
          >
            <View style={styles.lookImageWrap}>
              {item.images?.[0] ? (
                <CachedImage
                  uri={item.images[0]}
                  style={styles.lookImage}
                  containerStyle={{ width: '100%', height: '100%', borderRadius: Radius.md }}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.lookImageFallback} />
              )}
            </View>
            <Text style={styles.lookTitle} numberOfLines={1}>
              {item.title}
            </Text>
            {item.seller?.username ? (
              <Text style={styles.lookCreator} numberOfLines={1}>
                @{item.seller.username}
              </Text>
            ) : null}
          </AnimatedPressable>
        )}
        ItemSeparatorComponent={() => <View style={{ width: Space.sm }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
  },
  title: {
    fontSize: 17,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  listContent: {
    paddingHorizontal: Space.md,
  },
  lookCard: {
    width: 160,
  },
  lookImageWrap: {
    width: 160,
    height: 200,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  lookImage: {
    width: '100%',
    height: '100%',
  },
  lookImageFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.surfaceAlt,
  },
  lookTitle: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    marginTop: 6,
  },
  lookCreator: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 1,
  },
});
