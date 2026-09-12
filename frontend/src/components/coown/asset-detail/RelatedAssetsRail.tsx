/**
 * RelatedAssetsRail — "More from {issuer}" horizontal discovery rail.
 *
 * Flat horizontal scroll showing image, title, price, and availability
 * state. No card chrome per item — flat canvas, spacing, and press
 * feedback carry the structure.
 *
 * State coverage: loading (heading + spinner), empty (hidden — caller
 * omits the rail), error (hidden — discovery enhancement), populated.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Radius } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { FontFamily } from '../../../theme/fontFamily';
import { CachedImage } from '../../CachedImage';
import { formatCoOwnIze } from '../../../utils/currency';
import type { MarketCoOwnAsset } from '../../../services/marketApi';

export interface RelatedAssetsRailProps {
  assets: MarketCoOwnAsset[];
  loading: boolean;
  issuerUsername: string;
  onPressAsset: (assetId: string) => void;
}

export function RelatedAssetsRail({
  assets,
  loading,
  issuerUsername,
  onPressAsset,
}: RelatedAssetsRailProps) {
  const { colors } = useAppTheme();

  if (assets.length === 0 && !loading) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: colors.textPrimary }]}>
        More from {issuerUsername}
      </Text>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.textMuted} />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {assets.map((relAsset) => {
            const relAvailable = relAsset.availableUnits > 0;
            const relPriceLabel = relAsset.marketSnapshot?.lastExecutionPriceGbp != null
              ? formatCoOwnIze(relAsset.marketSnapshot.lastExecutionPriceGbp)
              : formatCoOwnIze(relAsset.unitPriceGbp);
            return (
              <Pressable
                key={relAsset.id}
                onPress={() => onPressAsset(relAsset.id)}
                style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel={`${relAsset.title}, ${relPriceLabel} per unit, ${relAvailable ? 'units available' : 'fully allocated'}`}
              >
                {relAsset.imageUrl ? (
                  <CachedImage
                    uri={relAsset.imageUrl}
                    style={styles.image}
                    contentFit="cover"
                    accessibilityElementsHidden
                  />
                ) : (
                  // Decorative placeholder — the chip's Pressable label
                  // already carries title, price, and availability.
                  <View
                    style={[styles.image, { backgroundColor: colors.surfaceAlt }]}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  />
                )}
                <Text
                  style={[styles.title, { color: colors.textPrimary }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.2}
                >
                  {relAsset.title}
                </Text>
                <Text style={[styles.price, { color: colors.textSecondary }]}>
                  {relPriceLabel}
                </Text>
                <View style={styles.statusRow}>
                  <View style={[styles.dot, {
                    backgroundColor: relAvailable ? colors.success : colors.textMuted,
                  }]} />
                  <Text style={[styles.status, { color: colors.textMuted }]} numberOfLines={1}>
                    {relAvailable ? `${relAsset.availableUnits} left` : 'Allocated'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: Space.lg,
    paddingHorizontal: Space.md,
  },
  heading: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.bold,
    marginBottom: Space.sm,
  },
  rail: {
    gap: Space.md,
    paddingRight: Space.md,
  },
  loadingRow: {
    paddingVertical: Space.sm,
  },
  chip: {
    width: 140,
    gap: 4,
  },
  image: {
    width: '100%',
    height: 84,
    borderRadius: Radius.sm,
    marginBottom: 4,
  },
  title: {
    fontSize: TypographyV2.caption.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.caption.lineHeight,
  },
  price: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    fontVariant: ['tabular-nums'],
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  status: {
    fontSize: 10,
    fontFamily: FontFamily.regular,
  },
});
