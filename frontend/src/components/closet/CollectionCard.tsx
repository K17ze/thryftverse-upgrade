import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { Collection } from '../../store/useStore';
import type { Listing } from '../../domain';
import { useBackendData } from '../../context/BackendDataContext';
import { Type, Space, Radius, Typography, Stroke } from '../../theme/designTokens';
const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = SCREEN_W - Space.md * 2;
const COVER_SIZE = (CARD_W - 8) / 3; // 3-up collage with 4px gaps

interface Props {
  collection: Collection;
  onPress: () => void;
}

export function CollectionCard({ collection, onPress }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { listings } = useBackendData();
  const count = collection.itemIds?.length ?? 0;

  // Resolve up to 3 cover images safely
  const covers = React.useMemo(() => {
    return collection.itemIds
      .slice(0, 3)
      .map((id) => listings.find((l) => l.id === id))
      .filter((l): l is Listing => {
        if (l == null) return false;
        return Array.isArray(l.images) && l.images.length > 0;
      })
      .map((l) => l.images[0]);
  }, [collection.itemIds, listings]);

  return (
    <AnimatedPressable
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.92}
      accessibilityRole="button"
      accessibilityLabel={`${collection.name} collection, ${count} ${count === 1 ? 'item' : 'items'}`}
      accessibilityHint="Tap to view collection"
    >
      {/* Cover Collage — media is the colour; no nested card surface.
          When empty, a dashed-outline creation prompt replaces the blunt
          "Empty" label (Pinterest pattern — the empty board invites creation). */}
      <View style={styles.collage}>
        {covers.length > 0 ? (
          <>
            <View style={[styles.mainCover, covers.length === 1 && styles.mainCoverSingle]}>
              <CachedImage uri={covers[0]} style={styles.coverImg} contentFit="cover" />
            </View>
            {covers.length > 1 && (
              <View style={styles.sideColumn}>
                <View style={styles.sideCover}>
                  <CachedImage uri={covers[1]} style={styles.coverImg} contentFit="cover" />
                </View>
                {covers.length > 2 && (
                  <View style={styles.sideCover}>
                    <CachedImage uri={covers[2]} style={styles.coverImg} contentFit="cover" />
                  </View>
                )}
                {covers.length === 2 && (
                  <View style={[styles.sideCover, styles.sideEmpty]}>
                    <Ionicons name="add-outline" size={20} color={colors.textMuted} />
                  </View>
                )}
              </View>
            )}
          </>
        ) : (
          <View style={styles.emptyCover}>
            <Ionicons name="add-outline" size={28} color={colors.textMuted} />
            <Text style={styles.emptyCoverText}>Add items</Text>
          </View>
        )}
      </View>

      {/* Info — flat, hairline separator instead of a bordered panel */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          {collection.isPrivate === true ? (
            <Ionicons name="lock-closed" size={13} color={colors.textMuted} style={styles.privacyGlyph} />
          ) : null}
          <Text style={styles.name} numberOfLines={1}>{collection.name}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
        <Text style={styles.meta}>{count} {count === 1 ? 'item' : 'items'}</Text>
      </View>
    </AnimatedPressable>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  // Flattened — no bordered card wrapper. Media is the colour; the info
  // row sits on the flat canvas with a hairline top separator. This removes
  // the card-on-card composition (AGENTS.md §4) where rounded media surfaces
  // sat inside a redundant bordered container.
  container: {
    borderRadius: Radius.lg,
    backgroundColor: colors.surface,
    marginBottom: Space.md,
    overflow: 'hidden',
  },
  collage: {
    flexDirection: 'row',
    gap: 4,
    padding: Space.xs,
    height: COVER_SIZE * 2 + 4,
  },
  mainCover: {
    width: COVER_SIZE * 2,
    height: '100%',
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  mainCoverSingle: {
    width: '100%',
  },
  sideColumn: {
    flex: 1,
    gap: 4,
  },
  sideCover: {
    flex: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  sideEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverImg: {
    width: '100%',
    height: '100%',
  },
  // Empty cover — dashed-outline creation prompt, not a status label
  emptyCover: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 2,
    margin: Space.xs,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  emptyCoverText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
  },
  info: {
    padding: Space.sm,
    paddingHorizontal: Space.md,
    borderTopWidth: Stroke.hairline,
    borderTopColor: colors.border,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.xs,
  },
  privacyGlyph: {
    marginTop: 1,
  },
  name: {
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    flex: 1,
  },
  meta: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    marginTop: 2,
  },
});
