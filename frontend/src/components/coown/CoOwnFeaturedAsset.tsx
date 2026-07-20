import React from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { StyleSheet as RNStyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export type CoOwnAssetStatus = 'open' | 'closed' | 'paused';

export interface CoOwnFeaturedAssetProps {
  imageUri?: string | null;
  title: string;
  categoryEyebrow?: string;
  unitPriceLabel: string;
  availableUnits: number;
  totalUnits: number;
  status: CoOwnAssetStatus;
  issuerLabel?: string;
  onPress?: () => void;
  onAction?: () => void;
  actionLabel?: string;
  index?: number;
}

export function CoOwnFeaturedAsset({
  imageUri,
  title,
  categoryEyebrow,
  unitPriceLabel,
  availableUnits,
  totalUnits,
  status,
  issuerLabel,
  onPress,
  onAction,
  actionLabel = 'View item',
  index = 0,
}: CoOwnFeaturedAssetProps) {
  const { colors } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  // Editorial hero: 60% of viewport height, capped at 420px for tablets
  const heroHeight = Math.min(height * 0.6, 420);

  const statusLabel = status === 'open' ? 'Available' : status === 'paused' ? 'Paused' : 'Fully allocated';
  const statusColor = status === 'open' ? colors.success : status === 'paused' ? colors.textSecondary : colors.textMuted;

  return (
    <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.delay(Math.min(index, 3) * 60).duration(350)}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${unitPriceLabel} per unit, ${availableUnits} of ${totalUnits} units available, ${statusLabel}`}
      >
        <View style={styles.imageWrap}>
          {imageUri ? (
            <CachedImage uri={imageUri} style={[styles.image, { height: heroHeight }]} contentFit="cover" transition={300} />
          ) : (
            <View style={[styles.image, styles.imageFallback, { height: heroHeight, backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="image-outline" size={40} color={colors.textMuted} />
              <Text style={[styles.imageFallbackText, { color: colors.textMuted }]}>No photo yet</Text>
            </View>
          )}

          {/* Gradient overlay for text legibility on any image */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.78)']}
            locations={[0, 0.55, 1]}
            style={styles.gradientOverlay}
            pointerEvents="none"
          />

          {/* Status chip — top-left, glassy, restrained */}
          <View style={styles.statusOverlay}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={styles.statusText} numberOfLines={1}>{statusLabel}</Text>
          </View>

          {/* Editorial content overlaid on image — bottom-left */}
          <View style={styles.heroContent}>
            {categoryEyebrow ? (
              <Text style={styles.eyebrow} numberOfLines={1}>{categoryEyebrow}</Text>
            ) : null}
            <Text style={styles.title} numberOfLines={2}>{title}</Text>
            <View style={styles.heroMetaRow}>
              <Text style={styles.heroPriceLine} numberOfLines={1}>
                From {unitPriceLabel}
              </Text>
              <Text style={styles.heroDivider}>·</Text>
              <Text style={styles.heroAvailability} numberOfLines={1}>
                {availableUnits} of {totalUnits} units
              </Text>
            </View>

            {onAction ? (
              <Pressable
                onPress={(e) => { e.stopPropagation(); onAction(); }}
                style={styles.actionBtn}
                accessibilityRole="button"
                accessibilityLabel={actionLabel}
              >
                <Text style={styles.actionText}>{actionLabel}</Text>
                <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
              </Pressable>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  imageWrap: {
    width: '100%',
    position: 'relative',
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  imageFallbackText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
  },
  // Gradient overlay for text legibility on any image
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  // Glassy status chip — restrained, not a colored pill
  statusOverlay: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.3,
    color: 'rgba(255,255,255,0.95)',
  },
  // Editorial content overlaid on image — bottom-left
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Space.lg,
    paddingTop: Space.xl,
    paddingBottom: Space.lg,
    gap: 6,
  },
  eyebrow: {
    fontSize: Type.metaElevated.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.85)',
  },
  title: {
    fontSize: Type.display.size,
    fontFamily: Typography.family.bold,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: Space.xs,
  },
  heroPriceLine: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: 'rgba(255,255,255,0.95)',
    fontVariant: ['tabular-nums'],
  },
  heroDivider: {
    fontSize: Type.body.size,
    color: 'rgba(255,255,255,0.5)',
  },
  heroAvailability: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: 'rgba(255,255,255,0.78)',
    fontVariant: ['tabular-nums'],
  },
  // Quieter action button — glassy outline, not a loud colored block
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    paddingVertical: Space.sm,
    borderRadius: Radius.full,
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: Space.md + 2,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  actionText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: '#FFFFFF',
  },
});
