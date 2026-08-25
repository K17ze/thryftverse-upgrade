import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Type, FontFamily } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

export interface SettingsSignOutRowProps {
  username?: string | null;
  onSignOut: () => Promise<void> | void;
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.sm + Space.xs,
      paddingHorizontal: Space.md,
      minHeight: 50,
      gap: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    icon: {
      width: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      flex: 1,
      fontSize: 16,
      fontFamily: FontFamily.regular,
      color: colors.danger,
      letterSpacing: Type.body.letterSpacing,
    },
  });

export function SettingsSignOutRow({ username, onSignOut }: SettingsSignOutRowProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [isBusy, setIsBusy] = useState(false);

  const handlePress = useCallback(() => {
    if (isBusy) return;
    Alert.alert(
      'Sign Out',
      username
        ? `You'll be signed out of @${username} on this device.`
        : 'You\'ll be signed out of your account on this device.',
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
          <ActivityIndicator size={20} color={colors.danger} style={styles.icon} />
        ) : (
          <Ionicons name="log-out-outline" size={24} color={colors.danger} style={styles.icon} />
        )}
        <Text style={styles.label}>
          {isBusy ? 'Signing out…' : 'Sign Out'}
        </Text>
      </View>
    </AnimatedPressable>
  );
}
