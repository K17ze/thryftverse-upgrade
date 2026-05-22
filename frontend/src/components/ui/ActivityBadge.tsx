/**
 * ActivityBadge — Real-time social proof & scarcity indicators
 * Exceeds flagship benchmarks by providing contextual urgency signals
 * that Depop/Vinted do not offer.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  FadeInDown,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type } from '../../theme/designTokens';
import { GlassCard } from './GlassSurface';

export type ActivityBadgeVariant =
  | 'viewers'
  | 'closeted'
  | 'recentSale'
  | 'trending'
  | 'offersPending'
  | 'priceDropped'
  | 'rareItem'
  | 'fastSelling';

interface ActivityBadgeProps {
  variant: ActivityBadgeVariant;
  count?: number;
  label?: string;
  subtitle?: string;
  style?: object;
}

const VARIANT_CONFIG: Record<ActivityBadgeVariant, {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  glowColor: string;
  defaultLabel: string;
  accent: boolean;
}> = {
  viewers: {
    icon: 'eye-outline',
    iconColor: Colors.textSecondary,
    glowColor: Colors.brand,
    defaultLabel: 'people viewing',
    accent: false,
  },
  closeted: {
    icon: 'bookmark-outline',
    iconColor: Colors.brand,
    glowColor: Colors.brand,
    defaultLabel: 'in closets',
    accent: true,
  },
  recentSale: {
    icon: 'checkmark-circle-outline',
    iconColor: Colors.success,
    glowColor: Colors.success,
    defaultLabel: 'sold recently',
    accent: false,
  },
  trending: {
    icon: 'flame-outline',
    iconColor: '#FF6B35',
    glowColor: '#FF6B35',
    defaultLabel: 'trending',
    accent: true,
  },
  offersPending: {
    icon: 'chatbubble-outline',
    iconColor: Colors.brand,
    glowColor: Colors.brand,
    defaultLabel: 'offers pending',
    accent: true,
  },
  priceDropped: {
    icon: 'trending-down-outline',
    iconColor: Colors.success,
    glowColor: Colors.success,
    defaultLabel: 'price dropped',
    accent: false,
  },
  rareItem: {
    icon: 'diamond-outline',
    iconColor: Colors.brand,
    glowColor: Colors.brand,
    defaultLabel: 'rare find',
    accent: true,
  },
  fastSelling: {
    icon: 'timer-outline',
    iconColor: '#FF6B35',
    glowColor: '#FF6B35',
    defaultLabel: 'selling fast',
    accent: true,
  },
};

function PulsingDot({ color }: { color: string }) {
  const pulse = useSharedValue(1);

  React.useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.3, { duration: 1000 }),
      -1,
      true
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 1 + (1 - pulse.value) * 0.5 }],
  }));

  return (
    <Reanimated.View
      style={[
        styles.pulseDot,
        { backgroundColor: color },
        animatedStyle,
      ]}
    />
  );
}

export function ActivityBadge({
  variant,
  count,
  label,
  subtitle,
  style,
}: ActivityBadgeProps) {
  const config = VARIANT_CONFIG[variant];
  const displayLabel = label ?? config.defaultLabel;
  const showCount = count !== undefined && count > 0;

  return (
    <Reanimated.View entering={FadeInDown.duration(300)} style={style}>
      <GlassCard
        intensity={25}
        style={[
          styles.badge,
          config.accent && styles.badgeAccent,
        ]}
        contentStyle={styles.badgeContent}
      >
        <View style={styles.row}>
          {config.accent && (
            <PulsingDot color={config.glowColor} />
          )}
          <Ionicons
            name={config.icon}
            size={14}
            color={config.iconColor}
            style={styles.icon}
          />
          <Text style={styles.text}>
            {showCount && (
              <Text style={[styles.count, { color: config.iconColor }]}>
                {count}{' '}
              </Text>
            )}
            {displayLabel}
          </Text>
        </View>
        {subtitle && (
          <Text style={styles.subtitle}>{subtitle}</Text>
        )}
      </GlassCard>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
  },
  badgeAccent: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,168,83,0.15)',
  },
  badgeContent: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  icon: {
    marginRight: 4,
  },
  text: {
    fontSize: Type.meta.size,
    fontFamily: Type.meta.weight === '500' ? 'Inter_500Medium' : 'Inter_400Regular',
    color: Colors.textSecondary,
    lineHeight: Type.meta.lineHeight,
    letterSpacing: Type.meta.letterSpacing,
  },
  count: {
    fontFamily: 'Inter_600SemiBold',
  },
  subtitle: {
    fontSize: Type.caption.size,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    marginTop: 2,
    marginLeft: 20,
    lineHeight: Type.caption.lineHeight,
  },
  rowContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs + 2,
  },
});

/**
 * ActivityBadgeRow — Horizontal stack of multiple badges for ItemDetail
 */
interface ActivityBadgeRowProps {
  badges: Array<{
    variant: ActivityBadgeVariant;
    count?: number;
    label?: string;
    subtitle?: string;
  }>;
  style?: object;
}

export function ActivityBadgeRow({ badges, style }: ActivityBadgeRowProps) {
  return (
    <View style={[styles.rowContainer, style]}>
      {badges.map((badge, index) => (
        <ActivityBadge
          key={`${badge.variant}-${index}`}
          variant={badge.variant}
          count={badge.count}
          label={badge.label}
          subtitle={badge.subtitle}
        />
      ))}
    </View>
  );
}


