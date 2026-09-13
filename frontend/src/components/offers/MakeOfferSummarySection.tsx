import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { makeOfferScreenStyles as styles } from './makeOfferScreenStyles';

export interface MakeOfferSummarySectionProps {
  numericOfferGbp: number;
  platformChargeGbp: number;
  total: number;
}

/** Summary + trust block for MakeOfferScreen: flat rows with a hairline
 *  separator (no card), then the inline buyer-protection note. */
export function MakeOfferSummarySection({
  numericOfferGbp,
  platformChargeGbp,
  total,
}: MakeOfferSummarySectionProps) {
  const { colors } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();

  return (
    <>
      {/* ── Summary ──
          Flat rows with hairline separator, not a card. Per AGENTS.md
          surface budget: flat canvas, hairlines, no cards. */}
      <View>
      <View style={styles.summarySection}>
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          Summary
        </Text>
        <View style={[styles.summaryRow, { borderBottomColor: colors.borderSubtle }]}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
            Your offer
          </Text>
          <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
            {formatFromFiat(numericOfferGbp, 'GBP')}
          </Text>
        </View>
        <View style={[styles.summaryRow, { borderBottomColor: colors.borderSubtle }]}>
          <View style={styles.summaryLabelCluster}>
            <Ionicons name="checkmark-circle-outline" size={15} color={colors.textSecondary} />
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
              Platform charge
            </Text>
          </View>
          <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
            {formatFromFiat(platformChargeGbp, 'GBP')}
          </Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: colors.textPrimary }]}>
            Total
          </Text>
          <Text style={[styles.totalValue, { color: colors.brand }]}>
            {formatFromFiat(total, 'GBP')}
          </Text>
        </View>
      </View>
      </View>

      {/* ── Trust signal ──
          Inline buyer protection note, not a card. Per Design.md:
          trust signals are decision inputs, not decoration. */}
      <View>
      <View style={styles.trustRow}>
        <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
        <Text style={[styles.trustText, { color: colors.textSecondary }]}>
          Protected by ThryftVerse Buyer Protection — secure settlement and support included.
        </Text>
      </View>

      </View>
    </>
  );
}
