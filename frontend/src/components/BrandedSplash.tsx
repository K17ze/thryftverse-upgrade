import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Reanimated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing } from 'react-native-reanimated';
import { Typography, Space } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { Motion } from '../theme/motionTokens';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface BrandedSplashProps {
  onFinish: () => void;
}

const WORDMARK = 'THRYFTVERSE';

export function BrandedSplash({ onFinish }: BrandedSplashProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const reducedMotionEnabled = useReducedMotion();
  const pulse = useSharedValue(1);

  React.useEffect(() => {
    if (reducedMotionEnabled) {
      pulse.value = 1;
      const reducedTimeoutId = setTimeout(onFinish, 700);
      return () => clearTimeout(reducedTimeoutId);
    }

    pulse.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: Motion.duration.crawl, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: Motion.duration.crawl, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    const timeoutId = setTimeout(onFinish, 1900);
    return () => clearTimeout(timeoutId);
  }, [onFinish, pulse, reducedMotionEnabled]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }] }));

  const wrapperEnterAnimation = reducedMotionEnabled ? undefined : FadeIn.duration(Motion.duration.slow);
  const taglineEnterAnimation = reducedMotionEnabled ? undefined : FadeIn.delay(520).duration(Motion.duration.slower);

  return (
    <View style={styles.container}>
      <Reanimated.View style={[styles.centerWrap, pulseStyle]} entering={wrapperEnterAnimation}>
        <View style={styles.brandRow}>
          {WORDMARK.split('').map((letter, index) => (
            <Text
              key={`${letter}_${index}`}
              style={styles.brandLetter}
            >
              {letter}
            </Text>
          ))}
        </View>
        <Reanimated.Text entering={taglineEnterAnimation} style={styles.tagline}>
          Resale meets investment
        </Reanimated.Text>
      </Reanimated.View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center' },
  centerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.lg },
  brandRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 2 },
  brandLetter: {
    color: colors.textPrimary,
    fontFamily: Typography.family.bold,
    fontSize: TypographyV2.display.size,
    letterSpacing: 0.42 },
  tagline: {
    marginTop: 14,
    color: colors.brand,
    fontFamily: TypographyV2.display.fontFamily,
    fontSize: TypographyV2.meta.size,
    letterSpacing: 0.22 } });
}
