import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Type } from '../../../theme/designTokens';

/**
 * Identity seam — one compact identity composition immediately after
 * the hero.
 *
 * Per spec 02:
 *   - family/brand/category line (one eyebrow max);
 *   - title (26–32pt, max two lines, not repeated elsewhere);
 *   - primary commerce value;
 *   - one secondary truth line;
 *   - seller/issuer identity (rendered via CommerceDetailSellerRow
 *     by the screen, not here, so this stays a pure identity block);
 *   - no large independent Watch card;
 *   - no uppercase eyebrow unless it meaningfully distinguishes family
 *     or brand.
 *
 * This is intentionally a flat composition — no card, no border, no
 * surface fill. The page background carries the layout.
 */
export interface CommerceDetailIdentityProps {
  /** Single eyebrow line — family / brand / category. Omit when empty. */
  eyebrow?: string;
  title: string;
  /** Primary transaction value (price / current bid / last trade). */
  primaryValue?: string;
  /** One secondary truth line (e.g. "Original £120" or "5 bids"). */
  secondaryLine?: string;
  /** Optional compact interest signal (e.g. "23 watching"). */
  interestSignal?: string;
  /** Optional small family chip rendered inline with the eyebrow. */
  familyChip?: React.ReactNode;
}

export function CommerceDetailIdentity({
  eyebrow,
  title,
  primaryValue,
  secondaryLine,
  interestSignal,
  familyChip,
}: CommerceDetailIdentityProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.container}>
      {(eyebrow || familyChip) && (
        <View style={styles.eyebrowRow}>
          {eyebrow ? (
            <Text style={[styles.eyebrow, { color: colors.textSecondary }]} numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
          {familyChip}
        </View>
      )}

      <Text
        style={[styles.title, { color: colors.textPrimary }]}
        numberOfLines={2}
        accessibilityRole="header"
      >
        {title}
      </Text>

      {(primaryValue || secondaryLine || interestSignal) && (
        <View style={styles.valueRow}>
          {primaryValue ? (
            <Text
              style={[styles.primaryValue, { color: colors.textPrimary }]}
              accessibilityRole="text"
            >
              {primaryValue}
            </Text>
          ) : null}
          {secondaryLine ? (
            <Text
              style={[styles.secondaryLine, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {secondaryLine}
            </Text>
          ) : null}
          {interestSignal ? (
            <Text
              style={[styles.interest, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {interestSignal}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: Space.xs,
  },
  eyebrow: {
    fontSize: Type.metaElevated.size,
    lineHeight: Type.metaElevated.lineHeight,
    fontWeight: '600',
    letterSpacing: Type.metaElevated.letterSpacing,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: Space.sm,
    marginTop: Space.xs,
  },
  primaryValue: {
    fontSize: Type.priceLarge.size,
    lineHeight: Type.priceLarge.lineHeight,
    fontWeight: '700',
    letterSpacing: Type.priceLarge.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  secondaryLine: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontWeight: '400',
  },
  interest: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
  },
});
