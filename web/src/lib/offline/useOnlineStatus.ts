'use client';

/**
 * useOnlineStatus — web equivalent of mobile useConnectivity (NetInfo).
 *
 * Wraps `navigator.onLine` + the window `online`/`offline` events.
 * SSR-safe: the server render reports online (the honest default — a
 * server render implies a fetched page), and the real state lands on
 * hydration via useSyncExternalStore so there is no hydration mismatch.
 *
 * `isOffline` drives the global OfflineBanner (PlatformRuntime) and the
 * `offline` variant inside StateGate.
 */
import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

/** SSR + pre-hydration snapshot — a rendered page implies connectivity. */
function getServerSnapshot(): boolean {
  return true;
}

export interface OnlineStatus {
  /** True when the browser reports connectivity. */
  isOnline: boolean;
  /** True when the browser reports no connectivity. */
  isOffline: boolean;
}

export function useOnlineStatus(): OnlineStatus {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { isOnline, isOffline: !isOnline };
}
