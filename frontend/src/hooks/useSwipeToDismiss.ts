import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  withTiming,
  withSpring,
  runOnJS,
  type SharedValue,
  type WithSpringConfig,
  type AnimatedStyle,
} from 'react-native-reanimated';
import { Motion } from '../theme/motionTokens';

// ───────────────────────────────────────────────────────────────────────────
// useSwipeToDismiss — owns the swipe-to-dismiss gesture for ItemDetailScreen.
//
// Vertical drag down (from the top of the scroll content) scales the scene
// and fades chrome. Releasing past 50% of screen height dismisses; otherwise
// the scene springs back. Reduced-motion users keep the back button — the
// gesture still dismisses but without the scale/translate.
//
// The hook returns the gesture, the container/chrome animated styles, and the
// shared values the caller spreads onto the scene root + chrome layer.
// ───────────────────────────────────────────────────────────────────────────

export interface UseSwipeToDismissOptions {
  scrollY: SharedValue<number>;
  screenHeight: number;
  reducedMotion: boolean;
  spring: { tap: WithSpringConfig };
  goBack: () => void;
}

export interface UseSwipeToDismissReturn {
  dragY: SharedValue<number>;
  dismissScale: SharedValue<number>;
  chromeOpacity: SharedValue<number>;
  isDismissing: SharedValue<number>;
  dismissPan: ReturnType<typeof Gesture.Pan>;
  dismissContainerStyle: AnimatedStyle<any>;
  dismissChromeStyle: AnimatedStyle<any>;
}

export function useSwipeToDismiss({
  scrollY,
  screenHeight,
  reducedMotion,
  spring,
  goBack,
}: UseSwipeToDismissOptions): UseSwipeToDismissReturn {
  const dragY = useSharedValue(0);
  const dismissScale = useSharedValue(1);
  const chromeOpacity = useSharedValue(1);
  const isDismissing = useSharedValue(0);
  // Track the initial touch position so manualActivation can decide
  // direction from the delta, not the absolute coordinate.
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);

  const dismissPan = useMemo(
    () =>
      Gesture.Pan()
        .manualActivation(true)
        .onTouchesDown((event) => {
          'worklet';
          const touch = event.changedTouches[0];
          if (touch) {
            panStartX.value = touch.x;
            panStartY.value = touch.y;
          }
        })
        .onTouchesMove((event, stateManager) => {
          'worklet';
          // Only activate on a downward drag from the top of the content
          // (scrollY <= 0). Horizontal movement yields to the image
          // carousel; upward / mid-scroll movement yields to the
          // ScrollView so existing scroll behaviour is preserved.
          if (scrollY.value > 1) {
            stateManager.fail();
            return;
          }
          const touch = event.changedTouches[0];
          if (!touch) {
            stateManager.fail();
            return;
          }
          const dx = touch.x - panStartX.value;
          const dy = touch.y - panStartY.value;
          if (dy > 12 && Math.abs(dx) < 24) {
            stateManager.activate();
          } else if (Math.abs(dx) > 24 || dy < -12) {
            stateManager.fail();
          }
        })
        .onUpdate((e) => {
          'worklet';
          const raw = Math.max(0, e.translationY);
          dragY.value = raw;
          const progress = raw / screenHeight;
          dismissScale.value = interpolate(
            progress,
            [0, 1],
            [1, 0.85],
            Extrapolation.CLAMP,
          );
          chromeOpacity.value = interpolate(
            progress,
            [0, 0.5],
            [1, 0],
            Extrapolation.CLAMP,
          );
        })
        .onEnd((e) => {
          'worklet';
          const threshold = screenHeight * 0.5;
          const fastDismiss = e.velocityY > 800;
          if (dragY.value > threshold || fastDismiss) {
            isDismissing.value = 1;
            dragY.value = withTiming(screenHeight, { duration: Motion.duration.slow });
            dismissScale.value = withTiming(0.85, { duration: Motion.duration.slow });
            chromeOpacity.value = withTiming(0, { duration: Motion.duration.normal });
            runOnJS(goBack)();
          } else {
            dragY.value = withSpring(0, spring.tap);
            dismissScale.value = withSpring(1, spring.tap);
            chromeOpacity.value = withSpring(1, spring.tap);
          }
        }),
    [scrollY, dragY, dismissScale, chromeOpacity, isDismissing, panStartX, panStartY, screenHeight, spring, goBack],
  );

  const dismissContainerStyle = useAnimatedStyle(() => {
    'worklet';
    if (reducedMotion) {
      // Reduced motion: no scale/translate, only a gentle opacity fade so
      // the dismiss still reads as a transition without travel.
      return {
        opacity: chromeOpacity.value,
        transform: [{ translateY: 0 }, { scale: 1 }],
      };
    }
    return {
      transform: [{ translateY: dragY.value }, { scale: dismissScale.value }],
    };
  });

  const dismissChromeStyle = useAnimatedStyle(() => {
    'worklet';
    return { opacity: chromeOpacity.value };
  });

  return {
    dragY,
    dismissScale,
    chromeOpacity,
    isDismissing,
    dismissPan,
    dismissContainerStyle,
    dismissChromeStyle,
  };
}
