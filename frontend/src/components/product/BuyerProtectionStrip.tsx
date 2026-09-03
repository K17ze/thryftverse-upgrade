import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

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
 *
 * Visual language: surface card with success-tinted background, rounded corners,
 * verified icon in a circular success-tinted badge. Feels like an authored trust
 * element, not a pasted text block.
 */
export function BuyerProtectionStrip({
  policyLabel,
  compact = false,
  message }: BuyerProtectionStripProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const text = message ?? 'Your money is held safely until you confirm receipt';
  const label = policyLabel ?? 'Buyer Protection';

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
        <Text style={styles.compactText} numberOfLines={1}>
          {text}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} style={styles.startIcon} />
      <View style={styles.textWrap}>
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {text}
        </Text>
      </View>
      <Ionicons name="lock-closed" size={14} color={colors.success} style={styles.endIcon} />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    marginTop: Space.sm,
    marginHorizontal: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: colors.successSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.successBorder },
  startIcon: {
    flexShrink: 0 },
  textWrap: {
    flex: 1,
    gap: Space.xs / 2 },
  title: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary,
    letterSpacing: 0.1 },
  subtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    lineHeight: 16 },
  endIcon: {
    flexShrink: 0,
    opacity: 0.6 },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: colors.successSubtle,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.successBorder },
  compactText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary } });
}
