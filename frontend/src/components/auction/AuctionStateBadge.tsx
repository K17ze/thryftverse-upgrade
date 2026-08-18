import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Typography } from '../../theme/designTokens';

type AuctionState = 'live' | 'upcoming' | 'ended' | 'cancelled' | 'settled';

interface Props {
  state: AuctionState;
  compact?: boolean;
}

function getConfig(colors: ReturnType<typeof useAppTheme>['colors']): Record<AuctionState, { label: string; bg: string; fg: string; dot?: boolean; icon?: keyof typeof Ionicons.glyphMap }> {
  return {
    live: { label: 'LIVE', bg: `${colors.danger}26`, fg: colors.danger, dot: true },
    upcoming: { label: 'UPCOMING', bg: `${colors.border}40`, fg: colors.textSecondary, icon: 'time-outline' },
    ended: { label: 'ENDED', bg: `${colors.border}30`, fg: colors.textMuted },
    cancelled: { label: 'CANCELLED', bg: `${colors.danger}20`, fg: colors.danger },
    settled: { label: 'SETTLED', bg: `${colors.success}20`, fg: colors.success },
  };
}

export function AuctionStateBadge({ state, compact }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const CONFIG = getConfig(colors);
  const cfg = CONFIG[state] ?? CONFIG.ended;
  const size = compact ? 18 : 20;
  return (
    <View
      style={[styles.badge, { backgroundColor: cfg.bg, paddingHorizontal: compact ? Space.sm : Space.md }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Auction status: ${cfg.label}`}
    >
      {cfg.dot && <View style={[styles.dot, { width: compact ? 5 : 6, height: compact ? 5 : 6 }]} />}
      {cfg.icon && <Ionicons name={cfg.icon} size={size} color={cfg.fg} />}
      <Text style={[styles.label, { color: cfg.fg, fontSize: compact ? 9 : 10 }]}>{cfg.label}</Text>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: Space.xs,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${colors.border}30`,
  },
  dot: {
    borderRadius: Radius.full,
    backgroundColor: colors.danger,
  },
  label: {
    fontFamily: Typography.family.bold,
    letterSpacing: 0.8,
  },
});
