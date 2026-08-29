import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Typography, Radius, Type } from '../../theme/designTokens';
import { t } from '../../i18n';

// Shown to buyers when status = 'delivered' (not yet 'completed').
// Presents two clear paths: "Everything is OK" (confirm receipt, releases
// escrow) or "Report an issue" (opens support with issue categories).
// The inspection deadline is server-derived — the client does not invent
// a 2-day window. Per P0-4: "The client may format time. It must not
// invent a deadline that changes rights, money, delivery promise or
// eligibility."

export function InspectionBanner({
  inspectionDeadlineAt,
  onConfirmReceipt,
  onReportIssue,
}: {
  inspectionDeadlineAt: string | null;
  onConfirmReceipt: () => void;
  onReportIssue: () => void;
}) {
  const { colors } = useAppTheme();

  const daysLeft = useMemo(() => {
    if (!inspectionDeadlineAt) return null;
    const deadline = new Date(inspectionDeadlineAt);
    if (Number.isNaN(deadline.getTime())) return null;
    return Math.ceil((deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  }, [inspectionDeadlineAt]);

  const expired = daysLeft != null && daysLeft <= 0;

  return (
    <View style={[styles.inspectionBanner, { borderColor: colors.brandBorder, backgroundColor: colors.brandSubtle }]}>
      <View style={styles.inspectionHeader}>
        <View style={[styles.inspectionIcon, { backgroundColor: colors.brandSubtle }]}>
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.brand} aria-hidden={true} />
        </View>
        <View style={styles.inspectionHeaderText}>
          <Text style={[styles.inspectionTitle, { color: colors.textPrimary }]}>
            {t('orderDetail.inspection.title')}
          </Text>
          <Text style={[styles.inspectionSub, { color: colors.textSecondary }]}>
            {expired
              ? t('orderDetail.inspection.expired')
              : daysLeft === 0
                ? t('orderDetail.inspection.lastDay')
                : daysLeft === 1
                  ? t('orderDetail.inspection.oneDayLeft')
                  : t('orderDetail.inspection.daysLeft', { days: daysLeft ?? 0 })}
          </Text>
        </View>
      </View>

      <View style={styles.inspectionActions}>
        <Pressable
          style={[styles.inspectionPrimaryBtn, { backgroundColor: colors.brand }]}
          onPress={onConfirmReceipt}
          accessibilityRole="button"
          accessibilityLabel={t('orderDetail.inspection.confirmA11yLabel')}
        >
          <Ionicons name="checkmark-circle-outline" size={22} color={colors.textInverse} aria-hidden={true} />
          <Text style={[styles.inspectionPrimaryBtnText, { color: colors.textInverse }]}>
            {t('orderDetail.inspection.everythingOk')}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.inspectionSecondaryBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
          onPress={onReportIssue}
          accessibilityRole="button"
          accessibilityLabel={t('orderDetail.inspection.reportA11yLabel')}
        >
          <Ionicons name="alert-circle-outline" size={22} color={colors.danger} aria-hidden={true} />
          <Text style={[styles.inspectionSecondaryBtnText, { color: colors.danger }]}>
            {t('orderDetail.inspection.reportIssue')}
          </Text>
        </Pressable>
      </View>

      <Text style={[styles.inspectionFootnote, { color: colors.textMuted }]}>
        {t('orderDetail.inspection.footnote')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  inspectionBanner: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.sm,
  },
  inspectionHeader: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'flex-start',
  },
  inspectionIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inspectionHeaderText: {
    flex: 1,
    gap: 2,
  },
  inspectionTitle: {
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.semibold,
  },
  inspectionSub: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.size + 4,
  },
  inspectionActions: {
    gap: Space.xs + 2,
  },
  inspectionPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.lg,
    minHeight: 44,
  },
  inspectionPrimaryBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  inspectionSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  inspectionSecondaryBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  inspectionFootnote: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.size + 4,
  },
});
