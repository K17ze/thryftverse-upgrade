import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { CachedImage } from '../CachedImage';

interface SellerInfo {
  id: string;
  username: string | null;
  avatar: string | null;
}

interface Props {
  title: string;
  imageUrl: string;
  seller: SellerInfo;
  priceLabel: string;
  onPressSeller?: () => void;
  onPressMessage?: () => void;
}

function CheckoutItemSummaryBase({
  title,
  imageUrl,
  seller,
  priceLabel,
  onPressSeller,
  onPressMessage }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const sellerName = seller.username ?? seller.id.slice(0, 8);

  return (
    <View style={styles.container}>
      <CachedImage uri={imageUrl} style={styles.image} contentFit="cover" />

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>

        <View style={styles.sellerRow}>
          {seller.id && onPressSeller ? (
            <Pressable
              onPress={onPressSeller}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel={`View ${sellerName} profile`}
            >
              <Text style={styles.sellerName}>from {sellerName}</Text>
            </Pressable>
          ) : (
            <Text style={styles.sellerName}>from {sellerName}</Text>
          )}

          {seller.id && onPressMessage ? (
            <Pressable
              onPress={onPressMessage}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Message seller"
            >
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.price}>{priceLabel}</Text>
      </View>
    </View>
  );
}

const CheckoutItemSummary = React.memo(CheckoutItemSummaryBase);
CheckoutItemSummary.displayName = 'CheckoutItemSummary';
export { CheckoutItemSummary };

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Space.md,
    paddingVertical: Space.sm },
  image: {
    width: 96,
    height: 120,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt },
  info: {
    flex: 1,
    justifyContent: 'center',
    gap: 4 },
  title: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    lineHeight: 21 },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  sellerName: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary },
  price: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    marginTop: 2 } });
