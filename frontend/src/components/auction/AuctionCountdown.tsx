import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Typography } from '../../theme/designTokens';

type CountdownStage = 'upcoming' | 'plenty' | 'moderate' | 'urgent' | 'final' | 'ended';

const STAGE_LABELS: Record<CountdownStage, string | null> = {
  upcoming: 'Scheduled',
  plenty: null,
  moderate: 'Ending soon',
  urgent: 'Ending soon',
  final: 'Final moments',
  ended: null,
};

// ── Accessibility threshold labels ──
// Rate-limits screen reader announcements to meaningful thresholds only,
// not every second. Per spec 08: "Countdown should not announce every second.
// Update accessibility announcements only at meaningful thresholds and
// state changes."
function resolveA11yThreshold(text: string, stage: CountdownStage): string | null {
  if (stage === 'ended') return 'Auction ended';
  if (stage === 'upcoming') return 'Auction scheduled';
  if (stage === 'final') {
    // In final minutes, announce at 60s, 30s, 10s, and ended boundaries
    if (text === 'Ended') return 'Auction ended';
    const parts = text.split(':');
    if (parts.length === 2) {
      const mins = parseInt(parts[0], 10);
      const secs = parseInt(parts[1], 10);
      if (mins === 1 && secs === 0) return '1 minute remaining';
      if (mins === 0 && secs === 30) return '30 seconds remaining';
      if (mins === 0 && secs === 10) return '10 seconds remaining';
    }
    return null; // Don't announce every second
  }
  if (stage === 'moderate' || stage === 'urgent') {
    // Announce at hour and half-hour boundaries
    if (text.includes('h ') && text.endsWith('0m')) return `${text} left`;
    if (text === '60m' || text === '30m' || text === '15m') return `${text} left`;
    return null;
  }
  // plenty — announce only at day/hour boundaries
  if (text.includes('d ')) return `${text} left`;
  return null;
}

interface Props {
  text: string;
  urgent?: boolean;
  compact?: boolean;
  /** 0–1 fraction of total auction duration elapsed (for progress bar) */
  progress?: number;
  /** Explicit stage override; otherwise inferred from urgent + text */
  stage?: CountdownStage;
  /** Show a thin progress bar below the countdown text */
  showProgress?: boolean;
  /** Larger time lock-up when paired with the current bid. */
  prominent?: boolean;
}

function resolveStage(urgent: boolean | undefined, text: string): CountdownStage {
  if (text === 'Ended' || text === 'Cancelled' || text === 'Settled') return 'ended';
  if (text.startsWith('Starts')) return 'upcoming';
  // Final minutes: MM:SS format (e.g., "02:34") from formatFinalMinutesCountdown
  if (/^\d{1,2}:\d{2}$/.test(text)) return 'final';
  // Days format (e.g., "2d 3h left") — plenty
  if (/\d+d\b/.test(text)) return 'plenty';
  // Minutes-only format (e.g., "45m left") — under 1 hour, ending soon
  if (/^\d{1,3}m\b/.test(text)) return 'moderate';
  // Hours format (e.g., "3h 20m left") — 1+ hours
  if (/\d+h\b/.test(text)) return 'plenty';
  // Fallback: use urgent flag for unrecognized formats
  if (urgent) return 'final';
  return 'plenty';
}

function getStageColors(colors: ReturnType<typeof useAppTheme>['colors']): Record<CountdownStage, { text: string; icon: string; bar: string }> {
  return {
    upcoming: { text: colors.brand, icon: colors.brand, bar: colors.brand },
    plenty: { text: colors.textPrimary, icon: colors.textMuted, bar: colors.textMuted },
    moderate: { text: colors.textPrimary, icon: colors.warning, bar: colors.warning },
    urgent: { text: colors.danger, icon: colors.danger, bar: colors.danger },
    final: { text: colors.danger, icon: colors.danger, bar: colors.danger },
    ended: { text: colors.textMuted, icon: colors.textMuted, bar: colors.border },
  };
}

export function AuctionCountdown({ text, urgent, compact, progress, stage, showProgress, prominent }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const resolvedStage = stage ?? resolveStage(urgent, text);
  const stageColors = getStageColors(colors);
  const colors2 = stageColors[resolvedStage];
  const stageLabel = STAGE_LABELS[resolvedStage];
  const iconSize = prominent ? 16 : compact ? 11 : 13;
  const fontSize = prominent ? 20 : compact ? 12 : 14;
  const isFinalOrUrgent = resolvedStage === 'final' || resolvedStage === 'urgent';

  // Rate-limited accessibility label — only meaningful thresholds, not every tick.
  // The visual text updates every second during final minutes, but the
  // accessibility label stays stable between threshold changes so VoiceOver
  // doesn't announce every second.
  const a11yLabel = React.useMemo(() => {
    const thresholdLabel = resolveA11yThreshold(text, resolvedStage);
    if (thresholdLabel) return thresholdLabel;
    // Fall back to a stable stage-level label between thresholds
    if (resolvedStage === 'final') return 'Final moments — auction ending soon';
    if (resolvedStage === 'moderate' || resolvedStage === 'urgent') return 'Auction ending soon';
    return `${text}${stageLabel ? `, ${stageLabel}` : ''}`;
  }, [text, resolvedStage, stageLabel]);

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="timer"
      accessibilityLabel={a11yLabel}
    >
      <View style={styles.row}>
        <Ionicons
          name={resolvedStage === 'ended' ? 'checkmark-done-outline' : 'time-outline'}
          size={iconSize}
          color={colors2.icon}
        />
        <Text
          style={[
            styles.text,
            { color: colors2.text, fontSize },
            prominent && styles.textProminent,
            isFinalOrUrgent && styles.textUrgent,
          ]}
          numberOfLines={1}
        >
          {text}
        </Text>
        {stageLabel && !compact ? (
          <Text style={[styles.stageLabel, { color: colors2.text }]}>
            {stageLabel}
          </Text>
        ) : null}
      </View>
      {showProgress && progress !== undefined && progress >= 0 && progress <= 1 && (
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${Math.round(progress * 100)}%`,
                backgroundColor: colors2.bar,
              },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: {
    flexDirection: 'column',
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  text: {
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  stageLabel: {
    fontSize: 10,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    opacity: 0.7,
    marginLeft: 2,
  },
  textUrgent: {
    fontFamily: Typography.family.bold,
  },
  textProminent: {
    lineHeight: 24,
    letterSpacing: -0.5,
  },
  progressBar: {
    height: 2,
    borderRadius: Radius.full,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
});
