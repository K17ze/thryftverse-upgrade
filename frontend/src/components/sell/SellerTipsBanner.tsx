import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Type, FontFamily } from '../../theme/designTokens';
import { t } from '../../i18n';

export interface SellerTipsBannerProps {
  onDismiss: () => void;
}

/**
 * Dismissible new-seller tips banner. Flat inline — no card chrome
 * (AGENTS.md §4 surface budget). Shows three concise tips for first-time
 * sellers and a close control.
 */
function SellerTipsBanner({ onDismiss }: SellerTipsBannerProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.sellerTipsSection}>
      <View style={styles.sellerTipsHeader}>
        <Ionicons name="bulb-outline" size={16} color={colors.brand} aria-hidden={true} />
        <Text style={[styles.sellerTipsTitle, { color: colors.textPrimary }]}>
          {t('listing.create.sellingTips')}
        </Text>
        <Pressable
          hitSlop={8}
          onPress={onDismiss}
          style={({ pressed }) => pressed && { opacity: 0.5 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss selling tips"
        >
          <Ionicons name="close" size={16} color={colors.textMuted} aria-hidden={true} />
        </Pressable>
      </View>
      <View style={styles.sellerTipsBody}>
        <View style={styles.sellerTipRow}>
          <Ionicons name="camera-outline" size={12} color={colors.textMuted} aria-hidden={true} />
          <Text style={[styles.sellerTipText, { color: colors.textSecondary }]}>
            {t('listing.create.sellingTipLighting')}
          </Text>
        </View>
        <View style={styles.sellerTipRow}>
          <Ionicons name="pricetag-outline" size={12} color={colors.textMuted} aria-hidden={true} />
          <Text style={[styles.sellerTipText, { color: colors.textSecondary }]}>
            {t('listing.create.sellingTipPricing')}
          </Text>
        </View>
        <View style={styles.sellerTipRow}>
          <Ionicons name="chatbubble-outline" size={12} color={colors.textMuted} aria-hidden={true} />
          <Text style={[styles.sellerTipText, { color: colors.textSecondary }]}>
            {t('listing.create.sellingTipRespond')}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default SellerTipsBanner;

const styles = StyleSheet.create({
  sellerTipsSection: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.xs + 2,
  },
  sellerTipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
  },
  sellerTipsTitle: {
    flex: 1,
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: Type.bodyStrong.letterSpacing,
  },
  sellerTipsBody: {
    gap: Space.xs + 1,
  },
  sellerTipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
  },
  sellerTipText: {
    flex: 1,
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight + 2,
    fontFamily: FontFamily.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
});
