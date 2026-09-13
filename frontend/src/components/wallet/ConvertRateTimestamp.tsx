import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../../theme/ThemeContext';
import { createConvertStyles } from './convertStyles';

interface Props {
  /** Label prefix — "Rate as of" on the amount step, "Reference rate as of" on review. */
  label: string;
  rateTimestampLabel: string | null;
  rateExpiryMs: number | null;
  isRateExpired: boolean;
  rateExpiryLabel: string;
  onRefreshRates: () => void;
}

// Rate timestamp + 30-minute validity countdown with the inline refresh
// affordance once expired. Shared by the amount and review steps.
export function ConvertRateTimestamp({
  label,
  rateTimestampLabel,
  rateExpiryMs,
  isRateExpired,
  rateExpiryLabel,
  onRefreshRates,
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createConvertStyles(colors), [colors]);

  if (!rateTimestampLabel) {
    return null;
  }

  return (
    <View style={styles.rateTimestampRow}>
      <Ionicons name="time-outline" size={12} color={colors.textMuted} />
      <Text style={[styles.rateTimestampText, { color: colors.textMuted }]}>
        {label} {rateTimestampLabel}
      </Text>
      {rateExpiryMs !== null && (
        <Text style={[styles.rateExpiryText, { color: isRateExpired ? colors.danger : colors.textMuted }]}>
          {isRateExpired ? ' · Expired' : ` · Valid ${rateExpiryLabel}`}
        </Text>
      )}
      {isRateExpired && (
        <Pressable
          hitSlop={8}
          onPress={onRefreshRates}
          accessibilityRole="button"
          accessibilityLabel="Refresh exchange rate"
        >
          <Text style={[styles.rateExpiryText, { color: colors.brand }]}> · Refresh</Text>
        </Pressable>
      )}
    </View>
  );
}
