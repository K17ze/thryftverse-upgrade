import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, StatusBar, Keyboard } from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, FadeInUp, FadeOutUp, Layout } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useStore } from '../store/useStore';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { markInteractive } from '../platform/monitoring';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { Type, Space, Radius, Typography, Stroke, Control, LetterSpacing } from '../theme/designTokens';
import {
  loginWithPassword,
  requestEmailOtp,
  requestMagicLink,
  verifyEmailOtp,
  type LoginWithPasswordError,
} from '../services/authApi';

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useAppTheme();
  const canGoBack = navigation.canGoBack();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMagicSending, setIsMagicSending] = useState(false);
  const [isOtpSending, setIsOtpSending] = useState(false);
  const [isOtpVerifying, setIsOtpVerifying] = useState(false);
  const [otpChallengeId, setOtpChallengeId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const reducedMotionEnabled = useReducedMotion();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const login = useStore(state => state.login);
  const setTwoFactorEnabled = useStore(state => state.setTwoFactorEnabled);
  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;
  const canRequestMagicLink = email.trim().length > 0 && !isSubmitting && !isMagicSending;
  const canRequestOtp = email.trim().length > 0 && !isSubmitting && !isOtpSending;
  const canVerifyOtp = !!otpChallengeId && otpCode.trim().length >= 4 && !isOtpVerifying && !isSubmitting;

  const errorPulse = useSharedValue(1);

  const triggerErrorFeedback = () => {
    if (reducedMotionEnabled) {
      // WCAG 2.2 §2.3.3 — no motion animation when Reduce Motion is on
      errorPulse.value = 1;
      return;
    }
    errorPulse.value = withSequence(
      withTiming(0.95, { duration: 120 }),
      withTiming(1, { duration: 180 })
    );
  };

  const errorPulseStyle = useAnimatedStyle(() => ({
    opacity: errorPulse.value
  }));

  const statusEnterAnimation = reducedMotionEnabled
    ? undefined
    : FadeInUp.springify().damping(20).duration(400);
  const statusExitAnimation = reducedMotionEnabled ? undefined : FadeOutUp;
  const layoutAnimation = reducedMotionEnabled ? undefined : Layout.springify();

  const handleLogin = async () => {
    if (isSubmitting) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setErrorMsg('Fill in both email and password.');
      setEmailError(!normalizedEmail ? 'Email is required.' : '');
      setPasswordError(!password ? 'Password is required.' : '');
      setInfoMsg('');
      triggerErrorFeedback();
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setErrorMsg('Enter a valid email address.');
      setEmailError('Enter a valid email address.');
      setInfoMsg('');
      triggerErrorFeedback();
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      setPasswordError('Password must be at least 6 characters.');
      setInfoMsg('');
      triggerErrorFeedback();
      return;
    }

    setErrorMsg('');
    setEmailError('');
    setPasswordError('');
    setInfoMsg('');
    setIsSubmitting(true);

    try {
      const result = await loginWithPassword({
        email: normalizedEmail,
        password,
        twoFactorCode: recoveryCode.trim() ? undefined : twoFactorCode.trim() || undefined,
        recoveryCode: recoveryCode.trim() || undefined,
      });

      login(result.storeUser);
      setTwoFactorEnabled(result.user.twoFactorEnabled);
      navigation.replace('MainTabs');
      // EAS Observe: login has completed and the user is being routed into the
      // main app. Only the first markInteractive() app-wide records the TTI
      // metric, so this is safe alongside the home-feed and splash signals.
      markInteractive({ surface: 'login_complete' });
    } catch (error) {
      const authError = error as LoginWithPasswordError;
      if (
        authError.code === 'TWO_FACTOR_CODE_REQUIRED'
        || authError.code === 'TWO_FACTOR_CODE_INVALID'
        || authError.code === 'RECOVERY_CODE_INVALID'
        || authError.code === 'TWO_FACTOR_NOT_CONFIGURED'
      ) {
        setRequiresTwoFactor(true);
        setInfoMsg('Enter your authenticator code (or a recovery code) to continue.');
      }
      setErrorMsg(authError.message || 'Unable to log in right now.');
      triggerErrorFeedback();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestOtp = async () => {
    if (isOtpSending || isSubmitting) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMsg('Enter your email first to receive an OTP code.');
      setInfoMsg('');
      triggerErrorFeedback();
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setErrorMsg('Enter a valid email address before requesting OTP.');
      setInfoMsg('');
      triggerErrorFeedback();
      return;
    }

    setErrorMsg('');
    setInfoMsg('');
    setIsOtpSending(true);

    try {
      const result = await requestEmailOtp(normalizedEmail);
      setOtpChallengeId(result.challengeId);
      setOtpCode('');

      if (result.developmentCode) {
        setInfoMsg(`Development OTP: ${result.developmentCode}`);
      } else {
        setInfoMsg('OTP sent to your email. Enter the code below.');
      }
    } catch (error) {
      setErrorMsg((error as Error).message || 'Unable to send OTP right now.');
      setInfoMsg('');
      triggerErrorFeedback();
    } finally {
      setIsOtpSending(false);
    }
  };

  const handleRequestMagicLink = async () => {
    if (isMagicSending || isSubmitting) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMsg('Enter your email first to request a magic link.');
      setInfoMsg('');
      triggerErrorFeedback();
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setErrorMsg('Enter a valid email address before requesting a magic link.');
      setInfoMsg('');
      triggerErrorFeedback();
      return;
    }

    setErrorMsg('');
    setInfoMsg('');
    setIsMagicSending(true);

    try {
      const result = await requestMagicLink(normalizedEmail);
      if (result.developmentMagicLink) {
        setInfoMsg(`Development magic link: ${result.developmentMagicLink}`);
      } else {
        setInfoMsg(result.message);
      }
    } catch (error) {
      setErrorMsg((error as Error).message || 'Unable to send magic link right now.');
      setInfoMsg('');
      triggerErrorFeedback();
    } finally {
      setIsMagicSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpChallengeId || isOtpVerifying || isSubmitting) {
      return;
    }

    const normalizedCode = otpCode.trim();
    if (normalizedCode.length < 4) {
      setErrorMsg('Enter the OTP code from your email.');
      setInfoMsg('');
      triggerErrorFeedback();
      return;
    }

    setErrorMsg('');
    setInfoMsg('');
    setIsOtpVerifying(true);

    try {
      const result = await verifyEmailOtp({
        challengeId: otpChallengeId,
        code: normalizedCode,
      });

      login(result.storeUser);
      setTwoFactorEnabled(result.user.twoFactorEnabled);
      navigation.replace('MainTabs');
      // EAS Observe: OTP login has completed and the user is being routed
      // into the main app. Only the first markInteractive() app-wide records
      // the TTI metric.
      markInteractive({ surface: 'login_complete_otp' });
    } catch (error) {
      const maybeAttempts = (error as { attemptsRemaining?: number }).attemptsRemaining;
      const baseMessage = (error as Error).message || 'Unable to verify OTP right now.';
      if (typeof maybeAttempts === 'number') {
        setErrorMsg(`${baseMessage} Attempts left: ${maybeAttempts}.`);
      } else {
        setErrorMsg(baseMessage);
      }
      triggerErrorFeedback();
    } finally {
      setIsOtpVerifying(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      <View style={styles.header}>
        {canGoBack ? (
          <AnimatedPressable
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityHint="Returns to the previous screen"
          >
            <Ionicons name="arrow-back" size={Control.icon} color={colors.textPrimary} />
          </AnimatedPressable>
        ) : (
          <View style={styles.backBtnSpacer} />
        )}
      </View>

      <KeyboardAwareScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
          <View>
            <Text style={styles.title} maxFontSizeMultiplier={1.3}>Welcome back</Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.4}>Log in to continue buying, selling, and trading.</Text>

            {/* Trust reassurance — calm, reflective-level signal (§27.7).
                A small lock icon + line communicates security without
                overwhelming the form. Shown only when no 2FA challenge
                is active to avoid visual noise during recovery. */}
            {!requiresTwoFactor && !otpChallengeId && (
              <View style={styles.trustReassure}>
                <Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} />
                <Text style={styles.trustReassureText} maxFontSizeMultiplier={1.3}>
                  Your login is encrypted and secure
                </Text>
              </View>
            )}

            <View style={styles.form}>
              <AppInput
                label="Email"
                placeholder="Enter your email"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                value={email}
                errorText={emailError || undefined}
                onChangeText={(value) => {
                  setEmail(value);
                  setRequiresTwoFactor(false);
                  setTwoFactorCode('');
                  setRecoveryCode('');
                  if (otpChallengeId) {
                    setOtpChallengeId(null);
                    setOtpCode('');
                  }
                  if (errorMsg) {
                    setErrorMsg('');
                  }
                  if (emailError) {
                    setEmailError('');
                  }
                  if (infoMsg) {
                    setInfoMsg('');
                  }
                }}
                containerStyle={styles.inputGroup}
              />

              {requiresTwoFactor && (
                <View style={styles.twoFactorGroup}>
                  <View style={styles.twoFactorHeader}>
                    <View style={[styles.twoFactorIcon, { backgroundColor: colors.commerceTrust + '18' }]}>
                      <Ionicons name="shield-checkmark-outline" size={16} color={colors.commerceTrust} />
                    </View>
                    <Text style={styles.twoFactorTitle} maxFontSizeMultiplier={1.3}>Two-factor authentication</Text>
                  </View>
                  <AppInput
                    label="Authenticator code"
                    placeholder="123456"
                    keyboardType="number-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={6}
                    value={twoFactorCode}
                    onChangeText={(value) => {
                      setTwoFactorCode(value.replace(/\D/g, '').slice(0, 6));
                      if (errorMsg) {
                        setErrorMsg('');
                      }
                    }}
                  />

                  <Text style={styles.twoFactorHint} maxFontSizeMultiplier={1.3}>
                    Lost access? Use a recovery code below instead.
                  </Text>

                  <AppInput
                    label="Recovery code (optional)"
                    placeholder="ABCD-1234"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    value={recoveryCode}
                    onChangeText={(value) => {
                      setRecoveryCode(value.toUpperCase());
                      if (errorMsg) {
                        setErrorMsg('');
                      }
                    }}
                  />
                </View>
              )}

              <AppInput
                label="Password"
                placeholder="Enter your password"
                secureTextEntry
                returnKeyType="done"
                value={password}
                errorText={passwordError || undefined}
                onChangeText={(value) => {
                  setPassword(value);
                  if (errorMsg) {
                    setErrorMsg('');
                  }
                  if (passwordError) {
                    setPasswordError('');
                  }
                }}
                onSubmitEditing={() => {
                  Keyboard.dismiss();
                  if (canSubmit) {
                    void handleLogin();
                  }
                }}
                containerStyle={styles.inputGroup}
              />

              <AnimatedPressable
                style={styles.forgotBtn}
                onPress={() => navigation.navigate('ForgotPassword')}
                accessibilityRole="button"
                accessibilityLabel="Forgot password"
                accessibilityHint="Opens password recovery flow"
              >
                <Text style={styles.forgotText} maxFontSizeMultiplier={1.3}>Forgot password?</Text>
              </AnimatedPressable>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText} maxFontSizeMultiplier={1.3}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <AppButton
                title={isOtpSending ? 'Sending OTP...' : 'Send OTP to Email'}
                style={[styles.otpRequestBtn, !canRequestOtp && styles.primaryBtnDisabled]}
                titleStyle={styles.otpRequestText}
                variant="secondary"
                size="sm"
                onPress={handleRequestOtp}
                disabled={!canRequestOtp}
                accessibilityLabel="Send one-time passcode to email"
              />

              <AppButton
                title={isMagicSending ? 'Sending magic link...' : 'Send Magic Link Instead'}
                style={[styles.magicLinkBtn, !canRequestMagicLink && styles.primaryBtnDisabled]}
                titleStyle={styles.magicLinkText}
                variant="secondary"
                size="sm"
                onPress={handleRequestMagicLink}
                disabled={!canRequestMagicLink}
                accessibilityLabel="Send magic sign-in link"
              />

              {!!otpChallengeId && (
                <View style={styles.otpGroup}>
                  <AppInput
                    label="One-time code"
                    placeholder="Enter OTP"
                    keyboardType="number-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={10}
                    value={otpCode}
                    onChangeText={setOtpCode}
                    onSubmitEditing={() => {
                      Keyboard.dismiss();
                      if (canVerifyOtp) {
                        void handleVerifyOtp();
                      }
                    }}
                  />

                  <AppButton
                    title={isOtpVerifying ? 'Verifying...' : 'Verify OTP & Log In'}
                    style={[styles.otpVerifyBtn, !canVerifyOtp && styles.primaryBtnDisabled]}
                    titleStyle={styles.otpVerifyText}
                    variant="primary"
                    size="md"
                    onPress={handleVerifyOtp}
                    disabled={!canVerifyOtp}
                    accessibilityLabel="Verify OTP and log in"
                    hapticFeedback="medium"
                  />
                </View>
              )}
            </View>
          </View>

          <View style={styles.footer}>
            {!!infoMsg && !errorMsg && (
              <Reanimated.Text
                entering={statusEnterAnimation}
                exiting={statusExitAnimation}
                layout={layoutAnimation}
                style={styles.infoText}
                accessibilityLiveRegion="polite"
                maxFontSizeMultiplier={1.4}
              >
                {infoMsg}
              </Reanimated.Text>
            )}

            {!!errorMsg && (
              <Reanimated.Text
                entering={statusEnterAnimation}
                exiting={statusExitAnimation}
                layout={layoutAnimation}
                style={styles.errorText}
                accessibilityLiveRegion="assertive"
                maxFontSizeMultiplier={1.4}
              >
                {errorMsg}
              </Reanimated.Text>
            )}

            <Reanimated.View style={errorPulseStyle} layout={layoutAnimation}>
              <AppButton
                title={isSubmitting ? 'Signing in...' : 'Log In'}
                style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
                titleStyle={styles.primaryText}
                variant="primary"
                size="md"
                onPress={handleLogin}
                disabled={!canSubmit}
                loading={isSubmitting}
                accessibilityLabel="Log in"
                hapticFeedback="medium"
              />
            </Reanimated.View>

            <View style={styles.switchRow}>
              <Text style={styles.switchText} maxFontSizeMultiplier={1.3}>New to Thryftverse?</Text>
              <AnimatedPressable
                onPress={() => navigation.navigate('SignUp')}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Create account"
                accessibilityHint="Opens the sign-up screen"
              >
                <Text style={styles.switchLink} maxFontSizeMultiplier={1.3}>Create account</Text>
              </AnimatedPressable>
            </View>
          </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: Space.md, paddingTop: Space.sm, paddingBottom: Space.xs },
  backBtn: { width: Control.hit, height: Control.hit, borderRadius: Radius.xxl, alignItems: 'center', justifyContent: 'center' },
  backBtnSpacer: { width: Control.hit, height: Control.hit },

  keyboardWrap: { flex: 1 },
  content: { flex: 1 },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
    paddingBottom: Space.lg,
  },
  title: { fontSize: Type.display.size, fontFamily: Typography.family.bold, color: colors.textPrimary, lineHeight: Type.display.lineHeight, letterSpacing: Type.display.letterSpacing },
  subtitle: { marginTop: Space.sm, fontSize: Type.body.size, lineHeight: Type.body.lineHeight, color: colors.textSecondary, fontFamily: Typography.family.regular, marginBottom: Space.md },
  trustReassure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: Space.lg,
  },
  trustReassureText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    letterSpacing: 0.1,
  },

  form: { marginBottom: Space.lg },
  inputGroup: { marginBottom: Space.md },

  forgotBtn: { alignSelf: 'flex-start', marginTop: Space.sm },
  forgotText: { color: colors.textSecondary, fontSize: Type.body.size, fontFamily: Typography.family.medium, textDecorationLine: 'underline' },
  dividerRow: {
    marginTop: Space.md + 2,
    marginBottom: Space.smMd,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
  },
  dividerLine: {
    flex: 1,
    height: Stroke.standard,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps,
  },
  otpRequestBtn: {
    minHeight: Control.hit + 2,
    borderRadius: Radius.xxl,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  otpRequestText: {
    color: colors.textPrimary,
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  otpGroup: {
    marginTop: Space.sm + 6,
    gap: Space.sm + 2,
  },
  twoFactorGroup: {
    marginBottom: Space.md,
    gap: Space.sm,
  },
  twoFactorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginBottom: Space.xs,
  },
  twoFactorIcon: {
    width: Control.chrome,
    height: Control.chrome,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  twoFactorTitle: {
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    letterSpacing: Type.bodyStrong.letterSpacing,
  },
  twoFactorHint: {
    color: colors.textMuted,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    marginBottom: Space.xs / 2,
  },
  magicLinkBtn: {
    minHeight: Control.hit - 2,
    borderRadius: Radius.xxl,
    borderWidth: 0,
    backgroundColor: 'transparent',
    marginTop: Space.sm + 2,
  },
  magicLinkText: {
    color: colors.textSecondary,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    textDecorationLine: 'underline',
  },
  otpVerifyBtn: {
    minHeight: Space.xxl,
    borderRadius: Radius.xxl,
    borderWidth: 0,
    backgroundColor: colors.brand,
  },
  otpVerifyText: {
    color: colors.textInverse,
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },

  footer: { paddingTop: Space.sm, position: 'relative' },
  infoText: { color: colors.success, fontSize: Type.caption.size, fontFamily: Typography.family.medium, textAlign: 'center', marginBottom: Space.md - 4 },
  errorText: { color: colors.danger, fontSize: Type.caption.size, fontFamily: Typography.family.medium, textAlign: 'center', marginBottom: Space.md - 4 },
  primaryBtn: { backgroundColor: colors.brand, minHeight: Space.xxl + Space.sm, borderRadius: Radius.xxl + 4, borderWidth: 0 },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryText: { color: colors.textInverse, fontSize: Type.body.size, fontFamily: Typography.family.semibold },
  switchRow: {
    marginTop: Space.sm + 6,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.xs + 2,
  },
  switchText: {
    color: colors.textSecondary,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  switchLink: {
    color: colors.textPrimary,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    textDecorationLine: 'underline',
  },
  });
}