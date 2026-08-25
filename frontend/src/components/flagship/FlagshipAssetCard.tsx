import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, FontFamily, IconGrammar, Control, ThumbSize } from '../../theme/designTokens';
import { Motion } from '../../theme/motionTokens';
import { CachedImage } from '../CachedImage';
import { getCategoryFocalPoint } from '../../utils/media';

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
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const ownershipPct = totalUnits > 0 ? Math.round((yourUnits / totalUnits) * 100) : 0;

  const statusColor =
    status === 'active' ? colors.success : status === 'pending' ? colors.textSecondary : status === 'sold' ? colors.textMuted : colors.textSecondary;

  const cardLabel = `${name}, ${unitPrice} per unit, ${yourUnits} of ${totalUnits} units owned (${ownershipPct}%)`;

  return (
    <Pressable
      onPress={onPress}
      style={styles.root}
      accessibilityRole="button"
      accessibilityLabel={cardLabel}
      accessibilityHint="View asset details"
    >
      <View style={styles.imageWrap}>
        {imageUri ? (
          <CachedImage
            uri={imageUri}
            style={styles.image}
            contentFit="cover"
            transition={Motion.transitions.mediaLoad.duration}
            focalPoint={getCategoryFocalPoint('art')}
            accessibilityRole="image"
            accessibilityLabel={name}
          />
        ) : (
          <View style={[styles.image, styles.imageFallback]} accessibilityElementsHidden>
            <Ionicons name="image-outline" size={IconGrammar.hero} color={colors.textMuted} />
          </View>
        )}
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} accessibilityElementsHidden />
      </View>

      <View style={styles.content}>
        <Text numberOfLines={1} style={styles.name}>
          {name}
        </Text>

        <View style={styles.priceRow}>
          <Text style={styles.unitPrice} numberOfLines={1}>{unitPrice}</Text>
          <Text style={styles.perUnit}>/ unit</Text>
        </View>

        <View style={styles.ownershipRow} accessibilityElementsHidden>
          <View style={styles.ownershipBarBg}>
            <View
              style={[
                styles.ownershipBarFill,
                { width: `${Math.min(ownershipPct, 100)}%`, backgroundColor: status === 'active' ? colors.brand : statusColor },
              ]}
            />
          </View>
        </View>
        <Text style={styles.ownershipText}>
          {yourUnits} / {totalUnits} ({ownershipPct}%)
        </Text>
      </View>

      {onAction && actionLabel && (
        <Pressable
          onPress={(e) => { e.stopPropagation(); onAction(); }}
          style={styles.actionBtn}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityHint={`Perform ${actionLabel.toLowerCase()} on ${name}`}
        >
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

const IMAGE_SIZE = ThumbSize.lg;

const createStyles = (colors: any) => StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    padding: Space.sm,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  imageWrap: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
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
    top: Space.xs,
    right: Space.xs,
    width: 10,
    height: 10,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  content: {
    flex: 1,
    marginLeft: Space.sm,
    justifyContent: 'center',
    gap: Space.xs / 2,
  },
  name: {
    fontSize: Type.body.size,
    fontFamily: FontFamily.semibold,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs / 2,
  },
  unitPrice: {
    fontSize: Type.priceList.size,
    fontFamily: FontFamily.bold,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  perUnit: {
    fontSize: Type.caption.size,
    fontFamily: FontFamily.regular,
    color: colors.textSecondary,
  },
  ownershipRow: {
    marginTop: Space.xs / 2,
    gap: Space.xs / 2,
  },
  ownershipBarBg: {
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  ownershipBarFill: {
    height: 4,
    borderRadius: Radius.full,
  },
  ownershipText: {
    fontSize: Type.meta.size,
    fontFamily: FontFamily.medium,
    color: colors.textSecondary,
  },
  actionBtn: {
    marginLeft: Space.sm,
    paddingHorizontal: Space.md,
    minHeight: Control.hit,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: Type.meta.size,
    fontFamily: FontFamily.semibold,
    color: colors.background,
  },
});
