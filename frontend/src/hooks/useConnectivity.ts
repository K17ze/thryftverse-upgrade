import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * useConnectivity — subscribes to NetInfo and returns whether the device
 * is currently offline. Used by Co-Own screens to show CoOwnOfflineBanner.
 */
export function useConnectivity(): { isOffline: boolean; isConnected: boolean | null } {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected ?? null);
    });
    return () => unsubscribe();
  }, []);

  return { isOffline: isConnected === false, isConnected };
}
