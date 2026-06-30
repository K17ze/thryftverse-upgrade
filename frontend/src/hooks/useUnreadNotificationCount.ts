import { useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { getUnreadCount } from '../services/notificationsApi';
import { useStore } from '../store/useStore';

export function useUnreadNotificationCount() {
  const notificationCount = useStore((state) => state.notificationCount);
  const setNotificationCount = useStore((state) => state.setNotificationCount);
  const isAuthenticated = useStore((state) => state.isAuthenticated);
  const lastFetchRef = useRef<number>(0);

  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) {
      setNotificationCount(0);
      return;
    }
    try {
      const count = await getUnreadCount();
      setNotificationCount(count);
      lastFetchRef.current = Date.now();
    } catch {
      // best-effort
    }
  }, [isAuthenticated, setNotificationCount]);

  useEffect(() => {
    void fetchUnreadCount();

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const elapsed = Date.now() - lastFetchRef.current;
        if (elapsed > 30_000) {
          void fetchUnreadCount();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [fetchUnreadCount]);

  return notificationCount;
}
