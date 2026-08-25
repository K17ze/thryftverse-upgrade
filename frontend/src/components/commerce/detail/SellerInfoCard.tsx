/**
 * SellerInfoCard — richer seller confidence module for the product page.
 *
 * Per AGENTS.md §4 (surface budget): this is a flat composed section on
 * the page canvas, not a nested bordered card. A hairline top border
 * separates it from the identity chapter above. Avatar uses Radius.full
 * (the one permitted avatar radius); trust-signal chips use the compact
 * utility radius. No card-on-card.
 *
 * Trust signals (fast shipper, top-rated, responsive) reuse the canonical
 * `SellerStandardsBadges` + `VerificationBadge` primitives so badge
 * derivation stays truthful (only earned badges render).
 *
 * Truthful UI (AGENTS.md §11): stats only render when the seller trust
 * summary actually carries the value. Missing values are omitted, never
 * fabricated.
 */
import React from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Radius, Type, Typography, Control } from '../../../theme/designTokens';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { CachedImage } from '../../CachedImage';
import { VerificationBadge, resolveVerificationTier } from '../../profile/VerificationBadge';
import { SellerStandardsBadges } from '../../profile/SellerStandardsBadges';
import type { SellerTrustSummary } from '../../../platform/product';

export interface SellerInfoCardProps {
  seller: SellerTrustSummary;
  /** True when the current viewer is the listing owner (hides Follow/Message). */
  isOwner?: boolean;
  /** Follow button state. */
  isFollowing?: boolean;
  isFollowPending?: boolean;
  onFollow?: () => void;
  onMessage?: () => void;
  /** Navigate to the seller's shop / profile. */
  onViewShop?: () => void;
}

interface StatCell {
  value: string;
}

export function SellerInfoCard({
  seller,
  isOwner = false,
  isFollowing = false,
  isFollowPending = false,
  onFollow,
  onMessage,
  onViewShop,
}: SellerInfoCardProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();

  const handleAction = (cb: () => void) => {
    if (!reducedMotion) haptic.light();
    cb();
  };

  // ── Truthful stats — concise inline values (spec 12: no KPI card) ──
  const stats: StatCell[] = [];
  if (seller.rating != null) {
    stats.push({
      value: `${seller.rating.toFixed(1)}${seller.reviewCount != null ? ` (${seller.reviewCount})` : ''}`,
    });
  }
  if (seller.completedSales != null) {
    stats.push({
      value: seller.completedSales >= 1000
        ? `${(seller.completedSales / 1000).toFixed(1)}k sold`
        : `${seller.completedSales} sold`,
    });
  }
  if (seller.responseRate != null) {
    stats.push({
      value: `${Math.round(seller.responseRate * 100)}% responds`,
    });
  }
  if (seller.dispatchTimeLabel) {
    stats.push({
      value: seller.dispatchTimeLabel,
    });
  }

  const verificationTier = resolveVerificationTier(seller.verified, seller.verificationTier);

  return (
    <View style={styles.container}>
      {/* Identity row */}
      <Pressable
        onPress={onViewShop}
        disabled={!onViewShop}
        style={({ pressed }) => [
          styles.identityRow,
          onViewShop && pressed && styles.pressed,
        ]}
        accessibilityLabel={`View ${seller.username}'s shop`}
        accessibilityRole="button"
        accessibilityHint="Opens the seller's profile and shop"
      >
        <View style={[styles.avatar, { backgroundColor: colors.surfaceAlt }]}>
          {seller.avatar ? (
            <CachedImage
              uri={seller.avatar}
              style={styles.avatarImage}
              transition={200}
              emptyIcon="person-outline"
            />
          ) : (
            <Text style={[styles.avatarInitial, { color: colors.textSecondary }]}>
              {seller.username.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={styles.identityText}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {seller.username}
            </Text>
            {verificationTier ? <VerificationBadge tier={verificationTier} compact /> : null}
          </View>
          {seller.location ? (
            <Text style={[styles.location, { color: colors.textSecondary }]} numberOfLines={1}>
              {seller.location}
            </Text>
          ) : null}
        </View>
        {onViewShop ? (
          <View style={styles.shopChevron}>
            <Text style={[styles.shopLabel, { color: colors.brand }]}>View Shop</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.brand} />
          </View>
        ) : null}
      </Pressable>

      {/* Concise trust line — replaces the former 4-cell KPI stats row.
          Per spec 12: "Keep response/dispatch/reviews concise. Avoid
          transforming seller trust into a KPI card." A single inline
          text line with middot separators is scannable and quiet. */}
      {stats.length > 0 ? (
        <Text style={[styles.trustLine, { color: colors.textSecondary }]} numberOfLines={2}>
          {stats.map((stat) => stat.value).join(' · ')}
        </Text>
      ) : null}

      {/* Trust signals — reuse canonical badge primitives */}
      <SellerStandardsBadges sellerTrust={seller} size="sm" />

      {/* Actions — quiet text actions, not bordered pills */}
      {!isOwner && (onFollow || onMessage) ? (
        <View style={styles.actionsRow}>
          {onMessage ? (
            <Pressable
              onPress={() => handleAction(onMessage)}
              hitSlop={8}
              style={({ pressed }) => [styles.actionHitTarget, pressed && { opacity: 0.6 }]}
              accessibilityLabel={`Message ${seller.username}`}
              accessibilityRole="button"
              accessibilityHint="Starts a chat with the seller"
            >
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>
                Message
              </Text>
            </Pressable>
          ) : null}
          {onFollow ? (
            <Pressable
              onPress={() => handleAction(onFollow)}
              disabled={isFollowPending}
              hitSlop={8}
              style={({ pressed }) => [styles.actionHitTarget, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityState={{ selected: isFollowing, busy: isFollowPending }}
              accessibilityLabel={isFollowing ? `Unfollow ${seller.username}` : `Follow ${seller.username}`}
              accessibilityHint={isFollowing ? 'Stops following this seller' : 'Follows this seller'}
            >
              <Text
                style={[
                  styles.actionText,
                  {
                    color: isFollowing ? colors.textSecondary : colors.brand,
                    opacity: isFollowPending ? 0.6 : 1,
                  },
                ]}
              >
                {isFollowPending ? 'Following…' : isFollowing ? 'Following' : 'Follow'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + Space.xs,
    gap: Space.sm,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: 44,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.985 }],
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitial: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  identityText: {
    flex: 1,
    gap: Space.xs / 2,
    flexShrink: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  name: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  location: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
  },
  shopChevron: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2,
    flexShrink: 0,
    minHeight: Control.hit,
  },
  shopLabel: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  // Concise trust line — single inline text, no KPI card chrome.
  // Per spec 12: avoid transforming seller trust into a KPI card.
  trustLine: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight + 2,
    fontFamily: Typography.family.medium,
    fontVariant: ['tabular-nums'],
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.lg,
  },
  actionHitTarget: {
    minHeight: 44,
    justifyContent: 'center',
  },
  actionText: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
  },
});
