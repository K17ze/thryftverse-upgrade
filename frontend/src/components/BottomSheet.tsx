import React, { useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Pressable,
  BackHandler,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHaptic } from '../hooks/useHaptic';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { Motion } from '../theme/motionTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { LiquidGlassBackdrop } from './LiquidGlassBackdrop';

import { Elevation, Radius, Space } from '../theme/designTokens';
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * BottomSheet variants — semantic material grammar.
 *
 * The low-level engine does not impose a "premium AI app" material on every
 * sheet. Each variant selects an appropriate radius, shadow weight, and
 * backdrop treatment so the sheet's material matches its task:
 *
 *   system       — default utility sheet (menus, pickers, generic overlays)
 *   form         — keyboard-aware editors, settings panels
 *   inspector    — object/detail inspectors; lighter backdrop preserves media
 *   transaction  — payment/confirmations; restrained, no decorative blur
 *   immersive    — full-bleed media experiences; may use the glass material
 */
export type BottomSheetVariant =
  | 'system'
  | 'form'
  | 'inspector'
  | 'transaction'
  | 'immersive';

interface SheetVariantConfig {
  /** Top corner radius (px). */
  topRadius: number;
  /** Shadow config (height is negated so the shadow casts upward). */
  shadow: typeof Elevation.modal;
  /** Max backdrop opacity (0-1). Lower keeps underlying content visible. */
  backdropMaxOpacity: number;
  /** When true, uses LiquidGlassBackdrop instead of a plain overlay. */
  useGlassBackdrop: boolean;
}

const VARIANT_CONFIGS: Record<BottomSheetVariant, SheetVariantConfig> = {
  // System-like utility sheet — restrained material.
  system: {
    topRadius: Radius.xl, // 16
    shadow: Elevation.floating,
    backdropMaxOpacity: 1,
    useGlassBackdrop: false,
  },
  // Keyboard-aware form/editor — same restrained material as system.
  form: {
    topRadius: Radius.xl, // 16
    shadow: Elevation.floating,
    backdropMaxOpacity: 1,
    useGlassBackdrop: false,
  },
  // Object/detail inspector — lighter backdrop so media behind stays visible.
  inspector: {
    topRadius: 20,
    shadow: Elevation.floating,
    backdropMaxOpacity: 0.72,
    useGlassBackdrop: false,
  },
  // Payment/confirmation — clear consequence, no decorative blur.
  transaction: {
    topRadius: Radius.xl, // 16
    shadow: Elevation.floating,
    backdropMaxOpacity: 1,
    useGlassBackdrop: false,
  },
  // Full-bleed media experience — glass material is appropriate here.
  immersive: {
    topRadius: 20,
    shadow: Elevation.modal,
    backdropMaxOpacity: 1,
    useGlassBackdrop: true,
  },
};

interface BottomSheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  snapPoint?: number; // percentage of screen height (default 0.55)
  /** Semantic material variant. Default 'system'. */
  variant?: BottomSheetVariant;
  /**
   * Override the variant's default top corner radius (px). Semantic wrappers
   * use this to fine-tune the sheet shape without forking the engine.
   */
  topRadius?: number;
  /**
   * Blur intensity passed to LiquidGlassBackdrop when the active variant uses
   * the glass material (immersive). Kept for backward compatibility — no
   * longer triggers blur on non-glass variants.
   */
  blurIntensity?: number;
  /**
   * Spring damping for open/close. Kept for backward compatibility; the
   * engine sources its spring physics from useMotionConfig.
   */
  springDamping?: number;
}

export function BottomSheet({
  visible,
  onDismiss,
  children,
  snapPoint = 0.55,
  variant = 'system',
  topRadius,
  blurIntensity = 25,
  springDamping = 18,
}: BottomSheetProps) {
  void springDamping; // physics sourced from useMotionConfig (reduced-motion aware)

  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const { spring, isEnabled } = useMotionConfig();
  const { colors } = useAppTheme();
  const baseConfig = VARIANT_CONFIGS[variant];
  const variantConfig: SheetVariantConfig = {
    ...baseConfig,
    topRadius: topRadius ?? baseConfig.topRadius,
  };
  const styles = React.useMemo(
    () => createStyles(colors, variantConfig),
    [colors, variantConfig],
  );
  const sheetHeight = SCREEN_HEIGHT * snapPoint;
  const translateY = useSharedValue(sheetHeight);
  const backdropOpacity = useSharedValue(0);
  const contextY = useSharedValue(0);

  const open = useCallback(() => {
    // Subtle spring entrance — smooth, confident settle.
    // When reduced motion is on the spring is critically damped so the sheet
    // appears instantly without visible travel.
    translateY.value = withSpring(0, spring.entrance);
    backdropOpacity.value = withTiming(variantConfig.backdropMaxOpacity, {
      duration: isEnabled ? Motion.duration.normal : 0,
    });
  }, [translateY, backdropOpacity, spring, isEnabled, variantConfig.backdropMaxOpacity]);

  const close = useCallback(() => {
    // Spring-based dismiss — the sheet settles down with the same entrance
    // physics. onDismiss fires when the spring completes so the caller can
    // unmount cleanly.
    translateY.value = withSpring(sheetHeight, spring.entrance, (finished) => {
      if (finished) {
        runOnJS(onDismiss)();
      }
    });
    backdropOpacity.value = withTiming(0, {
      duration: isEnabled ? Motion.duration.normal : 0,
    });
  }, [translateY, backdropOpacity, sheetHeight, onDismiss, spring, isEnabled]);

  useEffect(() => {
    if (visible) {
      open();
    } else {
      translateY.value = sheetHeight;
      backdropOpacity.value = 0;
    }
  }, [visible, open, translateY, backdropOpacity, sheetHeight]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [visible, close]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      contextY.value = translateY.value;
    })
    .onUpdate((e) => {
      'worklet';
      translateY.value = Math.max(0, contextY.value + e.translationY);
    })
    .onEnd((e) => {
      'worklet';
      const threshold = sheetHeight * 0.35;
      const shouldClose = translateY.value > threshold || e.velocityY > 600;

      if (shouldClose) {
        runOnJS(haptic.medium)();
        runOnJS(close)();
      } else {
        // Snap back to open with the entrance spring
        translateY.value = withSpring(0, spring.entrance);
      }
    });

  const sheetStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  const backdropStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: backdropOpacity.value,
      pointerEvents: backdropOpacity.value > 0.01 ? 'auto' : 'none',
    };
  });

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" accessibilityViewIsModal={true}>
      {/* Backdrop — plain semantic overlay (no decorative blur by default) */}
      <Reanimated.View style={[styles.backdrop, backdropStyle]}>
        {variantConfig.useGlassBackdrop ? (
          <LiquidGlassBackdrop
            intensity={blurIntensity}
            tint={colors.background === '#FFFFFF' ? 'light' : 'dark'}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close sheet"
          accessibilityHint="Dismisses this overlay"
        />
      </Reanimated.View>

      {/* Sheet */}
      <GestureDetector gesture={panGesture}>
        <Reanimated.View
          style={[
            styles.sheet,
            {
              height: sheetHeight + insets.bottom,
              paddingBottom: insets.bottom,
            },
            sheetStyle,
          ]}
        >
          {/* Drag handle — visual only, hidden from screen readers */}
          <View style={styles.handleWrap} accessible={false} importantForAccessibility="no-hide-descendants">
            <View style={styles.handle} />
          </View>

          <KeyboardAwareScrollView
            style={styles.contentWrap}
            contentContainerStyle={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {children}
          </KeyboardAwareScrollView>
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
}

const createStyles = (
  colors: ReturnType<typeof useAppTheme>['colors'],
  config: SheetVariantConfig,
) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFill,
      // Semantic overlay token — standard dimming, not decoration.
      backgroundColor: colors.overlay,
    },
    sheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.surface,
      borderTopLeftRadius: config.topRadius,
      borderTopRightRadius: config.topRadius,
      // Subtle upward-cast shadow for modal separation. The Elevation token
      // height is negated so the shadow casts above the sheet's top edge.
      shadowColor: config.shadow.shadowColor,
      shadowOffset: {
        width: config.shadow.shadowOffset.width,
        height: -config.shadow.shadowOffset.height,
      },
      shadowOpacity: config.shadow.shadowOpacity,
      shadowRadius: config.shadow.shadowRadius,
      elevation: config.shadow.elevation,
      // Hairline top border for clean edge separation against the backdrop.
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle,
    },
    handleWrap: {
      alignItems: 'center',
      paddingTop: 10,
      paddingBottom: Space.sm,
    },
    handle: {
      width: 40,
      height: 5,
      borderRadius: Radius.sm,
      backgroundColor: colors.textMuted + '80',
    },
    contentWrap: {
      flex: 1,
      paddingHorizontal: 20,
    },
  });
