import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Text,
  LayoutChangeEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import {
  Space,
  Type,
  Typography,
  Radius,
  Stroke,
  Control,
} from '../../theme/designTokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useHaptic } from '../../hooks/useHaptic';
import { Motion } from '../../theme/motionTokens';

export type DiscoveryMode = 'discover' | 'pulse' | 'looks';

export interface DiscoveryModeNavProps {
  activeMode: DiscoveryMode;
  onModeChange: (mode: DiscoveryMode) => void;
  /** Optional concise status per mode (e.g., "12 new" for Pulse). Never decorative. */
  modeStatus?: Partial<Record<DiscoveryMode, string>>;
  /** Repeated tap on active mode → scroll-to-top / refresh callback */
  onRepeatTap?: () => void;
  style?: StyleProp<ViewStyle>;
}

const MODES: { value: DiscoveryMode; label: string }[] = [
  { value: 'discover', label: 'Discover' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'looks', label: 'Looks' },
];

/**
 * DiscoveryModeNav — the flagship semantic mode navigation for the Explore
 * surface (Discover / Pulse / Looks).
 *
 * Design intent (AGENTS.md §4, §17, iOS 26 Liquid Glass):
 *   - Content-first, text-only tabs — no icon soup, no decorative chrome.
 *   - Selected state uses a subtle pill background (surfaceAlt) + brand
 *     text colour + semibold weight. Unselected is muted regular weight.
 *   - The pill slides between tabs preserving spatial continuity. Under
 *     Reduce Motion it moves instantly (no spring).
 *   - Compact 44pt touch height per tab (Control.hit).
 *   - Bottom hairline separates the bar from content below.
 *   - The pill uses a flat surfaceAlt fill, not a glass effect — keeping
 *     it readable over any content and consistent with the surface budget.
 *
 * State ownership: this component is presentational. The parent owns
 * `activeMode` and the scroll/data lifecycle of each scene, so switching modes
 * preserves each scene's scroll position independently.
 */
export function DiscoveryModeNav({
  activeMode,
  onModeChange,
  modeStatus,
  onRepeatTap,
  style,
}: DiscoveryModeNavProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const haptic = useHaptic();

  // Indicator geometry — the underline slides between tab positions.
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  const tabLayouts = useRef<Array<{ x: number; width: number }>>([]);
  const hasInitialized = useRef(false);

  // Move the indicator to the active tab. Under reduced motion the move is
  // instant (withTiming duration 0); otherwise a controlled spring with no
  // overshoot (Motion.spring.indicator semantics).
  const moveIndicator = useCallback(
    (index: number) => {
      const layout = tabLayouts.current[index];
      if (!layout) return;
      if (reducedMotion) {
        indicatorX.value = withTiming(layout.x, { duration: 0 });
        indicatorWidth.value = withTiming(layout.width, { duration: 0 });
      } else {
        indicatorX.value = withSpring(layout.x, Motion.spring.indicator);
        indicatorWidth.value = withSpring(layout.width, Motion.spring.indicator);
      }
    },
    [reducedMotion, indicatorX, indicatorWidth]
  );

  useEffect(() => {
    const activeIndex = MODES.findIndex((m) => m.value === activeMode);
    if (activeIndex >= 0) {
      moveIndicator(activeIndex);
    }
  }, [activeMode, moveIndicator]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorWidth.value,
  }));

  const handleTabLayout = (index: number, e: LayoutChangeEvent) => {
    tabLayouts.current[index] = {
      x: e.nativeEvent.layout.x,
      width: e.nativeEvent.layout.width,
    };
    // Set initial indicator position without animation on first layout.
    if (!hasInitialized.current && MODES[index].value === activeMode) {
      indicatorX.value = e.nativeEvent.layout.x;
      indicatorWidth.value = e.nativeEvent.layout.width;
      hasInitialized.current = true;
    }
  };

  const handlePress = (mode: DiscoveryMode) => {
    if (mode === activeMode) {
      // Repeated tap on the active mode → scroll-to-top / refresh.
      onRepeatTap?.();
      return;
    }
    haptic.selection();
    onModeChange(mode);
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, borderBottomColor: colors.border },
        style,
      ]}
      accessibilityRole="tablist"
    >
      <Reanimated.View
        style={[
          styles.indicator,
          { backgroundColor: colors.surfaceAlt },
          indicatorStyle,
        ]}
        pointerEvents="none"
      />
      {MODES.map((mode, index) => {
        const isActive = mode.value === activeMode;
        const status = modeStatus?.[mode.value];
        const labelColor = isActive ? colors.textPrimary : colors.textMuted;
        const fontFamily = isActive
          ? Typography.family.semibold
          : Typography.family.regular;

        return (
          <Pressable
            key={mode.value}
            onLayout={(e) => handleTabLayout(index, e)}
            style={styles.tab}
            onPress={() => handlePress(mode.value)}
            hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={mode.label}
            accessibilityHint={
              isActive
                ? `Active ${mode.label} feed. Tap again to scroll to top.`
                : `Switch to the ${mode.label} feed`
            }
          >
            <Text
              style={[
                styles.label,
                { color: labelColor, fontFamily },
              ]}
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
            >
              {mode.label}
            </Text>
            {status ? (
              <Text
                style={[
                  styles.status,
                  { color: isActive ? colors.brand : colors.textMuted },
                ]}
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
              >
                {status}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderBottomWidth: Stroke.hairline,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    gap: Space.xs,
  },
  tab: {
    flex: 1,
    minHeight: 36,
    paddingVertical: Space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  label: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
  },
  status: {
    marginTop: Space.xxs,
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
  },
  indicator: {
    position: 'absolute',
    top: Space.xs,
    bottom: Space.xs,
    left: Space.md,
    borderRadius: Radius.md,
  },
});
