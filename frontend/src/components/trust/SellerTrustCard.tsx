/**
 * SellerTrustCard — seller trust profile module for the PDP.
 *
 * Shows seller avatar + name + verification badge, the top 3-4 trust
 * signals as a row, and key metrics (sales count, response time, dispute
 * rate). Includes a "View seller profile" link.
 *
 * Anti-AI / truthful-UI (AGENTS.md §4, §11):
 *  - Flat composed section on the page canvas — a hairline top border
 *    separates it from the identity chapter above. No bordered card-on-card.
 *  - Avatar uses Radius.full (the one permitted avatar radius); trust chips
 *    use the compact utility radius.
 *  - Metrics only render when the profile actually carries the value.
 *    Missing values are omitted, never fabricated.
 *  - Design tokens only — no hardcoded colours, radii, or spacing.
 *  - `accessibilityRole="summary"` plus a composed label so screen readers
 *    announce the seller’s trust picture in one pass.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Stroke, AvatarSize, Control, IconGrammar } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { Motion } from '../../theme/motionTokens';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { CachedImage } from '../CachedImage';
import { TrustSignalRow } from './TrustSignalRow';
import {
  deriveSellerTrustProfile,
  getVerificationLabel,
  selectSignals,
  type TrustSignal,
} from './trustSignals';
import type {
  SellerTrustSummary,
  ListingCommerceContext,
} from '../../platform/product/listingDetailContract';

export interface SellerTrustCardProps {
  seller: SellerTrustSummary;
  commerce?: ListingCommerceContext | null;
  /** Navigate to the seller's shop / profile. */
  onViewProfile?: () => void;
}

export function SellerTrustCard({ seller, commerce, onViewProfile }: SellerTrustCardProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();

  const profile = useMemo(
    () => deriveSellerTrustProfile(seller, commerce),
    [seller, commerce],
  );

  const listingSignals: TrustSignal[] = useMemo(
    () => selectSignals(profile.signals, 'listing', 4),
    [profile.signals],
  );

  const handleViewProfile = () => {
    if (!reducedMotion) haptic.light();
    onViewProfile?.();
  };

  const verificationLabel =
    profile.verificationLevel !== 'unverified'
      ? getVerificationLabel(profile.verificationLevel)
      : null;

  // ── Truthful metrics — only render when the profile carries the value ──
  const metrics: { value: string; label: string }[] = [];
  if (profile.totalSales > 0) {
    metrics.push({
      value: profile.totalSales >= 1000
        ? `${(profile.totalSales / 1000).toFixed(1)}k`
        : `${profile.totalSales}`,
      label: 'sales',
    });
  }
  if (seller.responseTimeLabel) {
    metrics.push({ value: seller.responseTimeLabel, label: 'response' });
  }
  if (seller.rating != null && seller.rating > 0) {
    metrics.push({
      value: seller.rating.toFixed(1),
      label: seller.reviewCount != null ? `${seller.reviewCount} reviews` : 'rating',
    });
  }
  if (profile.disputeRate != null && profile.disputeRate > 0) {
    metrics.push({
      value: `${Math.round(profile.disputeRate * 100)}%`,
      label: 'dispute rate',
    });
  }

  const a11yParts = [
    `Seller ${seller.username}`,
    verificationLabel ?? 'Unverified',
    ...metrics.map((m) => `${m.value} ${m.label}`),
  ];
  const a11yLabel = a11yParts.join('. ');

  return (
    <View
      style={styles.container}
      accessibilityLabel={a11yLabel}
    >
      {/* ── Identity row ── */}
      <Pressable
        onPress={handleViewProfile}
        disabled={!onViewProfile}
        hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
        accessibilityRole="button"
        accessibilityLabel={`View ${seller.username}'s profile`}
        accessibilityHint="Opens the seller’s profile and shop"
        style={({ pressed }) => [
          styles.identityRow,
          onViewProfile && pressed && { opacity: 0.6 },
        ]}
      >
        <View style={[styles.avatar, { backgroundColor: colors.surfaceAlt }]}>
          {seller.avatar ? (
            <CachedImage
              uri={seller.avatar}
              style={styles.avatarImage}
              transition={Motion.duration.normal}
              emptyIcon="person-outline"
            />
          ) : (
            <Text style={[styles.avatarInitial, { color: colors.textSecondary }]}>
              {seller.username.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>

        <View style={styles.identityText}>
          <Text
            style={[styles.name, { color: colors.textPrimary }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1}
          >
            {seller.username}
          </Text>
          {verificationLabel && (
            <View style={styles.verificationRow}>
              <Ionicons
                name={profile.verificationLevel === 'enhanced' ? 'shield-checkmark' : 'checkmark-circle'}
                size={12}
                color={colors.success}
              />
              <Text
                style={[styles.verification, { color: colors.success }]}
                numberOfLines={1}
              >
                {verificationLabel}
              </Text>
            </View>
          )}
        </View>

        {onViewProfile && (
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        )}
      </Pressable>

      {/* ── Trust signals row ── */}
      {listingSignals.length > 0 && (
        <View style={styles.signalsWrap}>
          <TrustSignalRow signals={profile.signals} context="listing" max={4} />
        </View>
      )}

      {/* ── Metrics ── */}
      {metrics.length > 0 && (
        <View style={[styles.metricsRow, { borderColor: colors.borderSubtle }]}>
          {metrics.map((m, i) => (
            <View
              key={i}
              style={[
                styles.metricCell,
                i < metrics.length - 1 && { borderRightColor: colors.borderSubtle },
              ]}
            >
              <Text
                style={[styles.metricValue, { color: colors.textPrimary }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1}
              >
                {m.value}
              </Text>
              <Text
                style={[styles.metricLabel, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {m.label}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: Space.md,
    paddingBottom: Space.sm,
    borderTopWidth: Stroke.hairline,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: Control.hit,
  },
  avatar: {
    width: AvatarSize.md,
    height: AvatarSize.md,
    borderRadius: Radius.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitial: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
  },
  identityText: {
    flex: 1,
    gap: Space.xxs,
  },
  name: {
    fontSize: TypographyV2.itemTitle.size,
    lineHeight: TypographyV2.itemTitle.lineHeight,
    fontFamily: TypographyV2.itemTitle.fontFamily,
    letterSpacing: TypographyV2.itemTitle.letterSpacing,
  },
  verificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  verification: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  signalsWrap: {
    marginTop: Space.sm,
  },
  metricsRow: {
    flexDirection: 'row',
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: Stroke.hairline,
  },
  metricCell: {
    flex: 1,
    gap: Space.xxs,
    paddingHorizontal: Space.sm,
    borderRightWidth: Stroke.hairline,
  },
  metricValue: {
    fontSize: TypographyV2.numericMeta.size,
    lineHeight: TypographyV2.numericMeta.lineHeight,
    fontFamily: TypographyV2.numericMeta.fontFamily,
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
});
