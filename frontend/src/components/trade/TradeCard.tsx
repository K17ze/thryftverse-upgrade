import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space, Radius, Elevation } from '../../theme/designTokens';
import { AppCard, AppCardVariant } from '../ui/AppCard';

interface TradeCardProps {
  children: React.ReactNode;
  variant?: AppCardVariant;
  style?: StyleProp<ViewStyle>;
  noBorder?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  fullWidth?: boolean;
}

export function TradeCard({
  children,
  variant = 'surface',
  style,
  noBorder = false,
  isFirst = true,
  isLast = true,
  fullWidth = true,
}: TradeCardProps) {
  return (
    <AppCard
      variant={variant}
      noBorder={noBorder}
      style={[
        styles.base,
        fullWidth && styles.fullWidth,
        !isFirst && styles.notFirst,
        !isLast && styles.notLast,
        style,
      ]}
    >
      {children}
    </AppCard>
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
