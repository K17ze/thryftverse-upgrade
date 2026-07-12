import React from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
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

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = SCREEN_W * 0.62;

export function CuratedCollectionsRail({
  collections,
  onOpenCollection,
  onSeeAll,
}: CuratedCollectionsRailProps) {
  if (collections.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="sparkles-outline" size={14} color={Colors.brand} />
          <Text style={styles.kicker}>Curated by ThryftVerse</Text>
        </View>
        {onSeeAll && (
          <Pressable
            onPress={onSeeAll}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="See all curated collections"
          >
            <Text style={styles.seeAllText}>See all</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.title}>Editorial collections</Text>
        <Text style={styles.subtitle}>
          Hand-picked selections from our styling team
        </Text>
      </View>

      <View style={styles.rail}>
        {collections.map((collection) => (
          <CollectionCard
            key={collection.id}
            collection={collection}
            onPress={() => onOpenCollection(collection.id)}
          />
        ))}
      </View>
    </View>
  );
}

// ── Collection card ──────────────────────────────────────────────────────────

function CollectionCard({
  collection,
  onPress,
}: {
  collection: CuratedCollection;
  onPress: () => void;
}) {
  const accent = collection.accentColor ?? Colors.brand;

  return (
    <AnimatedPressable
      style={[styles.card, { width: CARD_W }]}
      onPress={onPress}
      activeOpacity={0.9}
      scaleValue={0.98}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel={`${collection.title}. ${collection.subtitle}. ${collection.itemCount} items${collection.curatorName ? `, curated by ${collection.curatorName}` : ''}`}
    >
      <CachedImage
        uri={collection.coverImage}
        style={styles.cardImage}
        containerStyle={{ width: '100%', height: 140, borderRadius: Radius.lg }}
        contentFit="cover"
      />
      <View style={[styles.cardOverlay, { backgroundColor: `${accent}10` }]} />
      <View style={styles.cardItemCountBadge}>
        <Text style={styles.cardItemCountBadgeText}>
          {collection.itemCount}
        </Text>
      </View>
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <View style={[styles.cardAccentDot, { backgroundColor: accent }]} />
          <Text style={styles.cardKicker}>Collection</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{collection.title}</Text>
        <Text style={styles.cardSubtitle} numberOfLines={1}>{collection.subtitle}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.cardItemCount}>
            {collection.itemCount} {collection.itemCount === 1 ? 'item' : 'items'}
          </Text>
          {collection.curatorName && (
            <Text style={styles.cardCurator} numberOfLines={1}>by {collection.curatorName}</Text>
          )}
        </View>
      </View>
    </AnimatedPressable>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginTop: Space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  kicker: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  seeAllText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },
  titleRow: {
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
    gap: 2,
  },
  title: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  rail: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingBottom: Space.xs,
  },
  card: {
    flexShrink: 0,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: 140,
  },
  cardOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: Radius.lg,
  },
  cardItemCountBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  cardItemCountBadgeText: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: '#ffffff',
  },
  cardContent: {
    padding: Space.sm + 2,
    gap: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  cardAccentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  cardKicker: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 19,
  },
  cardSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: Space.sm,
  },
  cardItemCount: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  cardCurator: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    flex: 1,
    textAlign: 'right',
  },
});
