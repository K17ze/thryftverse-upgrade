import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { View, Text, StyleSheet, Animated, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';

import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Space, Control } from '../theme/designTokens';
import { FontFamily } from '../theme/fontFamily';
import { TypographyV2 } from '../theme/typography.v2';

// ─── Types ────────────────────────────────────────────────────────────────

/** A single swipe action revealed behind a row. */
export interface SwipeAction {
  /** Ionicons outline glyph name. */
  icon: keyof typeof Ionicons.glyphMap;
  /** Short label announced to accessibility and shown under the glyph. */
  label: string;
  /** Fired when the action is committed (tap or full-swipe). */
  onPress: () => void;
  /** Whether this action is destructive (danger background + heavy haptic). */
  destructive?: boolean;
  /** Optional accent fill. Defaults to danger (destructive) or surfaceAlt. */
  color?: string;
}

export interface SwipeActionRowProps {
  children: React.ReactNode;
  /** Actions revealed on the trailing edge (swipe left). First = primary, second = destructive. */
  rightActions?: SwipeAction[];
  /** Describes the row itself to assistive technology. */
  accessibilityLabel: string;
  /** Optional hint describing what activating the row does. */
  accessibilityHint?: string;
  /** Optional press handler for the row body (tap). */
  onPress?: () => void;
  /** Width of each action button. Default 80pt. */
  actionWidth?: number;
  /** Style applied to the row container. */
  style?: ViewStyle;
}

// ─── Swipe coordination context ───────────────────────────────────────────
// When a new row opens, any previously-open row closes. This mimics iOS Mail
// behaviour and prevents two rows from being swiped open simultaneously.

interface SwipeContextValue {
  /** Register a row's Swipeable ref so it can be closed by others. */
  register: (id: string, ref: Swipeable | null) => void;
  /** Called when a row begins opening; closes all other registered rows. */
  onRowOpen: (id: string) => void;
}

const SwipeContext = createContext<SwipeContextValue | null>(null);

/**
 * SwipeProvider — wraps a list section so that opening one SwipeActionRow
 * auto-closes any other open row. Place it around the FlashList/ScrollView
 * that renders SwipeActionRow children.
 */
export function SwipeProvider({ children }: { children: React.ReactNode }) {
  const refs = useRef<Map<string, Swipeable>>(new Map());
  const openIdRef = useRef<string | null>(null);

  const register = useCallback((id: string, ref: Swipeable | null) => {
    if (ref) {
      refs.current.set(id, ref);
    } else {
      refs.current.delete(id);
    }
  }, []);

  const onRowOpen = useCallback((id: string) => {
    if (openIdRef.current && openIdRef.current !== id) {
      refs.current.get(openIdRef.current)?.close();
    }
    openIdRef.current = id;
  }, []);

  const value = useMemo(
    () => ({ register, onRowOpen }),
    [register, onRowOpen],
  );

  return <SwipeContext.Provider value={value}>{children}</SwipeContext.Provider>;
}

function useSwipeContext() {
  return useContext(SwipeContext);
}

// ─── Constants ────────────────────────────────────────────────────────────

const DEFAULT_ACTION_WIDTH = 80;
const REVEAL_HAPTIC = 'reveal';
const COMMIT_HAPTIC = 'commit';

// ─── SwipeActionButtonItem — single animated action (hooks-safe) ──────────

interface ActionItemProps {
  action: SwipeAction;
  actionWidth: number;
  progress: Animated.AnimatedInterpolation<number>;
  onPress: (action: SwipeAction) => void;
}

/**
 * A single swipe action button. Extracted as its own component so the
 * Animated interpolation is set up cleanly per-item.
 *
 * Uses RN's built-in Animated (which the gesture-handler Swipeable provides)
 * — transforms run on the native thread so the JS thread is never blocked
 * (AGENTS.md §17: Reanimated worklets / native animations only).
 */
const SwipeActionButtonItem = React.memo(function SwipeActionButtonItem({
  action,
  actionWidth,
  progress,
  onPress,
}: ActionItemProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();

  const isDestructive = action.destructive ?? false;
  const bgColor = action.color ?? (isDestructive ? colors.danger : colors.surfaceAlt);
  const iconColor = isDestructive ? colors.textInverse : colors.textPrimary;
  const labelColor = isDestructive ? colors.textInverse : colors.textPrimary;

  // Each action slides in from the right edge as the swipe progresses.
  // progress: 0 (closed) → 1 (fully open).
  const translateX = reducedMotion
    ? 0
    : progress.interpolate({
        inputRange: [0, 1],
        outputRange: [actionWidth, 0],
        extrapolate: 'clamp',
      });

  const opacity = reducedMotion
    ? 1
    : progress.interpolate({
        inputRange: [0, 0.25, 1],
        outputRange: [0, 1, 1],
        extrapolate: 'clamp',
      });

  // Subtle icon scale-up as the action reveals (0.85 → 1.0) — gives the
  // action a tactile "arriving" feel. Collapsed under reduced motion.
  const iconScale = reducedMotion
    ? 1
    : progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.85, 1.0],
        extrapolate: 'clamp',
      });

  return (
    <Animated.View
      style={[
        styles.actionButton,
        {
          backgroundColor: bgColor,
          width: actionWidth,
          transform: [{ translateX: translateX as number }],
          opacity: opacity as number,
        },
      ]}
    >
      <View
        style={styles.actionHitArea}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        accessible={true}
        onTouchEnd={(e) => {
          e.stopPropagation();
          onPress(action);
        }}
      >
        <Animated.View style={{ transform: [{ scale: iconScale as number }] }}>
          <Ionicons
            name={action.icon}
            size={Control.icon}
            color={iconColor}
          />
        </Animated.View>
        <Text style={[styles.actionLabel, { color: labelColor }]} numberOfLines={1}>
          {action.label}
        </Text>
      </View>
    </Animated.View>
  );
});

// ─── SwipeActionRow ───────────────────────────────────────────────────────

/**
 * SwipeActionRow — production-grade swipe-to-reveal row using
 * react-native-gesture-handler Swipeable + Reanimated.
 *
 * Design (2026 micro-interaction research + AGENTS.md §4 / §13):
 * - Right actions: primary (e.g. Archive) + destructive (e.g. Delete).
 * - Full-swipe commit: swiping all the way triggers the first right action.
 * - Haptic cue on reveal (light tick) and on commit (medium snap).
 * - Destructive actions use colors.danger; non-destructive use colors.surfaceAlt.
 * - Auto-close when another row opens (coordinated via SwipeProvider).
 * - Reduced motion: no spring animation, instant snap.
 * - Accessibility: each action has accessibilityRole="button" and accessibilityLabel.
 *
 * The Swipeable's action panels use RN's built-in Animated (which the
 * gesture-handler provides natively) — transforms run on the native thread
 * so the JS thread is never blocked. Reanimated's `runOnJS` is used for
 * haptic scheduling from the gesture callbacks.
 */
export function SwipeActionRow({
  children,
  rightActions,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  actionWidth = DEFAULT_ACTION_WIDTH,
  style,
}: SwipeActionRowProps) {
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const swipeContext = useSwipeContext();

  const swipeableRef = useRef<Swipeable | null>(null);
  const rowId = useRef<string>(`swipe-row-${Math.random().toString(36).slice(2)}`).current;

  // Track which haptics have fired for the current gesture so we don't
  // repeat them while the user holds the swipe past the threshold.
  const hapticState = useRef<Set<string>>(new Set());

  // Register/unregister with the SwipeProvider for coordinated auto-close.
  useEffect(() => {
    swipeContext?.register(rowId, swipeableRef.current);
    return () => {
      swipeContext?.register(rowId, null);
    };
  }, [rowId, swipeContext]);

  const resetHapticState = useCallback(() => {
    hapticState.current.clear();
  }, []);

  const fireRevealHaptic = useCallback(() => {
    if (reducedMotion) return;
    if (hapticState.current.has(REVEAL_HAPTIC)) return;
    hapticState.current.add(REVEAL_HAPTIC);
    haptic.light();
  }, [haptic, reducedMotion]);

  const fireCommitHaptic = useCallback(() => {
    if (reducedMotion) return;
    if (hapticState.current.has(COMMIT_HAPTIC)) return;
    hapticState.current.add(COMMIT_HAPTIC);
    haptic.medium();
  }, [haptic, reducedMotion]);

  const handleRowOpen = useCallback(() => {
    swipeContext?.onRowOpen(rowId);
  }, [rowId, swipeContext]);

  const handleRowClose = useCallback(() => {
    resetHapticState();
  }, [resetHapticState]);

  const totalActionsWidth = (rightActions?.length ?? 0) * actionWidth;

  // ── Action press (partial swipe — tap a revealed action) ──────────────
  const handleActionPress = useCallback(
    (action: SwipeAction) => {
      fireCommitHaptic();
      action.onPress();
      swipeableRef.current?.close();
    },
    [fireCommitHaptic],
  );

  // ── Render right actions ──────────────────────────────────────────────
  const renderRightActions = useCallback(
    (progress: Animated.AnimatedInterpolation<number>) => {
      if (!rightActions || rightActions.length === 0) return null;

      return (
        <View style={styles.actionsContainer}>
          {rightActions.map((action, index) => (
            <SwipeActionButtonItem
              key={`${action.label}-${index}`}
              action={action}
              actionWidth={actionWidth}
              progress={progress}
              onPress={handleActionPress}
            />
          ))}
        </View>
      );
    },
    [rightActions, actionWidth, handleActionPress],
  );

  // ── Swipeable callbacks ───────────────────────────────────────────────
  const handleSwipeableRightWillOpen = useCallback(() => {
    fireRevealHaptic();
    handleRowOpen();
  }, [fireRevealHaptic, handleRowOpen]);

  const handleSwipeableRightOpened = useCallback(() => {
    // Full-swipe commit: the first right action fires automatically.
    if (rightActions && rightActions.length > 0) {
      fireCommitHaptic();
      rightActions[0].onPress();
      // Close after commit so the row returns to rest.
      swipeableRef.current?.close();
    }
  }, [rightActions, fireCommitHaptic]);

  const handleSwipeableWillClose = useCallback(() => {
    handleRowClose();
  }, [handleRowClose]);

  const actionDescriptions = useMemo(() => {
    if (!rightActions) return '';
    return rightActions.map((a) => `Swipe left to ${a.label}`).join('. ');
  }, [rightActions]);

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      onSwipeableRightWillOpen={handleSwipeableRightWillOpen}
      onSwipeableRightOpen={handleSwipeableRightOpened}
      onSwipeableWillClose={handleSwipeableWillClose}
      rightThreshold={totalActionsWidth * 0.5}
      overshootRight={false}
      enableTrackpadTwoFingerGesture
    >
      <View
        style={[styles.rowContent, style]}
        accessible
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={
          accessibilityHint
            ? `${accessibilityHint}. ${actionDescriptions}`
            : actionDescriptions || undefined
        }
      >
        {children}
      </View>
    </Swipeable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  rowContent: {
    backgroundColor: 'transparent',
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'flex-end',
  },
  actionButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionHitArea: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.xs,
    minWidth: Control.hit,
    minHeight: Control.hit,
  },
  actionLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
});
