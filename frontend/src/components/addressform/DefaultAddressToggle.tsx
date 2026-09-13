import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { createAddressFormStyles } from './addressFormStyles';

export interface DefaultAddressToggleProps {
  checked: boolean;
  onToggle: () => void;
}

/**
 * Save-as-default toggle — lets the user choose whether this address
 * becomes their default for checkout. Per 2026 UX research:
 * "Save as default toggle" is a must-have for address forms.
 */
export function DefaultAddressToggle({ checked, onToggle }: DefaultAddressToggleProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createAddressFormStyles(colors), [colors]);

  return (
    <Pressable
      style={styles.defaultToggleRow}
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityLabel="Save as default delivery address"
      accessibilityState={{ checked }}
      accessibilityHint="When enabled, this address is selected automatically at checkout"
    >
      <View style={styles.defaultToggleLeft}>
        <AppIcon name="checkmark-circle-outline" size={IconSize.sm} color="textSecondary" opticalCenter accessible={false} />
        <View style={styles.defaultToggleTextCol}>
          <Text style={[styles.defaultToggleTitle, { color: colors.textPrimary }]}>
            Save as default
          </Text>
          <Text style={[styles.defaultToggleSub, { color: colors.textMuted }]}>
            Use this address automatically at checkout
          </Text>
        </View>
      </View>
      <View style={[
        styles.defaultSwitch,
        {
          backgroundColor: checked ? colors.brand : colors.surfaceAlt,
          borderColor: checked ? colors.brand : colors.border },
      ]}>
        <View style={[
          styles.defaultSwitchKnob,
          {
            backgroundColor: checked ? colors.textInverse : colors.textMuted,
            alignSelf: checked ? 'flex-end' : 'flex-start' },
        ]} />
      </View>
    </Pressable>
  );
}
