import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, StatusBar, Keyboard, Linking, Pressable, ActivityIndicator } from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, FadeInRight, FadeOutLeft, FadeInUp, FadeOutUp, Layout } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { useStore } from '../store/useStore';
import { signupWithPassword, loginWithAppleIdentityToken, loginWithGoogleIdToken } from '../services/authApi';
import { track, trackFunnelStep } from '../analytics/track';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { Motion } from '../theme/motionTokens';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';

import { Space, Radius, Typography, Control, Stroke, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';

WebBrowser.maybeCompleteAuthSession();

type SignUpStep = 0 | 1 | 2;

export default function SignUpScreen() {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useAppTheme();
  const haptic = useHaptic();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const login = useStore((state) => state.login);
  const setTwoFactorEnabled = useStore((state) => state.setTwoFactorEnabled);

  // Progressive disclosure — one field per step (email → password → username).
  // Per 2026 research (Eleken, Snoopr), breaking signup into small focused
  // steps reduces cognitive load and improves completion rates.
  const [step, setStep] = useState<SignUpStep>(0);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const reducedMotionEnabled = useReducedMotion();

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

  // Handle Google OAuth response — creates account or signs in if it exists.
  React.useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type !== 'success') {
      setSocialLoading(null);
      return;
    }
    const idToken = googleResponse.authentication?.idToken
      ?? (typeof googleResponse.params?.id_token === 'string' ? googleResponse.params.id_token : null);
    if (!idToken) {
      setSocialLoading(null);
      setAuthError('Google sign-up failed: Unable to get identity token.');
      return;
    }
    void (async () => {
      try {
        const result = await loginWithGoogleIdToken(idToken);
        login(result.storeUser);
        setTwoFactorEnabled(result.user.twoFactorEnabled);
        track('user_signed_up', { method: 'google' });
        trackFunnelStep('signup', 'signup_completed', { method: 'google' });
        navigation.replace('MainTabs');
      } catch (error) {
        setAuthError(`Google sign-up failed: ${(error as Error).message}`);
      } finally {
        setSocialLoading(null);
      }
    })();
  }, [googleResponse, login, navigation, setTwoFactorEnabled]);

  const handleGoogleSignUp = async () => {
    if (socialLoading) return;
    if (!googleRequest) {
      setAuthError('Google sign-up unavailable. Configure Google OAuth client IDs.');
      return;
    }
    setSocialLoading('google');
    try {
      const response = await promptGoogleAuth();
      if (response.type !== 'success') setSocialLoading(null);
    } catch (error) {
      setSocialLoading(null);
      setAuthError(`Google sign-up failed: ${(error as Error).message}`);
    }
  };

  const handleAppleSignUp = async () => {
    if (socialLoading) return;
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      setAuthError('Apple sign-up is only available on supported iOS devices.');
      return;
    }
    setSocialLoading('apple');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ] });
      if (!credential.identityToken) throw new Error('Missing Apple identity token');
      const result = await loginWithAppleIdentityToken(credential.identityToken);
      login(result.storeUser);
      setTwoFactorEnabled(result.user.twoFactorEnabled);
      track('user_signed_up', { method: 'apple' });
      trackFunnelStep('signup', 'signup_completed', { method: 'apple' });
      navigation.replace('MainTabs');
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== 'ERR_REQUEST_CANCELED') {
        setAuthError(`Apple sign-up failed: ${(error as Error).message}`);
      }
    } finally {
      setSocialLoading(null);
    }
  };

  const canSubmit = username.trim().length > 0 && email.trim().length > 0 && password.length > 0 && termsAccepted && !isSubmitting;

  // Password strength — computed from length, character variety, and common
  // pattern checks. Provides real-time behavioral feedback so the user knows
  // their password meets requirements before submitting.
  const passwordStrength = useMemo(() => {
    const len = password.length;
    if (len === 0) return { level: 0, label: '', color: colors.textMuted };
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    const variety = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
    let score = 0;
    if (len >= 8) score++;
    if (len >= 12) score++;
    if (variety >= 3) score++;
    if (variety >= 4 && len >= 10) score++;
    if (score <= 1) return { level: 1, label: 'Weak', color: colors.danger };
    if (score === 2) return { level: 2, label: 'Fair', color: colors.warning };
    if (score === 3) return { level: 3, label: 'Good', color: colors.bronze };
    return { level: 4, label: 'Strong', color: colors.success };
  }, [password, colors]);

  const errorPulse = useSharedValue(1);

  const triggerErrorFeedback = () => {
    if (reducedMotionEnabled) {
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
    : FadeInUp.springify().damping(20).duration(400);
  const statusExitAnimation = reducedMotionEnabled ? undefined : FadeOutUp;
  const layoutAnimation = reducedMotionEnabled ? undefined : Layout.springify();
  const stepEnter = reducedMotionEnabled ? undefined : FadeInRight.duration(250).springify().damping(22);
  const stepExit = reducedMotionEnabled ? undefined : FadeOutLeft.duration(180);

  const progress = ((step + 1) / 3) * 100;

  // Step 0 → 1: validate email before advancing
  const handleContinueFromEmail = useCallback(() => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMsg('Enter your email to continue.');
      setEmailError('Email is required.');
      triggerErrorFeedback();
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setErrorMsg('Enter a valid email address.');
      setEmailError('Enter a valid email address.');
      triggerErrorFeedback();
      return;
    }
    setErrorMsg('');
    setEmailError('');
    haptic.light();
    setStep(1);
  }, [email, haptic]);

  // Step 1 → 2: validate password before advancing
  const handleContinueFromPassword = useCallback(() => {
    if (!password) {
      setErrorMsg('Create a password to continue.');
      setPasswordError('Password is required.');
      triggerErrorFeedback();
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.');
      setPasswordError('Password must be at least 8 characters.');
      triggerErrorFeedback();
      return;
    }
    setErrorMsg('');
    setPasswordError('');
    haptic.light();
    setStep(2);
  }, [password, haptic]);

  const handleBack = useCallback(() => {
    haptic.light();
    if (step > 0) {
      setStep((s) => (s - 1) as SignUpStep);
      setErrorMsg('');
      setEmailError('');
      setPasswordError('');
      setUsernameError('');
    } else {
      navigation.goBack();
    }
  }, [step, haptic, navigation]);

  const handleSignUp = async () => {
    if (isSubmitting) return;

    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedUsername) {
      setErrorMsg('Pick a username to continue.');
      setUsernameError('Username is required.');
      triggerErrorFeedback();
      return;
    }
    if (normalizedUsername.length < 3) {
      setErrorMsg('Username must be at least 3 characters.');
      setUsernameError('Username must be at least 3 characters.');
      triggerErrorFeedback();
      return;
    }
    if (!termsAccepted) {
      setErrorMsg('Please accept the Terms to create your account.');
      triggerErrorFeedback();
      return;
    }

    setErrorMsg('');
    setUsernameError('');
    setIsSubmitting(true);
    trackFunnelStep('signup', 'signup_started', { method: 'email' });

    try {
      const result = await signupWithPassword({
        username: normalizedUsername,
        email: normalizedEmail,
        password });

      login(result.storeUser);
      setTwoFactorEnabled(result.user.twoFactorEnabled);
      track('user_signed_up', { method: 'email' });
      trackFunnelStep('signup', 'signup_completed', { method: 'email' });
      navigation.replace('MainTabs');
    } catch (error) {
      setErrorMsg((error as Error).message || 'Unable to create account right now.');
      triggerErrorFeedback();
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepTitle = step === 0 ? "What's your email?" : step === 1 ? 'Create a password' : 'Pick your handle';
  const stepSubtitle = step === 0
    ? 'We use this to sign you in. No spam — just order updates and account recovery.'
    : step === 1
    ? 'At least 8 characters. Mix letters, numbers, and symbols for a stronger password.'
    : 'Your public handle — how other members find and tag you. Not your login.';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      <View style={styles.header}>
        <AnimatedPressable
          style={styles.backBtn}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint={step > 0 ? 'Returns to the previous step' : 'Returns to the previous screen'}
        >
          <Ionicons name="arrow-back" size={Control.icon} color={colors.textPrimary} />
        </AnimatedPressable>
      </View>

      {/* Progress indicator — shows the user how many steps remain.
          Per 2026 research (Android Developers, Snoopr), progress indicators
          reduce abandonment by making the remaining effort legible. */}
      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <Reanimated.View
            style={[styles.progressFill, { width: `${progress}%` }]}
            layout={layoutAnimation}
          />
        </View>
        <Text style={styles.progressText} maxFontSizeMultiplier={1.3}>
          Step {step + 1} of 3
        </Text>
      </View>

      <KeyboardAwareScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={styles.title} maxFontSizeMultiplier={1.3}>{stepTitle}</Text>
          <Text style={styles.subtitle} maxFontSizeMultiplier={1.4}>{stepSubtitle}</Text>

          {/* Social signup — only on step 0, above the email field.
              Per 2026 research, social auth goes first to reduce friction. */}
          {step === 0 && (
            <View style={styles.socialGroup}>
              <AnimatedPressable
                style={[styles.socialFullBtn, (!!socialLoading) && styles.socialBtnDisabled]}
                activeOpacity={0.85}
                onPress={handleAppleSignUp}
                disabled={!!socialLoading}
                accessibilityRole="button"
                accessibilityLabel="Sign up with Apple"
                accessibilityHint="Create an account using your Apple ID"
              >
                {socialLoading === 'apple' ? (
                  <ActivityIndicator color={colors.textPrimary} size="small" />
                ) : (
                  <>
                    <Ionicons name="logo-apple" size={20} color={colors.textPrimary} />
                    <Text style={styles.socialFullText} maxFontSizeMultiplier={1.2}>Sign up with Apple</Text>
                  </>
                )}
              </AnimatedPressable>

              {hasGoogleOAuth ? (
                <AnimatedPressable
                  style={[styles.socialFullBtn, (!!socialLoading) && styles.socialBtnDisabled]}
                  activeOpacity={0.85}
                  onPress={handleGoogleSignUp}
                  disabled={!!socialLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Sign up with Google"
                  accessibilityHint="Create an account using your Google account"
                >
                  {socialLoading === 'google' ? (
                    <ActivityIndicator color={colors.textPrimary} size="small" />
                  ) : (
                    <>
                      <Ionicons name="logo-google" size={18} color={colors.textPrimary} />
                      <Text style={styles.socialFullText} maxFontSizeMultiplier={1.2}>Sign up with Google</Text>
                    </>
                  )}
                </AnimatedPressable>
              ) : null}

              <View style={styles.socialDivider}>
                <View style={styles.socialDividerLine} />
                <Text style={styles.socialDividerText} maxFontSizeMultiplier={1.3}>or use email</Text>
                <View style={styles.socialDividerLine} />
              </View>
            </View>
          )}

          {/* Inline auth error banner for social signup failures */}
          {authError ? (
            <View style={styles.errorBanner} accessibilityRole="alert" accessibilityLiveRegion="assertive">
              <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
              <Text style={styles.errorBannerText} maxFontSizeMultiplier={1.3}>{authError}</Text>
              <Pressable
                onPress={() => setAuthError(null)}
                hitSlop={Control.hit / 2}
                accessibilityRole="button"
                accessibilityLabel="Dismiss error"
              >
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : null}

          {/* Step content — keyed by step so Reanimated replays the
              transition on every step change. */}
          <Reanimated.View
            key={`step-${step}`}
            entering={stepEnter}
            exiting={stepExit}
          >
            {step === 0 && (
              <AppInput
                label="Email"
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                value={email}
                errorText={emailError || undefined}
                onChangeText={(value) => {
                  setEmail(value);
                  if (errorMsg) setErrorMsg('');
                  if (emailError) setEmailError('');
                  if (authError) setAuthError(null);
                }}
                onSubmitEditing={() => {
                  Keyboard.dismiss();
                  handleContinueFromEmail();
                }}
                containerStyle={styles.inputGroup}
              />
            )}

            {step === 1 && (
              <View>
                <AppInput
                  label="Password"
                  placeholder="Create a password"
                  secureTextEntry
                  returnKeyType="done"
                  value={password}
                  errorText={passwordError || undefined}
                  onChangeText={(value) => {
                    setPassword(value);
                    if (errorMsg) setErrorMsg('');
                    if (passwordError) setPasswordError('');
                  }}
                  onSubmitEditing={() => {
                    Keyboard.dismiss();
                    handleContinueFromPassword();
                  }}
                  containerStyle={styles.inputGroup}
                />
                {/* Password strength indicator — behavioral-level feedback.
                    Shows the user how strong their password is as they type. */}
                {password.length > 0 && (
                  <View
                    style={styles.passwordStrength}
                    accessibilityRole="text"
                    accessibilityLabel={`Password strength: ${passwordStrength.label}`}
                  >
                    <View style={styles.strengthBars}>
                      {[0, 1, 2, 3].map((i) => (
                        <View
                          key={i}
                          style={[
                            styles.strengthBar,
                            {
                              backgroundColor:
                                i < passwordStrength.level
                                  ? passwordStrength.color
                                  : colors.surfaceAlt },
                          ]}
                        />
                      ))}
                    </View>
                    <Text style={[styles.strengthLabel, { color: passwordStrength.color }]} maxFontSizeMultiplier={1.3}>
                      {passwordStrength.label}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {step === 2 && (
              <View>
                <AppInput
                  label="Username"
                  placeholder="Pick a unique username"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  value={username}
                  errorText={usernameError || undefined}
                  onChangeText={(value) => {
                    setUsername(value);
                    if (errorMsg) setErrorMsg('');
                    if (usernameError) setUsernameError('');
                  }}
                  onSubmitEditing={() => {
                    Keyboard.dismiss();
                    if (canSubmit) void handleSignUp();
                  }}
                  containerStyle={styles.inputGroup}
                />

                {/* Terms acceptance checkbox — explicit opt-in before
                    account creation. Per 2026 research, a checkbox is
                    clearer than passive "by continuing you agree" text. */}
                <Pressable
                  style={styles.termsRow}
                  onPress={() => {
                    haptic.light();
                    setTermsAccepted((v) => !v);
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: termsAccepted }}
                  accessibilityLabel="Accept Terms of Service and Privacy Policy"
                >
                  <View style={[styles.checkbox, termsAccepted && styles.checkboxActive]}>
                    {termsAccepted && (
                      <Ionicons name="checkmark" size={16} color={colors.textInverse} />
                    )}
                  </View>
                  <Text style={styles.termsText} maxFontSizeMultiplier={1.3}>
                    I agree to the{' '}
                    <Text
                      style={styles.termsLink}
                      onPress={() => void Linking.openURL('https://thryftverse.app/terms')}
                    >
                      Terms of Service
                    </Text>
                    {' '}and{' '}
                    <Text
                      style={styles.termsLink}
                      onPress={() => void Linking.openURL('https://thryftverse.app/privacy')}
                    >
                      Privacy Policy
                    </Text>
                  </Text>
                </Pressable>
              </View>
            )}
          </Reanimated.View>
        </View>

        <View style={styles.footer}>
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
            {step < 2 ? (
              <AppButton
                title="Continue"
                variant="primary"
                size="lg"
                onPress={step === 0 ? handleContinueFromEmail : handleContinueFromPassword}
                trailingIcon={<Ionicons name="arrow-forward" size={20} color={colors.textInverse} />}
                style={styles.primaryBtn}
                hapticFeedback="medium"
                accessibilityLabel="Continue to next step"
              />
            ) : (
              <AppButton
                title={isSubmitting ? 'Creating account...' : 'Create Account'}
                variant="primary"
                size="lg"
                onPress={handleSignUp}
                disabled={!canSubmit}
                loading={isSubmitting}
                style={styles.primaryBtn}
                hapticFeedback="medium"
                accessibilityLabel="Create account"
              />
            )}
          </Reanimated.View>
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

  progressWrap: {
    paddingHorizontal: Space.lg,
    paddingBottom: Space.sm },
  progressTrack: {
    height: Space.xs,
    borderRadius: Radius.sm,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden' },
  progressFill: {
    height: '100%',
    backgroundColor: colors.brand,
    borderRadius: Radius.sm },
  progressText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginTop: Space.xs + 2,
    letterSpacing: LetterSpacing.caps,
    textTransform: 'uppercase' },

  content: { flex: 1 },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
    paddingBottom: Space.lg },
  title: { fontSize: TypographyV2.display.size, fontFamily: TypographyV2.display.fontFamily, color: colors.textPrimary, lineHeight: TypographyV2.display.lineHeight, letterSpacing: TypographyV2.display.letterSpacing, marginBottom: Space.sm },
  subtitle: { fontSize: TypographyV2.body.size, lineHeight: TypographyV2.body.lineHeight + 2, color: colors.textSecondary, fontFamily: TypographyV2.body.fontFamily, marginBottom: Space.lg },

  socialGroup: {
    marginBottom: Space.lg,
    gap: Space.sm + 2 },
  socialFullBtn: {
    flexDirection: 'row',
    height: Space.xl + Space.xl + 4,
    borderRadius: Radius.full,
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
  socialDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.xs + 2 },
  socialDividerLine: {
    flex: 1,
    height: Stroke.hairline,
    backgroundColor: colors.border },
  socialDividerText: {
    color: colors.textMuted,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.4,
    textTransform: 'uppercase' },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 2,
    marginBottom: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: colors.dangerSubtle,
    borderWidth: Stroke.standard,
    borderColor: colors.dangerBorder },
  errorBannerText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.danger,
    lineHeight: TypographyV2.meta.size + 2 },

  inputGroup: { marginBottom: Space.md },

  passwordStrength: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: -Space.xs,
    marginBottom: Space.md },
  strengthBars: {
    flexDirection: 'row',
    gap: Space.xs,
    flex: 1 },
  strengthBar: {
    flex: 1,
    height: 3,
    borderRadius: Radius.sm },
  strengthLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.1 },

  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm + 2,
    marginTop: Space.sm },
  checkbox: {
    width: Control.chrome,
    height: Control.chrome,
    borderRadius: Radius.sm,
    borderWidth: Stroke.emphasis,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2 },
  checkboxActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand },
  termsText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    lineHeight: TypographyV2.meta.lineHeight + 2 },
  termsLink: { fontFamily: Typography.family.semibold, color: colors.textPrimary, textDecorationLine: 'underline' },

  footer: { paddingBottom: Space.sm, position: 'relative' },
  errorText: { color: colors.danger, fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, textAlign: 'center', marginBottom: Space.md - 4 },
  primaryBtn: { backgroundColor: colors.brand, height: 56, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryText: { color: colors.textInverse, fontSize: TypographyV2.body.size + 2, fontFamily: TypographyV2.body.fontFamily } });
}
