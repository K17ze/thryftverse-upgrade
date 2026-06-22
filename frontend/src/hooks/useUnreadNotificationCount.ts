import { useEffect, useCallback } from 'react';
import { getUnreadCount } from '../services/notificationsApi';
import { useStore } from '../store/useStore';
import { useFocusEffect } from '@react-navigation/native';

export function useUnreadNotificationCount() {
  const notificationCount = useStore((state) => state.notificationCount);
  const setNotificationCount = useStore((state) => state.setNotificationCount);
  const isAuthenticated = useStore((state) => state.isAuthenticated);

  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) {
      setNotificationCount(0);
      return;
    }
    try {
      const count = await getUnreadCount();
      setNotificationCount(count);
    } catch {
      // best-effort
    }
  }, [isAuthenticated, setNotificationCount]);

  // Fetch on mount and when auth state changes
  useEffect(() => {
    void fetchUnreadCount();
    const interval = setInterval(() => {
      void fetchUnreadCount();
    }, 60_000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Refetch when any screen gains focus
  useFocusEffect(
    useCallback(() => {
      void fetchUnreadCount();
    }, [fetchUnreadCount])
  );

  return notificationCount;
}
