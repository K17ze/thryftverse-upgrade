import React from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface CoOwnDiscoveryCardProps {
  imageUri?: string | null;
  title: string;
  unitPrice: string;
  availableUnits: number;
  totalUnits: number;
  status: 'open' | 'closed' | 'paused';
  onPress?: () => void;
  index?: number;
}

export function CoOwnDiscoveryCard({
  imageUri,
  title,
  unitPrice,
  availableUnits,
  totalUnits,
  status,
  onPress,
  index = 0,
}: CoOwnDiscoveryCardProps) {
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const cardWidth = (width - Space.md * 2 - Space.sm) / 2;
  const imageHeight = cardWidth * 1.25; // 4:5 editorial ratio

  const allocatedPct = totalUnits > 0 ? Math.round(((totalUnits - availableUnits) / totalUnits) * 100) : 0;
  const statusColor =
    status === 'open' ? Colors.success : status === 'paused' ? Colors.textSecondary : Colors.textMuted;
  const statusLabel =
    status === 'open' ? 'Available' : status === 'paused' ? 'Paused' : 'Allocated';

  return (
    <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}>
      <Pressable
        onPress={onPress}
        style={[styles.root, { width: cardWidth }]}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${unitPrice} per unit, ${statusLabel}`}
      >
        <View style={[styles.imageWrap, { height: imageHeight }]}>
          {imageUri ? (
            <CachedImage uri={imageUri} style={styles.image} contentFit="cover" transition={250} />
          ) : (
            <View style={[styles.image, styles.imageFallback]}>
              <Ionicons name="cube-outline" size={28} color={Colors.textMuted} />
            </View>
          )}
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        </View>

        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.unitPrice}>{unitPrice}</Text>
            <Text style={styles.perUnit}>/unit</Text>
          </View>
          <View style={styles.allocationRow}>
            <View style={styles.allocationBarBg}>
              <View style={[styles.allocationBarFill, { width: `${Math.min(allocatedPct, 100)}%` }]} />
            </View>
            <Text style={styles.allocationText}>{availableUnits} left</Text>
          </View>
        </View>
      </Pressable>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  imageWrap: {
    width: '100%',
    position: 'relative',
    backgroundColor: Colors.surfaceAlt,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  content: {
    padding: Space.sm,
    gap: 4,
  },
  title: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    lineHeight: 18,
    minHeight: 36,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  unitPrice: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  perUnit: {
    fontSize: Type.caption.size,
    color: Colors.textSecondary,
  },
  allocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  allocationBarBg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceAlt,
    overflow: 'hidden',
  },
  allocationBarFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.brand,
  },
  allocationText: {
    fontSize: Type.meta.size,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
});
