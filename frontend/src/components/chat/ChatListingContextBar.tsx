import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import type { ConversationContext } from '../../domain';

export interface ChatListingContextBarProps {
  context: ConversationContext;
  priceDisplay: string;
  onPress: () => void;
  onPressOrder?: () => void;
}

type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

interface StatusBadge {
  label: string;
  tone: BadgeTone;
}

function deriveStatusBadge(context: ConversationContext): StatusBadge | null {
  if (context.order) {
    const map: Record<string, { label: string; tone: BadgeTone }> = {
      pending: { label: 'Order placed', tone: 'brand' },
      paid: { label: 'Paid', tone: 'brand' },
      shipped: { label: 'Shipped', tone: 'brand' },
      delivered: { label: 'Delivered', tone: 'success' },
      completed: { label: 'Completed', tone: 'success' },
      cancelled: { label: 'Cancelled', tone: 'danger' },
      refunded: { label: 'Refunded', tone: 'danger' },
    };
    return map[context.order.status] ?? null;
  }
  if (context.offer) {
    const map: Record<string, { label: string; tone: BadgeTone }> = {
      pending: { label: 'Offer pending', tone: 'warning' },
      countered: { label: 'Countered', tone: 'warning' },
      accepted: { label: 'Offer accepted', tone: 'success' },
      rejected: { label: 'Offer declined', tone: 'danger' },
      expired: { label: 'Offer expired', tone: 'neutral' },
      withdrawn: { label: 'Offer withdrawn', tone: 'neutral' },
    };
    return map[context.offer.status] ?? null;
  }
  if (context.listing) {
    const map: Record<string, { label: string; tone: BadgeTone }> = {
      sold: { label: 'Sold', tone: 'neutral' },
      paused: { label: 'Paused', tone: 'neutral' },
      deleted: { label: 'Removed', tone: 'neutral' },
    };
    return map[context.listing.status] ?? null;
  }
  return null;
}

function badgeColor(tone: BadgeTone, colors: ReturnType<typeof useAppTheme>['colors']): string {
  switch (tone) {
    case 'brand': return colors.brand;
    case 'success': return colors.success;
    case 'warning': return colors.warning;
    case 'danger': return colors.danger;
    default: return colors.textMuted;
  }
}

export function ChatListingContextBar({
  context,
  priceDisplay,
  onPress,
  onPressOrder,
}: ChatListingContextBarProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const listing = context.listing;
  if (!listing) return null;

  const badge = deriveStatusBadge(context);
  const badgeClr = badge ? badgeColor(badge.tone, colors) : colors.textMuted;

  const handlePress = context.order && onPressOrder ? onPressOrder : onPress;

  return (
    <AnimatedPressable
      onPress={handlePress}
      activeOpacity={0.7}
      scaleValue={0.99}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel={`${listing.title}, ${priceDisplay}${badge ? `, ${badge.label}` : ''}`}
      style={styles.row}
    >
      {listing.imageUrl ? (
        <CachedImage
          uri={listing.imageUrl}
          style={styles.thumb}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Text style={styles.thumbFallbackText}>
            {listing.title.slice(0, 2).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{listing.title}</Text>
        <Text style={styles.price} numberOfLines={1}>{priceDisplay}</Text>
      </View>
      {badge && (
        <View style={[styles.badge, { backgroundColor: `${badgeClr}1A` }]}>
          <View style={[styles.badgeDot, { backgroundColor: badgeClr }]} />
          <Text style={[styles.badgeText, { color: badgeClr }]} numberOfLines={1}>
            {badge.label}
          </Text>
        </View>
      )}
      <Ionicons
        name="chevron-forward"
        size={16}
        color={colors.textMuted}
        style={styles.chevron}
      />
    </AnimatedPressable>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    minHeight: 56,
  },
  thumb: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  thumbFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbFallbackText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  info: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
  },
  price: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.full,
    maxWidth: 130,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.full,
  },
  badgeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  chevron: {
    marginLeft: -Space.xs,
  },
});
