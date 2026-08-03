import type { NavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';

/**
 * Module-level holder for the app's primary navigation container ref.
 *
 * App.tsx registers its `navigationRef` here at startup so that the
 * `AppErrorBoundary` (which wraps the NavigationContainer and therefore
 * cannot import App.tsx without a circular dependency) can reset navigation
 * state during crash recovery.
 *
 * This decouples the error boundary from the navigation container while
 * keeping a single source of truth for the active ref.
 */
let registeredRef: NavigationContainerRef<RootStackParamList> | null = null;

export function registerAppNavigationRef(
  ref: NavigationContainerRef<RootStackParamList> | null,
): void {
  registeredRef = ref;
}

export function getAppNavigationRef(): NavigationContainerRef<RootStackParamList> | null {
  return registeredRef;
}

/**
 * Reset navigation to the MainTabs root so the app re-renders a known-good
 * screen after a crash. Returns true if the reset was dispatched, false if the
 * ref is unavailable or the navigator is not ready.
 */
export function resetNavigationToHome(): boolean {
  const ref = registeredRef;
  if (!ref || !ref.isReady()) return false;
  try {
    ref.reset({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    });
    return true;
  } catch {
    // Navigation reset must never crash the app during recovery.
    return false;
  }
}
