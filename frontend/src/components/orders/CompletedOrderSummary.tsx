import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Typography, Type, Control } from '../../theme/designTokens';
import { haptics } from '../../utils/haptics';
import { t } from '../../i18n';

// Quiet completion state shown when status === 'completed'. Collapses
// operational chrome (timeline, inspection banner) and prioritises:
// receipt → review → buy/sell again → support history.

export function CompletedOrderSummary({
  onLeaveReview,
  onBuyAgain,
  onViewReceipt,
  onViewSupportHistory,
  hasReview,
}: {
  onLeaveReview: () => void;
  onBuyAgain: () => void;
  onViewReceipt: () => void;
  onViewSupportHistory: () => void;
  hasReview: boolean;
}) {
  const { colors } = useAppTheme();
  const themed = useMemo(() => ({
    label: { color: colors.textMuted },
    title: { color: colors.textPrimary },
    actionText: { color: colors.brand },
    actionRow: { borderBottomColor: colors.borderSubtle },
  }), [colors]);

  return (
    <View style={styles.completedSection}>
      <Text style={[styles.sectionLabel, themed.label]}>{t('orderDetail.completed.label')}</Text>
      <Text style={[styles.completedTitle, themed.title]}>
        {t('orderDetail.completed.title')}
      </Text>

      <Pressable
        style={({ pressed }) => [styles.completedActionRow, themed.actionRow, pressed && styles.completedActionPressed]}
        onPress={() => { haptics.tap(); onViewReceipt(); }}
        accessibilityRole="button"
        accessibilityLabel={t('orderDetail.completed.viewReceiptA11y')}
      >
        <Ionicons name="receipt-outline" size={22} color={colors.brand} aria-hidden={true} />
        <Text style={[styles.completedActionText, themed.actionText]}>{t('orderDetail.completed.viewReceipt')}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
      </Pressable>

      {!hasReview ? (
        <Pressable
          style={({ pressed }) => [styles.completedActionRow, themed.actionRow, pressed && styles.completedActionPressed]}
          onPress={() => { haptics.tap(); onLeaveReview(); }}
          accessibilityRole="button"
          accessibilityLabel={t('orderDetail.completed.leaveReviewA11y')}
        >
          <Ionicons name="star-outline" size={22} color={colors.brand} aria-hidden={true} />
          <Text style={[styles.completedActionText, themed.actionText]}>{t('orderDetail.completed.leaveReview')}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
        </Pressable>
      ) : null}

      <Pressable
        style={({ pressed }) => [styles.completedActionRow, themed.actionRow, pressed && styles.completedActionPressed]}
        onPress={() => { haptics.tap(); onBuyAgain(); }}
        accessibilityRole="button"
        accessibilityLabel={t('orderDetail.completed.buyAgainA11y')}
      >
        <Ionicons name="bag-outline" size={22} color={colors.brand} aria-hidden={true} />
        <Text style={[styles.completedActionText, themed.actionText]}>{t('orderDetail.completed.buyAgain')}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.completedActionRow, pressed && styles.completedActionPressed]}
        onPress={() => { haptics.tap(); onViewSupportHistory(); }}
        accessibilityRole="button"
        accessibilityLabel={t('orderDetail.completed.supportHistoryA11y')}
      >
        <Ionicons name="help-circle-outline" size={22} color={colors.brand} aria-hidden={true} />
        <Text style={[styles.completedActionText, themed.actionText]}>{t('orderDetail.completed.supportHistory')}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.sm,
  },
  completedSection: {
    paddingVertical: Space.sm,
    gap: Space.xs,
  },
  completedTitle: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
    marginBottom: Space.sm,
  },
  completedActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: Control.hit,
  },
  completedActionPressed: {
    opacity: 0.6,
  },
  completedActionText: {
    flex: 1,
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyStrong.letterSpacing,
  },
});
