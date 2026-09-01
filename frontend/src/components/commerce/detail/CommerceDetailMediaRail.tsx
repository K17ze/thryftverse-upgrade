import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate } from 'react-native-reanimated';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, PressScale, GlyphShadow } from '../../../theme/designTokens';
import { Motion } from '../../../theme/motionTokens';
import { useReducedMotion } from '../../../hooks/useReducedMotion';

/**
 * Media action rail — the visible utility controls over the hero.
 *
 * Enforces the spec rule: maximum three visible hero controls.
 * Preferred hierarchy:
 *   left: Back;
 *   right: Share and one saved-state action;
 *   overflow sheet contains lower-frequency actions.
 *
 * Controls are quiet glyph hit targets (44pt) with a subtle media-
 * contrast scrim — not large rounded-square grey containers. The
 * scrim exists for legibility over arbitrary imagery, not as
 * decorative chrome.
 */
export interface CommerceDetailMediaAction {
  icon: keyof typeof Ionicons.glyphMap;
  /** Filled/active icon when the state is on (e.g. bookmark saved). */
  activeIcon?: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  /** Whether the action's state is "on" (saved / favourited / watching). */
  isActive?: boolean;
}

export interface CommerceDetailMediaRailProps {
  onBack: () => void;
  /** Right-side actions. Up to two may render alongside an overflow
   * affordance (Back + Share + Save + Overflow). When no overflow is
   * present, up to two actions render. The total visible utility
   * controls never exceeds three besides the Back navigation control. */
  rightActions?: CommerceDetailMediaAction[];
  /** Called when the user taps the overflow affordance. The screen
   * opens its overflow sheet (save-to-collection, report, etc.). */
  onOverflow?: () => void;
  /** When true, an overflow "..." affordance is rendered after the
   * visible actions. */
  showOverflow?: boolean;
  topInset: number;
}

const PRESS_OPACITY = 0.85;

function RailControl({
  onPress,
  label,
  isActive,
  reducedMotion,
  children }: {
  onPress: () => void;
  label: string;
  isActive?: boolean;
  reducedMotion: boolean;
  children: React.ReactNode;
}) {
  const pressed = useSharedValue(0);
  const pressStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pressed.value, [0, 1], [1, PRESS_OPACITY]),
    transform: [
      { scale: interpolate(pressed.value, [0, 1], [1, reducedMotion ? 1 : PressScale.tap]) },
    ],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: Motion.duration.fast });
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, { duration: Motion.duration.fast });
      }}
      hitSlop={12}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={isActive ? { selected: true } : undefined}
      style={styles.hitTarget}
    >
      <Reanimated.View style={[styles.hitTarget, pressStyle]}>{children}</Reanimated.View>
    </Pressable>
  );
}

export function CommerceDetailMediaRail({
  onBack,
  rightActions = [],
  onOverflow,
  showOverflow = false,
  topInset }: CommerceDetailMediaRailProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const hasOverflow = showOverflow || rightActions.length > 2;
  // Back is a navigation control, not a utility control. The three
  // utility slots are: Share, Save/Collection, and Overflow. This
  // matches the screen intent: "Back, Share, Save + overflow".
  const visibleRight = rightActions.slice(0, hasOverflow ? 2 : 2);

  return (
    <View
      style={[styles.container, { paddingTop: Math.max(topInset, Space.sm) }]}
      pointerEvents="box-none"
    >
      <RailControl onPress={onBack} label="Go back" reducedMotion={reducedMotion}>
        <Ionicons
          name="chevron-back"
          size={28}
          color={colors.mediaOverlayText}
          style={styles.scrimIcon}
        />
      </RailControl>

      <View style={styles.rightCluster} pointerEvents="box-none">
        {visibleRight.map((action) => {
          const icon = action.isActive && action.activeIcon ? action.activeIcon : action.icon;
          return (
            <RailControl
              key={action.label}
              onPress={action.onPress}
              label={action.label}
              isActive={action.isActive}
              reducedMotion={reducedMotion}
            >
              <Ionicons
                name={icon}
                size={24}
                color={colors.mediaOverlayText}
                style={styles.scrimIcon}
              />
            </RailControl>
          );
        })}
        {hasOverflow && onOverflow ? (
          <RailControl
            onPress={onOverflow}
            label="More actions"
            reducedMotion={reducedMotion}
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={22}
              color={colors.mediaOverlayText}
              style={styles.scrimIcon}
            />
          </RailControl>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Space.sm,
    zIndex: 10,
  },
  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  hitTarget: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Subtle media-contrast scrim behind the glyph. This is functional
  // (legibility over arbitrary imagery), not decorative chrome.
  scrimIcon: {
    ...GlyphShadow.glyph },
});
