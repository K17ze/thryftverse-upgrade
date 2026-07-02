import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';

type ValueState = 'current' | 'starting' | 'final';
type ValueScale = 'featured' | 'supporting' | 'compact';

interface Props {
  /** 1ZE primary value text (e.g. "24.60 1ZE") */
  izeText: string;
  /** Local currency equivalent (e.g. "£123.00") */
  localText?: string | null;
  /** Which value state — controls prefix label */
  state?: ValueState;
  /** Which visual scale — controls font sizes */
  scale?: ValueScale;
}

const STATE_PREFIX: Record<ValueState, string> = {
  current: '',
  starting: 'Starts at ',
  final: 'Final ',
};

export function AuctionValueLockup({
  izeText,
  localText,
  state = 'current',
  scale = 'featured',
}: Props) {
  const prefix = STATE_PREFIX[state];
  const sizes = SCALE_SIZES[scale];

  return (
    <View style={styles.container}>
      <Text style={[styles.izeValue, { fontSize: sizes.ize, lineHeight: sizes.izeLineHeight }]} numberOfLines={1}>
        {prefix && <Text style={[styles.prefix, { fontSize: sizes.prefix }]}>{prefix}</Text>}
        {izeText}
      </Text>
      {localText && (
        <Text style={[styles.localValue, { fontSize: sizes.local }]} numberOfLines={1}>
          {localText}
        </Text>
      )}
    </View>
  );
}

const SCALE_SIZES: Record<ValueScale, { ize: number; izeLineHeight: number; local: number; prefix: number }> = {
  featured: { ize: 26, izeLineHeight: 32, local: 14, prefix: 13 },
  supporting: { ize: 16, izeLineHeight: 20, local: 11, prefix: 10 },
  compact: { ize: 15, izeLineHeight: 19, local: 11, prefix: 10 },
};

const styles = StyleSheet.create({
  container: {
    gap: 1,
  },
  izeValue: {
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  prefix: {
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  localValue: {
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.1,
  },
});
