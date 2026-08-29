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
