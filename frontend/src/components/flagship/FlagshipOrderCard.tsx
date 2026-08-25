import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, FontFamily, IconGrammar, ThumbSize } from '../../theme/designTokens';
import { Motion } from '../../theme/motionTokens';
import { CachedImage } from '../CachedImage';
import { PremiumStatusPill } from '../ui/PremiumStatusPill';

interface FlagshipOrderCardProps {
  imageUri?: string | null;
  listingTitle: string;
  status: 'pending' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  price: string;
  sellerName?: string;
  buyerName?: string;
  orderDate?: string;
  onPress?: () => void;
  index?: number;
}

export function FlagshipOrderCard({
  imageUri,
  listingTitle,
  status,
  price,
  sellerName,
  buyerName,
  orderDate,
  onPress,
  index = 0,
}: FlagshipOrderCardProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const tone =
    status === 'delivered'
      ? 'delivered'
      : status === 'shipped'
      ? 'shipped'
      : status === 'cancelled' || status === 'refunded'
      ? 'error'
      : 'pending';

  const actorLabel = buyerName ? `To ${buyerName}` : sellerName ? `From ${sellerName}` : '';
  const cardLabel = [listingTitle, price, status, actorLabel, orderDate].filter(Boolean).join(', ');

  return (
    <AnimatedPressable
      onPress={onPress}
      style={styles.root}
      {...PressPresets.listRow}
      accessibilityRole="button"
      accessibilityLabel={cardLabel}
      accessibilityHint="View order details"
    >
      {/* Product Image */}
      <View style={styles.imageWrap}>
        {imageUri ? (
          <CachedImage
            uri={imageUri}
            style={styles.image}
            contentFit="cover"
            transition={Motion.transitions.mediaLoad.duration}
            accessibilityRole="image"
            accessibilityLabel={listingTitle}
          />
        ) : (
          <View style={[styles.image, styles.imageFallback]} accessibilityElementsHidden>
            <Ionicons name="cube-outline" size={IconGrammar.hero} color={colors.textMuted} />
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text numberOfLines={1} style={styles.title}>
            {listingTitle}
          </Text>
          <Text style={styles.price}>{price}</Text>
        </View>

        <View style={styles.middleRow}>
          <PremiumStatusPill tone={tone} label={status.charAt(0).toUpperCase() + status.slice(1)} />
          {actorLabel ? <Text style={styles.actor}>{actorLabel}</Text> : null}
        </View>

        {orderDate ? (
          <Text style={styles.date}>{orderDate}</Text>
        ) : null}
      </View>

      {/* Chevron */}
      <Ionicons name="chevron-forward" size={IconGrammar.metadata} color={colors.textMuted} style={styles.chevron} accessibilityElementsHidden />
    </AnimatedPressable>
  );
}

const IMAGE_SIZE = ThumbSize.md;

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
  },
  image: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    marginLeft: Space.sm,
    justifyContent: 'center',
    gap: Space.xs / 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  title: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: FontFamily.semibold,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  price: {
    fontSize: Type.priceList.size,
    fontFamily: FontFamily.bold,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  middleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flexWrap: 'wrap',
  },
  actor: {
    fontSize: Type.caption.size,
    fontFamily: FontFamily.medium,
    color: colors.textSecondary,
  },
  date: {
    fontSize: Type.meta.size,
    fontFamily: FontFamily.regular,
    color: colors.textMuted,
    marginTop: Space.xs / 2,
  },
  chevron: {
    marginLeft: Space.xs,
  },
});
