import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { createAddressFormStyles } from './addressFormStyles';

/**
 * Shared inline field-error row — warning glyph + message. Used by the
 * labelled text fields and the country row.
 */
export function FieldErrorRow({ message }: { message: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createAddressFormStyles(colors), [colors]);

  return (
    <View style={styles.errorRow}>
      <AppIcon name="warning" size={IconSize.xs} color="danger" opticalCenter accessible={false} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}
