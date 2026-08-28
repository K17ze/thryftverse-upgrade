import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle, TextStyle } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { LottieAnimation, type LottieAnimationSource } from './LottieAnimation';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface AnimatedEmptyStateProps {
  /** Lottie animation source, or null when the asset hasn't been added yet.
   *  When null, a static icon ring is shown as fallback. */
  animation: LottieAnimationSource | null;
  /** Fallback icon when no animation asset is available. */
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
  /** Title — the primary message. */
  title: string;
  /** Subtitle — supporting context. */
  subtitle?: string;
  /** CTA button label. When provided, `onAction` must also be provided. */
  actionLabel?: string;
  /** CTA button press handler. */
  onAction?: () => void;
  /** Override the animation size (width/height). Defaults to 120. */
  animationSize?: number;
  /** Style override for the container. */
  style?: StyleProp<ViewStyle>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
/**
 * AnimatedEmptyState — an empty state with a Lottie animation + title + subtitle
 * + optional CTA.
 *
 * The animation plays once (not looping) — a gentle entrance, then static.
 * When no animation asset is available (null), a static icon ring is shown,
 * matching the existing EmptyState visual language.
 *
 * Layout: centered, animation on top, title below, subtitle below, CTA at bottom.
 * Uses theme colors for all text and surfaces.
 *
 * Replaces static empty states across the app (incremental adoption).
 */
export function AnimatedEmptyState({
  animation,
  fallbackIcon = 'cube-outline',
  title,
  subtitle,
  actionLabel,
  onAction,
  animationSize = 120,
  style,
}: AnimatedEmptyStateProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const enter = reducedMotion ? undefined : FadeIn.duration(300);
  const hasAnimation = animation !== null;
  const hasCta = Boolean(actionLabel && onAction);

  return (
    <View style={[styles.container, style]}>
      {hasAnimation ? (
        <Reanimated.View entering={enter}>
          <LottieAnimation
            source={animation}
            autoPlay
            loop={false}
            style={styles.animation(animationSize)}
          />
        </Reanimated.View>
      ) : (
        <Reanimated.View
          entering={enter}
          style={styles.iconSlot}
        >
          <Ionicons name={fallbackIcon} size={24} color={colors.brand} />
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

      {hasCta ? (
        <Reanimated.View entering={enter}>
          <AnimatedPressable
            style={styles.cta}
            onPress={onAction}
            hapticFeedback="selection"
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
          >
            <Text style={styles.ctaText}>{actionLabel}</Text>
          </AnimatedPressable>
        </Reanimated.View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

interface EmptyStateStyles {
  container: ViewStyle;
  iconSlot: ViewStyle;
  title: TextStyle;
  subtitle: TextStyle;
  cta: ViewStyle;
  ctaText: TextStyle;
  animation: (size: number) => ViewStyle;
}

function createStyles(colors: ThemeColors): EmptyStateStyles {
  const staticStyles = StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.xl + Space.sm,
      paddingVertical: Space.xxl + Space.sm,
      gap: Space.sm + 2,
    },
    iconSlot: {
      alignItems: 'center',
      marginBottom: Space.md,
    },
    title: {
      fontSize: Type.priceList.size,
      fontFamily: Typography.family.bold,
      letterSpacing: -0.2,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      letterSpacing: 0.08,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: Type.body.lineHeight + 1,
      maxWidth: 260,
    },
    cta: {
      marginTop: Space.md + 4,
      backgroundColor: colors.textPrimary,
      paddingHorizontal: Space.xl,
      paddingVertical: Space.md - 2,
      borderRadius: Radius.xxl,
    },
    ctaText: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.bold,
      letterSpacing: 0.3,
      color: colors.background,
    },
  });

  return {
    ...staticStyles,
    animation: (size: number): ViewStyle => ({
      width: size,
      height: size,
      marginBottom: Space.md,
    }),
  };
}
