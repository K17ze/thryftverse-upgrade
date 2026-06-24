import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager, focusManager } from '@tanstack/react-query';

export function useMobileQueryLifecycle() {
  useEffect(() => {
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      onlineManager.setOnline(
        Boolean(state.isConnected && state.isInternetReachable !== false),
      );
    });

    return () => {
      unsubscribeNetInfo();
    };
  }, []);

  useEffect(() => {
    const handleAppStateChange = (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active');
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    focusManager.setFocused(AppState.currentState === 'active');

    return () => {
      subscription.remove();
    };
  }, []);
}
