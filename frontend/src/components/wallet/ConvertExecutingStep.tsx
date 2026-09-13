import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { formatIzeAmount } from '../../utils/currency';
import type { SupportedCurrencyCode } from '../../constants/currencies';
import { createConvertStyles } from './convertStyles';

interface Props {
  izeValue: number;
  currencyCode: SupportedCurrencyCode;
}

// STEP 4: EXECUTING — burn-and-credit in-flight indicator.
export function ConvertExecutingStep({ izeValue, currencyCode }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createConvertStyles(colors), [colors]);

  return (
    <View
      style={styles.centeredStep}
    >
      <Ionicons name="swap-horizontal" size={48} color={colors.brand} style={styles.stepIcon} />
      <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>
        Converting 1ZE…
      </Text>
      <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
        Burning {formatIzeAmount(izeValue)} and crediting your {currencyCode} balance.
      </Text>
      <ActivityIndicator
        color={colors.brand}
        size="large"
        style={{ marginTop: Space.lg }}
      />
    </View>
  );
}
