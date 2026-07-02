import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';

type AuctionState = 'live' | 'upcoming' | 'ended' | 'cancelled' | 'settled';

interface Props {
  state: AuctionState;
  compact?: boolean;
}

const CONFIG: Record<AuctionState, { label: string; bg: string; fg: string; dot?: boolean; icon?: keyof typeof Ionicons.glyphMap }> = {
  live: { label: 'LIVE', bg: 'rgba(220,38,38,0.15)', fg: Colors.danger, dot: true },
  upcoming: { label: 'UPCOMING', bg: 'rgba(255,255,255,0.08)', fg: Colors.textSecondary, icon: 'time-outline' },
  ended: { label: 'ENDED', bg: 'rgba(255,255,255,0.06)', fg: Colors.textMuted },
  cancelled: { label: 'CANCELLED', bg: 'rgba(220,38,38,0.12)', fg: Colors.danger },
  settled: { label: 'SETTLED', bg: 'rgba(22,163,74,0.12)', fg: Colors.success },
};

export function AuctionStateBadge({ state, compact }: Props) {
  const cfg = CONFIG[state] ?? CONFIG.ended;
  const size = compact ? 18 : 20;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg, paddingHorizontal: compact ? Space.sm : Space.md }]}>
      {cfg.dot && <View style={[styles.dot, { width: compact ? 5 : 6, height: compact ? 5 : 6 }]} />}
      {cfg.icon && <Ionicons name={cfg.icon} size={size} color={cfg.fg} />}
      <Text style={[styles.label, { color: cfg.fg, fontSize: compact ? 9 : 10 }]}>{cfg.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  dot: {
    borderRadius: 999,
    backgroundColor: Colors.danger,
  },
  label: {
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.6,
  },
});
