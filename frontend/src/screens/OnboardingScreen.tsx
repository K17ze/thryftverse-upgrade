import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useConnectivity } from '../hooks/useConnectivity';
import { useStore } from '../store/useStore';
import { track, trackFunnelStep } from '../analytics/track';
import { Space, Radius, FontFamily, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { OfflineBanner } from '../components/OfflineBanner';
import { requestPushPermissionWithContext } from '../lib/pushPermission';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Onboarding completion is owned by the persisted store flag
 * (`hasCompletedOnboarding` in useStore — backed by synchronous MMKV storage,
 * so it is already hydrated when the navigator reads it). This AsyncStorage
 * key is a leftover write from builds that dual-wrote completion; it is read
 * once below to migrate those installs into the store, then removed.
 */
const LEGACY_ONBOARDING_KEY = '@thryftverse_onboarding_complete';

export async function isOnboardingComplete(): Promise<boolean> {
  if (useStore.getState().hasCompletedOnboarding) {
    return true;
  }
  try {
    const legacy = await AsyncStorage.getItem(LEGACY_ONBOARDING_KEY);
    if (legacy !== 'true') {
      return false;
    }
    // Migrate the legacy flag into the store — the single owner — and drop
    // the old key so the two sources cannot diverge again.
    useStore.getState().setHasCompletedOnboarding(true);
    void AsyncStorage.removeItem(LEGACY_ONBOARDING_KEY).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export function markOnboardingComplete(): void {
  useStore.getState().setHasCompletedOnboarding(true);
}

export default function OnboardingScreen() {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isOffline } = useConnectivity();

  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const finishOnboarding = useCallback(() => {
    markOnboardingComplete();
    track('onboarding_completed');
    trackFunnelStep('signup', 'onboarding_completed');
    navigation.replace('Personalisation', { fromOnboarding: true });
  }, [navigation]);

  const handleContinue = useCallback(async () => {
    haptic.success();
    setIsRequestingPermission(true);
    try {
      const granted = await requestPushPermissionWithContext('settings');
      setIsRequestingPermission(false);
      if (granted) {
        finishOnboarding();
      } else {
        setPermissionDenied(true);
      }
    } catch {
      setIsRequestingPermission(false);
      setPermissionDenied(true);
    }
  }, [haptic, finishOnboarding]);

  const handleSkip = useCallback(() => {
    haptic.light();
    finishOnboarding();
  }, [haptic, finishOnboarding]);

  const handleContinueWithout = useCallback(() => {
    haptic.light();
    finishOnboarding();
  }, [haptic, finishOnboarding]);

  const handleRetryPermission = useCallback(() => {
    haptic.medium();
    setPermissionDenied(false);
  }, [haptic]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <Text
        style={[styles.wordmark, { color: colors.textPrimary }]}
        maxFontSizeMultiplier={1.3}
      >
        ThryftVerse
      </Text>

      {isOffline && (
        <View style={styles.bannerWrap}>
          <OfflineBanner message="You're offline. Onboarding continues, but some features may be limited." />
        </View>
      )}

      {permissionDenied ? (
        <View style={styles.content}>
          <Text
            style={[styles.headline, { color: colors.textPrimary }]}
            accessibilityRole="header"
            maxFontSizeMultiplier={1.3}
          >
            Notifications off
          </Text>

          <Text
            style={[styles.sub, { color: colors.textSecondary }]}
            maxFontSizeMultiplier={1.5}
          >
            You'll miss order updates and auction alerts. Enable them later in Settings.
          </Text>

          <AnimatedPressable
            onPress={handleContinueWithout}
            style={[styles.cta, { backgroundColor: colors.brand }]}
            scaleValue={0.97}
            hapticFeedback="light"
            accessibilityLabel="Continue without notifications"
            accessibilityHint="Finish onboarding without push notifications"
            accessibilityRole="button"
          >
            <Text style={[styles.ctaText, { color: colors.background }]} maxFontSizeMultiplier={1.5}>
              Continue without
            </Text>
          </AnimatedPressable>

          <AnimatedPressable
            onPress={handleRetryPermission}
            style={styles.skipLink}
            scaleValue={0.98}
            hapticFeedback="light"
            accessibilityLabel="Try enabling notifications again"
            accessibilityHint="Retry the notifications permission request"
            accessibilityRole="button"
          >
            <Text style={[styles.skipText, { color: colors.textMuted }]} maxFontSizeMultiplier={1.5}>
              Try again
            </Text>
          </AnimatedPressable>
        </View>
      ) : (
        <View style={styles.content}>
          <Text
            style={[styles.headline, { color: colors.textPrimary }]}
            accessibilityRole="header"
            maxFontSizeMultiplier={1.3}
          >
            Find pieces no one else has.
          </Text>

          <Text
            style={[styles.sub, { color: colors.textSecondary }]}
            maxFontSizeMultiplier={1.5}
          >
            Curated fashion from independent sellers. Co-own high-value pieces. Bid at live auctions.
          </Text>

          <AnimatedPressable
            onPress={handleContinue}
            disabled={isRequestingPermission}
            style={[styles.cta, { backgroundColor: colors.brand }]}
            scaleValue={0.97}
            hapticFeedback="light"
            accessibilityLabel="Get started"
            accessibilityHint="Continue to personalisation and start using ThryftVerse"
            accessibilityRole="button"
          >
            {isRequestingPermission ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Text style={[styles.ctaText, { color: colors.background }]} maxFontSizeMultiplier={1.5}>
                Get started
              </Text>
            )}
          </AnimatedPressable>

          <AnimatedPressable
            onPress={handleSkip}
            style={styles.skipLink}
            scaleValue={0.98}
            hapticFeedback="light"
            accessibilityLabel="Skip"
            accessibilityHint="Skip and continue to the app"
            accessibilityRole="button"
          >
            <Text style={[styles.skipText, { color: colors.textMuted }]} maxFontSizeMultiplier={1.5}>
              Skip
            </Text>
          </AnimatedPressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: Space.lg,
  },
  wordmark: {
    fontFamily: FontFamily.bold,
    fontSize: TypographyV2.bodyStrong.size,
    letterSpacing: LetterSpacing.tight,
    paddingTop: Space.xxl,
  },
  bannerWrap: {
    marginTop: Space.md,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: Space.xxl + Space.lg,
  },
  headline: {
    fontFamily: FontFamily.bold,
    fontSize: TypographyV2.display.size + 4,
    lineHeight: TypographyV2.display.lineHeight + 4,
    letterSpacing: LetterSpacing.tight,
    marginBottom: Space.md,
    maxWidth: 320,
  },
  sub: {
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + 4,
    marginBottom: Space.xxl,
    maxWidth: 300,
  },
  cta: {
    height: 52,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.md,
  },
  ctaText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size,
  },
  skipLink: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: {
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.body.size,
  },
});
