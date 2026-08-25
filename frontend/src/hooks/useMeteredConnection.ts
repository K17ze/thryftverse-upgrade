import { useEffect, useState } from 'react';
import * as Network from 'expo-network';
import { NetworkStateType } from 'expo-network';

/**
 * Metered connection state returned by {@link useMeteredConnection}.
 *
 * `expo-network` does not expose a native `isMetered` flag on every platform,
 * so `isMetered` / `isConnectionExpensive` are inferred from the active
 * connection type: cellular connections are treated as metered/expensive,
 * while Wi-Fi and Ethernet are treated as unmetered. Unknown types fall back
 * to the safe (unmetered) default so the app never blocks critical prefetches
 * purely because the OS could not classify the network.
 */
export interface MeteredConnectionState {
  /** True when the active connection is likely metered (e.g. cellular data). */
  isMetered: boolean;
  /** True when the active connection is likely expensive to use. */
  isConnectionExpensive: boolean;
  /** Active connection type reported by expo-network (e.g. 'WIFI', 'CELLULAR'), or `null` until the first event arrives. */
  connectionType: string | null;
}

/** Safe defaults used before the first network event arrives and on any API failure. */
const SAFE_DEFAULTS: MeteredConnectionState = {
  isMetered: false,
  isConnectionExpensive: false,
  connectionType: null,
};

/**
 * Infers metered / expensive status from a `NetworkState`.
 *
 * Cellular connections are the canonical metered case. Wi-Fi and Ethernet are
 * generally unmetered. VPN is ambiguous (it tunnels over another transport),
 * so we treat it as unmetered to avoid blocking critical prefetches behind a
 * VPN that is itself riding Wi-Fi. Everything else falls back to the safe
 * unmetered default.
 */
function deriveMeteredState(state: Network.NetworkState): MeteredConnectionState {
  const type = state.type ?? null;
  const isCellular = type === NetworkStateType.CELLULAR;
  return {
    isMetered: isCellular,
    isConnectionExpensive: isCellular,
    connectionType: type ?? null,
  };
}

/**
 * useMeteredConnection — subscribes to `expo-network` and reports whether the
 * device is currently on a metered / expensive connection (e.g. cellular data).
 *
 * Used by the image preloader and `useSmartPrefetch` to skip non-critical image
 * prefetches on metered networks, preserving the user's data allowance. The
 * hook seeds an initial snapshot via `Network.getNetworkStateAsync()` so the
 * first render reflects real state, then updates live via
 * `Network.addNetworkStateListener`.
 *
 * If the `expo-network` API is unavailable (e.g. web, missing native module,
 * or a rejected promise), the hook gracefully degrades to the safe defaults —
 * it never throws and never blocks critical prefetches.
 */
export function useMeteredConnection(): MeteredConnectionState {
  const [state, setState] = useState<MeteredConnectionState>(SAFE_DEFAULTS);

  useEffect(() => {
    let mounted = true;

    // Seed an initial snapshot so the first render reflects real state.
    Network.getNetworkStateAsync()
      .then((networkState) => {
        if (mounted) {
          setState(deriveMeteredState(networkState));
        }
      })
      .catch(() => {
        // expo-network can reject on platforms without a native network
        // module; leave the safe defaults in place.
      });

    // Subscribe to live network state changes.
    let subscription: { remove?: () => void } | undefined;
    try {
      subscription = Network.addNetworkStateListener((networkState) => {
        if (mounted) {
          setState(deriveMeteredState(networkState));
        }
      });
    } catch {
      // addNetworkStateListener can throw when the native module is missing
      // (e.g. web). Safe defaults remain in place.
    }

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  return state;
}
