import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
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
  const { width: screenWidth } = useWindowDimensions();
  const isCompact = screenWidth < 360;
  const hasMultipleActions = (capabilities.canOffer ? 1 : 0) + (capabilities.canBuy ? 1 : 0) + (capabilities.canMessage ? 1 : 0) > 1;
  const shouldStack = isCompact && hasMultipleActions && capabilities.canBuy;

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
          <Ionicons name="settings-outline" size={18} color={Colors.textInverse} />
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
          <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
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
        <AnimatedPressable
          style={styles.buyBtnFull}
          onPress={onBuy}
          {...PressPresets.primaryButton}
          accessibilityLabel="Buy now"
          accessibilityRole="button"
        >
          <Text style={styles.buyText} numberOfLines={1}>Buy now</Text>
        </AnimatedPressable>
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
              <Ionicons name="chatbubble-outline" size={18} color={Colors.textPrimary} />
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
            <Ionicons name="chatbubble-outline" size={18} color={Colors.textPrimary} />
          </AnimatedPressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.md,
  },
  stackedContainer: {
    gap: Space.sm,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
  },
  priceSection: {
    flex: 1,
    flexShrink: 1,
  },
  priceLabel: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  priceValue: {
    fontSize: 20,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
    flexShrink: 1,
  },
  offerBtn: {
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: Space.md,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  offerBtnFlex: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: Space.md,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  buyBtn: {
    minHeight: 44,
    paddingVertical: 14,
    paddingHorizontal: Space.xl,
    backgroundColor: Colors.brand,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
    flexShrink: 0,
  },
  buyBtnFull: {
    minHeight: 48,
    paddingVertical: 14,
    backgroundColor: Colors.brand,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyText: {
    fontSize: 16,
    fontFamily: Typography.family.bold,
    color: Colors.textInverse,
  },
  messageBtn: {
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: Space.md,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  messageBtnFlex: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: Space.md,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  messageBtnText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  manageBtn: {
    flexDirection: 'row',
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: Space.lg,
    backgroundColor: Colors.brand,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    flexShrink: 0,
  },
  manageText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
  },
  soldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: 12,
    paddingHorizontal: Space.md,
    flexShrink: 1,
  },
  soldText: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
});
