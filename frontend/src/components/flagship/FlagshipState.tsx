import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle, DimensionValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
  FadeIn,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';

import { Space, Radius, Type, Typography, IconGrammar, Stroke} from '../../theme/designTokens';
import { Motion } from '../../theme/motionTokens';

export interface FlagshipStateProps {
  variant: 'loading' | 'empty' | 'error' | 'offline' | 'unavailable';
  title?: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Optional secondary action (e.g. "Go back") shown below the primary. */
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

const DEFAULT_TITLES: Record<string, string> = {
  loading: 'Loading',
  empty: 'Nothing here yet',
  error: 'Something went wrong',
  offline: 'You are offline',
  unavailable: 'Not available',
};

const DEFAULT_SUBTITLES: Record<string, string> = {
  loading: 'One moment while we get this ready.',
  empty: 'When content appears, you\'ll see it here.',
  error: 'We could not load this. Tap below to try again.',
  offline: 'Check your connection and try again.',
  unavailable: 'This feature is not available right now.',
};

const DEFAULT_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  loading: 'sync-outline',
  empty: 'cube-outline',
  error: 'alert-circle-outline',
  offline: 'cloud-offline-outline',
  unavailable: 'lock-closed-outline',
};

const AnimatedLinearGradient = Reanimated.createAnimatedComponent(LinearGradient);

/**
 * FlagshipState — the canonical loading / empty / error / offline / unavailable
 * surface for ThryftVerse.
 *
 * Design principles (AGENTS §14, §27.4):
 *   - loading uses a skeleton-style shimmer, not a generic centred spinner;
 *   - empty/error/offline get a restrained icon circle, clear title, helpful
 *     subtitle, and a recovery action with the correct haptic level;
 *   - error/offline retry fires a medium haptic (action commit);
 *   - reduced motion collapses the shimmer to a static placeholder.
 */
export function FlagshipState({
  variant,
  title,
  subtitle,
  actionLabel,
  onAction,
  icon,
  secondaryActionLabel,
  onSecondaryAction,
  style,
}: FlagshipStateProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotionEnabled = useReducedMotion();

  // ── Loading: skeleton shimmer instead of a generic spinner ──────────────
  if (variant === 'loading') {
    return (
      <View style={[styles.center, style]} accessibilityLiveRegion="polite">
        <LoadingShimmer colors={colors} reduced={reducedMotionEnabled} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>
          {title ?? DEFAULT_TITLES.loading}
        </Text>
        {subtitle ? (
          <Text style={[styles.loadingSub, { color: colors.textMuted }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    );
  }

  const effectiveIcon = icon ?? DEFAULT_ICONS[variant];
  const isErrorish = variant === 'error' || variant === 'offline';

  const handleAction = () => {
    // Recovery actions commit a real retry — medium haptic per AGENTS §13.
    if (isErrorish) {
      haptic.medium();
    } else {
      haptic.light();
    }
    onAction?.();
  };

  const handleSecondary = () => {
    haptic.light();
    onSecondaryAction?.();
  };

  const enter = reducedMotionEnabled ? undefined : FadeIn.duration(Motion.transitions.listItem.duration);

  return (
    <Reanimated.View
      entering={enter}
      style={[styles.center, style]}
      accessibilityLiveRegion={isErrorish ? 'assertive' : 'polite'}
    >
      <Reanimated.View
        entering={enter}
        style={styles.iconSlot}
      >
        <Ionicons
          name={effectiveIcon}
          size={IconGrammar.hero}
          color={isErrorish ? colors.danger : colors.textMuted}
        />
      </Reanimated.View>
      <Reanimated.Text
        entering={enter}
        style={[styles.title, { color: colors.textPrimary }]}
      >
        {title ?? DEFAULT_TITLES[variant]}
      </Reanimated.Text>
      <Reanimated.Text
        entering={enter}
        style={[styles.subtitle, { color: colors.textSecondary }]}
      >
        {subtitle ?? DEFAULT_SUBTITLES[variant]}
      </Reanimated.Text>
      {actionLabel && onAction && (
        <Reanimated.View entering={enter}>
          <AnimatedPressable
            onPress={handleAction}
            scaleValue={0.97}
            hapticFeedback="none"
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            accessibilityHint={isErrorish ? 'Tries loading this again' : undefined}
            style={[styles.actionBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
          >
            <Text style={[styles.actionText, { color: colors.textPrimary }]}>{actionLabel}</Text>
          </AnimatedPressable>
        </Reanimated.View>
      )}
      {secondaryActionLabel && onSecondaryAction && (
        <Reanimated.View entering={enter}>
          <AnimatedPressable
            onPress={handleSecondary}
            scaleValue={0.98}
            hapticFeedback="none"
            accessibilityRole="button"
            accessibilityLabel={secondaryActionLabel}
            style={styles.secondaryBtn}
          >
            <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>
              {secondaryActionLabel}
            </Text>
          </AnimatedPressable>
        </Reanimated.View>
      )}
    </Reanimated.View>
  );
}

// ── Loading shimmer ──────────────────────────────────────────────────────────
// A compact skeleton-style indicator: three stacked shimmering bars that
// resemble a loading content block. Replaces the generic ActivityIndicator
// per AGENTS §14 ("Do not use a generic centred spinner for every state")
// and §27.4 (flagship loading = skeleton matching final silhouette + shimmer).
//
// ShimmerBar is extracted as a memoized component so the inline style objects
// that the old `bar()` closure created on every render are eliminated
// (research doc §5: "561 inline style objects … each is a potential re-render
// trigger on a memoized child").
const ShimmerBar = React.memo(function ShimmerBar({
  width,
  height,
  borderRadius,
  marginTop,
  surfaceColor,
  reduced,
  shimmerStyle,
}: {
  width: DimensionValue;
  height: number;
  borderRadius: number;
  marginTop: number;
  surfaceColor: string;
  reduced: boolean;
  shimmerStyle: ReturnType<typeof useAnimatedStyle>;
}) {
  return (
    <View
      style={[
        shimmerBarStyles.base,
        {
          width,
          height,
          borderRadius,
          backgroundColor: surfaceColor,
          marginTop,
        },
      ]}
    >
      {reduced ? null : (
        <Reanimated.View style={[StyleSheet.absoluteFill, shimmerStyle]}>
          <AnimatedLinearGradient
            colors={['transparent', 'rgba(255,255,255,0.06)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[StyleSheet.absoluteFill, shimmerBarStyles.gradient]}
          />
        </Reanimated.View>
      )}
    </View>
  );
});

function LoadingShimmer({
  colors,
  reduced,
}: {
  colors: ReturnType<typeof useAppTheme>['colors'];
  reduced: boolean;
}) {
  const shimmerX = useSharedValue(-1);

  React.useEffect(() => {
    if (reduced) {
      cancelAnimation(shimmerX);
      shimmerX.value = -1;
      return;
    }
    shimmerX.value = withRepeat(
      withSequence(
        withTiming(1, { duration: Motion.transitions.shimmer.duration, easing: Easing.inOut(Easing.ease) }),
        withTiming(-1, { duration: 0 })
      ),
      -1,
      false
    );
  }, [reduced, shimmerX]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value * 120 }],
  }));

  return (
    <View style={styles.shimmerBlock}>
      <View style={[styles.shimmerGlyph, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name="cube-outline" size={22} color={colors.textMuted} />
      </View>
      <ShimmerBar
        width="55%"
        height={12}
        borderRadius={Radius.sm}
        marginTop={12}
        surfaceColor={colors.surfaceAlt}
        reduced={reduced}
        shimmerStyle={shimmerStyle}
      />
      <ShimmerBar
        width="80%"
        height={10}
        borderRadius={Radius.sm}
        marginTop={8}
        surfaceColor={colors.surfaceAlt}
        reduced={reduced}
        shimmerStyle={shimmerStyle}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl,
    paddingHorizontal: Space.md,
  },
  loadingText: {
    marginTop: Space.md,
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  loadingSub: {
    marginTop: Space.xs,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
    textAlign: 'center',
  },
  shimmerBlock: {
    alignItems: 'center',
    width: 180,
  },
  shimmerGlyph: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlot: {
    alignItems: 'center',
    marginBottom: Space.md,
  },
  title: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    textAlign: 'center',
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
    marginBottom: Space.xs,
  },
  subtitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
    marginBottom: Space.md,
    maxWidth: 280,
  },
  actionBtn: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.smMd,
    borderRadius: Radius.xl,
    borderWidth: Stroke.standard,
  },
  actionText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  secondaryBtn: {
    marginTop: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
  secondaryText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.caption.letterSpacing,
  },
});

const shimmerBarStyles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
  gradient: {
    width: 240,
  },
});
