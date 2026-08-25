import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Dimensions,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import { Typography, Radius, Type, Space, FontSize, Stroke, Control } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppInput } from '../components/ui/AppInput';
import { useStore } from '../store/useStore';
import { consumeMagicLink, loginWithAppleIdentityToken, loginWithGoogleIdToken, loginWithPassword, type MagicLinkConsumeError } from '../services/authApi';
import { loginWithPasskey } from '../services/passkeyApi';

const { width, height } = Dimensions.get('window');

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
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID,
  });

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
          email,
        });
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
        recoveryCode: magicLinkUseRecovery ? recoveryCode : undefined,
      });
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
        emailVerified: result.user.emailVerified,
      } as never);
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
        ],
      });

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
        {/* Middle - main copy. The brand wordmark "THRYFT" is the value
            proposition; no unexplained eyebrow chrome competing for the
            text budget (§4). */}

        {/* Middle - main copy */}
        <View style={styles.content}>
          <Text
            style={styles.title}
            maxFontSizeMultiplier={1.2}
          >
            THRYFT
          </Text>

          <Text
            style={styles.subtitle}
            maxFontSizeMultiplier={1.3}
          >
            buy, sell, trade. no noise.
          </Text>

          {/* Trust signals — a single line of honest proof, not a flat row
              of decorative icons. Per §11 and 2026 research (Landra), trust
              signals must be proof, not claims. The buyer-protection text
              links to the real policy so it is an actionable destination,
              not dead text. We do not fabricate seller counts or transaction
              volumes — the proof is qualitative and verifiable. */}
          <View
            style={styles.trustRow}
            accessibilityRole="text"
            accessibilityLabel="From independent sellers and creators. Buyer protection on every purchase."
          >
            <Text style={styles.trustText} maxFontSizeMultiplier={1.3}>
              From independent sellers and creators ·{' '}
            </Text>
            <Pressable
              onPress={() => void Linking.openURL('https://thryftverse.app/buyer-protection')}
              accessibilityRole="link"
              accessibilityLabel="Buyer protection policy"
              accessibilityHint="Opens the buyer protection policy in your browser"
            >
              <Text style={styles.trustLink} maxFontSizeMultiplier={1.3}>
                Buyer protection on every purchase
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Inline auth error banner — accessible, recoverable.
            A calm error banner with a clear dismiss control
            communicates competence. The danger-tinted surface is restrained
            so it informs without alarming. */}
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
            2FA code. This is a focused inline state — one dominant action
            ("Verify"), one restrained secondary ("Use recovery code" toggle
            + "Cancel") — matching the screen's visual language. */}
        {magicLinkTwoFactorRequired ? (
          <View
            style={styles.twoFactorNotice}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            <View style={styles.twoFactorNoticeHeader}>
              <View style={[styles.twoFactorNoticeIcon, { backgroundColor: colors.commerceTrustSubtle }]}>
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.commerceTrust} />
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

        {/* Bottom — CTAs. Per 2026 research (Gummble, Eleken), social login
            buttons go at the TOP — the old pattern of burying them below
            email fields is dead. Apple first (platform native on iOS),
            Google second. Full-width labeled buttons, not icon circles,
            so the path is obvious to a distracted user. Email signup is
            the secondary path below a "or continue with email" divider. */}
        <View
          style={styles.footer}
        >
          {/* Social login — primary path, full-width labeled buttons */}
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

          {/* Passkey — phishing-resistant sign-in (NCSC recommended) */}
          <AnimatedPressable
            style={[styles.socialFullBtn, (!!socialLoading || isMagicLinkLoading) && styles.socialBtnDisabled]}
            activeOpacity={0.85}
            onPress={handlePasskeySignIn}
            disabled={!!socialLoading || isMagicLinkLoading}
            accessibilityRole="button"
            accessibilityLabel="Sign in with passkey"
            accessibilityHint="Use Face ID, Touch ID, or a security key to sign in"
          >
            {socialLoading === 'passkey' ? (
              <ActivityIndicator color={colors.textPrimary} size="small" />
            ) : (
              <>
                <Ionicons name="key-outline" size={20} color={colors.textPrimary} />
                <Text style={styles.socialFullText} maxFontSizeMultiplier={1.2}>Sign in with passkey</Text>
              </>
            )}
          </AnimatedPressable>

          {isMagicLinkLoading && (
            <Text style={styles.magicLinkLoadingText} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.3}>
              Signing you in from your email link...
            </Text>
          )}

          {/* Divider — separates social from email path */}
          <View style={styles.socialDivider}>
            <View style={styles.socialDividerLine} />
            <Text style={styles.socialDividerText} maxFontSizeMultiplier={1.3}>or continue with email</Text>
            <View style={styles.socialDividerLine} />
          </View>

          {/* Email signup — secondary path */}
          <AnimatedPressable
            style={styles.primaryBtn}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('SignUp')}
            accessibilityRole="button"
            accessibilityLabel="Sign up with email"
            accessibilityHint="Opens the sign-up screen"
          >
            <Text style={styles.primaryText} maxFontSizeMultiplier={1.2}>Sign up with email</Text>
          </AnimatedPressable>

          {/* Already have an account — bottom link */}
          <AnimatedPressable
            style={styles.secondaryBtn}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Login')}
            accessibilityRole="button"
            accessibilityLabel="Log in to existing account"
            accessibilityHint="Opens the login screen"
          >
            <Text style={styles.secondaryText} maxFontSizeMultiplier={1.3}>Already have an account? Log in</Text>
          </AnimatedPressable>

          {/* Terms — navigable links (§11). "Terms of Service" and
              "Privacy Policy" open the real documents, so the control has
              an actionable destination rather than being dead text. */}
          <Text style={styles.termsText} maxFontSizeMultiplier={1.3}>
            by continuing, you agree to our{' '}
            <Text
              style={styles.termsLink}
              onPress={() => void Linking.openURL('https://thryftverse.app/terms')}
            >
              terms of service
            </Text>
            {' '}and{' '}
            <Text
              style={styles.termsLink}
              onPress={() => void Linking.openURL('https://thryftverse.app/privacy')}
            >
              privacy policy
            </Text>
            .
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
                    password: 'seed12345',
                  });
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
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  content: {
    paddingHorizontal: Space.lg - 2,
    paddingBottom: Space.md + 2,
  },
  title: {
    fontSize: FontSize.giant,
    fontFamily: Typography.family.extrabold,
    color: colors.textPrimary,
    lineHeight: FontSize.giant + 2,
    letterSpacing: -2,
    marginBottom: Space.smMd,
  },
  subtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
    lineHeight: Type.caption.size + 4,
    letterSpacing: 0.24,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: Space.md + 4,
  },
  trustText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    letterSpacing: 0.2,
  },
  trustLink: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.textSecondary,
    letterSpacing: 0.2,
    textDecorationLine: 'underline',
  },
  footer: {
    paddingHorizontal: Space.lg + 4,
    paddingBottom: Space.sm + 6,
    gap: Space.sm + 2,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 2,
    marginHorizontal: Space.lg + 4,
    marginBottom: Space.xs + 2,
    borderRadius: Radius.lg,
    backgroundColor: colors.dangerSubtle,
    borderWidth: Stroke.standard,
    borderColor: colors.dangerBorder,
  },
  errorBannerText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.danger,
    lineHeight: Type.caption.size + 2,
  },
  twoFactorNotice: {
    paddingHorizontal: Space.lg + 4,
    paddingVertical: Space.md + 2,
    marginHorizontal: Space.lg + 4,
    marginBottom: Space.xs + 2,
    borderRadius: Radius.lg,
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
  },
  twoFactorNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginBottom: Space.xs,
  },
  twoFactorNoticeIcon: {
    width: Control.icon,
    height: Control.icon,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  twoFactorNoticeTitle: {
    flex: 1,
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    letterSpacing: Type.bodyStrong.letterSpacing,
  },
  twoFactorNoticeBody: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
    lineHeight: Type.caption.size + 4,
    marginBottom: Space.sm + 2,
  },
  twoFactorNoticePrimaryBtn: {
    backgroundColor: colors.brand,
    height: Space.xl + Space.xl + 4,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  twoFactorNoticePrimaryText: {
    color: colors.textInverse,
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    letterSpacing: 0.2,
  },
  twoFactorNoticeCancel: {
    alignSelf: 'center',
    marginTop: Space.sm,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.md,
    minHeight: Control.hit,
    justifyContent: 'center',
  },
  twoFactorNoticeCancelText: {
    color: colors.textSecondary,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  twoFactorNoticeInput: {
    marginBottom: Space.sm,
  },
  twoFactorNoticeToggle: {
    alignSelf: 'flex-start',
    paddingVertical: Space.xs,
    paddingHorizontal: Space.xs,
    marginBottom: Space.xs,
    minHeight: Control.hit,
    justifyContent: 'center',
  },
  twoFactorNoticeToggleText: {
    color: colors.textSecondary,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    textDecorationLine: 'underline',
  },
  twoFactorNoticeError: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.danger,
    lineHeight: Type.caption.size + 2,
    marginBottom: Space.sm,
  },
  primaryBtn: {
    backgroundColor: colors.brand,
    height: Space.xl + Space.xl + 8,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: colors.textInverse,
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    height: Space.xl + Space.xl + 4,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.md,
  },
  secondaryText: {
    color: colors.textSecondary,
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.1,
  },
  socialFullBtn: {
    flexDirection: 'row',
    height: Space.xl + Space.xl + 4,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm + 2,
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
  },
  socialFullText: {
    color: colors.textPrimary,
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.1,
  },
  socialDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.xs,
    marginBottom: Space.xs,
  },
  socialDividerLine: {
    flex: 1,
    height: Stroke.hairline,
    backgroundColor: colors.border,
  },
  socialDividerText: {
    color: colors.textMuted,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  socialBtnDisabled: {
    opacity: 0.7,
  },
  magicLinkLoadingText: {
    marginTop: Space.sm,
    color: colors.textSecondary,
    fontSize: Type.caption.size,
    textAlign: 'center',
    fontFamily: Typography.family.medium,
  },
  termsText: {
    color: colors.textMuted,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    lineHeight: Type.caption.lineHeight,
    marginTop: Space.xs,
  },
  termsLink: {
    color: colors.textSecondary,
    fontFamily: Typography.family.semibold,
    textDecorationLine: 'underline',
  },
  devBypassBtn: {
    marginTop: Space.smMd,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    backgroundColor: colors.successSubtle,
    borderWidth: Stroke.standard,
    borderColor: colors.successBorder,
    alignSelf: 'center',
  },
  devBypassText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.success,
    textAlign: 'center',
  },
});
}
