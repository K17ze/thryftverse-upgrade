import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Space, Radius, Type } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';
import type { ListingCapabilities } from '../../platform/product';

export interface ProductActionBarProps {
  capabilities: ListingCapabilities;
  formattedPrice: string;
  onBuy: () => void;
  onOffer: () => void;
  onMessage: () => void;
  onManage: () => void;
}

export function ProductActionBar({
  capabilities,
  formattedPrice,
  onBuy,
  onOffer,
  onMessage,
  onManage,
}: ProductActionBarProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { width: screenWidth } = useWindowDimensions();
  const isCompact = screenWidth < 390;
  const actionCount = (capabilities.canOffer ? 1 : 0) + (capabilities.canBuy ? 1 : 0) + (capabilities.canMessage ? 1 : 0);
  const hasMultipleActions = actionCount > 1;
  const shouldStack = isCompact && hasMultipleActions;

  if (capabilities.isOwner) {
    return (
      <View style={styles.container}>
        <View style={styles.priceSection}>
          <Text style={styles.priceLabel}>Your listing</Text>
          <Text style={styles.priceValue} numberOfLines={1}>{formattedPrice}</Text>
        </View>
        <AnimatedPressable
          style={styles.manageBtn}
          onPress={onManage}
          {...PressPresets.primaryButton}
          accessibilityLabel="Manage listing"
          accessibilityRole="button"
        >
          <Ionicons name="settings-outline" size={18} color={colors.textInverse} />
          <Text style={styles.manageText} numberOfLines={1}>Manage</Text>
        </AnimatedPressable>
      </View>
    );
  }

  if (capabilities.isSold) {
    return (
      <View style={styles.container}>
        <View style={styles.priceSection}>
          <Text style={styles.priceLabel}>Sold</Text>
          <Text style={styles.priceValue} numberOfLines={1}>{formattedPrice}</Text>
        </View>
        <View style={styles.soldBadge}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={styles.soldText} numberOfLines={1}>This item has been sold</Text>
        </View>
      </View>
    );
  }

  if (shouldStack) {
    return (
      <View style={styles.stackedContainer}>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Price</Text>
          <Text style={styles.priceValue} numberOfLines={1}>{formattedPrice}</Text>
        </View>
        {capabilities.canBuy && (
          <AnimatedPressable
            style={styles.buyBtnFull}
            onPress={onBuy}
            {...PressPresets.primaryButton}
            accessibilityLabel="Buy now"
            accessibilityRole="button"
          >
            <Text style={styles.buyText} numberOfLines={1}>Buy now</Text>
          </AnimatedPressable>
        )}
        <View style={styles.secondaryRow}>
          {capabilities.canOffer && (
            <AnimatedPressable
              style={styles.offerBtnFlex}
              onPress={onOffer}
              {...PressPresets.primaryButton}
              accessibilityLabel="Make an offer"
              accessibilityRole="button"
            >
              <Text style={styles.offerText} numberOfLines={1}>Offer</Text>
            </AnimatedPressable>
          )}
          {capabilities.canMessage && (
            <AnimatedPressable
              style={styles.messageBtnFlex}
              onPress={onMessage}
              {...PressPresets.primaryButton}
              accessibilityLabel="Message seller"
              accessibilityRole="button"
            >
              <Ionicons name="chatbubble-outline" size={18} color={colors.textPrimary} />
              <Text style={styles.messageBtnText} numberOfLines={1}>Message</Text>
            </AnimatedPressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.priceSection}>
        <Text style={styles.priceLabel}>Price</Text>
        <Text style={styles.priceValue} numberOfLines={1}>{formattedPrice}</Text>
      </View>

      <View style={styles.actionRow}>
        {capabilities.canOffer && (
          <AnimatedPressable
            style={styles.offerBtn}
            onPress={onOffer}
            {...PressPresets.primaryButton}
            accessibilityLabel="Make an offer"
            accessibilityRole="button"
          >
            <Text style={styles.offerText} numberOfLines={1}>Offer</Text>
          </AnimatedPressable>
        )}

        {capabilities.canBuy && (
          <AnimatedPressable
            style={styles.buyBtn}
            onPress={onBuy}
            {...PressPresets.primaryButton}
            accessibilityLabel="Buy now"
            accessibilityRole="button"
          >
            <Text style={styles.buyText} numberOfLines={1}>Buy now</Text>
          </AnimatedPressable>
        )}

        {capabilities.canMessage && (
          <AnimatedPressable
            style={styles.messageBtn}
            onPress={onMessage}
            {...PressPresets.primaryButton}
            accessibilityLabel="Message seller"
            accessibilityRole="button"
          >
            <Ionicons name="chatbubble-outline" size={18} color={colors.textPrimary} />
          </AnimatedPressable>
        )}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.md,
  },
  stackedContainer: {
    width: '100%',
    minWidth: 0,
    gap: Space.sm,
  },
  priceRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
  },
  priceSection: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  priceLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
  priceValue: {
    minWidth: 0,
    fontSize: Type.priceList.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
  },
  actionRow: {
    minWidth: 0,
    flexDirection: 'row',
    gap: Space.sm,
    flexShrink: 1,
    alignItems: 'center',
  },
  offerBtn: {
    minHeight: 44,
    minWidth: 68,
    paddingVertical: 12,
    paddingHorizontal: Space.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  offerBtnFlex: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: Space.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerText: {
    minWidth: 0,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  buyBtn: {
    minHeight: 44,
    minWidth: 108,
    paddingVertical: 14,
    paddingHorizontal: Space.lg,
    backgroundColor: colors.brand,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  buyBtnFull: {
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: Space.lg,
    backgroundColor: colors.brand,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyText: {
    minWidth: 0,
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.bold,
    color: colors.textInverse,
  },
  messageBtn: {
    width: 44,
    minHeight: 44,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  messageBtnFlex: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: Space.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  messageBtnText: {
    minWidth: 0,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  secondaryRow: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    gap: Space.sm,
  },
  manageBtn: {
    flexDirection: 'row',
    minHeight: 44,
    minWidth: 104,
    paddingVertical: 12,
    paddingHorizontal: Space.md,
    backgroundColor: colors.brand,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    flexShrink: 1,
  },
  manageText: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    color: colors.textInverse,
  },
  soldBadge: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: 12,
    paddingHorizontal: Space.md,
    flexShrink: 1,
  },
  soldText: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
  },
  });
}