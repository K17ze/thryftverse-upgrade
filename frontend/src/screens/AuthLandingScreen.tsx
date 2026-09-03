import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import { Typography, Radius, Space, Stroke, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppInput } from '../components/ui/AppInput';
import { useStore } from '../store/useStore';
import { consumeMagicLink, loginWithAppleIdentityToken, loginWithGoogleIdToken, loginWithPassword, type MagicLinkConsumeError } from '../services/authApi';
import { loginWithPasskey } from '../services/passkeyApi';

WebBrowser.maybeCompleteAuthSession();

function firstQueryParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.find((entry) => typeof entry === 'string');
  }

  return undefined;
}

export default function AuthLandingScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const login = useStore((state) => state.login);
  const setTwoFactorEnabled = useStore((state) => state.setTwoFactorEnabled);
  const fetchMyProfile = useStore((state) => state.fetchMyProfile);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | 'passkey' | null>(null);
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false);
  const [isDevBypassLoading, setIsDevBypassLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [magicLinkTwoFactorRequired, setMagicLinkTwoFactorRequired] = useState(false);
  // Retain the magic-link token + email for inline 2FA retry. The backend
  // does NOT consume the token when TWO_FACTOR_REQUIRED is returned (the
  // transaction rolls back), so the same token can be retried with a 2FA code.
  const magicLinkTokenRef = useRef<string | null>(null);
  const magicLinkEmailRef = useRef<string | undefined>(undefined);
  const [magicLinkTwoFactorCode, setMagicLinkTwoFactorCode] = useState('');
  const [magicLinkRecoveryCode, setMagicLinkRecoveryCode] = useState('');
  const [magicLinkUseRecovery, setMagicLinkUseRecovery] = useState(false);
  const [isMagicLinkTwoFactorVerifying, setIsMagicLinkTwoFactorVerifying] = useState(false);
  const [magicLinkTwoFactorError, setMagicLinkTwoFactorError] = useState<string | null>(null);

  // UI-21P: Prevent crash when OAuth client IDs are not configured in dev builds
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

  const handleMagicLink = useCallback(
    async (url: string | null) => {
      if (!url) {
        return;
      }

      const parsed = Linking.parse(url);
      const normalizedPath = (parsed.path ?? '').replace(/^\/+/, '').toLowerCase();
      const isExpectedMagicPath = normalizedPath === 'auth/magic-link' || normalizedPath === 'magic-link';
      if (!isExpectedMagicPath) {
        return;
      }

      const token = firstQueryParam(parsed.queryParams?.token as string | string[] | undefined);
      const email = firstQueryParam(parsed.queryParams?.email as string | string[] | undefined);

      if (!token) {
        return;
      }

      // Persist token + email for the inline 2FA retry path.
      magicLinkTokenRef.current = token;
      magicLinkEmailRef.current = email;

      setIsMagicLinkLoading(true);
      try {
        const result = await consumeMagicLink({
          token,
          email });
        login(result.storeUser);
        setTwoFactorEnabled(result.user.twoFactorEnabled);
        navigation.replace('MainTabs');
      } catch (error) {
        // The backend does NOT consume the magic-link token when
        // TWO_FACTOR_REQUIRED is returned (the transaction rolls back), so
        // the same token can be retried with a 2FA code. Show an inline
        // 2FA challenge instead of redirecting to password login.
        const magicLinkError = error as MagicLinkConsumeError;
        if (magicLinkError.code === 'TWO_FACTOR_REQUIRED') {
          setMagicLinkTwoFactorRequired(true);
          setMagicLinkTwoFactorError(null);
          setMagicLinkTwoFactorCode('');
          setMagicLinkRecoveryCode('');
          setMagicLinkUseRecovery(false);
        } else {
          setAuthError(`Magic link failed: ${(error as Error).message}`);
        }
      } finally {
        setIsMagicLinkLoading(false);
      }
    },
    [login, navigation, setTwoFactorEnabled]
  );

  const handleVerifyMagicLinkTwoFactor = useCallback(async () => {
    const token = magicLinkTokenRef.current;
    if (!token || isMagicLinkTwoFactorVerifying) {
      return;
    }

    const twoFactorCode = magicLinkTwoFactorCode.trim();
    const recoveryCode = magicLinkRecoveryCode.trim();

    if (magicLinkUseRecovery) {
      if (!recoveryCode) {
        setMagicLinkTwoFactorError('Enter your recovery code.');
        return;
      }
    } else {
      if (twoFactorCode.length < 6) {
        setMagicLinkTwoFactorError('Enter the 6-digit code from your authenticator app.');
        return;
      }
    }

    setMagicLinkTwoFactorError(null);
    setIsMagicLinkTwoFactorVerifying(true);

    try {
      const result = await consumeMagicLink({
        token,
        email: magicLinkEmailRef.current,
        twoFactorCode: magicLinkUseRecovery ? undefined : twoFactorCode,
        recoveryCode: magicLinkUseRecovery ? recoveryCode : undefined });
      login(result.storeUser);
      setTwoFactorEnabled(result.user.twoFactorEnabled);
      navigation.replace('MainTabs');
    } catch (error) {
      // Token is not consumed on TWO_FACTOR_REQUIRED — keep it so the
      // user can retry with a corrected code.
      setMagicLinkTwoFactorError((error as Error).message || 'Unable to verify two-factor code.');
    } finally {
      setIsMagicLinkTwoFactorVerifying(false);
    }
  }, [
    isMagicLinkTwoFactorVerifying,
    login,
    magicLinkRecoveryCode,
    magicLinkTwoFactorCode,
    magicLinkUseRecovery,
    navigation,
    setTwoFactorEnabled,
  ]);

  const cancelMagicLinkTwoFactor = useCallback(() => {
    setMagicLinkTwoFactorRequired(false);
    setMagicLinkTwoFactorCode('');
    setMagicLinkRecoveryCode('');
    setMagicLinkUseRecovery(false);
    setMagicLinkTwoFactorError(null);
    magicLinkTokenRef.current = null;
    magicLinkEmailRef.current = undefined;
  }, []);

  useEffect(() => {
    void (async () => {
      const initialUrl = await Linking.getInitialURL();
      await handleMagicLink(initialUrl);
    })();

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleMagicLink(url);
    });

    return () => {
      subscription.remove();
    };
  }, [handleMagicLink]);

  useEffect(() => {
    if (!googleResponse) {
      return;
    }

    if (googleResponse.type !== 'success') {
      setSocialLoading(null);
      return;
    }

    const tokenFromAuth = googleResponse.authentication?.idToken;
    const tokenFromParams = typeof googleResponse.params?.id_token === 'string'
      ? googleResponse.params.id_token
      : null;
    const idToken = tokenFromAuth ?? tokenFromParams;

    if (!idToken) {
      setSocialLoading(null);
      setAuthError('Google sign-in failed: Unable to get Google identity token.');
      return;
    }

    void (async () => {
      try {
        const result = await loginWithGoogleIdToken(idToken);
        login(result.storeUser);
        setTwoFactorEnabled(result.user.twoFactorEnabled);
        navigation.replace('MainTabs');
      } catch (error) {
        setAuthError(`Google sign-in failed: ${(error as Error).message}`);
      } finally {
        setSocialLoading(null);
      }
    })();
  }, [googleResponse, login, navigation, setTwoFactorEnabled]);

  const handleGoogleSignIn = async () => {
    if (socialLoading || isMagicLinkLoading) {
      return;
    }

    if (!googleRequest) {
      setAuthError('Google sign-in unavailable. Configure Google OAuth client IDs in your Expo environment.');
      return;
    }

    setSocialLoading('google');

    try {
      const response = await promptGoogleAuth();
      if (response.type !== 'success') {
        setSocialLoading(null);
      }
    } catch (error) {
      setSocialLoading(null);
      setAuthError(`Google sign-in failed: ${(error as Error).message}`);
    }
  };

  const handlePasskeySignIn = async () => {
    if (socialLoading || isMagicLinkLoading) return;
    setSocialLoading('passkey');
    setAuthError(null);
    try {
      const result = await loginWithPasskey();
      login({
        id: result.user.id,
        email: result.user.email,
        username: result.user.username,
        role: result.user.role,
        emailVerified: result.user.emailVerified } as never);
      setTwoFactorEnabled(false);
      navigation.replace('MainTabs');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Passkey sign-in failed';
      setAuthError(msg);
    } finally {
      setSocialLoading(null);
    }
  };

  const handleAppleSignIn = async () => {
    if (socialLoading || isMagicLinkLoading) {
      return;
    }

    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      setAuthError('Apple sign-in is only available on supported iOS devices.');
      return;
    }

    setSocialLoading('apple');

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ] });

      if (!credential.identityToken) {
        throw new Error('Missing Apple identity token');
      }

      const result = await loginWithAppleIdentityToken(credential.identityToken);
      login(result.storeUser);
      setTwoFactorEnabled(result.user.twoFactorEnabled);
      navigation.replace('MainTabs');
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== 'ERR_REQUEST_CANCELED') {
        setAuthError(`Apple sign-in failed: ${(error as Error).message}`);
      }
    } finally {
      setSocialLoading(null);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <SafeAreaView style={styles.safeArea}>
        {/* Wordmark — top-left, not centered. The product name is the
            only identity element above the actions. No subtitle, no
            trust row, no decorative chrome competing for attention. */}
        <Text style={styles.wordmark} maxFontSizeMultiplier={1.2}>
          ThryftVerse
        </Text>

        {/* Inline auth error banner — accessible, recoverable. */}
        {authError ? (
          <View
            style={styles.errorBanner}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
            <Text style={styles.errorBannerText} maxFontSizeMultiplier={1.3}>{authError}</Text>
            <Pressable
              onPress={() => setAuthError(null)}
              hitSlop={Control.hit / 2}
              accessibilityRole="button"
              accessibilityLabel="Dismiss error"
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}

        {/* Inline 2FA challenge for magic-link sign-in. The backend does NOT
            consume the token when TWO_FACTOR_REQUIRED is returned (the
            transaction rolls back), so the same token can be retried with a
            2FA code. */}
        {magicLinkTwoFactorRequired ? (
          <View
            style={styles.twoFactorNotice}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            <View style={styles.twoFactorNoticeHeader}>
              <View style={[styles.twoFactorNoticeIcon, { backgroundColor: colors.commerceTrustSubtle }]}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.commerceTrust} />
              </View>
              <Text style={styles.twoFactorNoticeTitle} maxFontSizeMultiplier={1.3}>
                Two-factor authentication required
              </Text>
            </View>
            <Text style={styles.twoFactorNoticeBody} maxFontSizeMultiplier={1.3}>
              Enter the code from your authenticator app to continue signing in.
            </Text>

            {magicLinkUseRecovery ? (
              <AppInput
                appearance="outline"
                label="Recovery code"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                autoCapitalize="characters"
                autoCorrect={false}
                value={magicLinkRecoveryCode}
                onChangeText={(value) => {
                  setMagicLinkRecoveryCode(value.toUpperCase());
                  if (magicLinkTwoFactorError) {
                    setMagicLinkTwoFactorError(null);
                  }
                }}
                containerStyle={styles.twoFactorNoticeInput}
              />
            ) : (
              <AppInput
                appearance="outline"
                label="Authenticator code"
                placeholder="000000"
                keyboardType="numeric"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={6}
                autoFocus
                value={magicLinkTwoFactorCode}
                onChangeText={(value) => {
                  setMagicLinkTwoFactorCode(value.replace(/\D/g, '').slice(0, 6));
                  if (magicLinkTwoFactorError) {
                    setMagicLinkTwoFactorError(null);
                  }
                }}
                containerStyle={styles.twoFactorNoticeInput}
              />
            )}

            <Pressable
              onPress={() => {
                setMagicLinkUseRecovery((prev) => !prev);
                setMagicLinkTwoFactorError(null);
              }}
              hitSlop={Control.hit / 2}
              accessibilityRole="button"
              accessibilityLabel={magicLinkUseRecovery ? 'Use authenticator code instead' : 'Use recovery code instead'}
              style={styles.twoFactorNoticeToggle}
            >
              <Text style={styles.twoFactorNoticeToggleText} maxFontSizeMultiplier={1.3}>
                {magicLinkUseRecovery ? 'Use authenticator code' : 'Use recovery code'}
              </Text>
            </Pressable>

            {magicLinkTwoFactorError ? (
              <Text
                style={styles.twoFactorNoticeError}
                accessibilityLiveRegion="assertive"
                maxFontSizeMultiplier={1.3}
              >
                {magicLinkTwoFactorError}
              </Text>
            ) : null}

            <AnimatedPressable
              style={[styles.twoFactorNoticePrimaryBtn, isMagicLinkTwoFactorVerifying && styles.socialBtnDisabled]}
              activeOpacity={0.9}
              onPress={handleVerifyMagicLinkTwoFactor}
              disabled={isMagicLinkTwoFactorVerifying}
              accessibilityRole="button"
              accessibilityLabel="Verify two-factor code"
              accessibilityHint="Submits your two-factor code and continues signing in"
            >
              {isMagicLinkTwoFactorVerifying ? (
                <ActivityIndicator color={colors.textInverse} size="small" />
              ) : (
                <Text style={styles.twoFactorNoticePrimaryText} maxFontSizeMultiplier={1.2}>
                  Verify
                </Text>
              )}
            </AnimatedPressable>

            <Pressable
              onPress={cancelMagicLinkTwoFactor}
              hitSlop={Control.hit / 2}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              accessibilityHint="Dismisses the two-factor prompt and returns to the sign-in screen"
              style={styles.twoFactorNoticeCancel}
            >
              <Text style={styles.twoFactorNoticeCancelText} maxFontSizeMultiplier={1.3}>
                Cancel
              </Text>
            </Pressable>
          </View>
        ) : null}

        {isMagicLinkLoading && (
          <Text style={styles.magicLinkLoadingText} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.3}>
            Signing you in from your email link...
          </Text>
        )}

        {/* Actions anchored to the bottom. Two primary social paths
            (Apple, Google) as full-width buttons. Passkey and email
            are quiet text links — not equal-weight pills — because
            they are secondary paths, not the main entry. */}
        <View style={styles.footer}>
          <AnimatedPressable
            style={[styles.socialFullBtn, (!!socialLoading || isMagicLinkLoading) && styles.socialBtnDisabled]}
            activeOpacity={0.85}
            onPress={handleAppleSignIn}
            disabled={!!socialLoading || isMagicLinkLoading}
            accessibilityRole="button"
            accessibilityLabel="Continue with Apple"
            accessibilityHint="Authenticate using your Apple ID"
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
              style={[styles.socialFullBtn, (!!socialLoading || isMagicLinkLoading) && styles.socialBtnDisabled]}
              activeOpacity={0.85}
              onPress={handleGoogleSignIn}
              disabled={!!socialLoading || isMagicLinkLoading}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
              accessibilityHint="Authenticate using your Google account"
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

          {/* Secondary paths as text links — not equal-weight pills.
              Passkey, email signup, and login are real paths but not
              the dominant entry. Text links create clear hierarchy. */}
          <Pressable
            onPress={handlePasskeySignIn}
            disabled={!!socialLoading || isMagicLinkLoading}
            style={styles.textLinkBtn}
            accessibilityRole="button"
            accessibilityLabel="Sign in with passkey"
            accessibilityHint="Use Face ID, Touch ID, or a security key to sign in"
          >
            {socialLoading === 'passkey' ? (
              <ActivityIndicator color={colors.textSecondary} size="small" />
            ) : (
              <Text style={styles.textLinkText} maxFontSizeMultiplier={1.3}>
                Use passkey
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate('SignUp')}
            style={styles.textLinkBtn}
            accessibilityRole="button"
            accessibilityLabel="Sign up with email"
            accessibilityHint="Opens the sign-up screen"
          >
            <Text style={styles.textLinkText} maxFontSizeMultiplier={1.3}>
              Sign up with email
            </Text>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate('Login')}
            style={styles.textLinkBtn}
            accessibilityRole="button"
            accessibilityLabel="Log in to existing account"
            accessibilityHint="Opens the login screen"
          >
            <Text style={styles.textLinkText} maxFontSizeMultiplier={1.3}>
              Already have an account? Log in
            </Text>
          </Pressable>

          {/* Terms + trust — bottom, quiet. One line, not a banner. */}
          <Text style={styles.termsText} maxFontSizeMultiplier={1.3}>
            by continuing, you agree to our{' '}
            <Text
              style={styles.termsLink}
              onPress={() => void Linking.openURL('https://thryftverse.app/terms')}
            >
              terms
            </Text>
            {' '}and{' '}
            <Text
              style={styles.termsLink}
              onPress={() => void Linking.openURL('https://thryftverse.app/privacy')}
            >
              privacy policy
            </Text>
            .{' '}buyer protection on every purchase.
          </Text>

          {__DEV__ && (
            <AnimatedPressable
              style={[styles.devBypassBtn, isDevBypassLoading && { opacity: 0.6 }]}
              activeOpacity={0.8}
              disabled={isDevBypassLoading}
              onPress={async () => {
                setIsDevBypassLoading(true);
                setAuthError(null);
                try {
                  // Authenticate as seed_u1 (marie@seed.test) through the real
                  // backend so the full personalised auction experience —
                  // watchlist, attention strip, bid states, seller auctions —
                  // renders with backend data. Without a real auth session the
                  // backend treats every request as anonymous and the auction
                  // home degrades to an unpersonalised, structurally different
                  // composition.
                  const result = await loginWithPassword({
                    email: 'marie@seed.test',
                    password: 'seed12345' });
                  login(result.storeUser);
                  setTwoFactorEnabled(result.user.twoFactorEnabled);
                  // Hydrate the full profile (avatar, displayName, bio, …)
                  // so downstream screens that read currentUser look correct.
                  void fetchMyProfile();
                  navigation.replace('MainTabs');
                } catch (err) {
                  // Backend not running or DB not seeded. Stay on the auth
                  // screen with a clear, actionable error so the user knows
                  // exactly what to do — navigating into an unpersonalised
                  // empty auction home would reproduce the original bug.
                  setAuthError(
                    'Dev login failed — backend unreachable or DB not seeded. ' +
                    'Start the backend, run seed-dev-data.ts, then try again. ' +
                    '(seed_u1 / marie@seed.test / seed12345)'
                  );
                } finally {
                  setIsDevBypassLoading(false);
                }
              }}
            >
              {isDevBypassLoading ? (
                <ActivityIndicator size="small" color={colors.success} />
              ) : (
                <Text style={styles.devBypassText} maxFontSizeMultiplier={1.3}>Dev Bypass (UI Testing)</Text>
              )}
            </AnimatedPressable>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background },
  safeArea: {
    flex: 1,
    justifyContent: 'flex-end' },
  // Wordmark — top-left, restrained. No giant centered title.
  wordmark: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: Typography.family.extrabold,
    color: colors.textPrimary,
    letterSpacing: -0.5,
    paddingHorizontal: Space.lg,
    paddingTop: Space.xxl },
  footer: {
    paddingHorizontal: Space.lg,
    paddingBottom: Space.xxl,
    gap: Space.sm + 2 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 2,
    marginHorizontal: Space.lg,
    marginBottom: Space.xs + 2,
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
  twoFactorNotice: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md + 2,
    marginHorizontal: Space.lg,
    marginBottom: Space.xs + 2,
    borderRadius: Radius.lg,
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border },
  twoFactorNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginBottom: Space.xs },
  twoFactorNoticeIcon: {
    width: Control.icon,
    height: Control.icon,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center' },
  twoFactorNoticeTitle: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  twoFactorNoticeBody: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    lineHeight: TypographyV2.meta.size + 4,
    marginBottom: Space.sm + 2 },
  twoFactorNoticePrimaryBtn: {
    backgroundColor: colors.brand,
    height: 52,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center' },
  twoFactorNoticePrimaryText: {
    color: colors.textInverse,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: 0.2 },
  twoFactorNoticeCancel: {
    alignSelf: 'center',
    marginTop: Space.sm,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.md,
    minHeight: Control.hit,
    justifyContent: 'center' },
  twoFactorNoticeCancelText: {
    color: colors.textSecondary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  twoFactorNoticeInput: {
    marginBottom: Space.sm },
  twoFactorNoticeToggle: {
    alignSelf: 'flex-start',
    paddingVertical: Space.xs,
    paddingHorizontal: Space.xs,
    marginBottom: Space.xs,
    minHeight: Control.hit,
    justifyContent: 'center' },
  twoFactorNoticeToggleText: {
    color: colors.textSecondary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textDecorationLine: 'underline' },
  twoFactorNoticeError: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.danger,
    lineHeight: TypographyV2.meta.size + 2,
    marginBottom: Space.sm },
  // Primary social buttons — Apple + Google. Full-width, clear hierarchy.
  socialFullBtn: {
    flexDirection: 'row',
    height: 52,
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
  socialBtnDisabled: {
    opacity: 0.7 },
  // Secondary paths — text links, not pills. Creates clear hierarchy.
  textLinkBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Space.xs },
  textLinkText: {
    color: colors.textSecondary,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  magicLinkLoadingText: {
    color: colors.textSecondary,
    fontSize: TypographyV2.meta.size,
    textAlign: 'center',
    fontFamily: TypographyV2.meta.fontFamily,
    paddingHorizontal: Space.lg,
    marginBottom: Space.sm },
  termsText: {
    color: colors.textMuted,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textAlign: 'center',
    lineHeight: TypographyV2.meta.lineHeight,
    marginTop: Space.sm },
  termsLink: {
    color: colors.textSecondary,
    fontFamily: Typography.family.semibold,
    textDecorationLine: 'underline' },
  devBypassBtn: {
    marginTop: Space.smMd,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    backgroundColor: colors.successSubtle,
    borderWidth: Stroke.standard,
    borderColor: colors.successBorder,
    alignSelf: 'center' },
  devBypassText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.success,
    textAlign: 'center' } });
}
