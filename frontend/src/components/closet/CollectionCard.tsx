import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Type, Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { Collection } from '../../store/useStore';
import { Listing } from '../../data/mockData';
import { useBackendData } from '../../context/BackendDataContext';
import { Typography } from '../../theme/designTokens';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = SCREEN_W - Space.md * 2;
const COVER_SIZE = (CARD_W - 8) / 3; // 3-up collage with 4px gaps

interface Props {
  collection: Collection;
  onPress: () => void;
}

export function CollectionCard({ collection, onPress }: Props) {
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
      {/* Cover Collage */}
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
                    <Ionicons name="folder-open-outline" size={20} color={Colors.textMuted} />
                  </View>
                )}
              </View>
            )}
          </>
        ) : (
          <View style={styles.emptyCover}>
            <Ionicons name="folder-open-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyCoverText}>Empty</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{collection.name}</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        </View>
        <Text style={styles.meta}>{count} {count === 1 ? 'item' : 'items'}</Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Space.md,
    overflow: 'hidden',
  },
  collage: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    height: COVER_SIZE * 2 + 4,
  },
  mainCover: {
    width: COVER_SIZE * 2,
    height: '100%',
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
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
    backgroundColor: Colors.surfaceAlt,
  },
  sideEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverImg: {
    width: '100%',
    height: '100%',
  },
  emptyCover: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },
  emptyCoverText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  info: {
    padding: Space.sm,
    paddingHorizontal: Space.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  name: {
    fontSize: 15,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    flex: 1,
  },
  meta: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    marginTop: 2,
  },
});