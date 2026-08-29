import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { LottieAnimation, type LottieAnimationSource } from './LottieAnimation';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface AnimatedLoadingStateProps {
  /** Lottie animation source for the loading indicator. When null or not
   *  provided, falls back to a standard ActivityIndicator. */
  animation?: LottieAnimationSource | null;
  /** Optional label shown below the animation. */
  label?: string;
  /** Full-screen mode: centers with a subtle background overlay. Defaults to false. */
  fullScreen?: boolean;
  /** Override the animation size (width/height). Defaults to 120. */
  animationSize?: number;
  /** Style override for the container. */
  style?: StyleProp<ViewStyle>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
/**
 * AnimatedLoadingState — a loading state with a looping Lottie animation.
 *
 * When a Lottie source is provided, it loops continuously at 60+ FPS with
 * hardware acceleration. When no source is available (null or omitted), it
 * falls back to a standard ActivityIndicator — so the component is always
 * safe to render even before designer assets are delivered.
 *
 * Modes:
 *   - Inline (default): sized to its container, no background overlay.
 *   - Full-screen: centered with a subtle surface background, fills the screen.
 *
 * Uses theme colors for the label and fallback spinner.
 */
export function AnimatedLoadingState({
  animation,
  label,
  fullScreen = false,
  animationSize = 120,
  style }: AnimatedLoadingStateProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const hasAnimation = animation !== null && animation !== undefined;

  return (
    <View
      style={[
        styles.container,
        fullScreen && styles.fullScreen,
        style,
      ]}
    >
      {hasAnimation ? (
        <LottieAnimation
          source={animation}
          autoPlay
          loop
          style={styles.animation(animationSize)}
        />
      ) : (
        <ActivityIndicator size="large" color={colors.brand} />
      )}

      {label ? (
        <Text style={styles.label}>{label}</Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

interface LoadingStateStyles {
  container: ViewStyle;
  fullScreen: ViewStyle;
  label: TextStyle;
  animation: (size: number) => ViewStyle;
}

function createStyles(colors: ThemeColors): LoadingStateStyles {
  const staticStyles = StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.xl,
      gap: Space.md },
    fullScreen: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: Space.xl },
    label: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textMuted,
      textAlign: 'center' } });

  return {
    ...staticStyles,
    animation: (size: number): ViewStyle => ({
      width: size,
      height: size }) };
}
