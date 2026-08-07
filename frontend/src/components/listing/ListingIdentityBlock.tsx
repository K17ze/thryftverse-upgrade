import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Typography, Space, Type } from '../../theme/designTokens';
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
  hasDiscount,
}: ListingIdentityBlockProps) {
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
    paddingBottom: Space.sm,
  },
  brand: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: Space.xs,
  },
  title: {
    fontSize: 22,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    lineHeight: 28,
    letterSpacing: -0.4,
    marginBottom: Space.sm,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  price: {
    fontSize: Type.priceLarge.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: -0.6,
  },
  originalPrice: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  });
}
