import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
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
}

function resolveStage(urgent: boolean | undefined, text: string): CountdownStage {
  if (text === 'Ended' || text === 'Cancelled' || text === 'Settled') return 'ended';
  if (text.startsWith('Starts')) return 'upcoming';
  if (urgent) return 'final';
  return 'plenty';
}

const STAGE_COLORS: Record<CountdownStage, { text: string; icon: string; bar: string }> = {
  upcoming: { text: Colors.brand, icon: Colors.brand, bar: Colors.brand },
  plenty: { text: Colors.textPrimary, icon: Colors.textMuted, bar: Colors.textMuted },
  moderate: { text: Colors.textPrimary, icon: '#E8A93C', bar: '#E8A93C' },
  urgent: { text: Colors.danger, icon: Colors.danger, bar: Colors.danger },
  final: { text: Colors.danger, icon: Colors.danger, bar: Colors.danger },
  ended: { text: Colors.textMuted, icon: Colors.textMuted, bar: Colors.border },
};

export function AuctionCountdown({ text, urgent, compact, progress, stage, showProgress }: Props) {
  const resolvedStage = stage ?? resolveStage(urgent, text);
  const colors = STAGE_COLORS[resolvedStage];
  const stageLabel = STAGE_LABELS[resolvedStage];
  const iconSize = compact ? 11 : 13;
  const fontSize = compact ? 12 : 14;
  const isFinalOrUrgent = resolvedStage === 'final' || resolvedStage === 'urgent';

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Ionicons
          name={resolvedStage === 'ended' ? 'checkmark-done-outline' : 'time-outline'}
          size={iconSize}
          color={colors.icon}
        />
        <Text
          style={[
            styles.text,
            { color: colors.text, fontSize },
            isFinalOrUrgent && styles.textUrgent,
          ]}
          numberOfLines={1}
        >
          {text}
        </Text>
        {stageLabel && !compact ? (
          <Text style={[styles.stageLabel, { color: colors.text }]}>
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
                backgroundColor: colors.bar,
              },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  progressBar: {
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 1,
  },
});
