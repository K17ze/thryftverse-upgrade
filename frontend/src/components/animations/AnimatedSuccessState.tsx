import React, { useCallback } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle, TextStyle } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { LottieAnimation, type LottieAnimationSource } from './LottieAnimation';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface AnimatedSuccessStateProps {
  /** Lottie animation source for the success celebration (checkmark, confetti,
   *  etc.). When null or not provided, a static checkmark icon is shown. */
  animation?: LottieAnimationSource | null;
  /** Title — the success message (e.g. "Offer accepted!"). */
  title: string;
  /** Subtitle — supporting context (e.g. "The seller will ship within 3 days."). */
  subtitle?: string;
  /** Called when the one-shot animation finishes (not cancelled). For the
   *  static fallback, called immediately on mount. */
  onComplete?: () => void;
  /** Override the animation size (width/height). Defaults to 140. */
  animationSize?: number;
  /** Style override for the container. */
  style?: StyleProp<ViewStyle>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
/**
 * AnimatedSuccessState — a success state with a one-shot Lottie animation.
 *
 * Plays once, then calls `onComplete` when the animation finishes naturally
 * (not cancelled). Used for celebratory moments: offer accepted, payment
 * completed, listing published, etc.
 *
 * When no animation asset is available (null or omitted), a static checkmark
 * icon in the theme's success color is shown, and `onComplete` is called
 * immediately on mount so navigation/flow logic still fires.
 *
 * Uses the theme's `success` color for the fallback icon ring.
 */
export function AnimatedSuccessState({
  animation,
  title,
  subtitle,
  onComplete,
  animationSize = 140,
  style }: AnimatedSuccessStateProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const enter = reducedMotion ? undefined : FadeIn.duration(300);
  const hasAnimation = animation !== null && animation !== undefined;

  const handleAnimationFinish = useCallback(
    (isCancelled: boolean) => {
      if (!isCancelled && onComplete) {
        onComplete();
      }
    },
    [onComplete],
  );

  // For the static fallback, fire onComplete on mount so flow logic still runs.
  React.useEffect(() => {
    if (!hasAnimation && onComplete) {
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.container, style]}>
      {hasAnimation ? (
        <Reanimated.View entering={enter}>
          <LottieAnimation
            source={animation}
            autoPlay
            loop={false}
            style={styles.animation(animationSize)}
            onAnimationFinish={handleAnimationFinish}
          />
        </Reanimated.View>
      ) : (
        <Reanimated.View
          entering={enter}
          style={styles.iconSlot}
        >
          <Ionicons name="checkmark" size={32} color={colors.success} />
        </Reanimated.View>
      )}

      <Reanimated.Text
        entering={enter}
        style={styles.title}
      >
        {title}
      </Reanimated.Text>

      {subtitle ? (
        <Reanimated.Text
          entering={enter}
          style={styles.subtitle}
        >
          {subtitle}
        </Reanimated.Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

interface SuccessStateStyles {
  container: ViewStyle;
  iconSlot: ViewStyle;
  title: TextStyle;
  subtitle: TextStyle;
  animation: (size: number) => ViewStyle;
}

function createStyles(colors: ThemeColors): SuccessStateStyles {
  const staticStyles = StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.xl + Space.sm,
      paddingVertical: Space.xxl + Space.sm,
      gap: Space.sm + 2 },
    iconSlot: {
      alignItems: 'center',
      marginBottom: Space.md },
    title: {
      fontSize: TypographyV2.priceList.size,
      fontFamily: TypographyV2.priceList.fontFamily,
      letterSpacing: -0.2,
      color: colors.textPrimary,
      textAlign: 'center' },
    subtitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: 0.08,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: TypographyV2.body.lineHeight + 1,
      maxWidth: 280 } });

  return {
    ...staticStyles,
    animation: (size: number): ViewStyle => ({
      width: size,
      height: size,
      marginBottom: Space.md }) };
}
