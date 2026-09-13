import React, { useMemo, useCallback } from 'react';
import { View, Text, StatusBar, Keyboard } from 'react-native';
import Reanimated from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useAppTheme } from '../theme/ThemeContext';
import { useStore } from '../store/useStore';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { markInteractive } from '../platform/monitoring';
import { track } from '../analytics';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { Control } from '../theme/designTokens';
import {
  LoginTwoFactorFields,
  LoginSocialSection,
  LoginOtpSection,
  LoginStatusFooter,
  createLoginScreenStyles } from '../components/login';
import {
  useLoginFormState,
  useLoginStatusFeedback,
  useLoginDerivedState,
  useSocialSignIn,
  useLoginSubmission } from '../hooks/login';
import type { LoginAuthMethod, LoginAuthResult } from '../components/login/loginViewModels';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useAppTheme();
  const canGoBack = navigation.canGoBack();
  const styles = useMemo(() => createLoginScreenStyles(colors), [colors]);
  const login = useStore(state => state.login);
  const setTwoFactorEnabled = useStore(state => state.setTwoFactorEnabled);

  const form = useLoginFormState();
  const { triggerErrorFeedback, errorPulseStyle, layoutAnimation } = useLoginStatusFeedback();
  const { canSubmit, canRequestMagicLink, canRequestOtp, canVerifyOtp } = useLoginDerivedState(form);

  // Single auth-success routine — identical ordering for every method:
  // store login → analytics → 2FA flag → replace to MainTabs → TTI mark.
  // EAS Observe: only the first markInteractive() app-wide records the TTI
  // metric, so the per-method surfaces are safe alongside each other.
  const onAuthSuccess = useCallback(
    (result: LoginAuthResult, method: LoginAuthMethod, surface: string) => {
      login(result.storeUser);
      track('user_logged_in', { method });
      setTwoFactorEnabled(result.user.twoFactorEnabled);
      navigation.replace('MainTabs');
      markInteractive({ surface });
    },
    [login, navigation, setTwoFactorEnabled]
  );

  const { socialLoading, hasGoogleOAuth, handleGoogleSignIn, handleAppleSignIn } = useSocialSignIn({
    isSubmitting: form.isSubmitting,
    setErrorMsg: form.setErrorMsg,
    onAuthSuccess });

  const {
    handleLogin,
    handleRequestOtp,
    handleRequestMagicLink,
    handleVerifyOtp,
    handleVerifyOtpTwoFactor } = useLoginSubmission({ form, triggerErrorFeedback, onAuthSuccess });

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
                value={form.email}
                errorText={form.emailError || undefined}
                onChangeText={form.onEmailChange}
                containerStyle={styles.inputGroup}
              />

              {form.requiresTwoFactor && (
                <LoginTwoFactorFields
                  twoFactorCode={form.twoFactorCode}
                  onTwoFactorCodeChange={form.onTwoFactorCodeChange}
                  recoveryCode={form.recoveryCode}
                  onRecoveryCodeChange={form.onRecoveryCodeChange}
                />
              )}

              <AppInput
                label="Password"
                placeholder="Enter your password"
                secureTextEntry
                returnKeyType="done"
                value={form.password}
                errorText={form.passwordError || undefined}
                onChangeText={form.onPasswordChange}
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
                  title={form.isSubmitting ? 'Signing in...' : 'Log In'}
                  style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
                  titleStyle={styles.primaryText}
                  variant="primary"
                  size="lg"
                  onPress={handleLogin}
                  disabled={!canSubmit}
                  loading={form.isSubmitting}
                  accessibilityLabel="Log in"
                  hapticFeedback="medium"
                />
              </Reanimated.View>

              <LoginSocialSection
                socialLoading={socialLoading}
                isSubmitting={form.isSubmitting}
                hasGoogleOAuth={hasGoogleOAuth}
                onAppleSignIn={handleAppleSignIn}
                onGoogleSignIn={handleGoogleSignIn}
              />

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText} maxFontSizeMultiplier={1.3}>more options</Text>
                <View style={styles.dividerLine} />
              </View>

              <AppButton
                title={form.isOtpSending ? 'Sending OTP...' : 'Send OTP to Email'}
                style={[styles.otpRequestBtn, !canRequestOtp && styles.primaryBtnDisabled]}
                titleStyle={styles.otpRequestText}
                variant="secondary"
                size="sm"
                onPress={handleRequestOtp}
                disabled={!canRequestOtp}
                accessibilityLabel="Send one-time passcode to email"
              />

              <AppButton
                title={form.isMagicSending ? 'Sending magic link...' : 'Send Magic Link Instead'}
                style={[styles.magicLinkBtn, !canRequestMagicLink && styles.primaryBtnDisabled]}
                titleStyle={styles.magicLinkText}
                variant="secondary"
                size="sm"
                onPress={handleRequestMagicLink}
                disabled={!canRequestMagicLink}
                accessibilityLabel="Send magic sign-in link"
              />

              {!!form.otpChallengeId && (
                <LoginOtpSection
                  otpCode={form.otpCode}
                  onOtpCodeChange={form.setOtpCode}
                  canVerifyOtp={canVerifyOtp}
                  isOtpVerifying={form.isOtpVerifying}
                  onVerifyOtp={handleVerifyOtp}
                  otpTwoFactorRequired={form.otpTwoFactorRequired}
                  otpUseRecovery={form.otpUseRecovery}
                  otpTwoFactorCode={form.otpTwoFactorCode}
                  onOtpTwoFactorCodeChange={form.onOtpTwoFactorCodeChange}
                  otpRecoveryCode={form.otpRecoveryCode}
                  onOtpRecoveryCodeChange={form.onOtpRecoveryCodeChange}
                  onToggleOtpUseRecovery={form.onToggleOtpUseRecovery}
                  isOtpTwoFactorVerifying={form.isOtpTwoFactorVerifying}
                  onVerifyOtpTwoFactor={handleVerifyOtpTwoFactor}
                  onCancelOtpTwoFactor={form.cancelOtpTwoFactor}
                />
              )}
            </View>
          </View>

          <LoginStatusFooter
            infoMsg={form.infoMsg}
            errorMsg={form.errorMsg}
            onSignUpPress={() => navigation.navigate('SignUp')}
          />
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
