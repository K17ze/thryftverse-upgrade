import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps, RootStackParamList } from '../navigation/types';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AppInput } from '../components/ui/AppInput';
import { AppButton } from '../components/ui/AppButton';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useConnectivity } from '../hooks/useConnectivity';
import { Space, Typography, Type } from '../theme/designTokens';
import { confirmPasswordReset } from '../services/authApi';

type Props = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordScreen({ navigation, route }: Props) {
  const { colors } = useAppTheme();
  const { isOffline } = useConnectivity();
  const token = route.params?.token;
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPasswordError, setNewPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [passkeysEnrolled, setPasskeysEnrolled] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('AuthLanding');
    }
  }, [navigation]);

  const goToForgotPassword = useCallback(() => {
    navigation.replace('ForgotPassword');
  }, [navigation]);

  const goToLogin = useCallback(() => {
    navigation.replace('AuthLanding');
  }, [navigation]);

  const validate = useCallback((): boolean => {
    let valid = true;
    if (!newPassword) {
      setNewPasswordError('Enter a new password.');
      valid = false;
    } else if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setNewPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      valid = false;
    } else {
      setNewPasswordError('');
    }

    if (!confirmPassword) {
      setConfirmPasswordError('Confirm your new password.');
      valid = false;
    } else if (confirmPassword !== newPassword) {
      setConfirmPasswordError('Passwords do not match.');
      valid = false;
    } else {
      setConfirmPasswordError('');
    }

    return valid;
  }, [newPassword, confirmPassword]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting || !token) return;
    setSubmitError('');
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const result = await confirmPasswordReset(token, newPassword);
      setPasskeysEnrolled(result.passkeysEnrolled);
      setIsComplete(true);
    } catch (error) {
      const message = (error as Error).message || '';
      const lower = message.toLowerCase();
      if (lower.includes('invalid') || lower.includes('expired') || lower.includes('token')) {
        setSubmitError('This link is invalid or has expired. Request a new reset link.');
      } else {
        setSubmitError(message || 'Unable to reset your password right now.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, token, newPassword, validate]);

  // ── Missing / incomplete token — honest error, no form ──
  if (!token) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        header={
          <FlagshipHeader title="" onBack={handleBack} showBackButton />
        }
      >
        <View style={styles.stateContainer}>
          <Ionicons name="link-outline" size={48} color={colors.textMuted} />
          <Text style={styles.stateTitle}>Incomplete link</Text>
          <Text style={styles.stateBody} maxFontSizeMultiplier={1.3}>
            This reset link is incomplete. Request a new reset link.
          </Text>
          <AppButton
            title="Request a new reset link"
            onPress={goToForgotPassword}
            variant="primary"
            size="lg"
            style={{ marginTop: Space.lg }}
            accessibilityLabel="Request a new reset link"
            accessibilityHint="Opens the forgot password screen to request a new reset email"
          />
        </View>
      </FlagshipScreen>
    );
  }

  // ── Success — password reset complete ──
  if (isComplete) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        header={
          <FlagshipHeader title="" onBack={handleBack} showBackButton />
        }
      >
        <View style={styles.stateContainer}>
          <Ionicons name="checkmark-circle-outline" size={48} color={colors.success} />
          <Text style={styles.stateTitle}>Password reset</Text>
          <Text style={styles.stateBody} maxFontSizeMultiplier={1.3}>
            {passkeysEnrolled
              ? 'Your password has been reset. Your passkeys are unaffected and still work.'
              : 'Your password has been reset. You can now log in.'}
          </Text>
          <AppButton
            title="Back to login"
            onPress={goToLogin}
            variant="primary"
            size="lg"
            style={{ marginTop: Space.lg }}
            accessibilityLabel="Back to login"
            accessibilityHint="Returns to the login screen"
          />
        </View>
      </FlagshipScreen>
    );
  }

  // ── Form — enter new password ──
  const canSubmit = newPassword.length > 0 && confirmPassword.length > 0 && !isSubmitting && !isOffline;

  return (
    <FlagshipScreen
      scrollEnabled={false}
      header={
        <FlagshipHeader title="" onBack={handleBack} showBackButton />
      }
    >
      <KeyboardAwareScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={styles.title}>New{'\n'}Password</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.subtitle}>Choose a new password for your account.</Text>

          <AppInput
            label="New password"
            placeholder="Enter new password"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={newPassword}
            onChangeText={(value) => {
              setNewPassword(value);
              if (newPasswordError) setNewPasswordError('');
              if (submitError) setSubmitError('');
            }}
            errorText={newPasswordError}
            containerStyle={styles.inputGroup}
            accessibilityLabel="New password"
            accessibilityHint="Enter your new password, at least 8 characters"
          />

          <AppInput
            label="Confirm password"
            placeholder="Re-enter new password"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={confirmPassword}
            onChangeText={(value) => {
              setConfirmPassword(value);
              if (confirmPasswordError) setConfirmPasswordError('');
              if (submitError) setSubmitError('');
            }}
            errorText={confirmPasswordError}
            containerStyle={styles.inputGroup}
            accessibilityLabel="Confirm password"
            accessibilityHint="Re-enter your new password to confirm it matches"
          />

          {isOffline && (
            <Text style={styles.offlineText} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">
              You're offline. Connect to the internet to continue.
            </Text>
          )}

          {!!submitError && (
            <Text style={styles.errorText} accessibilityLiveRegion="polite">
              {submitError}
            </Text>
          )}

          <View style={styles.footer}>
            <AppButton
              title="Reset password"
              onPress={handleSubmit}
              disabled={!canSubmit}
              loading={isSubmitting}
              variant="primary"
              size="lg"
              style={{ marginTop: Space.lg }}
              accessibilityLabel="Reset password"
              accessibilityHint="Submits your new password to complete the reset"
            />
            {submitError.includes('invalid or has expired') && (
              <AppButton
                title="Request a new reset link"
                onPress={goToForgotPassword}
                variant="secondary"
                size="md"
                style={{ marginTop: Space.md }}
                accessibilityLabel="Request a new reset link"
                accessibilityHint="Opens the forgot password screen to request a new reset email"
              />
            )}
          </View>
        </View>
      </KeyboardAwareScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: { flex: 1, paddingHorizontal: Space.lg },
    contentContainer: { justifyContent: 'center', flexGrow: 1, paddingBottom: Space.xl },
    title: {
      fontSize: Type.display.size + Space.sm + Space.xs,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      lineHeight: Type.display.lineHeight + 10,
      letterSpacing: Type.display.letterSpacing * 2,
      marginBottom: Space.lg,
    },
    subtitle: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      marginBottom: Space.xl,
      lineHeight: Type.subtitle.lineHeight,
    },
    form: { marginBottom: Space.xl },
    inputGroup: { marginBottom: Space.lg },
    footer: { paddingBottom: Space.xl },
    errorText: {
      color: colors.danger,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      marginBottom: Space.xs,
    },
    offlineText: {
      color: colors.textMuted,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      marginBottom: Space.sm,
    },
    stateContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.lg,
    },
    stateTitle: {
      fontSize: Type.display.size + Space.sm + Space.xs,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      lineHeight: Type.display.lineHeight + 10,
      letterSpacing: Type.display.letterSpacing * 2,
      marginTop: Space.lg,
      marginBottom: Space.md,
      textAlign: 'center',
    },
    stateBody: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: Type.subtitle.lineHeight,
      maxWidth: 300,
    },
  });
}
