import { useCallback } from 'react';
import {
  showNotification,
  dismissNotification,
  clearAll,
  type NotificationType,
  type NotificationPriority,
} from '../services/inAppNotificationsApi';

export interface NotificationAction {
  label: string;
  target: string;
}

export interface UseNotificationsResult {
  showSuccess: (
    title: string,
    body?: string,
    action?: NotificationAction,
  ) => void;
  showWarning: (
    title: string,
    body?: string,
    action?: NotificationAction,
  ) => void;
  showError: (
    title: string,
    body?: string,
    action?: NotificationAction,
  ) => void;
  showInfo: (
    title: string,
    body?: string,
    action?: NotificationAction,
  ) => void;
  showOffer: (title: string, body: string, action: NotificationAction) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

/**
 * Hook for components to show in-app notifications.
 *
 * Each helper maps to a NotificationType and uses sensible default durations
 * and priorities from the service. All notifications are mock/illustrative
 * while NOTIFICATION_DEMO_MODE is true (per AGENTS.md §11).
 */
export function useNotifications(): UseNotificationsResult {
  const show = useCallback(
    (
      type: NotificationType,
      title: string,
      body?: string,
      action?: NotificationAction,
      priority?: NotificationPriority,
    ) => {
      showNotification({
        type,
        title,
        body,
        actionLabel: action?.label,
        actionTarget: action?.target,
        priority: priority ?? 'normal',
      });
    },
    [],
  );

  const showSuccess = useCallback(
    (title: string, body?: string, action?: NotificationAction) => {
      show('success', title, body, action);
    },
    [show],
  );

  const showWarning = useCallback(
    (title: string, body?: string, action?: NotificationAction) => {
      show('warning', title, body, action);
    },
    [show],
  );

  const showError = useCallback(
    (title: string, body?: string, action?: NotificationAction) => {
      show('error', title, body, action);
    },
    [show],
  );

  const showInfo = useCallback(
    (title: string, body?: string, action?: NotificationAction) => {
      show('info', title, body, action);
    },
    [show],
  );

  const showOffer = useCallback(
    (title: string, body: string, action: NotificationAction) => {
      show('offer', title, body, action);
    },
    [show],
  );

  const dismiss = useCallback((id: string) => {
    dismissNotification(id);
  }, []);

  const dismissAll = useCallback(() => {
    clearAll();
  }, []);

  return {
    showSuccess,
    showWarning,
    showError,
    showInfo,
    showOffer,
    dismiss,
    dismissAll,
  };
}
