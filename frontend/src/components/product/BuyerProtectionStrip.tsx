import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';

export interface BuyerProtectionStripProps {
  /** Optional policy label from server (e.g. "Thryftverse Buyer Protection") */
  policyLabel?: string | null;
  /** Whether to show the compact variant (for checkout) or full variant (for PDP) */
  compact?: boolean;
  /** Optional custom message override */
  message?: string | null;
}

/**
 * Buyer protection trust strip — shown on PDP and checkout.
 *
 * Communicates the escrow narrative: "Your money is held until you confirm receipt."
 * This is the single most important trust signal for stranger-to-stranger commerce
 * (Vinted/eBay model).
 */
export function BuyerProtectionStrip({
  policyLabel,
  compact = false,
  message,
}: BuyerProtectionStripProps) {
  const text = message ?? 'Your money is held safely until you confirm receipt';
  const label = policyLabel ?? 'Buyer Protection';

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <Ionicons name="shield-checkmark" size={14} color={Colors.success} />
        <Text style={styles.compactText} numberOfLines={1}>
          {text}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="shield-checkmark" size={18} color={Colors.success} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    marginTop: Space.xs,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: `${Colors.success}15`,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    letterSpacing: 0.1,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: `${Colors.success}08`,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${Colors.success}25`,
  },
  compactText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
});
