import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
  if (capabilities.isOwner) {
    return (
      <View style={styles.container}>
        <View style={styles.priceSection}>
          <Text style={styles.priceLabel}>Your listing</Text>
          <Text style={styles.priceValue}>{formattedPrice}</Text>
        </View>
        <AnimatedPressable
          style={styles.manageBtn}
          onPress={onManage}
          {...PressPresets.primaryButton}
          accessibilityLabel="Manage listing"
          accessibilityRole="button"
        >
          <Ionicons name="settings-outline" size={18} color={Colors.textInverse} />
          <Text style={styles.manageText}>Manage</Text>
        </AnimatedPressable>
      </View>
    );
  }

  if (capabilities.isSold) {
    return (
      <View style={styles.container}>
        <View style={styles.priceSection}>
          <Text style={styles.priceLabel}>Sold</Text>
          <Text style={styles.priceValue}>{formattedPrice}</Text>
        </View>
        <View style={styles.soldBadge}>
          <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
          <Text style={styles.soldText}>This item has been sold</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.priceSection}>
        <Text style={styles.priceLabel}>Price</Text>
        <Text style={styles.priceValue}>{formattedPrice}</Text>
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
            <Text style={styles.offerText}>Offer</Text>
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
            <Text style={styles.buyText}>Buy now</Text>
          </AnimatedPressable>
        )}

        {capabilities.canMessage && !capabilities.canBuy && (
          <AnimatedPressable
            style={styles.messageBtn}
            onPress={onMessage}
            {...PressPresets.primaryButton}
            accessibilityLabel="Message seller"
            accessibilityRole="button"
          >
            <Ionicons name="chatbubble-outline" size={18} color={Colors.textPrimary} />
            <Text style={styles.messageBtnText}>Message</Text>
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
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: Colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    gap: Space.md,
  },
  priceSection: {
    flex: 1,
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
  },
  offerBtn: {
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
    paddingVertical: 12,
    paddingHorizontal: Space.lg,
    backgroundColor: Colors.brand,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
  },
  messageBtn: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: Space.lg,
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
  manageBtn: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: Space.lg,
    backgroundColor: Colors.brand,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
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
  },
  soldText: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
});
