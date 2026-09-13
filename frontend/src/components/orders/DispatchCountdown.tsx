import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

interface Props {
  /**
   * Server-derived ship-by deadline (ISO). The only deadline this component
   * renders — per AGENTS.md §11 the client never fabricates a dispatch
   * window. When absent or invalid, an honest muted "deadline unavailable"
   * state is rendered instead of inventing one.
   */
  shipByDate: string | null;
  /** Whether the order has been shipped (hides countdown) */
  shipped: boolean;
}

type Urgency = 'normal' | 'warning' | 'urgent' | 'overdue';

function resolveUrgency(msRemaining: number): Urgency {
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

export function DispatchCountdown({ shipByDate, shipped }: Props) {
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

  const deadlineMs = shipByDate ? new Date(shipByDate).getTime() : NaN;

  // No server deadline → honest muted state. We do NOT fall back to
  // createdAt + a hardcoded window: that invents a deadline the seller
  // never agreed to (charter §11).
  if (!Number.isFinite(deadlineMs)) {
    return (
      <View style={styles.container}>
        <View style={styles.row}>
          <Ionicons name="time-outline" size={14} color={colors.textMuted} aria-hidden={true} />
          <Text style={[styles.label, { color: colors.textMuted }]} numberOfLines={1}>
            Dispatch deadline unavailable
          </Text>
        </View>
      </View>
    );
  }

  const msRemaining = deadlineMs - nowMs;
  const urgency = resolveUrgency(msRemaining);

  const color =
    urgency === 'overdue' ? colors.danger :
    urgency === 'urgent' ? colors.danger :
    urgency === 'warning' ? colors.warning :
    colors.textPrimary;

  const bgColor =
    urgency === 'overdue' ? colors.dangerSubtle :
    urgency === 'urgent' ? colors.dangerSubtle :
    urgency === 'warning' ? colors.warningSubtle :
    colors.surface;

  const icon: React.ComponentProps<typeof Ionicons>['name'] =
    urgency === 'overdue' ? 'alert-circle' :
    urgency === 'urgent' ? 'time' :
    urgency === 'warning' ? 'time' :
    'time-outline';

  const label =
    urgency === 'overdue' ? 'Dispatch overdue' :
    'Dispatch within';

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
    borderColor: colors.border },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2 },
  label: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  countdown: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3 } });
