import React from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography, Type } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CuratedCollection {
  id: string;
  title: string;
  subtitle: string;
  coverImage: string;
  itemCount: number;
  curatorName?: string;
  accentColor?: string;
}

export interface CuratedCollectionsRailProps {
  collections: CuratedCollection[];
  onOpenCollection: (collectionId: string) => void;
  onSeeAll?: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function CuratedCollectionsRail({
  collections,
  onOpenCollection,
  onSeeAll,
}: CuratedCollectionsRailProps) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(320, Math.max(272, width - Space.md * 3));

  if (collections.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Curated by ThryftVerse</Text>
        {onSeeAll && (
          <AnimatedPressable
            style={styles.seeAllButton}
            onPress={onSeeAll}
            activeOpacity={0.72}
            scaleValue={0.98}
            accessibilityRole="button"
            accessibilityLabel="See all curated collections"
          >
            <Text style={styles.seeAllText}>See all</Text>
            <Ionicons name="arrow-forward" size={16} color={Colors.textPrimary} />
          </AnimatedPressable>
        )}
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.title}>Editorial collections</Text>
        <Text style={styles.subtitle}>
          Hand-picked selections from our styling team
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={cardWidth + Space.sm}
        snapToAlignment="start"
        contentContainerStyle={styles.rail}
        accessibilityRole="list"
      >
        {collections.map((collection) => (
          <CollectionCard
            key={collection.id}
            collection={collection}
            width={cardWidth}
            onPress={() => onOpenCollection(collection.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ── Collection card ──────────────────────────────────────────────────────────

function CollectionCard({
  collection,
  width,
  onPress,
}: {
  collection: CuratedCollection;
  width: number;
  onPress: () => void;
}) {
  const accent = collection.accentColor ?? Colors.brand;

  return (
    <AnimatedPressable
      style={[styles.card, { width }]}
      onPress={onPress}
      activeOpacity={0.9}
      scaleValue={0.98}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel={`${collection.title}. ${collection.subtitle}. ${collection.itemCount} items${collection.curatorName ? `, curated by ${collection.curatorName}` : ''}`}
    >
      <View style={styles.cardMedia}>
        {collection.coverImage.trim().length > 0 ? (
          <CachedImage
            uri={collection.coverImage}
            style={styles.cardImage}
            containerStyle={styles.cardImageContainer}
            contentFit="cover"
          />
        ) : (
          <View style={styles.cardMediaFallback}>
            <View style={styles.fallbackMonogram}>
              <Text style={styles.fallbackMonogramText}>
                {collection.title
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((word) => word[0])
                  .join('')
                  .toUpperCase()}
              </Text>
            </View>
          </View>
        )}
        <View style={[styles.cardMediaTint, { backgroundColor: `${accent}0A` }]} />
        <View style={styles.cardItemCountBadge}>
          <Text style={styles.cardItemCountBadgeText}>
            {collection.itemCount} {collection.itemCount === 1 ? 'piece' : 'pieces'}
          </Text>
        </View>
      </View>
      <View style={styles.cardContent}>
        <View style={styles.cardCopy}>
          <Text style={styles.cardKicker}>Collection</Text>
          <Text style={styles.cardTitle} numberOfLines={1}>{collection.title}</Text>
          <Text style={styles.cardSubtitle} numberOfLines={2}>{collection.subtitle}</Text>
        </View>
        <View style={styles.cardOpenIcon}>
          <Ionicons name="arrow-forward" size={17} color={Colors.textPrimary} />
        </View>
      </View>
    </AnimatedPressable>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginTop: Space.lg,
    marginBottom: Space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    marginBottom: Space.xs,
  },
  kicker: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  seeAllButton: {
    minHeight: 44,
    paddingLeft: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seeAllText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  titleRow: {
    paddingHorizontal: Space.md,
    marginBottom: Space.md,
    gap: 3,
  },
  title: {
    fontSize: 25,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.6,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  rail: {
    paddingHorizontal: Space.md,
    paddingRight: Space.md * 2,
    gap: Space.sm,
  },
  card: {
    flexShrink: 0,
    flexDirection: 'row',
    minHeight: 148,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  cardMedia: {
    width: 116,
    minHeight: 148,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  cardImageContainer: {
    width: '100%',
    height: '100%',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardMediaFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.md,
    backgroundColor: Colors.surfaceAlt,
  },
  fallbackMonogram: {
    width: 42,
    height: 42,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  fallbackMonogramText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: 0.4,
  },
  cardMediaTint: {
    ...StyleSheet.absoluteFill,
  },
  cardItemCountBadge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.68)',
  },
  cardItemCountBadgeText: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: '#ffffff',
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
    padding: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  cardCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  cardKicker: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: 19,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 23,
  },
  cardSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  cardOpenIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
});
