/**
 * useScreenCaptureProtection — blocks screenshots and screen recording on
 * sensitive screens (wallet, payments, co-own assets, trading).
 *
 * Platform behaviour:
 *
 * - **Android**: `preventScreenCaptureAsync()` sets `FLAG_SECURE` on the
 *   window. Screenshots and screen recordings are blocked at the OS level
 *   and the recent-apps preview shows a blank surface. This is the canonical
 *   Android approach and is completely invisible to the user during normal
 *   foreground use.
 *
 * - **iOS**: `preventScreenCaptureAsync()` blocks screenshots (iOS 13+) and
 *   screen recordings (iOS 11+) at the OS level. Additionally,
 *   `enableAppSwitcherProtectionAsync()` applies a privacy blur overlay that
 *   hides sensitive content in the app switcher, background snapshots, and
 *   during interruptions (Control Center, Siri, calls). The overlay is
 *   invisible while the app is foregrounded and active.
 *
 * Design constraints honoured:
 *
 * - **Invisible to the user.** No visual disruption is applied on protected
 *   screens while the app is in the foreground. The hard block prevents the
 *   capture entirely; the iOS app-switcher blur only activates when the app
 *   leaves the foreground.
 * - **Reduced motion.** The iOS app-switcher overlay is applied instantly —
 *   no animated blur transition. When reduced motion is enabled the blur
 *   intensity is maximised (full opaque cover) so no partial transparency
 *   can leak content during the snapshot.
 * - **No listener leak.** All flags and overlays are torn down on unmount.
 * - **Safe navigation between protected screens.** Each hook instance uses a
 *   unique key so that unmounting one protected screen does not prematurely
 *   re-enable capture while the next protected screen is mounting.
 *
 * Call once at the top of a sensitive screen component — the hook handles
 * everything internally.
 */

import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import {
  preventScreenCaptureAsync,
  allowScreenCaptureAsync,
  enableAppSwitcherProtectionAsync,
  disableAppSwitcherProtectionAsync,
} from 'expo-screen-capture';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Protects the calling screen from screenshots and screen recording for as
 * long as the component is mounted.
 *
 * The hook is a no-op on platforms where the native module is not linked
 * (web, Expo Go without a custom dev client) — the underlying
 * `expo-screen-capture` calls reject silently and the screen renders
 * normally.
 */
export function useScreenCaptureProtection(): void {
  const reducedMotion = useReducedMotion();

  // Read reduced motion via a ref so the effect only runs once on mount.
  // Re-running the effect on a reduced-motion change would briefly tear
  // down protection during the transition — undesirable on a sensitive
  // screen. The ref captures the latest value without re-subscribing.
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  // A unique key per hook instance prevents two protected screens from
  // sharing the same "default" tag. When the user navigates from one
  // protected screen to another, the outgoing screen's cleanup calls
  // `allowScreenCaptureAsync(outgoingKey)` — which only re-enables capture
  // when *no* keys remain active. Because the incoming screen registered a
  // different key, capture stays blocked across the transition.
  const keyRef = useRef<string>('');
  if (keyRef.current === '') {
    keyRef.current = `thryft-screen-protection-${Math.random().toString(36).slice(2, 10)}`;
  }

  useEffect(() => {
    const key = keyRef.current;
    let didPrevent = false;
    let didEnableSwitcherProtection = false;

    // Hard-block screenshots and screen recording at the OS level.
    // Android → FLAG_SECURE. iOS → prevents screenshots (13+) and
    // screen recordings (11+).
    preventScreenCaptureAsync(key)
      .then(() => {
        didPrevent = true;
      })
      .catch(() => {
        // Native module unavailable — degrade silently. The screen still
        // renders; only the capture protection is absent.
      });

    // iOS: blur the app preview in the task switcher / background snapshots.
    // Invisible while the app is foregrounded and active.
    if (Platform.OS === 'ios') {
      // Reduced motion → full opaque cover (intensity 1.0) so no partial
      // transparency can leak content during the snapshot. Otherwise a
      // strong blur (0.85) that obscures detail while preserving the
      // app's visual identity in the switcher.
      const blurIntensity = reducedMotionRef.current ? 1.0 : 0.85;
      enableAppSwitcherProtectionAsync(blurIntensity)
        .then(() => {
          didEnableSwitcherProtection = true;
        })
        .catch(() => {
          // Not supported on this iOS version or module unavailable.
        });
    }

    return () => {
      if (didPrevent) {
        allowScreenCaptureAsync(key).catch(() => {});
      }
      if (didEnableSwitcherProtection) {
        disableAppSwitcherProtectionAsync().catch(() => {});
      }
    };
    // Intentionally empty dependency array — protection is established once
    // on mount and torn down once on unmount. `reducedMotionRef` is read
    // synchronously inside the effect without subscribing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
