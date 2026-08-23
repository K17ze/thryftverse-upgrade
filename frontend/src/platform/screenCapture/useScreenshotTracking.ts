/**
 * useScreenshotTracking — detects screenshots on non-protected screens and
 * reports them to analytics.
 *
 * This hook is mounted once at the app root so it observes every screenshot
 * taken while the app is foregrounded, regardless of which screen is active.
 * Screens that call `useScreenCaptureProtection` block screenshots at the OS
 * level, so this listener only fires on non-protected screens — exactly the
 * surfaces where we want to track (not block) the action.
 *
 * On each screenshot the `screenshot_taken` analytics event is captured with
 * the current route name, enabling funnel analysis ("do users screenshot
 * listings before purchasing?") without recording any PII.
 *
 * Platform notes:
 * - **iOS**: always fires; no permission required.
 * - **Android**: requires `READ_EXTERNAL_STORAGE` (pre-13) or
 *   `READ_MEDIA_IMAGES` (13). When the permission is absent the listener
 *   silently never fires — the app continues to operate normally.
 */

import { useEffect, useRef } from 'react';
import { addScreenshotListener } from 'expo-screen-capture';
import { track } from '../../analytics';
import { getAppNavigationRef } from '../monitoring/appNavigation';

/**
 * Resolves the current screen name from the app's navigation ref. Returns
 * `'unknown'` when the navigator is not ready or no route is focused, so the
 * analytics event always carries a usable string.
 */
function resolveCurrentScreenName(): string {
  try {
    const ref = getAppNavigationRef();
    if (!ref || !ref.isReady()) {
      return 'unknown';
    }
    const route = ref.getCurrentRoute();
    return route?.name ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Listens for screenshots for the lifetime of the calling component and
 * reports each one to analytics with the active screen name.
 *
 * Mount once at the app root — the listener is global and covers all
 * non-protected screens.
 */
export function useScreenshotTracking(): void {
  // Keep the listener callback stable via a ref so we never resubscribe.
  // The callback reads the current screen name at fire time, not at
  // subscribe time, so a single subscription correctly attributes every
  // screenshot to whatever screen is active when it is taken.
  const handleScreenshotRef = useRef<() => void>(() => {});
  handleScreenshotRef.current = () => {
    track('screenshot_taken', { screen: resolveCurrentScreenName() });
  };

  useEffect(() => {
    const subscription = addScreenshotListener(() => {
      handleScreenshotRef.current();
    });

    return () => {
      subscription.remove();
    };
  }, []);
}
