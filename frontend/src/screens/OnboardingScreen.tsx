import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useStore } from '../store/useStore';
import { track, trackFunnelStep } from '../analytics/track';
import { Space, Radius, FontFamily, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = '@thryftverse_onboarding_complete';

export async function isOnboardingComplete(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function markOnboardingComplete(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
  } catch {
    // Best-effort persistence — the app still functions if storage fails.
  }
}

export default function OnboardingScreen() {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const setHasCompletedOnboarding = useStore((s) => s.setHasCompletedOnboarding);

  const finishOnboarding = useCallback(async () => {
    await markOnboardingComplete();
    setHasCompletedOnboarding(true);
    track('onboarding_completed');
    trackFunnelStep('signup', 'onboarding_completed');
    navigation.replace('Personalisation', { fromOnboarding: true });
  }, [navigation, setHasCompletedOnboarding]);

  const handleContinue = useCallback(() => {
    haptic.success();
    void finishOnboarding();
  }, [haptic, finishOnboarding]);

  const handleSkip = useCallback(() => {
    haptic.light();
    void finishOnboarding();
  }, [haptic, finishOnboarding]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {/* Wordmark — top-left, not centered. Reads as a real product, not a slide. */}
      <Text style={[styles.wordmark, { color: colors.textPrimary }]}>
        ThryftVerse
      </Text>

      {/* Content anchored to the lower third. One statement, one action.
          No carousel, no dots, no icon panels, no proof pills. */}
      <View style={styles.content}>
        <Text
          style={[styles.headline, { color: colors.textPrimary }]}
          accessibilityRole="header"
        >
          Find pieces no one else has.
        </Text>

        <Text style={[styles.sub, { color: colors.textSecondary }]}>
          Curated fashion from independent sellers. Co-own high-value pieces. Bid at live auctions.
        </Text>

        <Pressable
          onPress={handleContinue}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: colors.brand },
            pressed && styles.pressed,
          ]}
          accessibilityLabel="Get started"
          accessibilityHint="Continue to personalisation and start using ThryftVerse"
          accessibilityRole="button"
        >
          <Text style={[styles.ctaText, { color: colors.background }]}>
            Get started
          </Text>
        </Pressable>

        <Pressable
          onPress={handleSkip}
          style={({ pressed }) => [styles.skipLink, pressed && styles.pressed]}
          accessibilityLabel="Skip"
          accessibilityHint="Skip and continue to the app"
          accessibilityRole="button"
        >
          <Text style={[styles.skipText, { color: colors.textMuted }]}>
            Skip
          </Text>
        </Pressable>
      </View>
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
  pressed: {
    opacity: 0.7,
  },
});
