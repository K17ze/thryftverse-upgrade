import { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { useMeteredConnection, MeteredConnectionState } from './useMeteredConnection';

/** Priority levels accepted by {@link useSmartPrefetch}. */
export type SmartPrefetchPriority = 'critical' | 'high' | 'normal';

/** Options accepted by {@link useSmartPrefetch}. */
export interface UseSmartPrefetchOptions {
  /** Prefetch priority. `critical` always prefetches, even on metered connections. Defaults to `normal`. */
  priority?: SmartPrefetchPriority;
  /** Conditionally enable / disable prefetching. Defaults to `true`. */
  enabled?: boolean;
  /** Maximum concurrent prefetch requests. Defaults to 4. */
  maxConcurrent?: number;
}

/** State returned by {@link useSmartPrefetch}. */
export interface SmartPrefetchState {
  /** True when all requested URIs have been prefetched into the image cache. */
  isPrefetched: boolean;
  /** True while a prefetch pass is currently in progress. */
  isPrefetching: boolean;
  /** True when the prefetch was skipped due to a metered / expensive connection. */
  skipped: boolean;
}

/** Safe initial state returned before the first prefetch pass completes. */
const INITIAL_STATE: SmartPrefetchState = {
  isPrefetched: false,
  isPrefetching: false,
  skipped: false,
};

/**
 * useSmartPrefetch — prefetches a set of image URIs only when the device is on
 * a Wi-Fi or unmetered connection, preserving the user's data allowance on
 * cellular / metered networks.
 *
 * `critical` priority URIs always prefetch regardless of network state — they
 * are required for first-viewport rendering. `high` and `normal` priority URIs
 * are skipped on metered connections (the hook reports `skipped: true` in that
 * case) and will be prefetched automatically once the device returns to an
 * unmetered connection.
 *
 * The hook re-runs whenever the URIs, options, or network metered state
 * change, so a surface that mounts on cellular and later joins Wi-Fi will
 * prefetch transparently without remounting.
 *
 * @param uris - Image URIs to prefetch. Invalid / non-http URIs are filtered out.
 * @param options - Priority, enabled flag, and concurrency options.
 */
export function useSmartPrefetch(
  uris: string[],
  options: UseSmartPrefetchOptions = {}
): SmartPrefetchState {
  const { priority = 'normal', enabled = true, maxConcurrent = 4 } = options;
  const { isMetered }: MeteredConnectionState = useMeteredConnection();

  const [state, setState] = useState<SmartPrefetchState>(INITIAL_STATE);
  // Track the latest pass so a stale async result does not overwrite a newer one.
  const passRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setState({ isPrefetched: false, isPrefetching: false, skipped: false });
      return;
    }

    const validUris = uris.filter(uri => uri && uri.startsWith('http'));
    if (validUris.length === 0) {
      setState({ isPrefetched: false, isPrefetching: false, skipped: false });
      return;
    }

    // On a metered connection, only critical priority prefetches.
    if (isMetered && priority !== 'critical') {
      setState({ isPrefetched: false, isPrefetching: false, skipped: true });
      return;
    }

    const pass = ++passRef.current;
    setState({ isPrefetched: false, isPrefetching: true, skipped: false });

    let cancelled = false;

    (async () => {
      try {
        for (let i = 0; i < validUris.length; i += maxConcurrent) {
          if (cancelled || pass !== passRef.current) return;
          const batch = validUris.slice(i, i + maxConcurrent);
          await Promise.all(
            batch.map(uri =>
              Image.prefetch(uri, {
                cachePolicy: 'memory-disk',
              })
            )
          );
        }
        if (!cancelled && pass === passRef.current) {
          setState({ isPrefetched: true, isPrefetching: false, skipped: false });
        }
      } catch (e) {
        if (!cancelled && pass === passRef.current) {
          console.warn('useSmartPrefetch failed:', e);
          setState({ isPrefetched: false, isPrefetching: false, skipped: false });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uris, priority, enabled, maxConcurrent, isMetered]);

  return state;
}
