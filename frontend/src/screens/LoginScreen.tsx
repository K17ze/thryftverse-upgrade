import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, StatusBar, Keyboard, ActivityIndicator, Pressable } from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, FadeInUp, FadeOutUp, Layout } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useStore } from '../store/useStore';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Motion } from '../theme/motionTokens';
import { markInteractive } from '../platform/monitoring';
import { track } from '../analytics';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { Space, Radius, Stroke, Control, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import {
  loginWithPassword,
  loginWithAppleIdentityToken,
  loginWithGoogleIdToken,
  requestEmailOtp,
  requestMagicLink,
  verifyEmailOtp,
  type LoginWithPasswordError,
  type OtpVerificationError } from '../services/authApi';

WebBrowser.maybeCompleteAuthSession();

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
  // Inline 2FA challenge for the OTP flow. The backend does NOT consume the
  // OTP challenge when TWO_FACTOR_REQUIRED is returned (the transaction rolls
  // back), so the same challengeId + OTP code can be retried with a 2FA code.
  const [otpTwoFactorRequired, setOtpTwoFactorRequired] = useState(false);
  const [otpTwoFactorCode, setOtpTwoFactorCode] = useState('');
  const [otpRecoveryCode, setOtpRecoveryCode] = useState('');
  const [otpUseRecovery, setOtpUseRecovery] = useState(false);
  const [isOtpTwoFactorVerifying, setIsOtpTwoFactorVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const reducedMotionEnabled = useReducedMotion();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const login = useStore(state => state.login);
  const setTwoFactorEnabled = useStore(state => state.setTwoFactorEnabled);

  const hasGoogleOAuth = Boolean(
    process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ||
    process.env.EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID ||
    process.env.EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID ||
    process.env.EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID
  );

  const [googleRequest, googleResponse, promptGoogleAuth] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || 'dev-client-id-placeholder',
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID || 'dev-android-client-id-placeholder',
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID });

  // Handle Google OAuth response for login
  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type !== 'success') {
      setSocialLoading(null);
      return;
    }
    const idToken = googleResponse.authentication?.idToken
      ?? (typeof googleResponse.params?.id_token === 'string' ? googleResponse.params.id_token : null);
    if (!idToken) {
      setSocialLoading(null);
      setErrorMsg('Google sign-in failed: Unable to get identity token.');
      return;
    }
    void (async () => {
      try {
        const result = await loginWithGoogleIdToken(idToken);
        login(result.storeUser);
        track('user_logged_in', { method: 'google' });
        setTwoFactorEnabled(result.user.twoFactorEnabled);
        navigation.replace('MainTabs');
        markInteractive({ surface: 'login_complete_google' });
      } catch (error) {
        setErrorMsg(`Google sign-in failed: ${(error as Error).message}`);
      } finally {
        setSocialLoading(null);
      }
    })();
  }, [googleResponse, login, navigation, setTwoFactorEnabled]);

  const handleGoogleSignIn = async () => {
    if (socialLoading || isSubmitting) return;
    if (!googleRequest) {
      setErrorMsg('Google sign-in unavailable. Configure Google OAuth client IDs.');
      return;
    }
    setSocialLoading('google');
    setErrorMsg('');
    try {
      const response = await promptGoogleAuth();
      if (response.type !== 'success') setSocialLoading(null);
    } catch (error) {
      setSocialLoading(null);
      setErrorMsg(`Google sign-in failed: ${(error as Error).message}`);
    }
  };

  const handleAppleSignIn = async () => {
    if (socialLoading || isSubmitting) return;
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      setErrorMsg('Apple sign-in is only available on supported iOS devices.');
      return;
    }
    setSocialLoading('apple');
    setErrorMsg('');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ] });
      if (!credential.identityToken) throw new Error('Missing Apple identity token');
      const result = await loginWithAppleIdentityToken(credential.identityToken);
      login(result.storeUser);
      track('user_logged_in', { method: 'apple' });
      setTwoFactorEnabled(result.user.twoFactorEnabled);
      navigation.replace('MainTabs');
      markInteractive({ surface: 'login_complete_apple' });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== 'ERR_REQUEST_CANCELED') {
        setErrorMsg(`Apple sign-in failed: ${(error as Error).message}`);
      }
    } finally {
      setSocialLoading(null);
    }
  };

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;
  const canRequestMagicLink = email.trim().length > 0 && !isSubmitting && !isMagicSending;
  const canRequestOtp = email.trim().length > 0 && !isSubmitting && !isOtpSending;
  const canVerifyOtp = !!otpChallengeId && otpCode.trim().length >= 4 && !isOtpVerifying && !isSubmitting && !otpTwoFactorRequired;

  const errorPulse = useSharedValue(1);

  const triggerErrorFeedback = () => {
    if (reducedMotionEnabled) {
      // WCAG 2.2 §2.3.3 — no motion animation when Reduce Motion is on
      errorPulse.value = 1;
      return;
    }
    errorPulse.value = withSequence(
      withTiming(0.95, { duration: Motion.duration.fast }),
      withTiming(1, { duration: Motion.duration.normal })
    );
  };

  const errorPulseStyle = useAnimatedStyle(() => ({
    opacity: errorPulse.value
  }));

  const statusEnterAnimation = reducedMotionEnabled
    ? undefined
    : FadeInUp.springify().damping(20);
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
        recoveryCode: recoveryCode.trim() || undefined });

      login(result.storeUser);
      track('user_logged_in', { method: 'email' });
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
        code: normalizedCode });

      login(result.storeUser);
      track('user_logged_in', { method: 'email' });
      setTwoFactorEnabled(result.user.twoFactorEnabled);
      navigation.replace('MainTabs');
      // EAS Observe: OTP login has completed and the user is being routed
      // into the main app. Only the first markInteractive() app-wide records
      // the TTI metric.
      markInteractive({ surface: 'login_complete_otp' });
    } catch (error) {
      // The backend does NOT consume the OTP challenge when
      // TWO_FACTOR_REQUIRED is returned (the transaction rolls back), so
      // the same challengeId + OTP code can be retried with a 2FA code.
      // Show an inline 2FA challenge instead of redirecting to password
      // login. The challengeId and otpCode are retained for retry.
      const otpError = error as OtpVerificationError;
      if (otpError.code === 'TWO_FACTOR_REQUIRED') {
        setOtpTwoFactorRequired(true);
        setOtpTwoFactorCode('');
        setOtpRecoveryCode('');
        setOtpUseRecovery(false);
        setInfoMsg('Two-factor authentication is required. Enter the code from your authenticator app to continue.');
        setErrorMsg('');
      } else {
        const maybeAttempts = (error as { attemptsRemaining?: number }).attemptsRemaining;
        const baseMessage = (error as Error).message || 'Unable to verify OTP right now.';
        if (typeof maybeAttempts === 'number') {
          setErrorMsg(`${baseMessage} Attempts left: ${maybeAttempts}.`);
        } else {
          setErrorMsg(baseMessage);
        }
        triggerErrorFeedback();
      }
    } finally {
      setIsOtpVerifying(false);
    }
  };

  const handleVerifyOtpTwoFactor = async () => {
    if (!otpChallengeId || isOtpTwoFactorVerifying || isSubmitting) {
      return;
    }

    const twoFactorCode = otpTwoFactorCode.trim();
    const recoveryCode = otpRecoveryCode.trim();

    if (otpUseRecovery) {
      if (!recoveryCode) {
        setErrorMsg('Enter your recovery code.');
        setInfoMsg('');
        triggerErrorFeedback();
        return;
      }
    } else {
      if (twoFactorCode.length < 6) {
        setErrorMsg('Enter the 6-digit code from your authenticator app.');
        setInfoMsg('');
        triggerErrorFeedback();
        return;
      }
    }

    setErrorMsg('');
    setInfoMsg('');
    setIsOtpTwoFactorVerifying(true);

    try {
      const result = await verifyEmailOtp({
        challengeId: otpChallengeId,
        code: otpCode.trim(),
        twoFactorCode: otpUseRecovery ? undefined : twoFactorCode,
        recoveryCode: otpUseRecovery ? recoveryCode : undefined });

      login(result.storeUser);
      track('user_logged_in', { method: 'email' });
      setTwoFactorEnabled(result.user.twoFactorEnabled);
      navigation.replace('MainTabs');
      markInteractive({ surface: 'login_complete_otp' });
    } catch (error) {
      // The challenge is not consumed on TWO_FACTOR_REQUIRED — keep it so
      // the user can retry with a corrected code.
      setErrorMsg((error as Error).message || 'Unable to verify two-factor code.');
      triggerErrorFeedback();
    } finally {
      setIsOtpTwoFactorVerifying(false);
    }
  };

  const cancelOtpTwoFactor = () => {
    setOtpTwoFactorRequired(false);
    setOtpTwoFactorCode('');
    setOtpRecoveryCode('');
    setOtpUseRecovery(false);
    setInfoMsg('Enter the OTP code from your email.');
    setErrorMsg('');
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
            <Text style={styles.title} maxFontSizeMultiplier={1.3} accessibilityRole="header">Sign in</Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.4}>Enter your details to continue.</Text>

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
                  setOtpTwoFactorRequired(false);
                  setOtpTwoFactorCode('');
                  setOtpRecoveryCode('');
                  setOtpUseRecovery(false);
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
                    <View style={[styles.twoFactorIcon, { backgroundColor: colors.commerceTrustSubtle }]}>
                      <Ionicons name="checkmark-circle-outline" size={16} color={colors.commerceTrust} />
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

              {/* Primary action — visually dominant, placed immediately after
                  the password field so the recommended path is obvious.
                  Per the research, the flat column of three equally-weighted
                  buttons was ambiguous; the primary "Log In" must dominate. */}
              <Reanimated.View style={errorPulseStyle} layout={layoutAnimation}>
                <AppButton
                  title={isSubmitting ? 'Signing in...' : 'Log In'}
                  style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
                  titleStyle={styles.primaryText}
                  variant="primary"
                  size="lg"
                  onPress={handleLogin}
                  disabled={!canSubmit}
                  loading={isSubmitting}
                  accessibilityLabel="Log in"
                  hapticFeedback="medium"
                />
              </Reanimated.View>

              {/* Social login — per 2026 research, social sign-in below the
                  primary email/password path gives users a low-friction
                  alternative. Full-width labeled buttons, not icon circles. */}
              <View style={styles.socialDivider}>
                <View style={styles.socialDividerLine} />
                <Text style={styles.socialDividerText} maxFontSizeMultiplier={1.3}>or continue with</Text>
                <View style={styles.socialDividerLine} />
              </View>

              <View style={styles.socialGroup}>
                <AnimatedPressable
                  style={[styles.socialFullBtn, (!!socialLoading || isSubmitting) && styles.socialBtnDisabled]}
                  activeOpacity={0.85}
                  onPress={handleAppleSignIn}
                  disabled={!!socialLoading || isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Apple"
                  accessibilityHint="Sign in using your Apple ID"
                >
                  {socialLoading === 'apple' ? (
                    <ActivityIndicator color={colors.textPrimary} size="small" />
                  ) : (
                    <>
                      <Ionicons name="logo-apple" size={20} color={colors.textPrimary} />
                      <Text style={styles.socialFullText} maxFontSizeMultiplier={1.2}>Continue with Apple</Text>
                    </>
                  )}
                </AnimatedPressable>

                {hasGoogleOAuth ? (
                  <AnimatedPressable
                    style={[styles.socialFullBtn, (!!socialLoading || isSubmitting) && styles.socialBtnDisabled]}
                    activeOpacity={0.85}
                    onPress={handleGoogleSignIn}
                    disabled={!!socialLoading || isSubmitting}
                    accessibilityRole="button"
                    accessibilityLabel="Continue with Google"
                    accessibilityHint="Sign in using your Google account"
                  >
                    {socialLoading === 'google' ? (
                      <ActivityIndicator color={colors.textPrimary} size="small" />
                    ) : (
                      <>
                        <Ionicons name="logo-google" size={18} color={colors.textPrimary} />
                        <Text style={styles.socialFullText} maxFontSizeMultiplier={1.2}>Continue with Google</Text>
                      </>
                    )}
                  </AnimatedPressable>
                ) : null}
              </View>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText} maxFontSizeMultiplier={1.3}>more options</Text>
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

                  {otpTwoFactorRequired ? (
                    <View style={styles.otpTwoFactorGroup}>
                      <View style={styles.twoFactorHeader}>
                        <View style={[styles.twoFactorIcon, { backgroundColor: colors.commerceTrustSubtle }]}>
                          <Ionicons name="checkmark-circle-outline" size={16} color={colors.commerceTrust} />
                        </View>
                        <Text style={styles.twoFactorTitle} maxFontSizeMultiplier={1.3}>Two-factor authentication</Text>
                      </View>
                      <Text style={styles.otpTwoFactorBody} maxFontSizeMultiplier={1.3}>
                        Enter the code from your authenticator app to continue signing in.
                      </Text>

                      {otpUseRecovery ? (
                        <AppInput
                          label="Recovery code"
                          placeholder="XXXX-XXXX-XXXX-XXXX"
                          autoCapitalize="characters"
                          autoCorrect={false}
                          value={otpRecoveryCode}
                          onChangeText={(value) => {
                            setOtpRecoveryCode(value.toUpperCase());
                            if (errorMsg) {
                              setErrorMsg('');
                            }
                          }}
                        />
                      ) : (
                        <AppInput
                          label="Authenticator code"
                          placeholder="000000"
                          keyboardType="number-pad"
                          autoCapitalize="none"
                          autoCorrect={false}
                          maxLength={6}
                          autoFocus
                          value={otpTwoFactorCode}
                          onChangeText={(value) => {
                            setOtpTwoFactorCode(value.replace(/\D/g, '').slice(0, 6));
                            if (errorMsg) {
                              setErrorMsg('');
                            }
                          }}
                        />
                      )}

                      <Pressable
                        onPress={() => {
                          setOtpUseRecovery((prev) => !prev);
                          if (errorMsg) {
                            setErrorMsg('');
                          }
                        }}
                        hitSlop={Control.hit / 2}
                        accessibilityRole="button"
                        accessibilityLabel={otpUseRecovery ? 'Use authenticator code instead' : 'Use recovery code instead'}
                        style={styles.otpTwoFactorToggle}
                      >
                        <Text style={styles.otpTwoFactorToggleText} maxFontSizeMultiplier={1.3}>
                          {otpUseRecovery ? 'Use authenticator code' : 'Use recovery code'}
                        </Text>
                      </Pressable>

                      <AppButton
                        title={isOtpTwoFactorVerifying ? 'Verifying...' : 'Verify'}
                        style={styles.otpVerifyBtn}
                        titleStyle={styles.otpVerifyText}
                        variant="primary"
                        size="md"
                        onPress={handleVerifyOtpTwoFactor}
                        disabled={isOtpTwoFactorVerifying}
                        loading={isOtpTwoFactorVerifying}
                        accessibilityLabel="Verify two-factor code"
                        hapticFeedback="medium"
                      />

                      <Pressable
                        onPress={cancelOtpTwoFactor}
                        hitSlop={Control.hit / 2}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel two-factor"
                        accessibilityHint="Returns to the OTP input"
                        style={styles.otpTwoFactorCancel}
                      >
                        <Text style={styles.otpTwoFactorCancelText} maxFontSizeMultiplier={1.3}>
                          Cancel
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
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
    paddingBottom: Space.lg },
  title: { fontSize: TypographyV2.display.size, fontFamily: TypographyV2.display.fontFamily, color: colors.textPrimary, lineHeight: TypographyV2.display.lineHeight, letterSpacing: TypographyV2.display.letterSpacing },
  subtitle: { marginTop: Space.sm, fontSize: TypographyV2.body.size, lineHeight: TypographyV2.body.lineHeight, color: colors.textSecondary, fontFamily: TypographyV2.body.fontFamily, marginBottom: Space.md },

  form: { marginBottom: Space.lg },
  inputGroup: { marginBottom: Space.md },

  forgotBtn: { alignSelf: 'flex-start', marginTop: Space.sm },
  forgotText: { color: colors.textSecondary, fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily, textDecorationLine: 'underline' },
  primaryBtn: { backgroundColor: colors.brand, minHeight: Space.xxl + Space.sm, borderRadius: Radius.xxl + 4, borderWidth: 0, marginTop: Space.md + 2 },
  socialDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    marginTop: Space.md + 2,
    marginBottom: Space.sm },
  socialDividerLine: {
    flex: 1,
    height: Stroke.hairline,
    backgroundColor: colors.border },
  socialDividerText: {
    color: colors.textMuted,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps },
  socialGroup: {
    gap: Space.sm + 2,
    marginBottom: Space.sm },
  socialFullBtn: {
    flexDirection: 'row',
    height: Space.xxl + Space.xl + 4,
    borderRadius: Radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm + 2,
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border },
  socialFullText: {
    color: colors.textPrimary,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: 0.1 },
  socialBtnDisabled: { opacity: 0.7 },
  dividerRow: {
    marginTop: Space.md + 2,
    marginBottom: Space.smMd,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2 },
  dividerLine: {
    flex: 1,
    height: Stroke.standard,
    backgroundColor: colors.border },
  dividerText: {
    color: colors.textMuted,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps },
  otpRequestBtn: {
    minHeight: Control.hit + 2,
    borderRadius: Radius.xxl,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.surface },
  otpRequestText: {
    color: colors.textPrimary,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  otpGroup: {
    marginTop: Space.sm + 6,
    gap: Space.sm + 2 },
  twoFactorGroup: {
    marginBottom: Space.md,
    gap: Space.sm },
  twoFactorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginBottom: Space.xs },
  twoFactorIcon: {
    width: Control.chrome,
    height: Control.chrome,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center' },
  twoFactorTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  twoFactorHint: {
    color: colors.textMuted,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginBottom: Space.xs / 2 },
  magicLinkBtn: {
    minHeight: Control.hit - 2,
    borderRadius: Radius.xxl,
    borderWidth: 0,
    backgroundColor: 'transparent',
    marginTop: Space.sm + 2 },
  magicLinkText: {
    color: colors.textSecondary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textDecorationLine: 'underline' },
  otpVerifyBtn: {
    minHeight: Space.xxl,
    borderRadius: Radius.xxl,
    borderWidth: 0,
    backgroundColor: colors.brand },
  otpVerifyText: {
    color: colors.textInverse,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  otpTwoFactorGroup: {
    marginTop: Space.sm,
    gap: Space.sm },
  otpTwoFactorBody: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    lineHeight: TypographyV2.meta.size + 4 },
  otpTwoFactorToggle: {
    alignSelf: 'flex-start',
    paddingVertical: Space.xs,
    minHeight: Control.hit,
    justifyContent: 'center' },
  otpTwoFactorToggleText: {
    color: colors.textSecondary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textDecorationLine: 'underline' },
  otpTwoFactorCancel: {
    alignSelf: 'center',
    paddingVertical: Space.xs,
    paddingHorizontal: Space.md,
    minHeight: Control.hit,
    justifyContent: 'center' },
  otpTwoFactorCancelText: {
    color: colors.textSecondary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },

  footer: { paddingTop: Space.sm, position: 'relative' },
  infoText: { color: colors.success, fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, textAlign: 'center', marginBottom: Space.md - 4 },
  errorText: { color: colors.danger, fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, textAlign: 'center', marginBottom: Space.md - 4 },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryText: { color: colors.textInverse, fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily },
  switchRow: {
    marginTop: Space.sm + 6,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.xs + 2 },
  switchText: {
    color: colors.textSecondary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  switchLink: {
    color: colors.textPrimary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textDecorationLine: 'underline' } });
}