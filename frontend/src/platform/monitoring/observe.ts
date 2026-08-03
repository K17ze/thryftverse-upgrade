/**
 * EAS Observe integration — safe wrapper around `expo-observe`.
 *
 * This module mirrors the defensive `require()` pattern used by `sentry.ts` so
 * the app keeps working even when `expo-observe` is not installed (e.g. on SDK
 * builds where the package has not yet been added, or in Expo Go where the
 * native module is unavailable). When the package is present, the real
 * `ObserveRoot` and `markInteractive` are delegated to; otherwise lightweight
 * no-op stubs are used so callers can import unconditionally.
 *
 * EAS Observe (Open Beta as of 2026-06) collects Cold Launch, Warm Launch,
 * TTI (Time to Interactive), TTR (Time to First Render) and Bundle Load Time.
 * The first `markInteractive()` call records the TTI metric; subsequent calls
 * are ignored, so it is safe to call from multiple "app is usable" points.
 */

import React from 'react';

type MarkInteractiveAttributes = Record<string, string | number | boolean | null | undefined> | undefined;

interface ObserveLike {
  markInteractive?: (attributes?: MarkInteractiveAttributes) => void;
  markFirstRender?: () => void;
  configure?: (config: unknown) => void;
  setGlobalAttributes?: (attributes: unknown) => void;
}

type ObserveRootLike = React.ComponentType<React.PropsWithChildren<Record<string, unknown>>> & {
  wrap: <P extends Record<string, unknown>>(Component: React.ComponentType<P>) => React.ComponentType<P>;
};

const noop = () => undefined;

// Stubs used when expo-observe is unavailable. The ObserveRoot stub simply
// renders children so the React tree is unaffected.
const ObserveRootStub: ObserveRootLike = function ObserveRootStub({ children }) {
  return React.createElement(React.Fragment, null, children);
} as ObserveRootLike;
ObserveRootStub.wrap = <P extends Record<string, unknown>>(Component: React.ComponentType<P>) => Component;

let observeInstance: ObserveLike = {};
let observeRootComponent: ObserveRootLike = ObserveRootStub;
let observeAvailable = false;

try {
  // `require` is used (not a static `import`) so that a missing native module
  // or uninstalled package never breaks the JS bundle — same resilience
  // strategy as the Sentry wrapper.
  const observeModule = require('expo-observe');
  const Observe: ObserveLike = observeModule.Observe ?? observeModule.default ?? {};
  const ObserveRoot: ObserveRootLike = observeModule.ObserveRoot ?? ObserveRootStub;

  if (Observe && typeof Observe.markInteractive === 'function') {
    observeInstance = Observe;
  }
  if (ObserveRoot && (typeof ObserveRoot === 'function' || typeof ObserveRoot === 'object')) {
    observeRootComponent = ObserveRoot as ObserveRootLike;
  }
  observeAvailable = !!observeInstance.markInteractive;
} catch {
  // expo-observe is not installed or its native module is unavailable.
  // Keep the no-op stubs so the app continues to function.
}

/**
 * Marks the moment the app becomes interactive. Used by EAS Observe to
 * compute the TTI (Time to Interactive) metric. Only the first call records
 * the metric; later calls are ignored, so this is safe to invoke from every
 * "app is usable" point (splash resolved, feed rendered, login complete,
 * deep-link navigated).
 *
 * No-ops when `expo-observe` is not installed.
 */
export function markInteractive(attributes?: MarkInteractiveAttributes): void {
  try {
    observeInstance.markInteractive?.(attributes);
  } catch {
    // Never let observability surface a user-visible failure.
  }
}

/**
 * Marks the first render of the app. Used to compute `cold_ttr` and
 * `warm_ttr`. No-ops when `expo-observe` is not installed.
 */
export function markFirstRender(): void {
  try {
    observeInstance.markFirstRender?.();
  } catch {
    // Best-effort.
  }
}

/**
 * The `ObserveRoot` component. Wrap the app root with this (or use
 * `ObserveRoot.wrap(App)`) to enable launch metric collection. When
 * `expo-observe` is unavailable this renders children unchanged.
 */
export const ObserveRoot: ObserveRootLike = observeRootComponent;

/**
 * Whether the real `expo-observe` module was resolved and exposes
 * `markInteractive`. Useful for diagnostics and debug overlays.
 */
export function isObserveAvailable(): boolean {
  return observeAvailable;
}
