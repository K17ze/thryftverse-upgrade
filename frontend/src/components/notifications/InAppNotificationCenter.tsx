import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InAppNotificationBanner } from './InAppNotificationBanner';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, ZIndex } from '../../theme/designTokens';
import {
  subscribe,
  dismissNotification,
  getActiveNotifications,
  type InAppNotification,
} from '../../services/inAppNotificationsApi';
import { getAppNavigationRef } from '../../platform/monitoring/appNavigation';

/**
 * Global notification container — renders active banners as a stacked overlay
 * fixed at the top of the screen (below the status bar).
 *
 * Subscribes to the in-app notification service and renders up to 3 banners.
 * Should be mounted once at the root level, above all screens but below modals.
 */
export function InAppNotificationCenter() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<InAppNotification[]>(() =>
    getActiveNotifications(),
  );

  useEffect(() => {
    const unsubscribe = subscribe((active) => {
      setNotifications(active);
    });
    return unsubscribe;
  }, []);

  const handleDismiss = useCallback((id: string) => {
    dismissNotification(id);
  }, []);

  const handleAction = useCallback((notification: InAppNotification) => {
    if (!notification.actionTarget) return;
    const ref = getAppNavigationRef();
    if (!ref || !ref.isReady()) return;
    // actionTarget format: "screenName" or "screenName:{jsonParams}"
    const target = notification.actionTarget;
    const colonIdx = target.indexOf(':');
    const screen = colonIdx >= 0 ? target.slice(0, colonIdx) : target;
    const paramsJson = colonIdx >= 0 ? target.slice(colonIdx + 1) : undefined;
    let params: unknown;
    if (paramsJson) {
      try { params = JSON.parse(paramsJson); } catch { return; }
    }
    const nav = ref as { navigate: (screen: string, params?: unknown) => void };
    nav.navigate(screen, params);
    dismissNotification(notification.id);
  }, []);

  if (notifications.length === 0) return null;

  return (
    <View
      style={[styles.container, { top: 0 }]}
      pointerEvents="box-none"
    >
      {notifications.map((notification, index) => (
        <InAppNotificationBanner
          key={notification.id}
          notification={notification}
          onDismiss={handleDismiss}
          onAction={handleAction}
          index={index}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: ZIndex.toast,
    gap: Space.xs,
  },
});
