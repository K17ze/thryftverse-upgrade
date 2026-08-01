import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';

interface TradeCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  noBorder?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  fullWidth?: boolean;
  /** Legacy/compat — no longer drives styling but accepted to avoid breakage */
  variant?: string;
}

export function TradeCard({
  children,
  style,
  noBorder = false,
  isFirst = true,
  isLast = true,
  fullWidth = true,
  variant,
}: TradeCardProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View
      style={[
        styles.base,
        fullWidth && styles.fullWidth,
        !isFirst && styles.notFirst,
        !isLast && styles.notLast,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fullWidth: {
    marginHorizontal: Space.md,
  },
  notFirst: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 0,
  },
  notLast: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
});