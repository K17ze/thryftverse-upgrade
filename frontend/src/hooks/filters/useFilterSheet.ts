import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';

interface Params {
  /** Window height — closed resting position of the sheet. */
  height: number;
  /** Half-open snap point (height * 0.5). */
  snapHalf: number;
  /** Near-full snap point (height * 0.1). */
  snapFull: number;
  reducedMotion: boolean;
  /** Invoked on the JS thread once the close animation finishes (navigation.goBack). */
  onClose: () => void;
}

// Bottom-sheet motion + drag gesture for the filter sheet. Owns the shared
// values, the pan gesture with its snap rules, and the animated styles; the
// screen only wires the gesture detector and the two animated views.
export function useFilterSheet({ height, snapHalf, snapFull, reducedMotion, onClose }: Params) {
  const translateY = useSharedValue(height);
  const contextY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withTiming(snapHalf, { duration: reducedMotion ? 0 : 200 });
  }, [reducedMotion, snapHalf]);

  const closeBottomSheet = () => {
    translateY.value = withTiming(height, { duration: reducedMotion ? 0 : 180 }, () => {
      runOnJS(onClose)();
    });
  };

  const gesture = Gesture.Pan()
    .onStart(() => {
      contextY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateY.value = Math.max(snapFull, contextY.value + e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 100 && e.velocityY > 500) {
        runOnJS(closeBottomSheet)();
      } else if (translateY.value > snapHalf + 100) {
        runOnJS(closeBottomSheet)();
      } else if (translateY.value < snapHalf - 50) {
        // Snap to full (90% height)
        translateY.value = withTiming(snapFull, { duration: reducedMotion ? 0 : 180 });
      } else {
        // Snap back to half
        translateY.value = withTiming(snapHalf, { duration: reducedMotion ? 0 : 180 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }] }));

  const overlayStyle = useAnimatedStyle(() => {
    const opacity = interpolate(translateY.value, [snapFull, height], [0.6, 0], Extrapolation.CLAMP);
    return { opacity };
  });

  return { gesture, sheetStyle, overlayStyle, closeBottomSheet };
}
