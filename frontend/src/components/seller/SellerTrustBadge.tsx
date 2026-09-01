import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { SellerTrustSummary, VerificationTier } from '../../platform/product';
import { deriveSellerBadges } from '../../platform/product';

export type TrustBadgeType = 'verified' | 'fastShipper' | 'responsive' | 'topRated' | 'trustedSeller';

interface TrustBadgeConfig {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

const TRUST_BADGE_CONFIG: Record<TrustBadgeType, TrustBadgeConfig> = {
  verified: { icon: 'checkmark-circle', label: 'Verified' },
  fastShipper: { icon: 'flash', label: 'Fast shipping' },
  responsive: { icon: 'chatbubble', label: 'Responsive' },
  topRated: { icon: 'star', label: 'Top rated' },
  trustedSeller: { icon: 'ribbon', label: 'Trusted seller' } };

function deriveTrustBadges(seller: SellerTrustSummary | null): TrustBadgeType[] {
  if (!seller) return [];
  const earned: TrustBadgeType[] = [];

  const tier: VerificationTier | null = seller.verificationTier ?? (seller.verified === true ? 'seller' : null);
  if (tier) {
    earned.push('verified');
  }
  if (tier === 'seller') {
    earned.push('trustedSeller');
  }

  const standardsBadges = deriveSellerBadges(seller);
  if (standardsBadges.includes('fastShipper')) {
    earned.push('fastShipper');
  }
  if (standardsBadges.includes('responsive')) {
    earned.push('responsive');
  }
  if (standardsBadges.includes('topSeller') || standardsBadges.includes('superSeller')) {
    earned.push('topRated');
  }

  return Array.from(new Set(earned));
}

export interface SellerTrustBadgeProps {
  seller: SellerTrustSummary | null;
  /** Limit the number of badges shown */
  limit?: number;
  align?: 'left' | 'center';
}

export function SellerTrustBadge({
  seller,
  limit,
  align = 'left' }: SellerTrustBadgeProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const badges = React.useMemo(() => deriveTrustBadges(seller), [seller]);

  if (badges.length === 0) return null;

  const badgesToShow = limit ? badges.slice(0, limit) : badges;

  return (
    <View
      style={[styles.container, align === 'center' && styles.containerCenter]}
      accessibilityRole="header"
    >
      {badgesToShow.map((type) => {
        const config = TRUST_BADGE_CONFIG[type];
        return (
          <View
            key={type}
            style={styles.badge}
            accessibilityLabel={config.label}
          >
            <Ionicons name={config.icon} size={12} color={colors.success} />
            <Text style={styles.badgeText} numberOfLines={1}>
              {config.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: Space.xs },
    containerCenter: {
      justifyContent: 'center' },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: Space.sm,
      paddingVertical: 4,
      backgroundColor: colors.successSubtle,
      borderRadius: Radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.successBorder },
    badgeText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.success,
      letterSpacing: 0.1 } });
}
