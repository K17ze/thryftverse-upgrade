import React from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography, Elevation, Stroke} from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';

export interface CoOwnFeaturedHeroProps {
  imageUri?: string | null;
  title: string;
  unitPrice: string;
  availableUnits: number;
  totalUnits: number;
  status: 'open' | 'closed' | 'paused';
  issuerLabel?: string;
  onPress?: () => void;
  onAction?: () => void;
  actionLabel?: string;
  index?: number;
}

export function CoOwnFeaturedHero({
  imageUri,
  title,
  unitPrice,
  availableUnits,
  totalUnits,
  status,
  issuerLabel,
  onPress,
  onAction,
  actionLabel = 'View details',
  index = 0,
}: CoOwnFeaturedHeroProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const imageHeight = Math.min(width * 0.62, 280);
  const allocatedPct = totalUnits > 0 ? Math.round(((totalUnits - availableUnits) / totalUnits) * 100) : 0;

  const statusLabel =
    status === 'open' ? 'Available' : status === 'paused' ? 'Paused' : 'Fully allocated';
  const statusColor =
    status === 'open' ? colors.success : status === 'paused' ? colors.textSecondary : colors.textMuted;

  return (
    <View>
      <Pressable
        onPress={onPress}
        style={styles.root}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${unitPrice} per unit, ${availableUnits} of ${totalUnits} units available`}
      >
        <View style={[styles.imageWrap, { height: imageHeight }]}>
          {imageUri ? (
            <CachedImage uri={imageUri} style={styles.image} contentFit="cover" transition={300} />
          ) : (
            <View style={[styles.image, styles.imageFallback]}>
              <Ionicons name="cube-outline" size={40} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.imageOverlay}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor + '40' }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          <Text style={styles.eyebrow}>Co-Own</Text>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>

          <View style={styles.priceRow}>
            <Text style={styles.unitPrice}>{unitPrice}</Text>
            <Text style={styles.perUnit}>per unit</Text>
          </View>

          <View style={styles.allocationRow}>
            <View style={styles.allocationBarBg}>
              <View style={[styles.allocationBarFill, { width: `${Math.min(allocatedPct, 100)}%` }]} />
            </View>
            <Text style={styles.allocationText}>
              {allocatedPct}% allocated · {availableUnits} of {totalUnits} units left
            </Text>
          </View>

          {issuerLabel && (
            <View style={styles.issuerRow}>
              <Ionicons name="person-circle-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.issuerText} numberOfLines={1}>{issuerLabel}</Text>
            </View>
          )}

          {onAction && (
            <Pressable
              onPress={(e) => { e.stopPropagation(); onAction(); }}
              style={styles.actionBtn}
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
            >
              <Text style={styles.actionText}>{actionLabel}</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.background} />
            </Pressable>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  root: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    marginHorizontal: Space.md,
    marginBottom: Space.lg,
    overflow: 'hidden',
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    ...Elevation.subtle,
  },
  imageWrap: {
    width: '100%',
    position: 'relative',
    backgroundColor: colors.surfaceAlt,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageOverlay: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.sm,
  },
  statusText: {
    fontSize: Type.meta.size,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  content: {
    padding: Space.md,
    gap: Space.xs,
  },
  eyebrow: {
    fontSize: Type.label.size,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    lineHeight: 30,
    letterSpacing: -0.5,
    marginBottom: Space.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: Space.sm,
  },
  unitPrice: {
    fontSize: Type.priceHero.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  perUnit: {
    fontSize: Type.body.size,
    color: colors.textSecondary,
  },
  allocationRow: {
    gap: 6,
    marginBottom: Space.sm,
  },
  allocationBarBg: {
    height: 6,
    borderRadius: Radius.sm,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  allocationBarFill: {
    height: 6,
    borderRadius: Radius.sm,
    backgroundColor: colors.brand,
  },
  allocationText: {
    fontSize: Type.caption.size,
    color: colors.textSecondary,
  },
  issuerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Space.sm,
  },
  issuerText: {
    fontSize: Type.caption.size,
    color: colors.textSecondary,
    flex: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.brand,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
  },
  actionText: {
    fontSize: Type.bodyStrong.size,
    fontWeight: '600',
    color: colors.background,
  },
});
