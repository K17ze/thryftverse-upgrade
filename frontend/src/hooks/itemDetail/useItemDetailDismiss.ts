import { useCallback, useMemo } from 'react';
import {
  useAnimatedScrollHandler,
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  withTiming,
  withSpring,
  withSequence,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { Motion } from '../../theme/motionTokens';
import type { useMotionConfig } from '../useMotionConfig';

type ItemDetailNav = NativeStackNavigationProp<RootStackParamList>;

export interface ItemDetailDismissContext {
  /** Navigation prop — the dismiss gesture calls navigation.goBack(). */
  navigation: ItemDetailNav;
  /** Screen height — the dismiss threshold is 50% of screen height. */
  screenHeight: number;
  /** Reduced-motion users keep the back button — the gesture still
   * dismisses but without the scale/translate. */
  reducedMotion: boolean;
  /** Named spring configs from useMotionConfig(). */
  spring: ReturnType<typeof useMotionConfig>['spring'];
  /** The actions-hook double-tap handler (haptic + optimistic fav). */
  onDoubleTap: () => void;
}

/**
 * Owns the Reanimated gesture/worklet state for the item detail screen:
 * the scroll offset SharedValue + scroll handler, the spring-driven
 * pagination index, the swipe-to-dismiss pan gesture with its animated
 * container/chrome styles, and the double-tap big-heart values.
 *
 * These SharedValues are bound to the media stage and the screen's root
 * container, so they are created once per mounted screen inside this hook
 * rather than living inline in the screen component.
 */
export function useItemDetailDismiss(ctx: ItemDetailDismissContext) {
  const { navigation, screenHeight, reducedMotion, spring, onDoubleTap } = ctx;

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  // ── Image pagination ──
  // Spring-driven active index. The integer page comes from the media
  // stage's onViewableItemsChanged; we spring the float so each dot's
  // width interpolates smoothly.
  const paginationIndex = useSharedValue(0);

  // ── Swipe-to-dismiss ──
  // Vertical drag down (from the top of the scroll content) scales the
  // scene and fades chrome. Releasing past 50% of screen height dismisses;
  // otherwise the scene springs back. Reduced-motion users keep the back
  // button — the gesture still dismisses but without the scale/translate.
  const dragY = useSharedValue(0);
  const dismissScale = useSharedValue(1);
  const chromeOpacity = useSharedValue(1);
  const isDismissing = useSharedValue(0);
  // Track the initial touch position so manualActivation can decide
  // direction from the delta, not the absolute coordinate.
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);

  const goBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

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

  const bigHeartScale = useSharedValue(0);
  const bigHeartOpacity = useSharedValue(0);

  // Double-tap wraps the hook's fav toggle with the big-heart animation
  // (the animation SharedValues live in the screen because they are
  // Reanimated worklet state bound to the media stage).
  const handleDoubleTap = () => {
    onDoubleTap();
    if (reducedMotion) {
      bigHeartOpacity.value = 0;
      bigHeartScale.value = 0;
      return;
    }
    bigHeartOpacity.value = 1;
    bigHeartScale.value = withSequence(
      withTiming(1.4, { duration: Motion.duration.normal }),
      withTiming(1.4, { duration: Motion.duration.slower }),
      withTiming(0, { duration: Motion.duration.normal })
    );
  };

  return {
    scrollY,
    scrollHandler,
    paginationIndex,
    dismissPan,
    dismissContainerStyle,
    dismissChromeStyle,
    bigHeartScale,
    bigHeartOpacity,
    handleDoubleTap,
  };
}
