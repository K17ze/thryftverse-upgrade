import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { BottomSheet } from '../BottomSheet';
import { PriceRow } from './PriceRow';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  itemLabel: string;
  protectionLabel: string;
  /** Delivery price label; the " (Estimated)" suffix is applied by the
   *  caller via deliveryRowLabel. */
  deliveryRowLabel: string;
  deliveryLabel: string;
  /** Formatted wallet credit — when set, the applied row and the
   *  "To pay" row render. */
  walletAppliedLabel?: string;
  /** Mirrors the screen's useBalance flag — the standalone divider renders
   *  only when no wallet credit is in play. */
  useBalance: boolean;
  totalLabel: string;
}

export function CheckoutBreakdownSheet({
  visible,
  onDismiss,
  itemLabel,
  protectionLabel,
  deliveryRowLabel,
  deliveryLabel,
  walletAppliedLabel,
  useBalance,
  totalLabel,
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      snapPoint={0.6}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Full breakdown</Text>
        <PriceRow label="Item" value={itemLabel} />
        <PriceRow label="Buyer protection fee" value={protectionLabel} />
        <PriceRow
          label={deliveryRowLabel}
          value={deliveryLabel}
        />
        <View style={styles.protectionIncludedRow}>
          <Ionicons name="checkmark-circle" size={12} color={colors.success} importantForAccessibility="no" />
          <Text style={styles.protectionIncludedText}>
            Includes buyer protection — funds held until you receive your order
          </Text>
        </View>
        {walletAppliedLabel ? (
          <>
            <PriceRow
              label="Wallet balance applied"
              value={`-${walletAppliedLabel}`}
            />
            <View style={styles.divider} />
            <PriceRow label="To pay" value={totalLabel} bold />
          </>
        ) : null}
        {!useBalance && (
          <View style={styles.divider} />
        )}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>
            {totalLabel}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.policyRow}>
          <Ionicons name="return-down-back-outline" size={16} color={colors.textMuted} importantForAccessibility="no" />
          <Text style={styles.policyText}>
            Returns accepted within 14 days. Refunds issued to your original payment method.
          </Text>
        </View>
      </View>
    </BottomSheet>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.lg,
  },
  title: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.semibold,
    marginBottom: Space.md,
    color: colors.textPrimary,
  },
  protectionIncludedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 1,
    paddingTop: Space.xs + 2,
  },
  protectionIncludedText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.meta.lineHeight,
    color: colors.success,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.sm,
    backgroundColor: colors.border,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs,
  },
  totalLabel: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
    color: colors.textPrimary,
  },
  totalValue: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
    color: colors.textPrimary,
  },
  policyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingVertical: Space.xs,
  },
  policyText: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.body.lineHeight,
    color: colors.textSecondary,
  },
});
