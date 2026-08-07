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

import { Radius, Space } from '../theme/designTokens';
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface BottomSheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  snapPoint?: number; // percentage of screen height (default 0.55)
  /** Blur intensity on backdrop (0-100, default 25) */
  blurIntensity?: number;
  /** Spring damping for open/close (default 18) */
  springDamping?: number;
}

export function BottomSheet({
  visible,
  onDismiss,
  children,
  snapPoint = 0.55,
  blurIntensity = 25,
  springDamping = 18,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const { spring, isEnabled } = useMotionConfig();
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const sheetHeight = SCREEN_HEIGHT * snapPoint;
  const translateY = useSharedValue(sheetHeight);
  const backdropOpacity = useSharedValue(0);
  const contextY = useSharedValue(0);

  const open = useCallback(() => {
    // Spring-based entrance — smooth, confident settle (Motion.spring.entrance).
    // When reduced motion is on the spring is critically damped so the sheet
    // appears instantly without visible travel.
    translateY.value = withSpring(0, spring.entrance);
    backdropOpacity.value = withTiming(1, {
      duration: isEnabled ? Motion.duration.normal : 0,
    });
  }, [translateY, backdropOpacity, spring, isEnabled]);

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
      {/* Backdrop with blur */}
      <Reanimated.View style={[styles.backdrop, backdropStyle]}>
        <LiquidGlassBackdrop
          intensity={blurIntensity}
          tint={colors.background === '#FFFFFF' ? 'light' : 'dark'}
          style={StyleSheet.absoluteFill}
        />
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

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    // iOS native sheet shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 24,
    // Subtle top border for glass separation
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
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