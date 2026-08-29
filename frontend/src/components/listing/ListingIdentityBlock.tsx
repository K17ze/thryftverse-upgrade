import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { ThemeColors } from '../../theme/ThemeContext';

interface ListingIdentityBlockProps {
  brand?: string;
  title: string;
  price: string;
  originalPrice?: string | null;
  hasDiscount?: boolean;
}

export function ListingIdentityBlock({
  brand,
  title,
  price,
  originalPrice,
  hasDiscount }: ListingIdentityBlockProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      {brand ? (
        <Text style={styles.brand} numberOfLines={1}>{brand.toUpperCase()}</Text>
      ) : null}

      <Text style={styles.title} numberOfLines={2}>{title}</Text>

      <View style={styles.priceRow}>
        <Text style={styles.price}>{price}</Text>
        {hasDiscount && originalPrice ? (
          <Text style={styles.originalPrice}>{originalPrice}</Text>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm },
  brand: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: Space.xs },
  title: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    color: colors.textPrimary,
    lineHeight: TypographyV2.screenTitle.lineHeight,
    letterSpacing: -0.4,
    marginBottom: Space.sm },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10 },
  price: {
    fontSize: TypographyV2.priceHero.size,
    fontFamily: TypographyV2.priceHero.fontFamily,
    color: colors.textPrimary,
    letterSpacing: -0.6 },
  originalPrice: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textMuted,
    textDecorationLine: 'line-through' } });
}
