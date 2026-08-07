import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * useConnectivity — subscribes to NetInfo and returns whether the device
 * is currently offline, plus the active connection type. Used by Co-Own
 * screens to show CoOwnOfflineBanner and by the global OfflineQueueBanner
 * to surface pending offline actions.
 *
 * Per 2026 August React Native offline-first best practices, the hook also
 * seeds an initial connectivity snapshot via `NetInfo.fetch()` so the first
 * render is not stuck on the optimistic "online" default.
 */
export interface ConnectivityState {
  /** True when NetInfo reports `isConnected === false`. */
  isOffline: boolean;
  /** Raw `isConnected` value (`null` until the first event arrives). */
  isConnected: boolean | null;
  /** Active connection type reported by NetInfo (e.g. 'wifi', 'cellular', 'none', 'unknown'). */
  connectionType: string;
}

export function useConnectivity(): ConnectivityState {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [connectionType, setConnectionType] = useState<string>('unknown');

  useEffect(() => {
    // Seed an initial snapshot so the first render reflects real state
    // instead of the optimistic default.
    NetInfo.fetch()
      .then((state) => {
        setIsConnected(state.isConnected ?? null);
        setConnectionType(state.type);
      })
      .catch(() => {
        // NetInfo.fetch can reject on bare/native bridges without a network
        // module; leave the optimistic default in place.
      });

    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected ?? null);
      setConnectionType(state.type);
    });
    return () => unsubscribe();
  }, []);

  return { isOffline: isConnected === false, isConnected, connectionType };
}
