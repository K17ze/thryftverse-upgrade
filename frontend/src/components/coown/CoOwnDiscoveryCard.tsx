import React from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Stroke} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { CachedImage } from '../CachedImage';

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
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const cardWidth = (width - Space.md * 2 - Space.sm) / 2;
  const imageHeight = cardWidth * 1.25; // 4:5 editorial ratio

  const allocatedPct = totalUnits > 0 ? Math.round(((totalUnits - availableUnits) / totalUnits) * 100) : 0;
  const statusColor =
    status === 'open' ? colors.success : status === 'paused' ? colors.textSecondary : colors.textMuted;
  const statusLabel =
    status === 'open' ? 'Available' : status === 'paused' ? 'Paused' : 'Allocated';

  return (
    <View>
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
              <Ionicons name="cube-outline" size={28} color={colors.textMuted} />
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
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  root: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: Stroke.standard,
    borderColor: colors.border,
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
  statusDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: Radius.sm,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  content: {
    padding: Space.sm,
    gap: 4,
  },
  title: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    lineHeight: 18,
    minHeight: 36,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  unitPrice: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  perUnit: {
    fontSize: TypographyV2.meta.size,
    color: colors.textSecondary,
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
    borderRadius: Radius.sm,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  allocationBarFill: {
    height: 4,
    borderRadius: Radius.sm,
    backgroundColor: colors.brand,
  },
  allocationText: {
    fontSize: TypographyV2.meta.size,
    fontWeight: '500',
    color: colors.textSecondary,
  },
});
