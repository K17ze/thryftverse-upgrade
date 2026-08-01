import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Typography } from '../../theme/designTokens';

interface Props {
  /** Primary price text (formatted fiat) */
  primary: string;
  /** Secondary price text (1ZE equivalent or secondary currency) */
  secondary?: string | null;
  /** Label above the price: "Current bid", "Starting bid", "Final price" */
  label: string;
  /** Size variant */
  size?: 'hero' | 'card' | 'row';
  /** Whether to show the price in a dominant treatment */
  dominant?: boolean;
}

export function AuctionPriceBlock({ primary, secondary, label, size = 'card', dominant }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const sizes = {
    hero: { primary: 32, secondary: 14, label: 11 },
    card: { primary: 20, secondary: 12, label: 10 },
    row: { primary: 16, secondary: 11, label: 10 },
  };
  const s = sizes[size];

  return (
    <View style={styles.block}>
      <Text style={[styles.label, { fontSize: s.label }]}>{label}</Text>
      <View style={styles.priceRow}>
        <Text
          style={[
            styles.primary,
            { fontSize: s.primary },
            dominant && styles.dominant,
          ]}
          numberOfLines={1}
        >
          {primary}
        </Text>
        {secondary ? (
          <Text style={[styles.secondary, { fontSize: s.secondary }]} numberOfLines={1}>
            {secondary}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  block: {
    gap: 2,
  },
  label: {
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
    letterSpacing: -0.1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
  },
  primary: {
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  dominant: {
    fontFamily: Typography.family.extrabold,
  },
  secondary: {
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
  },
});
