import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
import type { SellerTrustSummary, VerificationTier } from '../../platform/product';
import { VERIFICATION_TIERS, deriveSellerBadges, SELLER_BADGES } from '../../platform/product';

/**
 * Trust signal chip — icon + label, restrained.
 * Used in the trust metrics row on profile heroes.
 */
interface TrustChipProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone?: 'default' | 'success' | 'muted';
}

function TrustChip({ icon, label, tone = 'default' }: TrustChipProps) {
  const color =
    tone === 'success' ? Colors.success : tone === 'muted' ? Colors.textMuted : Colors.textSecondary;
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[styles.chipText, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export interface ProfileTrustSignalsProps {
  /** Seller trust summary from /sellers/:id endpoint. */
  sellerTrust?: SellerTrustSummary | null;
  /** Email-verified flag from the user profile. */
  emailVerified?: boolean;
  /** Rating average from public profile stats (fallback if sellerTrust has none). */
  ratingAverage?: number | null;
  /** Review count from public profile stats. */
  reviewCount?: number;
  /** Sold listing count from public profile stats. */
  soldCount?: number;
  /** Layout alignment — centered for self-profile, left for public profile. */
  align?: 'left' | 'center';
}

/**
 * Compact row of trust signal chips:
 *   ✓ Verified · ★ 4.9 (47) · ⏱ Replies in 1h · 📦 Dispatches same day · ✓ 120 sales
 *
 * Only renders chips for which data is available. Renders null if no signals exist.
 */
export function ProfileTrustSignals({
  sellerTrust,
  emailVerified,
  ratingAverage,
  reviewCount = 0,
  soldCount = 0,
  align = 'left',
}: ProfileTrustSignalsProps) {
  const chips: TrustChipProps[] = [];

  // Verified — tiered badge from seller trust (authoritative) or email-verified fallback
  const tier: VerificationTier | null = sellerTrust?.verificationTier ?? (sellerTrust?.verified === true || emailVerified === true ? 'email' : null);
  if (tier) {
    const info = VERIFICATION_TIERS[tier];
    chips.push({
      icon: info.icon as keyof typeof Ionicons.glyphMap,
      label: info.label,
      tone: info.color === 'success' ? 'success' : 'default',
    });
  }

  // Rating — prefer seller trust rating, fall back to public profile stats
  const rating = sellerTrust?.rating ?? ratingAverage ?? null;
  const reviews = sellerTrust?.reviewCount ?? reviewCount;
  if (rating !== null && rating !== undefined && reviews > 0) {
    chips.push({
      icon: 'star',
      label: `${rating.toFixed(1)} (${reviews})`,
    });
  } else if (rating !== null && rating !== undefined) {
    chips.push({ icon: 'star', label: rating.toFixed(1) });
  }

  // Response time
  if (sellerTrust?.responseTimeLabel) {
    chips.push({ icon: 'time', label: `Replies ${sellerTrust.responseTimeLabel}` });
  }

  // Dispatch time
  if (sellerTrust?.dispatchTimeLabel) {
    chips.push({ icon: 'cube', label: sellerTrust.dispatchTimeLabel });
  }

  // Completed sales — prefer seller trust, fall back to sold count
  const completedSales = sellerTrust?.completedSales ?? (soldCount > 0 ? soldCount : null);
  if (completedSales !== null && completedSales !== undefined && completedSales > 0) {
    chips.push({ icon: 'checkmark-done', label: `${completedSales} sold` });
  }

  // Response rate
  if (sellerTrust?.responseRate !== null && sellerTrust?.responseRate !== undefined) {
    chips.push({ icon: 'chatbubble-ellipses', label: `${sellerTrust.responseRate}% reply` });
  }

  // Seller standards badges — derived from trust metrics
  const earnedBadges = deriveSellerBadges(sellerTrust ?? null);
  for (const badgeType of earnedBadges) {
    const badge = SELLER_BADGES[badgeType];
    if (badge) {
      chips.push({
        icon: badge.icon as keyof typeof Ionicons.glyphMap,
        label: badge.label,
        tone: 'success',
      });
    }
  }

  if (chips.length === 0) return null;

  return (
    <View style={[styles.container, align === 'center' && styles.containerCenter]}>
      {chips.map((chip, index) => (
        <TrustChip key={`${chip.icon}-${index}`} {...chip} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs,
  },
  containerCenter: {
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.sm,
  },
  chipText: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.1,
  },
});
