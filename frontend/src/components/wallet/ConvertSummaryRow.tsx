import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Typography } from '../../theme/designTokens';
import { createConvertStyles } from './convertStyles';

interface Props {
  label: string;
  value: string;
  total?: boolean;
  emphasis?: boolean;
}

// Flat label/value summary row shared by the amount quote preview, the
// review step and the receipt breakdown.
export function ConvertSummaryRow({ label, value, total = false, emphasis = false }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createConvertStyles(colors), [colors]);

  return (
    <View
      style={[
        styles.summaryRow,
        total && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          marginTop: Space.xs,
          paddingTop: Space.xs },
      ]}
      accessibilityRole="text"
      accessibilityLabel={`${label} ${value}`}
    >
      <Text
        style={[
          styles.summaryLabel,
          { color: total ? colors.textPrimary : colors.textSecondary },
          total && { fontFamily: Typography.family.semibold },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.summaryValue,
          { color: total ? colors.textPrimary : colors.textPrimary },
          emphasis && { fontFamily: Typography.family.bold },
          total && { fontFamily: Typography.family.semibold },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}
