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
import { Typography, Radius, Type, Space, FontSize, Stroke, Elevation } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useStore } from '../store/useStore';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { consumeMagicLink, loginWithAppleIdentityToken, loginWithGoogleIdToken } from '../services/authApi';

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
  const reducedMotionEnabled = useReducedMotion();
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false);
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
          <Text style={styles.logo}>entry 01</Text>
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
          >
            THRYFT
          </Reanimated.Text>

          <Reanimated.Text
            entering={reducedMotionEnabled ? undefined : FadeInDown.delay(600).duration(500)}
            style={styles.subtitle}
          >
            buy, sell, trade. no noise.
          </Reanimated.Text>

          {/* Trust signals — compact value props */}
          <Reanimated.View
            entering={reducedMotionEnabled ? undefined : FadeInDown.delay(750).duration(500)}
            style={styles.trustRow}
          >
            <View style={styles.trustItem}>
              <Ionicons name="shield-checkmark-outline" size={16} color="rgba(245,239,230,0.6)" />
              <Text style={styles.trustText}>Buyer protection</Text>
            </View>
            <View style={styles.trustDot} />
            <View style={styles.trustItem}>
              <Ionicons name="pricetag-outline" size={16} color="rgba(245,239,230,0.6)" />
              <Text style={styles.trustText}>Make offers</Text>
            </View>
            <View style={styles.trustDot} />
            <View style={styles.trustItem}>
              <Ionicons name="swap-horizontal-outline" size={16} color="rgba(245,239,230,0.6)" />
              <Text style={styles.trustText}>Co-Own trading</Text>
            </View>
          </Reanimated.View>
        </View>

        {/* Inline auth error banner */}
        {authError ? (
          <Reanimated.View
            entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}
            style={styles.errorBanner}
          >
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={styles.errorBannerText}>{authError}</Text>
            <Pressable
              onPress={() => setAuthError(null)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Dismiss error"
            >
              <Ionicons name="close" size={16} color="rgba(245,239,230,0.6)" />
            </Pressable>
          </Reanimated.View>
        ) : null}

        {/* Bottom - CTAs in glass cards */}
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
            >
              <Text style={styles.primaryText}>create account</Text>
            </AnimatedPressable>
          </View>

          <View style={styles.glassCard}>
            <AnimatedPressable
              style={styles.secondaryBtnGlass}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={styles.secondaryText}>i already have an account</Text>
            </AnimatedPressable>
          </View>

          {/* Social login row */}
          <View style={styles.socialRow}>
            <AnimatedPressable
              style={[styles.socialBtn, (!!socialLoading || isMagicLinkLoading) && styles.socialBtnDisabled]}
              activeOpacity={0.8}
              onPress={handleAppleSignIn}
              disabled={!!socialLoading || isMagicLinkLoading}
            >
              {socialLoading === 'apple' ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="logo-apple" size={20} color="#fff" />
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
              >
                {socialLoading === 'google' ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="logo-google" size={18} color="#fff" />
                )}
              </AnimatedPressable>
            ) : null}
          </View>

          {isMagicLinkLoading && (
            <Text style={styles.magicLinkLoadingText}>Signing you in from your email link...</Text>
          )}

          <Text style={styles.termsText}>
            by continuing, you agree to our terms of service and privacy policy.
          </Text>

          {__DEV__ && (
            <AnimatedPressable
              style={styles.devBypassBtn}
              activeOpacity={0.8}
              onPress={() => {
                login({
                  id: 'dev-user-1',
                  username: 'devuser',
                  displayName: 'Dev User',
                  email: 'dev@thryftverse.app',
                  avatar: '',
                  coverPhoto: '',
                  bio: '',
                  emailVerified: true,
                  createdAt: new Date().toISOString(),
                });
                navigation.replace('MainTabs');
              }}
            >
              <Text style={styles.devBypassText}>Dev Bypass (UI Testing)</Text>
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
    paddingTop: Space.sm + 4,
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
    marginBottom: Space.sm + 4,
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
    color: 'rgba(245,239,230,0.6)',
    letterSpacing: 0.2,
  },
  trustDot: {
    width: Space.xs - 1,
    height: Space.xs - 1,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(245,239,230,0.25)',
  },
  footer: {
    paddingHorizontal: Space.lg + 4,
    paddingBottom: Space.sm + 6,
    gap: Space.xs + 2,
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
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Space.md,
    marginTop: Space.xs,
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
    color: 'rgba(255,255,255,0.3)',
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    lineHeight: Type.caption.lineHeight,
    marginTop: Space.xs,
  },
  devBypassBtn: {
    marginTop: Space.sm + 4,
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
