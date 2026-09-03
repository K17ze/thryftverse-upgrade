import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export function PriceRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const { colors } = useAppTheme();
  const priceStyles = useMemo(() => StyleSheet.create({
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: Space.xs + 2,
    },
    label: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
    },
    labelBold: {
      fontSize: TypographyV2.priceList.size,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },
    value: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    valueBold: {
      fontSize: TypographyV2.priceList.size,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
  }), [colors]);

  return (
    <View style={priceStyles.row}>
      <Text style={[priceStyles.label, bold && priceStyles.labelBold]}>{label}</Text>
      <Text style={[priceStyles.value, bold && priceStyles.valueBold]}>{value}</Text>
    </View>
  );
}
