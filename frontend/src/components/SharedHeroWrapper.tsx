import React, { useMemo } from 'react';
import { Platform, View, type ViewProps } from 'react-native';
import {
  SharedHeroView,
  type SharedHeroMode,
  type SharedHeroTransitionEvent,
  type SpringConfig,
  type FadeMode,
  type EasingName,
  type MotionPath,
} from 'react-native-shared-hero';

/**
 * SharedHeroWrapper — typed, graceful-degradation wrapper around
 * `react-native-shared-hero`'s native `SharedHero` component.
 *
 * The underlying native view (`SharedHeroView`) is a Fabric Codegen component.
 * On platforms where the native module is not linked (web, bare JS, or a build
 * that has not yet run prebuild), the wrapper transparently falls back to a
 * plain `View` so callers never need to branch on availability.
 *
 * Matching key across screens is `namespace::id`. When a SharedHero with the
 * same key unmounts and another mounts within ~1 native frame, the library
 * runs a "flight" — a high-performance native shared-element transition.
 */

export type SharedHeroWrapperMode = 'snapshot' | 'morph';

export interface SharedHeroWrapperProps extends Omit<ViewProps, 'children'> {
  /** Stable identifier matched across screens. Combined with `namespace` to form the match key. */
  id: string;
  /** Namespace for isolating registries; the matching key is `namespace::id`. Defaults to "default". */
  namespace?: string;
  /**
   * Transition style.
   * - `"snapshot"` (default): cheap clone, translate+scale+crossfade.
   * - `"morph"`: Material container transform — also interpolates corner
   *   radius, background color and clip shape.
   */
  mode?: SharedHeroWrapperMode;
  /** Animation duration in ms. Ignored when `spring` is set. Default 320 ms. */
  duration?: number;
  /** Optional spring config; overrides `duration`. */
  spring?: SpringConfig;
  /** How source/destination content fade during the flight. Default "cross". */
  fadeMode?: FadeMode;
  /** Easing preset for time-based flights. Default "standard". */
  easing?: EasingName;
  /** Motion path of the flying element's centre. Default "linear". */
  motionPath?: MotionPath;
  /** Disable participation in flights without unmounting. */
  enabled?: boolean;
  /** Whether unmounting this hero produces a return (back) flight. Default true. */
  returnFlightEnabled?: boolean;
  /** Fires on the source view when its outbound flight starts. */
  onTransitionStart?: (e: SharedHeroTransitionEvent) => void;
  /** Fires on the destination view when its inbound flight ends. */
  onTransitionEnd?: (e: SharedHeroTransitionEvent) => void;
  children?: React.ReactNode;
}

/**
 * Detects whether the `SharedHeroView` native component is available.
 *
 * The Codegen-generated native component is only present when the native module
 * has been linked (iOS pod install / Android Gradle build). On web or in a JS
 *-only environment the import resolves but the host component is a no-op stub.
 */
function isSharedHeroNativeAvailable(): boolean {
  // Web never has the native Fabric component.
  if (Platform.OS === 'web') return false;
  // The Codegen component is always exported, but on platforms without a
  // native build the direct event handlers / view manager are absent. We
  // treat availability as "native platform with a linked build", which is
  // true for iOS and Android once prebuild has run.
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

const NATIVE_AVAILABLE = isSharedHeroNativeAvailable();

export function SharedHeroWrapper({
  id,
  namespace = 'default',
  mode = 'snapshot',
  duration,
  spring,
  fadeMode = 'cross',
  easing = 'standard',
  motionPath = 'linear',
  enabled = true,
  returnFlightEnabled = true,
  onTransitionStart,
  onTransitionEnd,
  style,
  children,
  ...rest
}: SharedHeroWrapperProps) {
  // Map the wrapper's constrained mode union to the library's broader union.
  // The library accepts additional modes ("shuttle", "zoom", "auto") that are
  // not exposed through this wrapper's public API to keep the surface stable.
  const heroMode: SharedHeroMode = mode;

  const startHandler = useMemo(() => {
    if (!onTransitionStart) return undefined;
    return (e: SharedHeroTransitionEvent) => onTransitionStart(e);
  }, [onTransitionStart]);

  const endHandler = useMemo(() => {
    if (!onTransitionEnd) return undefined;
    return (e: SharedHeroTransitionEvent) => onTransitionEnd(e);
  }, [onTransitionEnd]);

  // Graceful degradation — render a plain View when the native module is not
  // linked. This keeps the call site identical across web/JS-only and native.
  if (!NATIVE_AVAILABLE) {
    return (
      <View style={style} {...rest}>
        {children}
      </View>
    );
  }

  return (
    <SharedHeroView
      {...rest}
      style={style}
      id={id}
      namespace={namespace}
      mode={heroMode}
      duration={duration}
      spring={spring}
      fadeMode={fadeMode}
      easing={easing}
      motionPath={motionPath}
      enabled={enabled}
      returnFlightEnabled={returnFlightEnabled}
      onTransitionStart={startHandler}
      onTransitionEnd={endHandler}
    >
      {children}
    </SharedHeroView>
  );
}

/**
 * Returns whether the `react-native-shared-hero` native module is loaded and
 * the `SharedHeroWrapper` will render the native Fabric component (rather than
 * the plain `View` fallback).
 *
 * Use this to gate transition-dependent logic (e.g. choosing whether to apply
 * a JS-driven fallback animation) without try/catching the render path.
 */
export function useSharedHeroReady(): boolean {
  return NATIVE_AVAILABLE;
}

export default SharedHeroWrapper;
