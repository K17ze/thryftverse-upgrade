import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Space, Radius, Type } from '../../theme/designTokens';
import type { SellerTrustSummary, VerificationTier } from '../../platform/product';
import { VERIFICATION_TIERS, deriveSellerBadges, SELLER_BADGES } from '../../platform/product';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';

export interface SellerTrustCardProps {
  seller: SellerTrustSummary;
  onOpenProfile: () => void;
  onMessage?: () => void;
  onFollow?: () => void;
}

export function SellerTrustCard({
  seller,
  onOpenProfile,
  onMessage,
  onFollow,
}: SellerTrustCardProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const rating = seller.rating ?? null;
  const reviewCount = seller.reviewCount ?? null;
  const completedSales = seller.completedSales ?? null;
  const responseRate = seller.responseRate ?? null;
  const responseTimeLabel = seller.responseTimeLabel ?? null;
  const dispatchTimeLabel = seller.dispatchTimeLabel ?? null;
  const memberSince = seller.memberSince ?? null;
  const activeListingCount = seller.activeListingCount ?? null;
  const isFollowing = seller.isFollowing ?? false;

  const trustMetrics: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }[] = [];

  if (rating != null) {
    trustMetrics.push({
      icon: 'star',
      label: 'Rating',
      value: `${rating.toFixed(1)}${reviewCount != null ? ` (${reviewCount})` : ''}`,
    });
  }

  if (completedSales != null) {
    trustMetrics.push({
      icon: 'checkmark-done',
      label: 'Sales',
      value: `${completedSales} completed`,
    });
  }

  if (responseRate != null) {
    trustMetrics.push({
      icon: 'chatbubble-ellipses',
      label: 'Response',
      value: `${responseRate}% rate`,
    });
  }

  if (responseTimeLabel) {
    trustMetrics.push({
      icon: 'time',
      label: 'Replies in',
      value: responseTimeLabel,
    });
  }

  if (dispatchTimeLabel) {
    trustMetrics.push({
      icon: 'cube',
      label: 'Dispatch',
      value: dispatchTimeLabel,
    });
  }

  if (memberSince) {
    trustMetrics.push({
      icon: 'calendar',
      label: 'Member since',
      value: memberSince,
    });
  }

  if (activeListingCount != null) {
    trustMetrics.push({
      icon: 'pricetags',
      label: 'Listings',
      value: `${activeListingCount} active`,
    });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Seller</Text>

      <View style={styles.headerRow}>
        <AnimatedPressable
          style={styles.profileRow}
          onPress={onOpenProfile}
          {...PressPresets.card}
          accessibilityLabel={`View ${seller.username} profile`}
          accessibilityRole="button"
        >
          <View style={styles.avatarWrap}>
            {seller.avatar ? (
              <CachedImage
                uri={seller.avatar}
                style={styles.avatar}
                containerStyle={{ width: Space.xxl + Space.xl, height: Space.xxl + Space.xl, borderRadius: Radius.full }}
                contentFit="cover"
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackText}>
                  {(seller.username ?? 'S').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.username} numberOfLines={1}>
                {seller.username}
              </Text>
              {(() => {
                const tier: VerificationTier | null = seller.verificationTier ?? (seller.verified ? 'seller' : null);
                if (!tier) return null;
                const info = VERIFICATION_TIERS[tier];
                return (
                  <Ionicons
                    name={info.icon as keyof typeof Ionicons.glyphMap}
                    size={16}
                    color={info.color === 'brand' ? colors.brand : colors.success}
                    accessibilityLabel={info.label}
                  />
                );
              })()}
            </View>
            {seller.location ? (
              <Text style={styles.location} numberOfLines={1}>
                {seller.location}
              </Text>
            ) : null}
            {seller.badges && seller.badges.length > 0 ? (
              <View style={styles.badgeRow}>
                {seller.badges.slice(0, 3).map((badge) => (
                  <View key={badge} style={styles.badge}>
                    <Text style={styles.badgeText} numberOfLines={1}>{badge}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {/* Seller standards badges — fail-closed: only rendered when the
                backend provides an explicit, persisted programme decision. */}
            {(() => {
              const earned = deriveSellerBadges(seller);
              if (earned.length === 0) return null;
              return (
                <View style={styles.badgeRow}>
                  {earned.slice(0, 3).map((type) => {
                    const badge = SELLER_BADGES[type];
                    if (!badge) return null;
                    return (
                      <View key={type} style={styles.standardsBadge}>
                        <Ionicons name={badge.icon as keyof typeof Ionicons.glyphMap} size={10} color={colors.brand} />
                        <Text style={styles.standardsBadgeText} numberOfLines={1}>{badge.label}</Text>
                      </View>
                    );
                  })}
                </View>
              );
            })()}
          </View>
        </AnimatedPressable>

        <View style={styles.actionRow}>
          {onFollow && (
            <AnimatedPressable
              style={[styles.followBtn, isFollowing && styles.followingBtn]}
              onPress={onFollow}
              {...PressPresets.primaryButton}
              accessibilityLabel={isFollowing ? 'Unfollow seller' : 'Follow seller'}
              accessibilityRole="button"
            >
              <Text style={[styles.followText, isFollowing && styles.followingText]}>
                {isFollowing ? 'Following' : 'Follow'}
              </Text>
            </AnimatedPressable>
          )}
          {onMessage && (
            <AnimatedPressable
              style={styles.messageBtn}
              onPress={onMessage}
              {...PressPresets.primaryButton}
              accessibilityLabel={`Message ${seller.username}`}
              accessibilityRole="button"
            >
              <Ionicons name="chatbubble-outline" size={18} color={colors.textPrimary} />
              <Text style={styles.messageText}>Message</Text>
            </AnimatedPressable>
          )}
        </View>
      </View>

      {trustMetrics.length > 0 ? (
        <View style={styles.metricsGrid}>
          {trustMetrics.map((metric) => (
            <View key={metric.label} style={styles.metricCell}>
              <Ionicons name={metric.icon} size={16} color={colors.textMuted} />
              <Text style={styles.metricLabel}>{metric.label}</Text>
              <Text style={styles.metricValue} numberOfLines={1}>
                {metric.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    marginTop: Space.sm,
    marginHorizontal: Space.md,
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
  },
  sectionTitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textSecondary,
    marginBottom: Space.sm,
    letterSpacing: 0.2,
  },
  headerRow: {
    flexDirection: 'column',
    gap: Space.sm,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  avatarWrap: {
    flexShrink: 0,
  },
  avatar: {
    width: Space.xxl + Space.xl,
    height: Space.xxl + Space.xl,
    borderRadius: Radius.full,
  },
  avatarFallback: {
    width: Space.xxl + Space.xl,
    height: Space.xxl + Space.xl,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.semibold,
    color: colors.textSecondary,
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    minWidth: 0,
  },
  username: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    flexShrink: 1,
    minWidth: 0,
  },
  location: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
    marginTop: Space.xs,
  },
  badge: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs / 2,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.sm,
  },
  badgeText: {
    fontSize: Type.meta.size - 2,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
  },
  standardsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
    paddingHorizontal: Space.xs + 3,
    paddingVertical: Space.xs / 2,
    backgroundColor: colors.brandSubtle,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  standardsBadgeText: {
    fontSize: Type.meta.size - 2,
    fontFamily: Typography.family.semibold,
    color: colors.brand,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  followBtn: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 12,
    backgroundColor: colors.brand,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followingBtn: {
    backgroundColor: colors.surfaceAlt,
  },
  followText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textInverse,
  },
  followingText: {
    color: colors.textPrimary,
  },
  messageBtn: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 44,
    paddingVertical: 12,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  messageText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Space.md,
    gap: Space.sm,
  },
  metricCell: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.xs + 2,
  },
  metricLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
  metricValue: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  });
}
