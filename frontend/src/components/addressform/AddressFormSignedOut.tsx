import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { createAddressFormStyles } from './addressFormStyles';

/** Signed-out gate — address management requires an account. */
export function AddressFormSignedOut({ onSignIn }: { onSignIn: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createAddressFormStyles(colors), [colors]);

  return (
    <View style={styles.signedOutContainer}>
      <AppIcon name="lock" size={IconSize.hero} color="textMuted" opticalCenter accessible={false} />
      <Text style={styles.signedOutTitle}>Sign in required</Text>
      <Text style={styles.signedOutBody}>
        You need to be signed in to manage your delivery address.
      </Text>
      <Pressable
        style={styles.signedOutBtn}
        onPress={onSignIn}
        accessibilityRole="button"
        accessibilityLabel="Go to sign in"
      >
        <Text style={styles.signedOutBtnText}>Sign in</Text>
      </Pressable>
    </View>
  );
}
