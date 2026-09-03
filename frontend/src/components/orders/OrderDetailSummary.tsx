import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '../CachedImage';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

interface Props {
  title: string;
  imageUrl: string;
  subtitle?: string;
  priceLabel: string;
  listingAvailable: boolean;
  onPress?: () => void;
}

export function OrderDetailSummary({
  title,
  imageUrl,
  subtitle,
  priceLabel,
  listingAvailable,
  onPress }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={styles.row}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${title}, ${priceLabel}${listingAvailable ? '' : ', listing no longer available'}`}
    >
      <CachedImage
        uri={imageUrl}
        style={styles.image}
        contentFit="cover"
        transition={200}
      />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
        <Text style={styles.price}>{priceLabel}</Text>
        {!listingAvailable ? (
          <View style={styles.unavailableRow}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
            <Text style={styles.unavailableText}>Listing no longer available</Text>
          </View>
        ) : null}
      </View>
      {onPress && listingAvailable ? (
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      ) : null}
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm },
  image: {
    width: 96,
    height: 120,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt },
  info: {
    flex: 1,
    gap: Space.xs },
  title: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    lineHeight: TypographyV2.body.lineHeight },
  subtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary },
  price: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    marginTop: Space.xs / 2 },
  unavailableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs },
  unavailableText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted } });
