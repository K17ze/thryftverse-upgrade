import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { Space, Type, Typography, Radius } from '../../theme/designTokens';
import type {
  CoOwnRecourseAgreement,
  CoOwnSellerLiability,
  CoOwnVerificationDemand,
} from '../../services/marketApi';
import { formatShortDate } from '../../utils/dateFormat';

export interface CoOwnRecoursePanelProps {
  recourseAgreementSigned: boolean;
  recourseStatus: 'pending' | 'active' | 'triggered' | 'settled' | 'disputed';
  totalTradedValueGbp?: number;
  activeVerificationDemands?: number;
  agreement?: CoOwnRecourseAgreement | null;
  sellerLiability?: CoOwnSellerLiability | null;
  verificationDemands?: CoOwnVerificationDemand[];
  onRequestVerification?: () => void;
  onRespondToVerification?: (demandId: number) => void;
  isHolder?: boolean;
  isIssuer?: boolean;
}

export function CoOwnRecoursePanel({
  recourseAgreementSigned,
  recourseStatus,
  totalTradedValueGbp,
  activeVerificationDemands,
  agreement,
  sellerLiability,
  verificationDemands,
  onRequestVerification,
  onRespondToVerification,
  isHolder,
  isIssuer,
}: CoOwnRecoursePanelProps) {
  const { colors } = useAppTheme();
  const { currencySymbol } = useFormattedPrice();

  const items: Array<{ icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string; positive: boolean; warning?: boolean }> = [];

  // ── Recourse agreement status ──
  if (recourseAgreementSigned && agreement) {
    const liabilityStr = agreement.maxLiabilityGbp != null
      ? ` · ${currencySymbol}${Math.round(agreement.maxLiabilityGbp).toLocaleString()} liability`
      : '';
    items.push({
      icon: 'shield-checkmark',
      label: 'Seller liability',
      value: `Personal guarantee signed${liabilityStr}`,
      positive: true,
    });
  } else if (recourseStatus === 'pending') {
    items.push({
      icon: 'alert-circle-outline',
      label: 'Seller liability',
      value: 'Recourse agreement not signed',
      positive: false,
      warning: true,
    });
  }

  // ── Recourse triggered (seller defaulted) ──
  if (recourseStatus === 'triggered' && agreement?.triggeredReason) {
    items.push({
      icon: 'warning-outline',
      label: 'Recourse triggered',
      value: agreement.triggeredReason,
      positive: false,
      warning: true,
    });
  }

  // ── Seller risk tier ──
  if (sellerLiability) {
    const riskLabel = sellerLiability.riskTier === 'standard'
      ? 'Standard'
      : sellerLiability.riskTier === 'elevated'
      ? 'Elevated risk'
      : sellerLiability.riskTier === 'high'
      ? 'High risk'
      : 'Blocked';

    const bgLabel = sellerLiability.backgroundCheckStatus === 'passed'
      ? 'Background check passed'
      : sellerLiability.backgroundCheckStatus === 'pending'
      ? 'Background check pending'
      : sellerLiability.backgroundCheckStatus === 'failed'
      ? 'Background check failed'
      : 'Background check expired';

    items.push({
      icon: sellerLiability.backgroundCheckStatus === 'passed' ? 'checkmark-circle' : 'hourglass-outline',
      label: 'Seller background',
      value: `${riskLabel} · ${bgLabel}`,
      positive: sellerLiability.riskTier === 'standard' && sellerLiability.backgroundCheckStatus === 'passed',
    });

    // Total active liability across all assets
    if (sellerLiability.totalActiveLiabilityGbp > 0) {
      items.push({
        icon: 'cash-outline',
        label: 'Total seller liability',
        value: `${currencySymbol}${Math.round(sellerLiability.totalActiveLiabilityGbp).toLocaleString()} across ${sellerLiability.activeAgreementCount} asset${sellerLiability.activeAgreementCount > 1 ? 's' : ''}`,
        positive: false,
      });
    }

    // Past recourse history
    if (sellerLiability.totalRecourseTriggered > 0) {
      items.push({
        icon: 'warning-outline',
        label: 'Recourse history',
        value: `${sellerLiability.totalRecourseTriggered} past recourse trigger${sellerLiability.totalRecourseTriggered > 1 ? 's' : ''}`,
        positive: false,
        warning: true,
      });
    }
  }

  // ── Total traded value (what's at stake) ──
  if (totalTradedValueGbp != null && totalTradedValueGbp > 0) {
    items.push({
      icon: 'trending-up-outline',
      label: 'Total traded value',
      value: `${currencySymbol}${Math.round(totalTradedValueGbp).toLocaleString()} traded on this asset`,
      positive: false,
    });
  }

  // ── Active verification demands ──
  if (activeVerificationDemands != null && activeVerificationDemands > 0) {
    items.push({
      icon: 'search-outline',
      label: 'Verification demands',
      value: `${activeVerificationDemands} active demand${activeVerificationDemands > 1 ? 's' : ''} from unit holders`,
      positive: false,
      warning: true,
    });
  }

  if (items.length === 0) return null;

  const a11yLabel = `Seller accountability. ${items.map((i) => `${i.label}: ${i.value}`).join('. ')}`;

  return (
    <View accessibilityRole="summary" accessibilityLabel={a11yLabel}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
        Seller accountability
      </Text>
      <View style={styles.itemsList}>
        {items.map((item, i) => (
          <View
            key={`${item.label}-${i}`}
            style={[styles.itemRow, i < items.length - 1 && { borderBottomColor: colors.borderSubtle }]}
          >
            <Ionicons
              name={item.icon}
              size={16}
              color={item.positive ? colors.brand : item.warning ? colors.warning : colors.textMuted}
            />
            <View style={styles.itemBody}>
              <Text style={[styles.itemLabel, { color: colors.textMuted }]}>{item.label}</Text>
              <Text
                style={[
                  styles.itemValue,
                  {
                    color: item.positive
                      ? colors.textPrimary
                      : item.warning
                      ? colors.warning
                      : colors.textSecondary,
                  },
                ]}
              >
                {item.value}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Verification demand button — only for unit holders */}
      {isHolder && onRequestVerification && recourseAgreementSigned && recourseStatus === 'active' && (
        <Pressable
          style={({ pressed }) => [
            styles.demandButton,
            { borderColor: colors.border, backgroundColor: colors.surface },
            pressed && { opacity: 0.7 },
          ]}
          onPress={onRequestVerification}
          accessibilityRole="button"
          accessibilityLabel="Request verification from seller"
        >
          <Ionicons name="search-outline" size={16} color={colors.textPrimary} />
          <Text style={[styles.demandButtonText, { color: colors.textPrimary }]}>
            Request verification
          </Text>
        </Pressable>
      )}

      {/* Seller-side: respond to pending verification demands */}
      {isIssuer && onRespondToVerification && activeVerificationDemands != null && activeVerificationDemands > 0 && (
        <Pressable
          style={({ pressed }) => [
            styles.demandButton,
            { borderColor: colors.warning, backgroundColor: colors.warningSubtle },
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => {
            const pending = verificationDemands?.find((d) => d.status === 'pending');
            if (pending) onRespondToVerification(pending.id);
          }}
          accessibilityRole="button"
          accessibilityLabel="Respond to verification request"
        >
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.warning} />
          <Text style={[styles.demandButtonText, { color: colors.warning }]}>
            Respond to verification ({activeVerificationDemands} pending)
          </Text>
        </Pressable>
      )}

      {/* Recent verification demands */}
      {verificationDemands && verificationDemands.length > 0 && (
        <View style={styles.demandsList}>
          <Text style={[styles.demandsTitle, { color: colors.textMuted }]}>
            Recent verification requests
          </Text>
          {verificationDemands.slice(0, 3).map((d) => (
            <View key={d.id} style={styles.demandRow}>
              <Ionicons
                name={
                  d.status === 'compliant' ? 'checkmark-circle'
                  : d.status === 'failed' ? 'close-circle'
                  : d.status === 'pending' ? 'hourglass-outline'
                  : d.status === 'responded' ? 'document-text-outline'
                  : 'alert-circle-outline'
                }
                size={14}
                color={
                  d.status === 'compliant' ? colors.brand
                  : d.status === 'failed' ? colors.danger
                  : colors.textMuted
                }
              />
              <Text style={[styles.demandText, { color: colors.textSecondary }]} numberOfLines={1}>
                {d.demandType} · {d.status}
              </Text>
              <Text style={[styles.demandDate, { color: colors.textMuted }]}>
                {formatShortDate(d.createdAt)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: Space.sm,
  },
  itemsList: {
    gap: 0,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemBody: {
    flex: 1,
    gap: 2,
  },
  itemLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  itemValue: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  demandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Space.sm,
  },
  demandButtonText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  demandsList: {
    marginTop: Space.md,
    gap: Space.xs,
  },
  demandsTitle: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  demandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  demandText: {
    flex: 1,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    textTransform: 'capitalize',
  },
  demandDate: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
  },
});
