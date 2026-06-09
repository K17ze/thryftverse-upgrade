import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';

interface FlagshipAssetCardProps {
  imageUri?: string | null;
  name: string;
  unitPrice: string;
  yourUnits: number;
  totalUnits: number;
  status: 'active' | 'pending' | 'sold' | 'paused';
  onPress?: () => void;
  onAction?: () => void;
  actionLabel?: string;
  index?: number;
}

export function FlagshipAssetCard({
  imageUri,
  name,
  unitPrice,
  yourUnits,
  totalUnits,
  status,
  onPress,
  onAction,
  actionLabel,
  index = 0,
}: FlagshipAssetCardProps) {
  const ownershipPct = totalUnits > 0 ? Math.round((yourUnits / totalUnits) * 100) : 0;

  const statusColor =
    status === 'active' ? Colors.success : status === 'pending' ? '#F5A623' : status === 'sold' ? Colors.textMuted : Colors.textSecondary;

  return (
    <Reanimated.View entering={FadeInDown.delay(index * 50).duration(350)}>
      <Pressable onPress={onPress} style={styles.root}>
        <View style={styles.imageWrap}>
          {imageUri ? (
            <CachedImage uri={imageUri} style={styles.image} contentFit="cover" transition={250} />
          ) : (
            <View style={[styles.image, styles.imageFallback]}>
              <Ionicons name="image-outline" size={28} color={Colors.textMuted} />
            </View>
          )}
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        </View>

        <View style={styles.content}>
          <Text numberOfLines={1} style={styles.name}>
            {name}
          </Text>

          <View style={styles.priceRow}>
            <Text style={styles.unitPrice}>{unitPrice}</Text>
            <Text style={styles.perUnit}>/ unit</Text>
          </View>

          <View style={styles.ownershipRow}>
            <View style={styles.ownershipBarBg}>
              <View
                style={[
                  styles.ownershipBarFill,
                  { width: `${Math.min(ownershipPct, 100)}%`, backgroundColor: status === 'active' ? Colors.brand : statusColor },
                ]}
              />
            </View>
            <Text style={styles.ownershipText}>
              {yourUnits} / {totalUnits} ({ownershipPct}%)
            </Text>
          </View>
        </View>

        {onAction && actionLabel && (
          <Pressable onPress={(e) => { e.stopPropagation(); onAction(); }} style={styles.actionBtn}>
            <Text style={styles.actionLabel}>{actionLabel}</Text>
          </Pressable>
        )}
      </Pressable>
    </Reanimated.View>
  );
}

const IMAGE_SIZE = 80;

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.sm,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  imageWrap: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
    position: 'relative',
  },
  image: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  content: {
    flex: 1,
    marginLeft: Space.sm,
    justifyContent: 'center',
    gap: 4,
  },
  name: {
    fontSize: Type.body.size,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  unitPrice: {
    fontSize: Type.price.size,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  perUnit: {
    fontSize: Type.caption.size,
    fontWeight: '400',
    color: Colors.textSecondary,
  },
  ownershipRow: {
    marginTop: 2,
    gap: 4,
  },
  ownershipBarBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceAlt,
    overflow: 'hidden',
  },
  ownershipBarFill: {
    height: 4,
    borderRadius: 2,
  },
  ownershipText: {
    fontSize: Type.meta.size,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  actionBtn: {
    marginLeft: Space.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.brand,
  },
  actionLabel: {
    fontSize: Type.meta.size,
    fontWeight: '600',
    color: Colors.background,
  },
});
