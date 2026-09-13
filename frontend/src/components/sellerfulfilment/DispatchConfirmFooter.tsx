import React, { useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Space } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { createSellerFulfilmentStyles } from './sellerFulfilmentScreenStyles';

export interface DispatchConfirmFooterProps {
  bottomInset: number;
  isDispatching: boolean;
  onConfirmPress: () => void;
}

/**
 * Sticky footer for manual dispatch confirm. Integrated shipping has no
 * manual confirm button (the carrier scan advances state) — the parent
 * gates rendering. The button says "Confirm dispatch"; the tracking input
 * is already visible above.
 */
export function DispatchConfirmFooter({
  bottomInset,
  isDispatching,
  onConfirmPress }: DispatchConfirmFooterProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createSellerFulfilmentStyles(colors), [colors]);

  return (
    <View style={[styles.footer, { paddingBottom: bottomInset + Space.md }]}>
      <Pressable
        style={[styles.dispatchBtn, isDispatching && styles.dispatchBtnDisabled]}
        onPress={onConfirmPress}
        disabled={isDispatching}
        accessibilityRole="button"
        accessibilityLabel="Confirm dispatch"
      >
        {isDispatching ? (
          <ActivityIndicator size="small" color={colors.textInverse} />
        ) : (
          <Text style={styles.dispatchBtnText}>Confirm dispatch</Text>
        )}
      </Pressable>
    </View>
  );
}
