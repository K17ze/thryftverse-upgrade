import { useEffect, useMemo } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';
import { Motion, REDUCED_SPRING } from '../../theme/motionTokens';

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

/** Upward flick velocity that commits to the expanded detent. */
const FLICK_UP_VELOCITY = -500;
/** Downward flick velocity that drops one detent (full → half, half → dismiss). */
const FLICK_DOWN_VELOCITY = 500;

// Bottom-sheet motion + drag gesture for the filter sheet. Owns the shared
// values, the pan gesture with its snap rules, and the animated styles; the
// screen wires the gesture detectors and the animated views.
//
// Geometry: the sheet is a full-height slab anchored to the container bottom
// and translated down — `translateY` is the sheet's TOP edge position
// (snapFull = 0.1H expanded, snapHalf = 0.5H resting, H = closed). The action
// dock lives outside the sheet and tracks `dockStyle` so it stays glued to
// the screen's bottom edge at both detents and rides with dismiss drags.
export function useFilterSheet({ height, snapHalf, snapFull, reducedMotion, onClose }: Params) {
  const translateY = useSharedValue(height);
  const contextY = useSharedValue(0);
  // Over-damped sheet settle — controlled, zero overshoot (no rubber-band).
  // Reduced motion collapses the spring to critically damped (instant).
  const settleSpring = reducedMotion ? REDUCED_SPRING : Motion.spring.sheet;

  useEffect(() => {
    // Deliberate-tier entrance: ~280ms slide-up, ease-out into rest.
    translateY.value = withTiming(snapHalf, {
      duration: reducedMotion ? 0 : Motion.duration.slow,
      easing: Motion.easing.entrance });
  }, [reducedMotion, snapHalf, translateY]);

  const closeBottomSheet = () => {
    // Deliberate-tier exit: ease-in accelerate away, then pop the route.
    translateY.value = withTiming(
      height,
      { duration: reducedMotion ? 0 : Motion.duration.slow, easing: Motion.easing.exit },
      (finished) => {
        if (finished) runOnJS(onClose)();
      });
  };

  // Nested-scroll arbitration (house BottomSheet grammar): the content's
  // ScrollView owns vertical drags while it can still scroll; only when it
  // fails — at the top edge pulling down — does the sheet pan take over.
  // Memoized so the gesture identity survives re-renders mid-drag.
  const scrollGesture = useMemo(() => Gesture.Native(), []);

  const gesture = Gesture.Pan()
    .requireExternalGestureToFail(scrollGesture)
    // Vertical drags only — keeps horizontal responders inside the content
    // (preset rail, in-facet search) from pre-empting or being pre-empted.
    .activeOffsetY([-10, 10])
    .failOffsetX([-15, 15])
    .onStart(() => {
      contextY.value = translateY.value;
    })
    .onUpdate((e) => {
      // Hard clamp at the expanded detent — no upward rubber-banding.
      translateY.value = Math.max(snapFull, contextY.value + e.translationY);
    })
    .onEnd((e) => {
      const y = translateY.value;
      const midDetent = (snapFull + snapHalf) / 2;
      if (e.velocityY < FLICK_UP_VELOCITY) {
        // Upward flick always commits to the expanded detent.
        translateY.value = withSpring(snapFull, settleSpring);
      } else if (e.velocityY > FLICK_DOWN_VELOCITY) {
        // Downward flick cascades one detent: expanded → resting → dismiss.
        if (y < midDetent) {
          translateY.value = withSpring(snapHalf, settleSpring);
        } else {
          runOnJS(closeBottomSheet)();
        }
      } else if (y > (snapHalf + height) / 2) {
        // Released past the midpoint between resting and closed → dismiss.
        runOnJS(closeBottomSheet)();
      } else {
        // Settle to the nearest detent.
        translateY.value = withSpring(y < midDetent ? snapFull : snapHalf, settleSpring);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }] }));

  // Full overlay strength at the resting detent and above; fades out only as
  // the sheet travels toward closed (dismiss drags and the exit animation).
  const overlayStyle = useAnimatedStyle(() => {
    const opacity = interpolate(translateY.value, [snapHalf, height], [1, 0], Extrapolation.CLAMP);
    return { opacity };
  });

  // The dock is pinned to the screen's bottom edge while the sheet is at or
  // above the resting detent; once the sheet drags below rest the dock rides
  // down with it 1:1, and during entry it arrives with the sheet's top edge.
  const dockStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(0, translateY.value - snapHalf) }] }));

  return { gesture, scrollGesture, sheetStyle, overlayStyle, dockStyle, closeBottomSheet };
}
