/**
 * LayerFloatingMenu — a compact, floating action menu that appears near
 * the selected layer on the canvas. Provides quick access to z-order
 * (bring forward / send backward), duplicate, lock, and delete without
 * requiring the user to open the Layers sheet.
 *
 * Visual language:
 * - Pill-shaped bar floating above the selected layer
 * - Icon-only actions with 44pt hit targets
 * - Subtle elevation, no decorative chrome
 * - Appears with a fade + slight scale-up spring
 * - Disappears when the layer is deselected or the canvas is tapped
 */
import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
  useSharedValue,
  Easing,
} from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Elevation, Control } from '../theme/designTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';

export interface LayerFloatingMenuAction {
  id: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

interface LayerFloatingMenuProps {
  visible: boolean;
  actions: LayerFloatingMenuAction[];
  /** Position on screen (px) for the menu anchor. */
  x: number;
  y: number;
}

export function LayerFloatingMenu({ visible, actions, x, y }: LayerFloatingMenuProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.85);
  const styles = useMemo(() => createStyles(colors), [colors]);

  React.useEffect(() => {
    if (visible) {
      opacity.value = reducedMotion ? 1 : withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) });
      scale.value = reducedMotion ? 1 : withSpring(1, { damping: 18, stiffness: 220 });
    } else {
      opacity.value = reducedMotion ? 0 : withTiming(0, { duration: 100 });
      scale.value = reducedMotion ? 0.85 : withSpring(0.85, { damping: 20, stiffness: 250 });
    }
  }, [visible, reducedMotion, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!visible || actions.length === 0) return null;

  return (
    <Reanimated.View
      style={[
        styles.container,
        animatedStyle,
        { left: x, top: y },
      ]}
      pointerEvents="box-none"
    >
      {actions.map((action) => (
        <Pressable
          key={action.id}
          style={styles.actionBtn}
          onPress={action.onPress}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <Ionicons
            name={action.icon}
            size={18}
            color={action.destructive ? colors.danger : colors.textPrimary}
          />
        </Pressable>
      ))}
    </Reanimated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.xs,
      paddingVertical: Space.xs,
      backgroundColor: colors.surfaceElevated,
      borderRadius: Radius.full,
      ...Elevation.floating,
      shadowColor: colors.shadow,
      transform: [{ translateX: -50 }],
    },
    actionBtn: {
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
