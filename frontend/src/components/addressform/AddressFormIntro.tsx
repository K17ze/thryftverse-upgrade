import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { createAddressFormStyles } from './addressFormStyles';

/** Editorial introduction — title + body copy differs by add/edit mode. */
export function AddressFormIntro({ isEditing }: { isEditing: boolean }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createAddressFormStyles(colors), [colors]);

  return (
    <View style={styles.intro}>
      <Text style={styles.introTitle}>
        {isEditing ? 'Edit delivery address' : 'Add delivery address'}
      </Text>
      <Text style={styles.introBody}>
        {isEditing
          ? 'Update your saved delivery address. Used at checkout and for delivery.'
          : 'Add a delivery address for faster checkout. Save multiple addresses.'}
      </Text>
    </View>
  );
}
