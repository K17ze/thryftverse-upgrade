import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, {
  FadeInDown,
  FadeOutDown,
  SlideInRight,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useStore } from '../store/useStore';
import { AppButton } from '../components/ui/AppButton';
import { Space, Radius, Type, Typography, Control, Stroke, LetterSpacing } from '../theme/designTokens';

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

interface OnboardingSlide {
  icon: keyof typeof Ionicons.glyphMap;
  iconBackground: string;
  title: string;
  body: string;
}

const SLIDES: OnboardingSlide[] = [
  {
    icon: 'compass-outline',
    iconBackground: 'discovery',
    title: 'Discover unique pieces',
    body: 'Browse curated fashion from independent sellers and creators. Every piece is hand-listed — no mass-market noise, just the good stuff.',
  },
  {
    icon: 'people-outline',
    iconBackground: 'commerceTrust',
    title: 'Co-Own what you love',
    body: 'Fractional ownership for high-value items. Buy units in pieces you believe in, trade them on the open market, and build a portfolio of things you genuinely love.',
  },
  {
    icon: 'trophy-outline',
    iconBackground: 'antiqueGold',
    title: 'Bid on live auctions',
    body: 'Real-time auction excitement. Place bids as the clock counts down, get notified the moment you are outbid, and win pieces at the price you set.',
  },
  {
    icon: 'leaf-outline',
    iconBackground: 'success',
    title: 'Sell sustainably',
    body: 'Give pre-loved items a second life. List in minutes, reach buyers who care, and keep great fashion out of landfill — one piece at a time.',
  },
];

interface OnboardingDotProps {
  index: number;
  activeIndex: number;
}

function OnboardingDot({ index, activeIndex }: OnboardingDotProps) {
  const { colors } = useAppTheme();
  const animatedStyle = useAnimatedStyle(() => {
    const isActive = index === activeIndex;
    const width = withTiming(isActive ? 28 : 8, { duration: 280 });
    const opacity = withTiming(isActive ? 1 : 0.32, { duration: 280 });
    return { width, opacity };
  });

  return (
    <Reanimated.View
      style={[
        animatedStyle,
        { backgroundColor: colors.textPrimary, borderRadius: Radius.full, height: 8 },
      ]}
    />
  );
}

export default function OnboardingScreen() {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const setHasCompletedOnboarding = useStore((s) => s.setHasCompletedOnboarding);
  const [currentIndex, setCurrentIndex] = useState(0);
  const isLastSlide = currentIndex === SLIDES.length - 1;
  const slide = SLIDES[currentIndex];

  const finishOnboarding = useCallback(async () => {
    await markOnboardingComplete();
    setHasCompletedOnboarding(true);
    // Navigate to the auth entry point — the app's normal first-run destination.
    navigation.replace('AuthLanding');
  }, [navigation, setHasCompletedOnboarding]);

  const goNext = useCallback(() => {
    haptic.patterns.tabSwitch();
    if (isLastSlide) {
      void finishOnboarding();
    } else {
      setCurrentIndex((i) => Math.min(i + 1, SLIDES.length - 1));
    }
  }, [haptic, isLastSlide, finishOnboarding]);

  const goSkip = useCallback(() => {
    haptic.patterns.toggle();
    void finishOnboarding();
  }, [haptic, finishOnboarding]);

  const goBack = useCallback(() => {
    haptic.patterns.tabSwitch();
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, [haptic]);

  // Animated dots indicator — the active dot widens as the user advances.
  // Each dot is a dedicated component so useAnimatedStyle is called once
  // per dot (rules-of-hooks safe), not inside a .map() callback.

  // Icon background resolves the semantic color name from the theme palette.
  const resolveAccent = (key: string): string => {
    switch (key) {
      case 'discovery':
        return colors.discovery;
      case 'commerceTrust':
        return colors.commerceTrust;
      case 'antiqueGold':
        return colors.antiqueGold;
      case 'success':
        return colors.success;
      default:
        return colors.brand;
    }
  };

  // Keyed Reanimated view re-mounts on slide change so the entering/exit
  // transitions replay for each slide — FadeInDown for the icon + title,
  // a slide for the body copy. Reduced-motion users get instant swaps.
  const enterVariant = reducedMotion
    ? FadeInDown.duration(0)
    : FadeInDown.springify().damping(18).stiffness(180);
  const bodyEnter = reducedMotion
    ? SlideInRight.duration(0)
    : SlideInRight.springify().damping(20).stiffness(200);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {/* Top bar — Back control (left, transparent 44pt) + Skip (right).
          A visible Back control reduces commitment anxiety
          (§27.1 behavioral). Users know they can revisit previous slides
          without losing context. The step eyebrow gives immediate
          position context ("01 / 04") so users know how much remains. */}
      <View style={styles.topBar}>
        {currentIndex > 0 ? (
          <Pressable
            onPress={goBack}
            hitSlop={Control.hit / 2}
            accessibilityRole="button"
            accessibilityLabel="Previous slide"
            accessibilityHint="Go back to the previous introduction slide"
            style={styles.backTarget}
          >
            <Ionicons name="arrow-back" size={Control.icon} color={colors.textPrimary} />
          </Pressable>
        ) : (
          <View style={styles.backTarget} />
        )}
        <Text style={[styles.stepEyebrow, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>
          {String(currentIndex + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}
        </Text>
        <Pressable
          onPress={goSkip}
          hitSlop={Control.hit / 2}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
          accessibilityHint="Skip the introduction and continue to the app"
          style={styles.skipTarget}
        >
          <Text style={[styles.skipText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>Skip</Text>
        </Pressable>
      </View>

      <View style={styles.contentWrap}>
        {/* Slide illustration + copy. Keyed by index so Reanimated replays
            the enter/exit transition on every slide change. */}
        <Reanimated.View
          key={`slide-${currentIndex}`}
          entering={enterVariant}
          exiting={reducedMotion ? FadeOutDown.duration(0) : FadeOutDown.duration(220)}
          style={styles.slideContent}
        >
          {/* Icon — the dominant visual anchor for each slide.
              Rendered inside a subtle tinted panel that uses the slide's
              semantic color. Color-coded
              icon panels create immediate visual differentiation between
              slides, aiding recall and orientation. The panel is
              restrained — a soft tint, not a heavy container. */}
          <View style={[styles.iconPanel, { backgroundColor: resolveAccent(slide.iconBackground) + '15' }]}>
            <Ionicons
              name={slide.icon}
              size={56}
              color={resolveAccent(slide.iconBackground)}
              style={styles.icon}
            />
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
            {slide.title}
          </Text>

          <Reanimated.Text
            entering={bodyEnter}
            style={[styles.body, { color: colors.textSecondary }]}
            maxFontSizeMultiplier={1.4}
          >
            {slide.body}
          </Reanimated.Text>
        </Reanimated.View>
      </View>

      {/* Footer: dots indicator + primary action. One dominant panel, flat. */}
      <View style={styles.footer}>
        <View
          style={styles.dotsRow}
          accessibilityRole="tablist"
          accessibilityLabel={`Slide ${currentIndex + 1} of ${SLIDES.length}`}
        >
          {SLIDES.map((_, i) => (
            <OnboardingDot key={`dot-${i}`} index={i} activeIndex={currentIndex} />
          ))}
        </View>

        <AppButton
          title={isLastSlide ? 'Get started' : 'Next'}
          onPress={goNext}
          variant="primary"
          size="lg"
          hapticFeedback="none"
          trailingIcon={
            <Ionicons
              name={isLastSlide ? 'arrow-forward' : 'chevron-forward'}
              size={20}
              color={colors.background}
            />
          }
          style={styles.primaryAction}
          accessibilityLabel={isLastSlide ? 'Get started' : 'Next slide'}
          accessibilityHint={
            isLastSlide
              ? 'Finish onboarding and continue to the app'
              : 'Advance to the next introduction slide'
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    minHeight: Control.hit,
  },
  backTarget: {
    minHeight: Control.hit,
    minWidth: Control.hit,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingHorizontal: Space.sm,
  },
  stepEyebrow: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: LetterSpacing.caps,
    textTransform: 'uppercase',
  },
  skipTarget: {
    minHeight: Control.hit,
    minWidth: Control.hit,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: Space.sm,
  },
  skipText: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  contentWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.xl,
  },
  slideContent: {
    alignItems: 'center',
    width: '100%',
  },
  iconPanel: {
    width: Space.xxl + Space.xxl + Space.lg,
    height: Space.xxl + Space.xxl + Space.lg,
    borderRadius: Radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.xl,
  },
  icon: {
    marginBottom: 0,
  },
  title: {
    fontSize: Type.title.size,
    lineHeight: Type.title.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.title.letterSpacing,
    textAlign: 'center',
    marginBottom: Space.md,
  },
  body: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight + 4,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
    textAlign: 'center',
    maxWidth: 320,
  },
  footer: {
    paddingHorizontal: Space.lg,
    paddingBottom: Space.lg,
    gap: Space.lg,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 2,
    height: Space.sm + Space.xs,
  },
  primaryAction: {
    width: '100%',
  },
});
