import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { createAddressFormStyles } from './addressFormStyles';
import { FieldErrorRow } from './FieldErrorRow';

export interface CountryFieldProps {
  country: string;
  error?: string;
  onPress: () => void;
}

/** Country selector row — opens the bottom-sheet country picker. */
export function CountryField({ country, error, onPress }: CountryFieldProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createAddressFormStyles(colors), [colors]);
  const countryDisplayName = country || 'Select country';

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Country</Text>
      <Pressable
        style={styles.countryRow}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Country. Current selection: ${countryDisplayName}`}
      >
        <Text
          style={[
            styles.countryText,
            !country && styles.countryPlaceholder,
          ]}
        >
          {countryDisplayName}
        </Text>
        <AppIcon name="chevronDown" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
      </Pressable>
      {error ? <FieldErrorRow message={error} /> : null}
    </View>
  );
}
