import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import type { SellerTrustSummary, VerificationTier } from '../../platform/product';
import { VERIFICATION_TIERS, deriveSellerBadges, SELLER_BADGES } from '../../platform/product';
import type { PublicProfileTrader } from '../../services/profileApi';

/**
 * Trust signal chip — icon + label, restrained.
 * Used in the trust metrics row on profile heroes.
 *
 * 2026 flagship: no bordered pills around every chip — spacing gaps
 * provide rhythm. Icon 14pt (metadata band), label captionElevated.
 * One dot separator between chips when in a horizontal row.
 */
interface TrustChipProps {
  icon: keyof typeof Ionicons.glyphMap | string;
  label: string;
  tone?: 'default' | 'success' | 'muted';
}

function TrustChip({ icon, label, tone = 'default', colors, styles }: TrustChipProps & { colors: ThemeColors; styles: ReturnType<typeof createStyles> }) {
  const color =
    tone === 'success' ? colors.success : tone === 'muted' ? colors.textMuted : colors.textSecondary;
  const isStar = icon === 'star';
  return (
    <View style={styles.chip}>
      <AppIcon
        name={icon}
        focused={isStar}
        size={IconSize.xs}
        color={isStar ? 'ratingStar' : (tone === 'success' ? 'success' : tone === 'muted' ? 'textMuted' : 'textSecondary')}
        opticalCenter
        accessible={false}
      />
      <Text style={[styles.chipText, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export interface ProfileTrustSignalsProps {
  /** Seller trust summary from /sellers/:id endpoint. */
  sellerTrust?: SellerTrustSummary | null;
  /** Rating average from public profile stats (fallback if sellerTrust has none). */
  ratingAverage?: number | null;
  /** Review count from public profile stats. */
  reviewCount?: number;
  /** Sold listing count from public profile stats. */
  soldCount?: number;
  /** DSA Article 30 trader classification from the profile aggregate.
   *  When provided, renders a "Business" or "Private" chip. */
  traderClassification?: PublicProfileTrader | null;
  /** Layout alignment — centered for self-profile, left for public profile. */
  align?: 'left' | 'center';
  /** When true, suppresses the "X sold" chip because the parent already shows
   *  a "Sold" stat. Used by MyProfileIdentityHero to avoid duplication. */
  hideSoldChip?: boolean;
}

/**
 * Compact row of trust signal chips:
 *   ✓ Verified · ★ 4.9 (47) · ⏱ Replies in 1h · 📦 Dispatches same day · ✓ 120 sales
 *
 * Only renders chips for which data is available. Renders null if no signals exist.
 * Spacing gaps (not containers) separate chips — 2026 minimal trend.
 */
export function ProfileTrustSignals({
  sellerTrust,
  ratingAverage,
  reviewCount = 0,
  soldCount = 0,
  traderClassification = null,
  align = 'left',
  hideSoldChip = false }: ProfileTrustSignalsProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const chips: TrustChipProps[] = [];

  // Verified — tiered badge from seller trust only (authoritative backend source).
  // Email verification is never used as a proxy for seller/identity verification.
  const tier: VerificationTier | null = sellerTrust?.verificationTier ?? (sellerTrust?.verified === true ? 'seller' : null);
  if (tier) {
    const info = VERIFICATION_TIERS[tier];
    chips.push({
      icon: info.icon as keyof typeof Ionicons.glyphMap,
      label: info.label,
      tone: info.color === 'success' ? 'success' : 'default' });
  }

  // DSA Article 30 trader classification — factual, not decorative.
  // "Business" for traders, "Private" for non-traders. Only rendered when
  // the aggregate provides the classification (compliance record exists).
  if (traderClassification) {
    chips.push({
      icon: traderClassification.classification === 'trader' ? 'briefcase' : 'person',
      label: traderClassification.classification === 'trader' ? 'Business' : 'Private',
      tone: 'muted' });
  }

  // Rating — prefer seller trust rating, fall back to public profile stats
  const rating = sellerTrust?.rating ?? ratingAverage ?? null;
  const reviews = sellerTrust?.reviewCount ?? reviewCount;
  if (rating !== null && rating !== undefined && reviews > 0) {
    chips.push({
      icon: 'star',
      label: `${rating.toFixed(1)} (${reviews})` });
  } else if (rating !== null && rating !== undefined) {
    chips.push({ icon: 'star', label: rating.toFixed(1) });
  }

  // Response time
  if (sellerTrust?.responseTimeLabel) {
    chips.push({ icon: 'time', label: `Replies ${sellerTrust.responseTimeLabel}` });
  }

  // Dispatch time
  if (sellerTrust?.dispatchTimeLabel) {
    chips.push({ icon: 'car-outline', label: sellerTrust.dispatchTimeLabel });
  }

  // Completed sales — suppressed when hideSoldChip is true (MyProfileIdentityHero
  // shows a "Sold" stat in its stats row). Public profile shows it here.
  if (!hideSoldChip) {
    const completedSales = sellerTrust?.completedSales ?? (soldCount > 0 ? soldCount : null);
    if (completedSales !== null && completedSales !== undefined && completedSales > 0) {
      chips.push({ icon: 'checkmark-done', label: `${completedSales} sold` });
    }
  }

  // Response rate
  if (sellerTrust?.responseRate !== null && sellerTrust?.responseRate !== undefined) {
    chips.push({ icon: 'chatbubble-ellipses', label: `${sellerTrust.responseRate}% reply` });
  }

  // Seller standards badges — fail-closed: only rendered when the backend
  // provides an explicit, persisted programme decision via `badges` field.
  // No client-side derivation from mutable summary values or regex over labels.
  const earnedBadges = deriveSellerBadges(sellerTrust ?? null);
  for (const badgeType of earnedBadges) {
    const badge = SELLER_BADGES[badgeType];
    if (badge) {
      chips.push({
        icon: badge.icon as keyof typeof Ionicons.glyphMap,
        label: badge.label,
        tone: 'success' });
    }
  }

  if (chips.length === 0) return null;

  return (
    <View style={[styles.container, align === 'center' && styles.containerCenter]}>
      {chips.map((chip, index) => (
        <React.Fragment key={`${chip.icon}-${index}`}>
          {index > 0 ? <View style={styles.separator} /> : null}
          <TrustChip {...chip} colors={colors} styles={styles} />
        </React.Fragment>
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.sm },
  containerCenter: {
    justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  chipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.1,
    lineHeight: TypographyV2.meta.lineHeight },
  separator: {
    width: 3,
    height: 3,
    borderRadius: Radius.full,
    backgroundColor: colors.borderSubtle } });
}
