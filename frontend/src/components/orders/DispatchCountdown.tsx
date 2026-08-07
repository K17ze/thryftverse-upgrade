import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Radius, Type } from '../../theme/designTokens';

interface Props {
  /** ISO timestamp of order creation (dispatch window start) */
  createdAt: string;
  /** Dispatch window in hours (default 24) */
  windowHours?: number;
  /** Whether the order has been shipped (hides countdown) */
  shipped: boolean;
}

type Urgency = 'normal' | 'warning' | 'urgent' | 'overdue';

function resolveUrgency(msRemaining: number, totalMs: number): Urgency {
  if (msRemaining <= 0) return 'overdue';
  const hoursRemaining = msRemaining / (1000 * 60 * 60);
  if (hoursRemaining <= 1) return 'urgent';
  if (hoursRemaining <= 4) return 'warning';
  return 'normal';
}

function formatDispatchCountdown(ms: number): string {
  if (ms <= 0) return 'Overdue';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function DispatchCountdown({ createdAt, windowHours = 24, shipped }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Tick every second
  useEffect(() => {
    if (shipped) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [shipped]);

  if (shipped) return null;

  const createdMs = new Date(createdAt).getTime();
  const deadlineMs = createdMs + windowHours * 60 * 60 * 1000;
  const msRemaining = deadlineMs - nowMs;
  const urgency = resolveUrgency(msRemaining, windowHours * 60 * 60 * 1000);

  const color =
    urgency === 'overdue' ? colors.danger :
    urgency === 'urgent' ? colors.danger :
    urgency === 'warning' ? colors.warning :
    colors.textPrimary;

  const bgColor =
    urgency === 'overdue' ? `${colors.danger}15` :
    urgency === 'urgent' ? `${colors.danger}10` :
    urgency === 'warning' ? `${colors.warning}10` :
    colors.surface;

  const icon: React.ComponentProps<typeof Ionicons>['name'] =
    urgency === 'overdue' ? 'alert-circle' :
    urgency === 'urgent' ? 'time' :
    urgency === 'warning' ? 'time' :
    'time-outline';

  const label =
    urgency === 'overdue' ? 'Dispatch overdue' :
    'Dispatch within';

  const totalMs = windowHours * 60 * 60 * 1000;
  const elapsedMs = totalMs - msRemaining;
  const elapsedPercent = (elapsedMs / totalMs) * 100;

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={styles.row}>
        <Ionicons name={icon} size={14} color={color} />
        <Text style={[styles.label, { color }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.countdown, { color }]} numberOfLines={1}>
          {urgency === 'overdue' ? '' : formatDispatchCountdown(msRemaining)}
        </Text>
      </View>
      {/* Visual progress bar showing dispatch window elapsed */}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.min(100, Math.max(0, elapsedPercent))}%`,
              backgroundColor: color,
            },
          ]}
        />
      </View>
      {urgency === 'overdue' && (
        <Text style={styles.overdueHint}>
          Buyer may cancel. Dispatch promptly to maintain trust.
        </Text>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    marginTop: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
  },
  progressTrack: {
    height: 3,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(128,128,128,0.15)',
    marginTop: Space.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.sm,
  },
  label: {
    flex: 1,
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
  },
  countdown: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  overdueHint: {
    marginTop: Space.xs,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
});
