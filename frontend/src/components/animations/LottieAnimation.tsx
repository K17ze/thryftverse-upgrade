import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleProp,
  ViewStyle,
} from 'react-native';
import LottieView, { AnimationObject } from 'lottie-react-native';
import {
  type SharedValue,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAppTheme } from '../../theme/ThemeContext';

/**
 * A Lottie animation source — matches the union accepted by lottie-react-native's
 * `source` prop. Can be a local `require()`'d JSON object, a string asset path,
 * or a remote `{ uri }` object.
 */
export type LottieAnimationSource = AnimationObject | string | { uri: string };

/**
 * Module-level cache tracking which animation sources have been successfully
 * loaded at least once. LottieView's native `cacheComposition` handles the
 * native-level composition cache; this Set tracks JS-level load state so
 * callers can inspect whether a source has been resolved before.
 */
const loadedSources = new Set<string>();

function sourceCacheKey(source: LottieAnimationSource | null): string {
  if (!source) return 'none';
  if (typeof source === 'string') return source;
  if (typeof source === 'object' && 'uri' in source) return source.uri;
  return 'local-asset';
}

// ---------------------------------------------------------------------------
// Imperative handle — mirrors LottieView's own imperative API so callers can
// play, reset, pause, and resume through a ref on <LottieAnimation>.
// ---------------------------------------------------------------------------
export interface LottieAnimationHandle {
  play: (startFrame?: number, endFrame?: number) => void;
  reset: () => void;
  pause: () => void;
  resume: () => void;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface LottieAnimationProps {
  /** Lottie animation source, or null when the asset hasn't been added yet.
   *  When null, the component falls back to an ActivityIndicator. */
  source: LottieAnimationSource | null;
  /** Auto-play on mount. Defaults to true. Ignored when `progress` is provided. */
  autoPlay?: boolean;
  /** Loop the animation. Defaults to true. Ignored when `progress` is provided. */
  loop?: boolean;
  /** Playback speed multiplier. Defaults to 1. */
  speed?: number;
  /** Style applied to the LottieView / fallback. */
  style?: StyleProp<ViewStyle>;
  /** Called when a non-looping animation finishes. */
  onAnimationFinish?: (isCancelled: boolean) => void;
  /** Reanimated shared value (0–1) to drive progress manually. When provided,
   *  autoPlay and loop are ignored — the caller controls playback frame-by-frame
   *  from the UI thread for 60+ FPS scrubbing. */
  progress?: SharedValue<number>;
  /** TestID for automation. */
  testID?: string;
}

/**
 * LottieAnimation — the reusable Lottie wrapper for ThryftVerse.
 *
 * Features:
 *   - Hardware acceleration via `renderMode="HARDWARE"` + `hardwareAccelerationAndroid`
 *   - Native composition caching via `cacheComposition` (default true)
 *   - JS-level load tracking for cache introspection
 *   - Reanimated shared-value progress driving (via useAnimatedReaction bridge)
 *   - Graceful fallback to ActivityIndicator on missing asset or load error
 *   - Reduced-motion respect: looping animations collapse to ActivityIndicator;
 *     one-shot animations show the final frame statically
 *
 * Reanimated integration: `progress` (a SharedValue<number>) is bridged to
 * LottieView's `progress` prop via `useAnimatedReaction` + `runOnJS`. This
 * avoids a TypeScript inference incompatibility between Reanimated's
 * `createAnimatedComponent` and LottieView's class component, while still
 * driving the animation from the UI thread. The state update is cheap (a
 * single number prop) and LottieView seeks to the frame natively.
 *
 * Usage:
 *   <LottieAnimation source={SUCCESS_CHECKMARK} loop={false} onAnimationFinish={...} />
 *   <LottieAnimation source={LOADING_BRANDED} loop />
 *   <LottieAnimation source={customAnim} progress={progressSV} />
 */
export const LottieAnimation = React.forwardRef<
  LottieAnimationHandle,
  LottieAnimationProps
>(function LottieAnimation(
  {
    source,
    autoPlay = true,
    loop = true,
    speed = 1,
    style,
    onAnimationFinish,
    progress,
    testID,
  },
  ref,
) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const [hasError, setHasError] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const lottieRef = useRef<LottieView>(null);

  const cacheKey = sourceCacheKey(source);

  // Bridge Reanimated SharedValue → LottieView progress prop.
  // Called unconditionally (rules of hooks). When `progress` is undefined,
  // the reaction does nothing — the `if (progress)` guard inside the reaction
  // callback prevents unnecessary state updates.
  useAnimatedReaction(
    () => progress?.value ?? 0,
    (value, previous) => {
      if (progress && value !== previous) {
        runOnJS(setProgressValue)(value);
      }
    },
    [progress],
  );

  // Reset error state when the source changes.
  useEffect(() => {
    setHasError(false);
  }, [cacheKey]);

  // Track successful loads for cache introspection.
  useEffect(() => {
    if (source && !hasError) {
      loadedSources.add(cacheKey);
    }
  }, [cacheKey, source, hasError]);

  // Expose LottieView's imperative API through the forwarded ref.
  useImperativeHandle(
    ref,
    (): LottieAnimationHandle => ({
      play: (startFrame?: number, endFrame?: number) => {
        lottieRef.current?.play(startFrame, endFrame);
      },
      reset: () => {
        lottieRef.current?.reset();
      },
      pause: () => {
        lottieRef.current?.pause();
      },
      resume: () => {
        lottieRef.current?.resume();
      },
    }),
    [],
  );

  // ── Fallback: no source or load error ──────────────────────────────────
  if (!source || hasError) {
    return (
      <ActivityIndicator
        size="small"
        color={colors.brand}
        style={style}
        testID={testID}
      />
    );
  }

  // ── Reduced motion ─────────────────────────────────────────────────────
  // Looping animations collapse to ActivityIndicator (minimal spinner).
  // One-shot animations show the final frame statically (progress=1).
  // Externally-driven progress (SharedValue) is respected as-is — the caller
  // is responsible for their own reduced-motion handling.
  if (reducedMotion && !progress) {
    if (loop) {
      return (
        <ActivityIndicator
          size="small"
          color={colors.brand}
          style={style}
          testID={testID}
        />
      );
    }
    return (
      <LottieView
        ref={lottieRef}
        source={source}
        progress={1}
        loop={false}
        style={style}
        cacheComposition
        renderMode="HARDWARE"
        hardwareAccelerationAndroid
        testID={testID}
      />
    );
  }

  // ── Reanimated-driven progress ─────────────────────────────────────────
  if (progress) {
    return (
      <LottieView
        ref={lottieRef}
        source={source}
        progress={progressValue}
        loop={false}
        style={style}
        cacheComposition
        renderMode="HARDWARE"
        hardwareAccelerationAndroid
        onAnimationFailure={() => setHasError(true)}
        testID={testID}
      />
    );
  }

  // ── Standard declarative playback ──────────────────────────────────────
  return (
    <LottieView
      ref={lottieRef}
      source={source}
      autoPlay={autoPlay}
      loop={loop}
      speed={speed}
      style={style}
      cacheComposition
      renderMode="HARDWARE"
      hardwareAccelerationAndroid={Platform.OS === 'android'}
      onAnimationFinish={onAnimationFinish}
      onAnimationFailure={() => setHasError(true)}
      testID={testID}
    />
  );
});
