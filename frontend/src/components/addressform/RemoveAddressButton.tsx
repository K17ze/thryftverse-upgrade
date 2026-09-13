import React, { useMemo } from 'react';
import { Text, Pressable } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { createAddressFormStyles } from './addressFormStyles';

/** Destructive remove affordance — edit mode only. */
export function RemoveAddressButton({ onPress }: { onPress: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createAddressFormStyles(colors), [colors]);

  return (
    <Pressable
      style={styles.removeBtn}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8 }}
      accessibilityRole="button"
      accessibilityLabel="Remove delivery address"
    >
      <AppIcon name="trash" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
      <Text style={styles.removeBtnText}>Remove address</Text>
    </Pressable>
  );
}
