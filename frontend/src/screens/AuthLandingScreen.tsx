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
import Reanimated, {
  FadeInDown,
  FadeIn,
  FadeInUp,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import { Typography, Radius, Type, Space, FontSize, Stroke, Elevation, Control } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useStore } from '../store/useStore';
import { useReducedMotion } from '../hooks/useReducedMotion';
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
  const reducedMotionEnabled = useReducedMotion();
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
        {/* Top - animated brand wordmark */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeIn.delay(200).duration(600)}
          style={styles.topSection}
        >
          <Text style={styles.logo} maxFontSizeMultiplier={1.3}>entry 01</Text>
        </Reanimated.View>

        {/* Middle - main copy */}
        <View style={styles.content}>
          <Reanimated.Text
            entering={
              reducedMotionEnabled
                ? undefined
                : FadeInDown.delay(400).duration(600).springify()
            }
            style={styles.title}
            maxFontSizeMultiplier={1.2}
          >
            THRYFT
          </Reanimated.Text>

          <Reanimated.Text
            entering={reducedMotionEnabled ? undefined : FadeInDown.delay(600).duration(500)}
            style={styles.subtitle}
            maxFontSizeMultiplier={1.3}
          >
            buy, sell, trade. no noise.
          </Reanimated.Text>

          {/* Trust signals — compact value props with refined icon treatment.
              Trust signals at the entry
              point reduce anxiety and communicate competence before the user
              commits to an action. Icons at 18pt sit above the reading flow
              without competing with the primary CTA. */}
          <Reanimated.View
            entering={reducedMotionEnabled ? undefined : FadeInDown.delay(750).duration(500)}
            style={styles.trustRow}
            accessibilityRole="text"
            accessibilityLabel="Buyer protection, make offers, and co-own trading"
          >
            <View style={styles.trustItem}>
              <Ionicons name="checkmark-circle-outline" size={18} color="rgba(245,239,230,0.65)" />
              <Text style={styles.trustText} maxFontSizeMultiplier={1.3}>Buyer protection</Text>
            </View>
            <View style={styles.trustDot} />
            <View style={styles.trustItem}>
              <Ionicons name="pricetag-outline" size={18} color="rgba(245,239,230,0.65)" />
              <Text style={styles.trustText} maxFontSizeMultiplier={1.3}>Make offers</Text>
            </View>
            <View style={styles.trustDot} />
            <View style={styles.trustItem}>
              <Ionicons name="swap-horizontal-outline" size={18} color="rgba(245,239,230,0.65)" />
              <Text style={styles.trustText} maxFontSizeMultiplier={1.3}>Co-Own trading</Text>
            </View>
          </Reanimated.View>
        </View>

        {/* Inline auth error banner — accessible, recoverable.
            A calm error banner with a clear dismiss control
            communicates competence. The danger-tinted surface is restrained
            so it informs without alarming. */}
        {authError ? (
          <Reanimated.View
            entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}
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
              <Ionicons name="close" size={18} color="rgba(245,239,230,0.65)" />
            </Pressable>
          </Reanimated.View>
        ) : null}

        {/* Bottom — CTAs. Primary action is visually dominant; secondary is
            restrained. Social auth sits below a subtle divider so the email
            path remains the clear primary. Placing
            social below the primary CTA signals that email signup is the
            recommended path while still offering convenience. */}
        <Reanimated.View
          entering={
            reducedMotionEnabled
              ? undefined
              : FadeInUp.delay(700).duration(500).springify()
          }
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

          <View style={styles.glassCard}>
            <AnimatedPressable
              style={styles.secondaryBtnGlass}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Login')}
              accessibilityRole="button"
              accessibilityLabel="I already have an account"
              accessibilityHint="Opens the login screen"
            >
              <Text style={styles.secondaryText} maxFontSizeMultiplier={1.3}>i already have an account</Text>
            </AnimatedPressable>
          </View>

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
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="logo-apple" size={22} color="#fff" />
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
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="logo-google" size={20} color="#fff" />
                )}
              </AnimatedPressable>
            ) : null}
          </View>

          {isMagicLinkLoading && (
            <Text style={styles.magicLinkLoadingText} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.3}>
              Signing you in from your email link...
            </Text>
          )}

          <Text style={styles.termsText} maxFontSizeMultiplier={1.3}>
            by continuing, you agree to our terms of service and privacy policy.
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
        </Reanimated.View>
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
  topSection: {
    paddingHorizontal: Space.lg - 2,
    paddingTop: Space.smMd,
  },
  logo: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: 'rgba(232,220,200,0.9)',
    letterSpacing: Space.xs - 1.2,
    textTransform: 'uppercase',
  },
  content: {
    paddingHorizontal: Space.lg - 2,
    paddingBottom: Space.md + 2,
  },
  title: {
    fontSize: FontSize.giant,
    fontFamily: Typography.family.extrabold,
    color: '#f6f2ea',
    lineHeight: FontSize.giant + 2,
    letterSpacing: -2,
    marginBottom: Space.smMd,
  },
  subtitle: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.regular,
    color: 'rgba(245,239,230,0.72)',
    lineHeight: Type.captionElevated.size + 4,
    letterSpacing: 0.24,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginTop: Space.md + 4,
    flexWrap: 'wrap',
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
  },
  trustText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: 'rgba(245,239,230,0.65)',
    letterSpacing: 0.2,
  },
  trustDot: {
    width: Space.xs - 1,
    height: Space.xs - 1,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(245,239,230,0.3)',
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
    backgroundColor: 'rgba(255,107,107,0.12)',
    borderWidth: Stroke.standard,
    borderColor: 'rgba(255,107,107,0.25)',
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
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: Space.xl,
    elevation: Elevation.floating.elevation,
  },
  primaryText: {
    color: colors.textInverse,
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.bold,
    letterSpacing: 0.2,
  },
  glassCard: {
    marginHorizontal: 0,
    padding: 0,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    borderRadius: Radius.lg,
  },
  secondaryBtnGlass: {
    height: Space.xl + Space.xl + 4,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.md,
  },
  secondaryBtn: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    height: Space.xl + Space.xl + 4,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: 'rgba(232,220,200,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: 'rgba(245,239,230,0.85)',
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
    backgroundColor: 'rgba(245,239,230,0.15)',
  },
  socialDividerText: {
    color: 'rgba(245,239,230,0.45)',
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: Stroke.standard,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialBtnDisabled: {
    opacity: 0.7,
  },
  magicLinkLoadingText: {
    marginTop: Space.sm,
    color: 'rgba(255,255,255,0.62)',
    fontSize: Type.caption.size,
    textAlign: 'center',
    fontFamily: Typography.family.medium,
  },
  termsText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    lineHeight: Type.caption.lineHeight,
    marginTop: Space.xs,
  },
  devBypassBtn: {
    marginTop: Space.smMd,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(52,199,89,0.15)',
    borderWidth: Stroke.standard,
    borderColor: 'rgba(52,199,89,0.4)',
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
