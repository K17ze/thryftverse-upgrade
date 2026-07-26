import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space } from '../../../theme/designTokens';

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
  /** Right-side actions. Only the first two are rendered visibly; the
   * rest are surfaced via the overflow callback. */
  rightActions?: CommerceDetailMediaAction[];
  /** Called when the user taps the overflow affordance. The screen
   * opens its overflow sheet (save-to-collection, report, etc.). */
  onOverflow?: () => void;
  /** When true, an overflow "..." affordance is rendered after the
   * visible actions. */
  showOverflow?: boolean;
  topInset: number;
}

export function CommerceDetailMediaRail({
  onBack,
  rightActions = [],
  onOverflow,
  showOverflow = false,
  topInset,
}: CommerceDetailMediaRailProps) {
  const { colors } = useAppTheme();
  // Spec: maximum three visible controls (back + two right actions).
  // Additional actions go to overflow.
  const visibleRight = rightActions.slice(0, 2);
  const hasOverflow = showOverflow || rightActions.length > 2;

  return (
    <View
      style={[styles.container, { paddingTop: Math.max(topInset, Space.sm) }]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onBack}
        hitSlop={12}
        accessibilityLabel="Go back"
        accessibilityRole="button"
        style={styles.hitTarget}
      >
        <Ionicons name="chevron-back" size={28} color="#fff" style={styles.scrimIcon} />
      </Pressable>

      <View style={styles.rightCluster} pointerEvents="box-none">
        {visibleRight.map((action) => {
          const icon = action.isActive && action.activeIcon ? action.activeIcon : action.icon;
          return (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              hitSlop={12}
              accessibilityLabel={action.label}
              accessibilityRole="button"
              accessibilityState={action.isActive ? { selected: true } : undefined}
              style={styles.hitTarget}
            >
              <Ionicons
                name={icon}
                size={24}
                color={action.isActive ? colors.brand : '#fff'}
                style={styles.scrimIcon}
              />
            </Pressable>
          );
        })}
        {hasOverflow && onOverflow ? (
          <Pressable
            onPress={onOverflow}
            hitSlop={12}
            accessibilityLabel="More actions"
            accessibilityRole="button"
            style={styles.hitTarget}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color="#fff" style={styles.scrimIcon} />
          </Pressable>
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
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
