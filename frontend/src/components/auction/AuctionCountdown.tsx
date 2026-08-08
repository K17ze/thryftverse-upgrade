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

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="timer"
      accessibilityLabel={`${text}${stageLabel ? `, ${stageLabel}` : ''}`}
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
    borderRadius: 1,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 1,
  },
});
