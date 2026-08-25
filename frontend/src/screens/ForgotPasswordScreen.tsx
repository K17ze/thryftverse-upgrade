import { Space, Typography, Type } from '../theme/designTokens';
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AppInput } from '../components/ui/AppInput';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { requestPasswordReset } from '../services/authApi';
import { AppButton } from '../components/ui/AppButton';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useAppTheme();
  const [email, setEmail] = useState('');
  const [isSent, setIsSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [resendMsg, setResendMsg] = useState('');
  const [isResending, setIsResending] = useState(false);
  const canSendReset = email.trim().length > 0;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleReset = async () => {
    if (isSubmitting) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMsg('Enter your email address.');
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setErrorMsg('Enter a valid email address.');
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);

    try {
      await requestPasswordReset(normalizedEmail);
      setIsSent(true);
    } catch (error) {
      setErrorMsg((error as Error).message || 'Unable to send reset link right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resend — stays in the success state, re-sends the reset link to the
  // same address. Enriches the success state so the user is not stranded
  // if the first email does not arrive (research §3.6, micro #13).
  const handleResend = async () => {
    if (isResending) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      return;
    }

    setResendMsg('');
    setIsResending(true);

    try {
      await requestPasswordReset(normalizedEmail);
      setResendMsg('Reset link resent. Check your inbox and spam folder.');
    } catch (error) {
      setResendMsg((error as Error).message || 'Unable to resend right now. Try again in a moment.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <FlagshipScreen
      scrollEnabled={false}
      header={
        <FlagshipHeader
          title=""
          onBack={() => navigation.goBack()}
          showBackButton
        />
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
          <Text style={styles.title}>Reset{'\n'}Password</Text>
        </View>

        {isSent ? (
          <View
            style={styles.successState}
          >
            <Ionicons name="mail-unread-outline" size={48} color={colors.success} />
            <Text style={styles.successText}>We have sent a password reset link to {email}.</Text>
            {/* Spam-folder hint — guides the user if the email does not
                arrive immediately. Honest guidance, not a claim. */}
            <Text style={styles.spamHint} maxFontSizeMultiplier={1.3}>
              Didn't receive it? Check your spam folder, then try resending.
            </Text>
            {/* Resend action — re-sends the reset link to the same address.
                Shows a loading state while sending and a confirmation once
                sent, so the user knows the action worked. */}
            <AppButton
              title={isResending ? 'Resending...' : 'Resend reset link'}
              onPress={handleResend}
              disabled={isResending}
              loading={isResending}
              variant="secondary"
              size="md"
              style={{ marginTop: Space.md }}
              accessibilityLabel="Resend reset link"
              accessibilityHint="Sends another password reset link to your email"
            />
            {!!resendMsg && (
              <Text style={styles.resendMsg} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">
                {resendMsg}
              </Text>
            )}
            <AppButton
              title="Return to Login"
              onPress={() => navigation.goBack()}
              variant="primary"
              size="lg"
              style={{ marginTop: Space.lg }}
            />
          </View>
        ) : (
          <View
            style={styles.form}
          >
            <Text style={styles.subtitle}>Enter your email address and we'll send you a link to reset your password.</Text>
            <AppInput
              label="Email"
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                if (errorMsg) {
                  setErrorMsg('');
                }
              }}
              containerStyle={styles.inputGroup}
            />

            {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

            <View
              style={styles.footer}
            >
              <AppButton
                title={isSubmitting ? 'Sending...' : 'Send Reset Link'}
                onPress={handleReset}
                disabled={!canSendReset || isSubmitting}
                loading={isSubmitting}
                variant="primary"
                size="lg"
                style={{ marginTop: Space.lg }}
              />
            </View>
          </View>
        )}

      </KeyboardAwareScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: { flex: 1, paddingHorizontal: Space.lg },
  contentContainer: { justifyContent: 'center', flexGrow: 1, paddingBottom: Space.xl },
  title: { fontSize: Type.display.size + Space.sm + Space.xs, fontFamily: Typography.family.bold, color: colors.textPrimary, lineHeight: Type.display.lineHeight + 10, letterSpacing: Type.display.letterSpacing * 2, marginBottom: Space.lg },
  subtitle: { fontSize: Type.body.size, fontFamily: Typography.family.regular, color: colors.textSecondary, marginBottom: Space.xl, lineHeight: Type.subtitle.lineHeight },

  form: { marginBottom: Space.xl },
  inputGroup: { marginBottom: Space.xl },

  footer: { paddingBottom: Space.xl },
  errorText: { color: colors.danger, fontSize: Type.caption.size, fontFamily: Typography.family.medium, marginBottom: Space.xs },

  successState: {
    alignItems: 'center',
    paddingTop: Space.lg,
  },
  successText: {
    fontSize: Type.body.size,
    color: colors.textPrimary,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    marginVertical: Space.lg,
    lineHeight: Type.subtitle.lineHeight,
  },
  spamHint: {
    fontSize: Type.caption.size,
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    lineHeight: Type.caption.lineHeight + 2,
    maxWidth: 300,
  },
  resendMsg: {
    fontSize: Type.caption.size,
    color: colors.textSecondary,
    fontFamily: Typography.family.medium,
    textAlign: 'center',
    marginTop: Space.sm,
    lineHeight: Type.caption.lineHeight + 2,
  },
  });
}