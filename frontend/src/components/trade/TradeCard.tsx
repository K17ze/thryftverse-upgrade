import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Colors } from '../../constants/colors';
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

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
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
