/**
 * useHaptics — React hook for ThryftVerse haptics.
 *
 * Replaces the legacy `useHaptic` hook (expo-haptics) with a Core Haptics
 * abstraction that provides custom AHAP patterns, the new v3 haptic types,
 * and worklet-compatible triggers.
 *
 * ## Accessibility — reduced motion
 *
 * The hook checks `useReducedMotion()` and disables all haptic feedback when
 * the user has enabled Reduce Motion at the OS level or in-app. This is an
 * accessibility best practice: motion and haptics degrade together so the
 * interface remains calm for users who have opted out of animation
 * (AGENTS.md §18).
 *
 * ## Worklet compatibility
 *
 * The underlying `react-native-haptic-feedback` native module is JSI-backed
 * on the New Architecture. The `trigger()` and `triggerPattern()` calls are
 * synchronous native invocations that do not cross the JS bridge, making
 * them safe to call from Reanimated worklets (`'worklet'` directive).
 *
 * When calling from a worklet, import the engine functions directly rather
 * than through the hook (hooks cannot run in worklet context):
 *
 * ```ts
 * import { confirm } from '@/platform/haptics';
 *
 * const gesture = Gesture.Tap().onEnd(() => {
 *   'worklet';
 *   confirm(); // safe — synchronous JSI call
 * });
 * ```
 *
 * ## Stability
 *
 * The returned object is stable across renders. Each method is memoised via
 * `useCallback` with an empty dependency array, and the reduced-motion gate
 * is read from a `useRef` so the callbacks never need to be recreated when
 * the setting changes.
 *
 * @example
 * const haptics = useHaptics();
 * haptics.impact('medium');     // medium impact
 * haptics.confirm();            // crisp double-tap confirmation
 * haptics.toggleOn();           // warm rising toggle-on pattern
 */

import { useCallback, useMemo, useRef } from 'react';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { HapticsEngine } from './HapticsEngine';
import type {
  HapticImpactStyle,
  HapticNotificationType,
  HapticsAPI,
} from './types';

/**
 * Minimum interval between haptic triggers from the hook layer, in
 * milliseconds. Prevents the rapid-fire buzzing that occurs when many
 * JS-thread callers fire haptics within the same frame (e.g. segment ticks
 * during a fast scroll, or multiple primitives toggling together). The
 * engine itself remains worklet-safe and ungated so direct worklet callers
 * keep their low-latency path.
 */
const HAPTIC_RATE_LIMIT_MS = 50;

let _lastHookHapticTs = 0;

/**
 * Gate a haptic fire by the rate-limit window. Returns true when the call
 * is allowed through, false when it falls inside the suppression window.
 */
function rateLimitAllows(): boolean {
  const now = Date.now();
  if (now - _lastHookHapticTs < HAPTIC_RATE_LIMIT_MS) return false;
  _lastHookHapticTs = now;
  return true;
}

/**
 * React hook that provides all haptic methods.
 *
 * @returns A stable `HapticsAPI` object. All methods are no-ops when
 *          haptics are disabled or when Reduce Motion is active.
 */
export function useHaptics(): HapticsAPI {
  const reducedMotion = useReducedMotion();

  // Hold the latest reduced-motion value in a ref so the useCallback
  // closures can read it without being recreated on every toggle.
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  // ── Stable callbacks ──────────────────────────────────────────────────

  const impact = useCallback((style: HapticImpactStyle) => {
    if (reducedMotionRef.current) return;
    if (!rateLimitAllows()) return;
    HapticsEngine.triggerImpact(style);
  }, []);

  const notification = useCallback((type: HapticNotificationType) => {
    if (reducedMotionRef.current) return;
    if (!rateLimitAllows()) return;
    HapticsEngine.triggerNotification(type);
  }, []);

  const selection = useCallback(() => {
    if (reducedMotionRef.current) return;
    if (!rateLimitAllows()) return;
    HapticsEngine.triggerSelection();
  }, []);

  const confirm = useCallback(() => {
    if (reducedMotionRef.current) return;
    if (!rateLimitAllows()) return;
    HapticsEngine.confirm();
  }, []);

  const reject = useCallback(() => {
    if (reducedMotionRef.current) return;
    if (!rateLimitAllows()) return;
    HapticsEngine.reject();
  }, []);

  const gestureStart = useCallback(() => {
    if (reducedMotionRef.current) return;
    if (!rateLimitAllows()) return;
    HapticsEngine.gestureStart();
  }, []);

  const gestureEnd = useCallback(() => {
    if (reducedMotionRef.current) return;
    if (!rateLimitAllows()) return;
    HapticsEngine.gestureEnd();
  }, []);

  const segmentTick = useCallback(() => {
    if (reducedMotionRef.current) return;
    if (!rateLimitAllows()) return;
    HapticsEngine.segmentTick();
  }, []);

  const toggleOn = useCallback(() => {
    if (reducedMotionRef.current) return;
    if (!rateLimitAllows()) return;
    HapticsEngine.toggleOn();
  }, []);

  const toggleOff = useCallback(() => {
    if (reducedMotionRef.current) return;
    if (!rateLimitAllows()) return;
    HapticsEngine.toggleOff();
  }, []);

  const increment = useCallback(() => {
    if (reducedMotionRef.current) return;
    if (!rateLimitAllows()) return;
    HapticsEngine.increment();
  }, []);

  const decrement = useCallback(() => {
    if (reducedMotionRef.current) return;
    if (!rateLimitAllows()) return;
    HapticsEngine.decrement();
  }, []);

  const successCelebration = useCallback(() => {
    if (reducedMotionRef.current) return;
    if (!rateLimitAllows()) return;
    HapticsEngine.successCelebration();
  }, []);

  const errorShake = useCallback(() => {
    if (reducedMotionRef.current) return;
    if (!rateLimitAllows()) return;
    HapticsEngine.errorShake();
  }, []);

  // ── Stable API object ─────────────────────────────────────────────────

  return useMemo<HapticsAPI>(
    () => ({
      impact,
      notification,
      selection,
      confirm,
      reject,
      gestureStart,
      gestureEnd,
      segmentTick,
      toggleOn,
      toggleOff,
      increment,
      decrement,
      successCelebration,
      errorShake,
    }),
    [
      impact,
      notification,
      selection,
      confirm,
      reject,
      gestureStart,
      gestureEnd,
      segmentTick,
      toggleOn,
      toggleOff,
      increment,
      decrement,
      successCelebration,
      errorShake,
    ],
  );
}
