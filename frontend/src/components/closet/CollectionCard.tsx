import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Type, Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { Collection } from '../../store/useStore';
import { useBackendData } from '../../context/BackendDataContext';

interface Props {
  collection: Collection;
  onPress: () => void;
}

export function CollectionCard({ collection, onPress }: Props) {
  const { listings } = useBackendData();
  const count = collection.itemIds?.length ?? 0;

  // Resolve cover images from first 3 items
  const coverImages = React.useMemo(() => {
    return collection.itemIds
      .slice(0, 3)
      .map((id) => listings.find((l) => l.id === id))
      .filter(Boolean)
      .map((l) => l!.images[0]);
  }, [collection.itemIds, listings]);

  return (
    <AnimatedPressable
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`${collection.name} collection with ${count} items`}
      accessibilityHint="Tap to view collection"
    >
      {/* Thumbnail Grid */}
      <View style={styles.thumbGrid}>
        {coverImages.length > 0 ? (
          coverImages.map((uri, i) => (
            <View key={i} style={[styles.thumb, coverImages.length === 1 && styles.thumbSingle]}>
              <CachedImage uri={uri} style={styles.thumbImage} contentFit="cover" />
            </View>
          ))
        ) : (
          <View style={styles.thumbEmpty}>
            <Ionicons name="folder-open-outline" size={28} color={Colors.textMuted} />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{collection.name}</Text>
        <Text style={styles.meta}>{count} {count === 1 ? 'item' : 'items'}</Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Space.xs,
  },
  thumbGrid: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    overflow: 'hidden',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    backgroundColor: Colors.surfaceAlt,
  },
  thumb: {
    flex: 1,
    minWidth: '48%',
    minHeight: '48%',
  },
  thumbSingle: {
    minWidth: '100%',
    minHeight: '100%',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    ...Type.price,
    color: Colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
  },
  meta: {
    ...Type.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
