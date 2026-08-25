import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Space, Radius, Type, Stroke } from '../../theme/designTokens';
import { VERIFICATION_TIERS, VerificationTier } from '../../platform/product/listingDetailContract';

/**
 * Tiered verification badge — shows the seller's verification level.
 *
 * Tiers (ascending):
 *   email  → "Verified" (green checkmark)
 *   id     → "ID Verified" (brand card icon)
 *   seller → "Trusted Seller" (green shield)
 *
 * When `compact` is true, renders a single icon + label chip.
 * When `compact` is false, renders a pill with icon + label.
 */
export interface VerificationBadgeProps {
  tier: VerificationTier;
  compact?: boolean;
}

function resolveColor(colorKey: string, colors: ThemeColors): string {
  if (colorKey === 'success') return colors.success;
  if (colorKey === 'brand') return colors.brand;
  if (colorKey === 'danger') return colors.danger;
  return colors.textSecondary;
}

export function VerificationBadge({ tier, compact = false }: VerificationBadgeProps) {
  const { colors } = useAppTheme();
  const info = VERIFICATION_TIERS[tier];
  if (!info) return null;
  const color = resolveColor(info.color, colors);

  if (compact) {
    return (
      <View style={styles.compact}>
        <Ionicons name={info.icon as keyof typeof Ionicons.glyphMap} size={12} color={color} />
        <Text style={[styles.compactText, { color }]} numberOfLines={1}>
          {info.label}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.pill, { backgroundColor: `${color}15`, borderColor: `${color}30` }]}>
      <Ionicons name={info.icon as keyof typeof Ionicons.glyphMap} size={13} color={color} />
      <Text style={[styles.pillText, { color }]} numberOfLines={1}>
        {info.label}
      </Text>
    </View>
  );
}

/**
 * Resolve the highest verification tier from a seller trust summary.
 * Falls back to `verified` boolean for backward compatibility — the legacy
 * `verified` flag on SellerTrustSummary represents seller verification (from
 * the /sellers/:id endpoint), NOT email verification, so it maps to the
 * 'seller' tier. Email verification must never be used as a trust badge.
 */
export function resolveVerificationTier(
  verified?: boolean,
  verificationTier?: VerificationTier,
): VerificationTier | null {
  if (verificationTier) return verificationTier;
  if (verified) return 'seller';
  return null;
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.sm,
    borderWidth: Stroke.standard,
  },
  pillText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.1,
  },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
  },
  compactText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.1,
  },
});
