import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space, Radius, Elevation } from '../../theme/designTokens';
import { GlassCard } from '../ui/GlassSurface';

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
    <GlassCard
      style={[
        styles.base,
        fullWidth && styles.fullWidth,
        !isFirst && styles.notFirst,
        !isLast && styles.notLast,
        style,
      ]}
    >
      {children}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
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
