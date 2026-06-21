import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type, TypeStyles, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

export interface SettingsSignOutRowProps {
  username?: string | null;
  onSignOut: () => Promise<void> | void;
}

export function SettingsSignOutRow({ username, onSignOut }: SettingsSignOutRowProps) {
  const [isBusy, setIsBusy] = useState(false);

  const handlePress = useCallback(() => {
    if (isBusy) return;
    Alert.alert(
      'Sign Out',
      username
        ? `You will be signed out of @${username} on this device.`
        : 'You will be signed out of your account on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setIsBusy(true);
            try {
              await onSignOut();
            } finally {
              setIsBusy(false);
            }
          },
        },
      ]
    );
  }, [isBusy, onSignOut]);

  return (
    <AnimatedPressable
      onPress={handlePress}
      activeOpacity={0.7}
      scaleValue={0.98}
      hapticFeedback="medium"
      disabled={isBusy}
      accessibilityRole="button"
      accessibilityLabel="Sign out"
      accessibilityHint="Opens a confirmation dialog to sign out of your account"
      accessibilityState={{ busy: isBusy, disabled: isBusy }}
    >
      <View style={styles.row}>
        {isBusy ? (
          <ActivityIndicator size={18} color={Colors.danger} style={styles.icon} />
        ) : (
          <Ionicons name="log-out-outline" size={20} color={Colors.danger} style={styles.icon} />
        )}
        <Text style={styles.label}>
          {isBusy ? 'Signing out…' : 'Sign Out'}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Space.md,
    gap: Space.sm + 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  icon: {
    width: 20,
  },
  label: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.danger,
    letterSpacing: Type.body.letterSpacing,
  },
});
