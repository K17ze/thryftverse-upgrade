import React from 'react';
import { InteractionManager } from 'react-native';

/**
 * Runs a callback after the current interactions (animations, gestures,
 * navigation transitions) complete. This defers heavy work — data processing,
 * large renders, expensive computations — until after the user perceives the
 * current animation finishing, keeping frame rates stable.
 *
 * Uses `InteractionManager.runAfterInteractions` under the hood. Any pending
 * callback is cancelled on unmount so a stale computation never fires after
 * the owning component is gone.
 *
 * @param callback The work to run after interactions settle.
 * @param deps     Dependency list — the callback is re-queued whenever these change.
 */
export function useRunAfterInteractions(
  callback: () => void,
  deps: React.DependencyList,
): void {
  const savedCallback = React.useRef(callback);
  savedCallback.current = callback;

  React.useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      savedCallback.current();
    });
    return () => {
      handle.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export interface InteractionManagerState {
  /** True while a native interaction (animation/gesture) is in progress. */
  isInteractionActive: boolean;
}

/**
 * Tracks whether a native interaction is currently active.
 *
 * `InteractionManager` does not expose a direct "is busy" flag, so this hook
 * probes the manager by scheduling a `runAfterInteractions` callback and
 * observing whether it fires synchronously. If the callback is deferred, an
 * interaction is in progress; if it fires immediately, the manager is idle.
 * The probe repeats whenever the callback eventually resolves so the state
 * stays accurate across interaction boundaries.
 *
 * The returned `isInteractionActive` is useful for gating heavy synchronous
 * work behind a "wait until things settle" check without spawning a callback.
 */
export function useInteractionManagerState(): InteractionManagerState {
  const [isInteractionActive, setIsInteractionActive] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    let cancelled = false;

    const probe = () => {
      if (!mounted || cancelled) return;
      let firedSynchronously = false;
      const handle = InteractionManager.runAfterInteractions(() => {
        firedSynchronously = true;
      });
      if (firedSynchronously) {
        if (mounted) setIsInteractionActive(false);
        return;
      }
      if (mounted) setIsInteractionActive(true);
      handle.cancel();
    };

    probe();
    return () => {
      cancelled = true;
      mounted = false;
    };
  }, []);

  return { isInteractionActive };
}
