import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppButton } from '../ui/AppButton';
import type { ListingSeller } from '../../domain';

interface ListingSellerRowProps {
  seller?: ListingSeller | null;
  sellerId?: string;
  onProfilePress: () => void;
  onMessage: () => void;
}

export function ListingSellerRow({
  seller,
  sellerId,
  onProfilePress,
  onMessage }: ListingSellerRowProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  if (seller) {
    return (
      <View style={styles.container}>
        <AnimatedPressable
          style={styles.identityTap}
          onPress={onProfilePress}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityLabel={`Open @${seller.username || 'seller'} profile`}
        >
          <CachedImage
            uri={seller.avatar || ''}
            style={styles.avatar}
            containerStyle={{ width: 40, height: 40, borderRadius: Radius.xxl }}
            contentFit="cover"
          />
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>
              @{seller.username || 'Seller'}
            </Text>
            {seller.rating != null && seller.reviewCount != null ? (
              <View style={styles.metaRow}>
                <Ionicons name="star" size={11} color={colors.brand} />
                <Text style={styles.metaText}>
                  {seller.rating} · {seller.reviewCount} reviews
                </Text>
              </View>
            ) : seller.rating != null ? (
              <View style={styles.metaRow}>
                <Ionicons name="star" size={11} color={colors.brand} />
                <Text style={styles.metaText}>{seller.rating} rating</Text>
              </View>
            ) : seller.reviewCount != null ? (
              <Text style={styles.metaText} numberOfLines={1}>{seller.reviewCount} reviews</Text>
            ) : seller.location ? (
              <Text style={styles.metaText} numberOfLines={1}>{seller.location}</Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </AnimatedPressable>

        <AppButton
          title="Message"
          style={styles.messageBtn}
          titleStyle={styles.messageBtnText}
          variant="secondary"
          size="sm"
          onPress={onMessage}
        />
      </View>
    );
  }

  if (sellerId) {
    return (
      <View style={styles.container}>
        <View style={styles.identityTap}>
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Ionicons name="person" size={18} color={colors.textMuted} />
          </View>
          <View style={styles.info}>
            <Text style={styles.name}>Seller</Text>
            <Text style={styles.metaText}>Seller information unavailable</Text>
          </View>
        </View>
      </View>
    );
  }

  return null;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.sm },
  identityTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.xxl },
  avatarFallback: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center' },
  info: {
    flex: 1 },
  name: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2 },
  metaText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  messageBtn: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: Radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background },
  messageBtnText: {
    color: colors.textPrimary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily } });
}
