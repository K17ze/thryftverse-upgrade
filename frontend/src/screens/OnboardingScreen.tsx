import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, {
  FadeOutDown,
  SlideInRight,
  useAnimatedStyle,
  withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Motion } from '../theme/motionTokens';
import { useStore } from '../store/useStore';
import { track, trackFunnelStep } from '../analytics/track';
import { AppButton } from '../components/ui/AppButton';
import { Space, Radius, Control, Stroke, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';

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
  /** Honest qualitative proof — no fabricated metrics. Per §11, we never
   *  invent seller counts or transaction volumes. This is a real, verifiable
   *  claim about how the surface works, not a number. */
  proof: string;
}

const SLIDES: OnboardingSlide[] = [
  {
    icon: 'compass-outline',
    iconBackground: 'discovery',
    title: 'Find pieces no one else has',
    body: 'Curated fashion from independent sellers — hand-listed, never mass-market.',
    proof: 'Every piece is listed by a real seller, not a warehouse.' },
  {
    icon: 'people-outline',
    iconBackground: 'commerceTrust',
    title: 'Own a piece of what you love',
    body: 'Buy units in high-value pieces. Trade them when you are ready — 1% platform fee.',
    proof: 'Start with one unit. Build a portfolio of things you believe in.' },
  {
    icon: 'trophy-outline',
    iconBackground: 'antiqueGold',
    title: 'Win at the price you set',
    body: 'Real-time auctions with live countdowns. You set your max — we bid for you.',
    proof: 'Get notified the moment you are outbid.' },
  {
    icon: 'leaf-outline',
    iconBackground: 'success',
    title: 'Turn your closet into credit',
    body: 'List in minutes, reach buyers who care. Give pre-loved items a second life.',
    proof: 'Keep great fashion out of landfill — one piece at a time.' },
];

interface OnboardingDotProps {
  index: number;
  activeIndex: number;
}

function OnboardingDot({ index, activeIndex }: OnboardingDotProps) {
  const { colors } = useAppTheme();
  const animatedStyle = useAnimatedStyle(() => {
    const isActive = index === activeIndex;
    const width = withTiming(isActive ? 28 : 8, { duration: Motion.duration.slow });
    const opacity = withTiming(isActive ? 1 : 0.32, { duration: Motion.duration.slow });
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
    track('onboarding_completed');
    trackFunnelStep('signup', 'onboarding_completed');
    navigation.replace('Personalisation', { fromOnboarding: true });
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

  // Keyed Reanimated view re-mounts on slide change so the slide transition
  // replays for each slide. Reduced-motion users get instant swaps.
  const slideEnter = reducedMotion
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
          entering={slideEnter}
          exiting={reducedMotion ? FadeOutDown.duration(0) : FadeOutDown.duration(220)}
          style={styles.slideContent}
        >
          {/* Icon — a crafted accent, not the dominant visual anchor.
              Rendered inside a subtle tinted panel that uses the slide's
              semantic color. The panel is restrained — a soft tint, not a
              heavy container — so the headline and proof point carry the
              reading weight, not the icon box. */}
          <View style={[styles.iconPanel, { backgroundColor: resolveAccent(slide.iconBackground) + '15' }]}>
            <Ionicons
              name={slide.icon}
              size={40}
              color={resolveAccent(slide.iconBackground)}
              style={styles.icon}
            />
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
            {slide.title}
          </Text>

          <Text
            style={[styles.body, { color: colors.textSecondary }]}
            maxFontSizeMultiplier={1.4}
          >
            {slide.body}
          </Text>

          {/* Proof point — honest qualitative evidence, not a fabricated
              metric. Per §11, no invented seller counts or transaction
              volumes. This is a real, verifiable claim about the surface. */}
          <View style={[styles.proofRow, { borderColor: resolveAccent(slide.iconBackground) + '30' }]}>
            <Ionicons
              name="checkmark"
              size={14}
              color={resolveAccent(slide.iconBackground)}
            />
            <Text
              style={[styles.proofText, { color: colors.textPrimary }]}
              maxFontSizeMultiplier={1.3}
            >
              {slide.proof}
            </Text>
          </View>
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
    flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    minHeight: Control.hit },
  backTarget: {
    minHeight: Control.hit,
    minWidth: Control.hit,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingHorizontal: Space.sm },
  stepEyebrow: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: LetterSpacing.caps,
    textTransform: 'uppercase' },
  skipTarget: {
    minHeight: Control.hit,
    minWidth: Control.hit,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: Space.sm },
  skipText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  contentWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.xl },
  slideContent: {
    alignItems: 'center',
    width: '100%' },
  iconPanel: {
    width: Space.xxl + Space.lg,
    height: Space.xxl + Space.lg,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.lg },
  icon: {
    marginBottom: 0 },
  title: {
    fontSize: TypographyV2.screenTitle.size,
    lineHeight: TypographyV2.screenTitle.lineHeight,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    letterSpacing: TypographyV2.screenTitle.letterSpacing,
    textAlign: 'center',
    marginBottom: Space.md },
  body: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + 4,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: Space.lg },
  proofRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    maxWidth: 320 },
  proofText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  footer: {
    paddingHorizontal: Space.lg,
    paddingBottom: Space.lg,
    gap: Space.lg },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 2,
    height: Space.sm + Space.xs },
  primaryAction: {
    width: '100%' } });
