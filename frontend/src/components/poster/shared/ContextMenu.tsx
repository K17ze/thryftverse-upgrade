/**
 * ContextMenu — shared long-press context menu for poster/creator layers.
 *
 * A premium, spring-entrance bottom sheet that replaces Alert.alert and the
 * per-surface ActionSheet implementations found in CreatorCanvas,
 * PosterStickerLayer, and MultiPhotoCollage.
 *
 * Features:
 *  - Long-press activated via react-native-gesture-handler Gesture.LongPress
 *  - Reanimated spring slide-up + fade-in entrance
 *  - BlurView backdrop (expo-blur) with tap-to-dismiss
 *  - Haptic feedback: medium on open, selection on action
 *  - Reduced-motion fallback (instant show/hide, no travel)
 *  - Theme tokens for all colours
 *
 * Usage:
 *   const [menuVisible, setMenuVisible] = useState(false);
 *   <ContextMenu
 *     actions={[{ id: 'duplicate', label: 'Duplicate', icon: 'copy-outline', onPress: () => ... }]}
 *     visible={menuVisible}
 *     onOpen={() => setMenuVisible(true)}
 *     onDismiss={() => setMenuVisible(false)}
 *   >
 *     <DraggableLayer ... />
 *   </ContextMenu>
 *
 * The child element is wrapped in a long-press gesture detector. When the
 * long-press fires, `onOpen` is called so the parent can set `visible`,
 * which renders the spring-entrance sheet.
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, AccessibilityInfo } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, Typography, Stroke, Elevation} from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useMotionConfig } from '../../../hooks/useMotionConfig';
import { useHaptic } from '../../../hooks/useHaptic';

// ── Types ────────────────────────────────────────────────────────────

export interface ContextMenuAction {
  id: string;
  label: string;
  /** Ionicons glyph name. */
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Destructive actions render in the danger colour. */
  danger?: boolean;
}

export interface ContextMenuProps {
  /** Actions to render in the sheet. */
  actions: ContextMenuAction[];
  /** Called when the menu is dismissed (backdrop tap, action press, or external toggle). */
  onDismiss: () => void;
  /**
   * Called when the child element is long-pressed. The parent should set
   * `visible` to true in response so the sheet can animate in.
   */
  onOpen: () => void;
  /** Whether the sheet is currently visible. */
  visible: boolean;
  /**
   * The element that triggers the menu on long-press. It is wrapped in a
   * GestureDetector so callers do not need to manage the gesture themselves.
   */
  children: React.ReactNode;
  /** Optional title shown in the sheet header. Defaults to "Options". */
  title?: string;
  /**
   * Accent colour for non-destructive action icons. Defaults to the theme
   * brand colour. Pass a layer accent colour to match the selected layer.
   */
  accentColor?: string;
  /** Whether the long-press trigger is enabled. Defaults to true. */
  enabled?: boolean;
}

// ── Component ────────────────────────────────────────────────────────

export function ContextMenu({
  actions,
  onDismiss,
  onOpen,
  visible,
  children,
  title = 'Options',
  accentColor,
  enabled = true,
}: ContextMenuProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const haptic = useHaptic();

  const slideSV = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);

  const resolvedAccent = accentColor ?? colors.brand;

  // Keep the latest onOpen in a ref so the memoised gesture always calls
  // the current callback without rebuilding.
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  // ── Entrance / exit animation ──────────────────────────────────────
  // Slide up 300pt + fade in. Reduced motion: instant.
  useEffect(() => {
    if (visible) {
      if (reducedMotion) {
        slideSV.value = 1;
        backdropOpacity.value = 1;
      } else {
        slideSV.value = withSpring(1, spring.entrance);
        backdropOpacity.value = withTiming(1, {
          duration: 180,
          easing: Easing.out(Easing.cubic),
        });
      }
      runOnJS(haptic.medium)();
      runOnJS(AccessibilityInfo.announceForAccessibility)(`${title} menu opened`);
    } else {
      if (reducedMotion) {
        slideSV.value = 0;
        backdropOpacity.value = 0;
      } else {
        slideSV.value = withSpring(0, spring.entrance);
        backdropOpacity.value = withTiming(0, {
          duration: 150,
          easing: Easing.in(Easing.cubic),
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reducedMotion]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - slideSV.value) * 300 }],
    opacity: slideSV.value,
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  // ── Action handler ─────────────────────────────────────────────────
  const handleAction = useCallback(
    (action: ContextMenuAction) => {
      haptic.selection();
      action.onPress();
      onDismiss();
    },
    [haptic, onDismiss],
  );

  // ── Long-press gesture on the child ────────────────────────────────
  // Fires haptic medium + calls onOpen so the parent can set visible.
  const handleLongPress = useCallback(() => {
    haptic.medium();
    onOpenRef.current();
  }, [haptic]);

  const longPressGesture = useMemo(
    () =>
      Gesture.LongPress()
        .enabled(enabled && !visible)
        .minDuration(400)
        .onStart(() => {
          runOnJS(handleLongPress)();
        }),
    [enabled, visible, handleLongPress],
  );

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <>
      <GestureDetector gesture={longPressGesture}>{children as React.ReactElement}</GestureDetector>

      {visible && (
        <>
          {/* Blur backdrop — tap to dismiss */}
          <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="auto">
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={onDismiss}
              accessibilityLabel="Close menu"
              accessibilityRole="button"
            />
          </Reanimated.View>

          {/* Action sheet */}
          <Reanimated.View
            style={[styles.sheet, { backgroundColor: colors.surface }, sheetStyle]}
            accessibilityRole="menu"
            accessibilityLabel={title}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.title, { color: colors.textSecondary }]}>{title}</Text>

            <View style={styles.actionRow}>
              {actions.map((action) => {
                const isDanger = !!action.danger;
                const color = isDanger ? colors.danger : resolvedAccent;
                return (
                  <Pressable
                    key={action.id}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      { borderColor: isDanger ? colors.danger : colors.border },
                      pressed && { opacity: 0.6 },
                    ]}
                    onPress={() => handleAction(action)}
                    accessibilityLabel={action.label}
                    accessibilityRole="button"
                  >
                    {action.icon && <Ionicons name={action.icon} size={22} color={color} />}
                    <Text
                      style={[
                        styles.actionLabel,
                        { color: isDanger ? colors.danger : colors.textPrimary },
                      ]}
                    >
                      {action.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Reanimated.View>
        </>
      )}
    </>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Space.md,
    paddingBottom: 34,
    paddingTop: Space.sm,
    ...Elevation.modal,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginBottom: Space.sm + Space.xs,
  },
  title: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    textAlign: 'center',
    marginBottom: Space.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    gap: Space.smMd,
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
    paddingVertical: Space.sm,
    gap: Space.xs,
    borderWidth: Stroke.standard,
    borderRadius: Radius.lg,
  },
  actionLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    textAlign: 'center',
  },
});
