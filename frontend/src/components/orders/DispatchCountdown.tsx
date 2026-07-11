import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';

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
    urgency === 'overdue' ? Colors.danger :
    urgency === 'urgent' ? Colors.danger :
    urgency === 'warning' ? Colors.warning :
    Colors.textPrimary;

  const bgColor =
    urgency === 'overdue' ? `${Colors.danger}15` :
    urgency === 'urgent' ? `${Colors.danger}10` :
    urgency === 'warning' ? `${Colors.warning}10` :
    Colors.surface;

  const icon =
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
        <Ionicons name={icon as any} size={14} color={color} />
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

const styles = StyleSheet.create({
  container: {
    marginTop: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.15)',
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.family.semibold,
  },
  countdown: {
    fontSize: 14,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  overdueHint: {
    marginTop: 4,
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
});
