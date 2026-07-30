import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useAnimatedStyle,
  useAnimatedReaction,
  interpolate,
  Extrapolation,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Typography } from '../../../theme/designTokens';
import { useReducedMotion } from '../../../hooks/useReducedMotion';

/**
 * Collapsed detail header — appears as the user scrolls past the hero.
 *
 * Quiet glyph hit targets, no large rounded-square containers. The
 * title fades in only when there is enough header height to display it
 * without overlapping the back chevron. Background opacity tracks the
 * scroll so the header blends with the page until it is needed.
 */
export interface CommerceDetailHeaderProps {
  scrollY: SharedValue<number>;
  /** Scroll offset at which the header reaches full opacity. */
  fadeThreshold?: number;
  title?: string;
  onBack: () => void;
  /** Optional right-side action (e.g. overflow). Rendered as a quiet glyph. */
  rightAction?: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
  };
}

export function CommerceDetailHeader({
  scrollY,
  fadeThreshold = 220,
  title,
  onBack,
  rightAction,
}: CommerceDetailHeaderProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [interactive, setInteractive] = React.useState(false);

  useAnimatedReaction(
    () => scrollY.value >= fadeThreshold * 0.6,
    (next, previous) => {
      if (next !== previous) {
        runOnJS(setInteractive)(next);
      }
    },
    [fadeThreshold],
  );

  const containerStyle = useAnimatedStyle(() => {
    // Establish the solid navigation surface before its compact title enters.
    // This cleanly masks hero badges as they scroll beneath the status bar.
    const opacity = interpolate(
      scrollY.value,
      [fadeThreshold * 0.12, fadeThreshold * 0.6],
      [0, 1],
      Extrapolation.CLAMP,
    );
    // Subtle translate so the header settles into place rather than
    // appearing abruptly. Per spec 05 §7: native motion is restrained.
    const translateY = interpolate(scrollY.value, [0, fadeThreshold], [8, 0], Extrapolation.CLAMP);
    const revealedOpacity = reducedMotion ? 1 : opacity;
    return {
      opacity: reducedMotion && scrollY.value < fadeThreshold ? 0 : revealedOpacity,
      transform: [{ translateY: reducedMotion ? 0 : translateY }],
    };
  });

  const titleStyle = useAnimatedStyle(() => {
    // Title appears slightly after the header background so it never
    // floats over a transparent header.
    const opacity = interpolate(
      scrollY.value,
      [fadeThreshold * 0.72, fadeThreshold],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: reducedMotion ? (scrollY.value >= fadeThreshold ? 1 : 0) : opacity,
    };
  });

  return (
    <Reanimated.View
      pointerEvents={interactive ? 'auto' : 'none'}
      accessibilityElementsHidden={!interactive}
      importantForAccessibility={interactive ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.container,
        { paddingTop: Math.max(insets.top, Space.sm), backgroundColor: colors.header },
        containerStyle,
        styles.border,
      ]}
    >
      <View style={styles.row}>
        <Pressable
          onPress={onBack}
          hitSlop={12}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          style={styles.hitTarget}
        >
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>

        {title ? (
          <Reanimated.Text
            style={[styles.title, { color: colors.textPrimary }]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {title}
          </Reanimated.Text>
        ) : (
          <View style={styles.titleSpacer} />
        )}

        {rightAction ? (
          <Pressable
            onPress={rightAction.onPress}
            hitSlop={12}
            accessibilityLabel={rightAction.label}
            accessibilityRole="button"
            style={styles.hitTarget}
          >
            <Ionicons name={rightAction.icon} size={22} color={colors.textPrimary} />
          </Pressable>
        ) : (
          <View style={styles.hitTarget} />
        )}
      </View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  border: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
  },
  hitTarget: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
    marginHorizontal: Space.xs,
  },
  titleSpacer: {
    flex: 1,
  },
});
