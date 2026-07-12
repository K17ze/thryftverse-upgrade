import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
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

function resolveColor(colorKey: string): string {
  if (colorKey === 'success') return Colors.success;
  if (colorKey === 'brand') return Colors.brand;
  if (colorKey === 'danger') return Colors.danger;
  return Colors.textSecondary;
}

export function VerificationBadge({ tier, compact = false }: VerificationBadgeProps) {
  const info = VERIFICATION_TIERS[tier];
  if (!info) return null;
  const color = resolveColor(info.color);

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
 * Falls back to `verified` boolean for backward compatibility.
 */
export function resolveVerificationTier(
  verified?: boolean,
  verificationTier?: VerificationTier,
): VerificationTier | null {
  if (verificationTier) return verificationTier;
  if (verified) return 'email';
  return null;
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.1,
  },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  compactText: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.1,
  },
});
