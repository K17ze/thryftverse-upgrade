import React, { useCallback, useEffect, useState, useMemo } from 'react';
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
import { useStore } from '../store/useStore';
import { consumeMagicLink, loginWithAppleIdentityToken, loginWithGoogleIdToken, loginWithPassword } from '../services/authApi';

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
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false);
  const [isDevBypassLoading, setIsDevBypassLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

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
        setAuthError(`Magic link failed: ${(error as Error).message}`);
      } finally {
        setIsMagicLinkLoading(false);
      }
    },
    [login, navigation, setTwoFactorEnabled]
  );

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

        {/* Bottom — CTAs. Primary action is visually dominant; secondary is
            restrained. Social auth sits below a subtle divider so the email
            path remains the clear primary. Placing
            social below the primary CTA signals that email signup is the
            recommended path while still offering convenience. */}
        <View
          style={styles.footer}
        >
          <View>
            <AnimatedPressable
              style={styles.primaryBtn}
              activeOpacity={0.9}
              onPress={() => navigation.navigate('SignUp')}
              accessibilityRole="button"
              accessibilityLabel="Create account"
              accessibilityHint="Opens the sign-up screen"
            >
              <Text style={styles.primaryText} maxFontSizeMultiplier={1.2}>create account</Text>
            </AnimatedPressable>
          </View>

          {/* Secondary CTA — flattened (§4: no card-on-card). A transparent
              pressable with a text label, separated from the primary CTA by
              spacing alone. No glass wrapper, no nested surface. */}
          <AnimatedPressable
            style={styles.secondaryBtn}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Login')}
            accessibilityRole="button"
            accessibilityLabel="I already have an account"
            accessibilityHint="Opens the login screen"
          >
            <Text style={styles.secondaryText} maxFontSizeMultiplier={1.3}>i already have an account</Text>
          </AnimatedPressable>

          {/* Divider — separates email path from social auth */}
          <View style={styles.socialDivider}>
            <View style={styles.socialDividerLine} />
            <Text style={styles.socialDividerText} maxFontSizeMultiplier={1.3}>or continue with</Text>
            <View style={styles.socialDividerLine} />
          </View>

          {/* Social login row — Apple first (platform native), Google second */}
          <View style={styles.socialRow}>
            <AnimatedPressable
              style={[styles.socialBtn, (!!socialLoading || isMagicLinkLoading) && styles.socialBtnDisabled]}
              activeOpacity={0.8}
              onPress={handleAppleSignIn}
              disabled={!!socialLoading || isMagicLinkLoading}
              accessibilityRole="button"
              accessibilityLabel="Sign in with Apple"
              accessibilityHint="Authenticate using your Apple ID"
            >
              {socialLoading === 'apple' ? (
                <ActivityIndicator color={colors.textInverse} size="small" />
              ) : (
                <Ionicons name="logo-apple" size={22} color={colors.textInverse} />
              )}
            </AnimatedPressable>
            {hasGoogleOAuth ? (
              <AnimatedPressable
                style={[styles.socialBtn, (!!socialLoading || isMagicLinkLoading) && styles.socialBtnDisabled]}
                activeOpacity={0.8}
                onPress={handleGoogleSignIn}
                disabled={!!socialLoading || isMagicLinkLoading}
                accessibilityRole="button"
                accessibilityLabel="Sign in with Google"
                accessibilityHint="Authenticate using your Google account"
              >
                {socialLoading === 'google' ? (
                  <ActivityIndicator color={colors.textInverse} size="small" />
                ) : (
                  <Ionicons name="logo-google" size={20} color={colors.textInverse} />
                )}
              </AnimatedPressable>
            ) : null}
          </View>

          {isMagicLinkLoading && (
            <Text style={styles.magicLinkLoadingText} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.3}>
              Signing you in from your email link...
            </Text>
          )}

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
    gap: Space.sm,
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
  socialDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.xs,
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
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Space.md,
  },
  socialBtn: {
    width: Space.xl + Space.xl + 2,
    height: Space.xl + Space.xl + 2,
    borderRadius: Radius.full,
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
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
