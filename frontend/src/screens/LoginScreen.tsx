import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, StatusBar, ScrollView, Keyboard } from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, withSpring, FadeInUp, FadeOutUp, Layout } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ActiveTheme, Colors } from '../constants/colors';
import { Type, Space } from '../theme/designTokens';
import { useStore } from '../store/useStore';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  loginWithPassword,
  requestEmailOtp,
  requestMagicLink,
  verifyEmailOtp,
  type LoginWithPasswordError,
} from '../services/authApi';

export default function LoginScreen() {
  const navigation = useNavigation<any>();
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
  const reducedMotionEnabled = useReducedMotion();
  const login = useStore(state => state.login);
  const setTwoFactorEnabled = useStore(state => state.setTwoFactorEnabled);
  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;
  const canRequestMagicLink = email.trim().length > 0 && !isSubmitting && !isMagicSending;
  const canRequestOtp = email.trim().length > 0 && !isSubmitting && !isOtpSending;
  const canVerifyOtp = !!otpChallengeId && otpCode.trim().length >= 4 && !isOtpVerifying && !isSubmitting;

  const shakeOffset = useSharedValue(0);

  const shake = () => {
    shakeOffset.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withSpring(0, { damping: 20, stiffness: 400 })
    );
  };

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeOffset.value }]
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
      setErrorMsg('Please fill in both email and password.');
      setInfoMsg('');
      shake();
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setErrorMsg('Enter a valid email address.');
      setInfoMsg('');
      shake();
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      setInfoMsg('');
      shake();
      return;
    }

    setErrorMsg('');
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
      shake();
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
      shake();
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setErrorMsg('Enter a valid email address before requesting OTP.');
      setInfoMsg('');
      shake();
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
      shake();
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
      shake();
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setErrorMsg('Enter a valid email address before requesting a magic link.');
      setInfoMsg('');
      shake();
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
      shake();
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
      shake();
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
    } catch (error) {
      const maybeAttempts = (error as { attemptsRemaining?: number }).attemptsRemaining;
      const baseMessage = (error as Error).message || 'Unable to verify OTP right now.';
      if (typeof maybeAttempts === 'number') {
        setErrorMsg(`${baseMessage} Attempts left: ${maybeAttempts}.`);
      } else {
        setErrorMsg(baseMessage);
      }
      shake();
    } finally {
      setIsOtpVerifying(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
      
      <View style={styles.header}>
        {canGoBack ? (
          <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </AnimatedPressable>
        ) : (
          <View style={styles.backBtnSpacer} />
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Log in to continue buying, selling, and trading.</Text>

            <View style={styles.form}>
              <AppInput
                label="Email"
                placeholder="Enter your email"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                value={email}
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
                  if (infoMsg) {
                    setInfoMsg('');
                  }
                }}
                containerStyle={styles.inputGroup}
              />

              {requiresTwoFactor && (
                <View style={styles.twoFactorGroup}>
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

                  <Text style={styles.twoFactorHint}>If you lost access, use a recovery code below.</Text>

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
                onChangeText={setPassword}
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
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </AnimatedPressable>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
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
                    size="sm"
                    onPress={handleVerifyOtp}
                    disabled={!canVerifyOtp}
                    accessibilityLabel="Verify OTP and log in"
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
              >
                {errorMsg}
              </Reanimated.Text>
            )}

            <Reanimated.View style={shakeStyle} layout={layoutAnimation}>
              <AppButton
                title={isSubmitting ? 'Logging in...' : 'Log In'}
                style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
                titleStyle={styles.primaryText}
                variant="contrast"
                size="md"
                onPress={handleLogin}
                disabled={!canSubmit}
                accessibilityLabel="Log in"
              />
            </Reanimated.View>

            <View style={styles.switchRow}>
              <Text style={styles.switchText}>New to Thryftverse?</Text>
              <AnimatedPressable onPress={() => navigation.navigate('SignUp')} activeOpacity={0.8}>
                <Text style={styles.switchLink}>Create account</Text>
              </AnimatedPressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Space.md, paddingTop: Space.sm, paddingBottom: Space.xs },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  backBtnSpacer: { width: 44, height: 44 },

  keyboardWrap: { flex: 1 },
  content: { flex: 1 },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
    paddingBottom: Space.lg,
  },
  title: { fontSize: Type.title.size, fontFamily: 'Inter_700Bold', color: Colors.textPrimary, lineHeight: Type.title.lineHeight, letterSpacing: Type.title.letterSpacing },
  subtitle: { marginTop: Space.sm, fontSize: Type.body.size, lineHeight: Type.body.lineHeight, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginBottom: Space.lg },

  form: { marginBottom: Space.lg },
  inputGroup: { marginBottom: Space.md },

  forgotBtn: { alignSelf: 'flex-start', marginTop: Space.sm },
  forgotText: { color: Colors.textSecondary, fontSize: Type.body.size, fontFamily: 'Inter_500Medium', textDecorationLine: 'underline' },
  dividerRow: {
    marginTop: Space.md + 2,
    marginBottom: Space.sm + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    color: Colors.textMuted,
    fontSize: Type.caption.size,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  otpRequestBtn: {
    minHeight: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  otpRequestText: {
    color: Colors.textPrimary,
    fontSize: Type.body.size,
    fontFamily: 'Inter_600SemiBold',
  },
  otpGroup: {
    marginTop: Space.sm + 6,
    gap: Space.sm + 2,
  },
  twoFactorGroup: {
    marginBottom: Space.md,
    gap: Space.sm,
  },
  twoFactorHint: {
    color: Colors.textMuted,
    fontSize: Type.caption.size,
    fontFamily: 'Inter_500Medium',
    marginBottom: 2,
  },
  magicLinkBtn: {
    minHeight: 42,
    borderRadius: 21,
    borderWidth: 0,
    backgroundColor: 'transparent',
    marginTop: Space.sm + 2,
  },
  magicLinkText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    textDecorationLine: 'underline',
  },
  otpVerifyBtn: {
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 0,
    backgroundColor: Colors.brand,
  },
  otpVerifyText: {
    color: Colors.textInverse,
    fontSize: Type.body.size,
    fontFamily: 'Inter_600SemiBold',
  },

  footer: { paddingTop: Space.sm, position: 'relative' },
  infoText: { color: Colors.success, fontSize: 13, fontFamily: 'Inter_500Medium', textAlign: 'center', marginBottom: Space.md - 4 },
  errorText: { color: Colors.danger, fontSize: 13, fontFamily: 'Inter_500Medium', textAlign: 'center', marginBottom: Space.md - 4 },
  primaryBtn: { backgroundColor: Colors.textPrimary, minHeight: 56, borderRadius: 28, borderWidth: 0 },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryText: { color: Colors.background, fontSize: Type.body.size, fontFamily: 'Inter_600SemiBold' },
  switchRow: {
    marginTop: Space.sm + 6,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  switchText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  switchLink: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    textDecorationLine: 'underline',
  },
});
