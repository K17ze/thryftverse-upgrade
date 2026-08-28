import React, { useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, StatusBar, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useStore } from '../store/useStore';
import { AppButton } from '../components/ui/AppButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Type, Space, Radius, Control } from '../theme/designTokens';
import { restoreAuthSession } from '../services/authApi';
import { track } from '../analytics';

/**
 * Biometric login gate for returning users.
 *
 * When the user has enabled "Biometric login" in Settings and the app has a
 * stored auth snapshot, App.tsx restores the session into the store but sets
 * `biometricLoginPending = true`. This screen becomes the initial route
 * instead of MainTabs. The user must pass Face ID / Touch ID / fingerprint
 * before the main app is revealed.
 *
 * On success: clears the pending flag and navigates to MainTabs.
 * On failure/cancel: logs out (clearing the restored session) and navigates
 * to AuthLanding so the user can sign in manually.
 *
 * If biometric hardware is unavailable at runtime (e.g. user removed enrolled
 * fingerprints since enabling the feature), the screen falls back to the
 * manual sign-in flow rather than blocking forever — truthful UI per AGENTS.md.
 */
export default function BiometricLoginScreen() {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useAppTheme();
  const currentUser = useStore((state) => state.currentUser);
  const setBiometricLoginPending = useStore((state) => state.setBiometricLoginPending);
  const logout = useStore((state) => state.logout);
  const [isAuthenticating, setIsAuthenticating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hardwareChecked, setHardwareChecked] = React.useState(false);
  const [biometricAvailable, setBiometricAvailable] = React.useState(false);
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Probe hardware availability once on mount. If biometrics are not
  // available (e.g. user removed fingerprints since enabling the feature),
  // fall back to manual sign-in instead of blocking forever.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (cancelled) return;
        setBiometricAvailable(hasHardware && enrolled);
      } catch {
        if (cancelled) return;
        setBiometricAvailable(false);
      } finally {
        if (!cancelled) setHardwareChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSuccess = useCallback(() => {
    setBiometricLoginPending(false);
    track('biometric_login_success');
    navigation.replace('MainTabs');
  }, [navigation, setBiometricLoginPending]);

  const handleFallbackToSignIn = useCallback(() => {
    track('biometric_login_cancelled');
    logout();
    navigation.replace('AuthLanding');
  }, [logout, navigation]);

  const authenticate = useCallback(async () => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);
    setError(null);
    track('biometric_login_attempted');
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Welcome back${currentUser?.username ? ', ' + currentUser.username : ''}`,
        fallbackLabel: 'Use password',
        disableDeviceFallback: false,
        cancelLabel: 'Cancel',
      });
      if (result.success) {
        // Refresh the live session in the background — the restored snapshot
        // is already in the store, so the user sees the app immediately.
        restoreAuthSession().catch(() => {
          // Best-effort — the snapshot is already restored.
        });
        handleSuccess();
        return;
      }
      const message =
        result.error === 'user_cancel'
          ? 'Authentication cancelled'
          : result.error === 'user_fallback'
            ? 'Password fallback selected'
            : 'Authentication failed';
      setError(message);
    } catch {
      setError('Authentication failed');
    } finally {
      setIsAuthenticating(false);
    }
  }, [currentUser?.username, handleSuccess, isAuthenticating]);

  // Auto-prompt when hardware is confirmed available.
  useEffect(() => {
    if (hardwareChecked && biometricAvailable && !isAuthenticating) {
      void authenticate();
    }
  }, [hardwareChecked, biometricAvailable, authenticate, isAuthenticating]);

  // If biometric hardware is not available, fall back to sign-in immediately.
  useEffect(() => {
    if (hardwareChecked && !biometricAvailable) {
      handleFallbackToSignIn();
    }
  }, [hardwareChecked, biometricAvailable, handleFallbackToSignIn]);

  if (!hardwareChecked) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      <View style={styles.content}>
        <Ionicons name="finger-print-outline" size={56} color={colors.brand} style={styles.biometricIcon} />

        <Text style={styles.title} maxFontSizeMultiplier={1.3}>
          Welcome back
        </Text>
        <Text style={styles.subtitle} maxFontSizeMultiplier={1.4}>
          {currentUser?.username
            ? `Authenticate to continue, ${currentUser.username}.`
            : 'Authenticate to continue.'}
        </Text>

        {error ? (
          <Text style={styles.errorText} maxFontSizeMultiplier={1.3}>
            {error}
          </Text>
        ) : null}

        <AppButton
          title={isAuthenticating ? 'Authenticating...' : 'Authenticate'}
          onPress={authenticate}
          variant="primary"
          size="lg"
          loading={isAuthenticating}
          disabled={isAuthenticating}
          style={styles.authButton}
          accessibilityLabel="Authenticate with biometrics"
          accessibilityHint="Opens Face ID, Touch ID, or fingerprint prompt"
          hapticFeedback="medium"
        />

        <AnimatedPressable
          style={styles.fallbackBtn}
          onPress={handleFallbackToSignIn}
          accessibilityRole="button"
          accessibilityLabel="Sign in manually"
          accessibilityHint="Skips biometric authentication and goes to the sign-in screen"
        >
          <Text style={styles.fallbackText} maxFontSizeMultiplier={1.3}>
            Sign in manually
          </Text>
        </AnimatedPressable>
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.xl,
    },
    biometricIcon: {
      marginBottom: Space.lg,
    },
    title: {
      fontSize: Type.display.size,
      lineHeight: Type.display.lineHeight,
      fontWeight: Type.display.weight as any,
      letterSpacing: Type.display.letterSpacing,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: Space.sm,
    },
    errorText: {
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      color: colors.danger,
      textAlign: 'center',
      marginTop: Space.md,
    },
    authButton: {
      marginTop: Space.xxl,
      minWidth: 220,
    },
    fallbackBtn: {
      marginTop: Space.lg,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fallbackText: {
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      color: colors.textSecondary,
    },
  });
}
