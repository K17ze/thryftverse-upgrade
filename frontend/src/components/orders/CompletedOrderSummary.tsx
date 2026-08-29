import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
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
  hasReview }: {
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
    actionRow: { borderBottomColor: colors.borderSubtle } }), [colors]);

  return (
    <View style={styles.completedSection}>
      <Text style={[styles.sectionLabel, themed.label]}>{t('orderDetail.completed.label')}</Text>
      <Text style={[styles.completedTitle, themed.title]}>
        {t('orderDetail.completed.title')}
      </Text>

      <Pressable
        style={({ pressed }) => [styles.completedActionRow, themed.actionRow, pressed && styles.completedActionPressed]}
        onPress={() => { haptics.tap(); onViewReceipt(); }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.sm },
  completedSection: {
    paddingVertical: Space.sm,
    gap: Space.xs },
  completedTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    marginBottom: Space.sm },
  completedActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: Control.hit },
  completedActionPressed: {
    opacity: 0.6 },
  completedActionText: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing } });
