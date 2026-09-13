import React from 'react';
import { Linking } from 'react-native';
import { useToast } from '../../context/ToastContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import {
  getPushPermissionStatus,
  requestPushPermissionWithContext,
  resetPushPermissionAskedFlag } from '../../lib/pushPermission';

export interface UseSettingsPushPermissionResult {
  /** OS-level push permission: null until probed (or probe failed). */
  pushPermissionGranted: boolean | null;
  /** True while the enable request is in flight. */
  isTogglingPush: boolean;
  handleTogglePushPermission: (enable: boolean) => Promise<void>;
}

/**
 * OS-level push permission state for the "Enable notifications" toggle.
 * Probes the real permission status on mount and handles the explicit
 * user-initiated re-enable flow.
 */
export function useSettingsPushPermission(): UseSettingsPushPermissionResult {
  const { show } = useToast();
  const { t: ts } = useAppTranslation('settings');

  const [pushPermissionGranted, setPushPermissionGranted] = React.useState<boolean | null>(null);
  const [isTogglingPush, setIsTogglingPush] = React.useState(false);

  // Read the current system push permission status on mount so the "Enable
  // notifications" toggle reflects the real OS-level state.
  React.useEffect(() => {
    let mounted = true;
    getPushPermissionStatus()
      .then((status) => {
        if (mounted) setPushPermissionGranted(status.status === 'granted');
      })
      .catch(() => {
        if (mounted) setPushPermissionGranted(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleTogglePushPermission = React.useCallback(
    async (enable: boolean) => {
      if (enable) {
        setIsTogglingPush(true);
        try {
          // Reset the contextual "asked" flag so the Settings toggle is an
          // explicit, user-initiated re-enable that always prompts the OS.
          await resetPushPermissionAskedFlag('settings');
          const granted = await requestPushPermissionWithContext('settings');
          setPushPermissionGranted(granted);
          show(
            granted ? ts('toast.pushEnabled') : ts('toast.pushDenied'),
            granted ? 'success' : 'info',
          );
        } catch {
          show(ts('toast.pushUpdateFailed'), 'error');
        } finally {
          setIsTogglingPush(false);
        }
      } else {
        // The OS push permission cannot be revoked programmatically. Direct
        // the user to the system settings screen where they can disable it.
        show(ts('toast.pushManageDeviceSettings'), 'info');
        Linking.openSettings().catch(() => undefined);
      }
    },
    [show, ts],
  );

  return {
    pushPermissionGranted,
    isTogglingPush,
    handleTogglePushPermission,
  };
}
