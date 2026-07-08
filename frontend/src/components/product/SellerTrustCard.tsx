import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
import type { SellerTrustSummary } from '../../platform/product';
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
                containerStyle={{ width: 52, height: 52, borderRadius: 26 }}
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
              {seller.verified && (
                <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
              )}
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
              <Ionicons name="chatbubble-outline" size={18} color={Colors.textPrimary} />
              <Text style={styles.messageText}>Message</Text>
            </AnimatedPressable>
          )}
        </View>
      </View>

      {trustMetrics.length > 0 ? (
        <View style={styles.metricsGrid}>
          {trustMetrics.map((metric) => (
            <View key={metric.label} style={styles.metricCell}>
              <Ionicons name={metric.icon} size={16} color={Colors.textMuted} />
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

const styles = StyleSheet.create({
  container: {
    marginTop: Space.sm,
    marginHorizontal: Space.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
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
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 22,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
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
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    flexShrink: 1,
    minWidth: 0,
  },
  location: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.sm,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  followBtn: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 12,
    backgroundColor: Colors.brand,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followingBtn: {
    backgroundColor: Colors.surfaceAlt,
  },
  followText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
  },
  followingText: {
    color: Colors.textPrimary,
  },
  messageBtn: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 44,
    paddingVertical: 12,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  messageText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
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
    gap: 6,
    paddingVertical: 6,
  },
  metricLabel: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  metricValue: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
});
