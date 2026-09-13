import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { createSellerFulfilmentStyles } from './sellerFulfilmentScreenStyles';

export interface DispatchBlockedNoticeProps {
  statusLabel: string;
}

/**
 * Shown when the canonical capability resolver says the order cannot be
 * dispatched from its current status. Inline warning, not a panel.
 */
export function DispatchBlockedNotice({ statusLabel }: DispatchBlockedNoticeProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createSellerFulfilmentStyles(colors), [colors]);

  return (
    <View style={styles.warningInline}>
      <Ionicons name="alert-circle-outline" size={16} color={colors.danger} aria-hidden={true} />
      <Text style={styles.warningText}>
        This order cannot be dispatched from its current status ({statusLabel}).
      </Text>
    </View>
  );
}
