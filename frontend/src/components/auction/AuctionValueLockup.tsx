import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
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
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const prefix = STATE_PREFIX[state];
  const sizes = SCALE_SIZES[scale];

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${prefix}${izeText}${localText ? `, ${localText}` : ''}`}
    >
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
  featured: { ize: 28, izeLineHeight: 34, local: 14, prefix: 13 },
  supporting: { ize: 17, izeLineHeight: 22, local: 11, prefix: 10 },
  compact: { ize: 15, izeLineHeight: 19, local: 11, prefix: 10 },
};

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: {
    gap: 2,
  },
  izeValue: {
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  prefix: {
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  localValue: {
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.1,
  },
});
