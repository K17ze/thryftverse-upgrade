import React from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { useAccessibilityPreferences } from '../context/AccessibilityPreferencesContext';

/**
 * Tracks the OS-level "Reduce Motion" accessibility setting, ORed with the
 * in-app accessibility preference.
 *
 * On iOS: Settings → Accessibility → Motion → Reduce Motion.
 * On Android: Settings → Accessibility → Remove animations.
 *
 * The in-app preference (from AccessibilityPreferencesContext) is ORed with
 * the OS setting so that a user who enables in-app reduced motion gets
 * reduced motion even if the OS setting is off. This makes the
 * AccessibilitySettingsScreen toggle truthful (AGENTS.md §11).
 *
 * All animated surfaces should branch on this and collapse to instant / simple
 * fade fallbacks (AGENTS.md §17, §18, §27.2). `useMotionConfig` already
 * consumes this hook; callers that need raw access can use this directly.
 */
export function useReducedMotion() {
  const { reducedMotion: inAppReducedMotion } = useAccessibilityPreferences();
  const [osReducedMotion, setOsReducedMotion] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) {
          setOsReducedMotion(enabled);
        }
      })
      .catch(() => {
        if (mounted) {
          setOsReducedMotion(false);
        }
      });

    const subscription = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (enabled) => {
        if (mounted) {
          setOsReducedMotion(enabled);
        }
      }
    );

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  return osReducedMotion || inAppReducedMotion;
}

/**
 * Tracks the iOS "Reduce Transparency" accessibility setting.
 *
 * Per AGENTS.md §27.5 (iOS 26 Liquid Glass): glass materials must check this
 * before rendering and fall back to an opaque surface when enabled. On
 * Android this is always `false` (no equivalent setting).
 */
export function useReducedTransparency() {
  const [reducedTransparency, setReducedTransparency] = React.useState(false);

  React.useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }

    let mounted = true;

    // isReduceTransparencyEnabled is iOS-only; guard for web/Android.
    const api = AccessibilityInfo as unknown as {
      isReduceTransparencyEnabled?: () => Promise<boolean>;
      addEventListener?: (
        event: string,
        cb: (enabled: boolean) => void
      ) => { remove?: () => void };
    };

    api.isReduceTransparencyEnabled?.()
      .then((enabled) => {
        if (mounted) {
          setReducedTransparency(enabled);
        }
      })
      .catch(() => {
        if (mounted) {
          setReducedTransparency(false);
        }
      });

    const subscription = api.addEventListener?.(
      'reduceTransparencyChanged',
      (enabled) => {
        if (mounted) {
          setReducedTransparency(enabled);
        }
      }
    );

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  return reducedTransparency;
}
