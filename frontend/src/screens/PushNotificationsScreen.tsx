import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { Colors } from '../constants/colors';
import { Space, Radius, Type } from '../theme/designTokens';
import { PUSH_NOTIFICATION_DEFINITIONS } from '../preferences/settingsPreferences';
import { useToast } from '../context/ToastContext';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';
import { useStore } from '../store/useStore';
import { parseApiError } from '../lib/apiClient';
import { deactivateNotificationDevice, registerNotificationDevice, getNotificationPreferences, updateNotificationPreferences, listNotificationDevices } from '../services/notificationsApi';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Typography } from '../theme/designTokens';
import { SettingsSection } from '../components/settings/SettingsSection';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsRow } from '../components/settings/SettingsRow';
import { SettingsInfoBanner } from '../components/settings/SettingsInfoBanner';

type Props = StackScreenProps<RootStackParamList, 'PushNotifications'>;

const NOTIFICATIONS = PUSH_NOTIFICATION_DEFINITIONS;

export default function PushNotificationsScreen({ navigation }: Props) {
  const currentUser = useStore((state) => state.currentUser);
  const { show } = useToast();
  const {
    pushNotificationToggles: toggles,
    pushEnabledCount: enabledCount,
    pushTotalCount,
    setPushNotificationToggle,
    setAllPushNotificationToggles,
  } = useSettingsPreferences();
  const [isSyncingDevice, setIsSyncingDevice] = React.useState(false);
  const [registeredToken, setRegisteredToken] = React.useState<string | null>(null);
  const [isDeviceRegistered, setIsDeviceRegistered] = React.useState(false);
  const [pushPermissionStatus, setPushPermissionStatus] = React.useState<Notifications.NotificationPermissionsStatus | null>(null);

  React.useEffect(() => {
    Notifications.getPermissionsAsync()
      .then(setPushPermissionStatus)
      .catch(() => setPushPermissionStatus(null));
  }, []);

  React.useEffect(() => {
    void (async () => {
      try {
        const serverPrefs = await getNotificationPreferences();
        for (const [key, enabled] of Object.entries(serverPrefs)) {
          if (toggles[key] !== undefined && toggles[key] !== enabled) {
            setPushNotificationToggle(key, enabled);
          }
        }
      } catch {
        // best-effort
      }
      try {
        const devices = await listNotificationDevices();
        const activeDevice = devices.find((d) => d.isActive);
        if (activeDevice) {
          setRegisteredToken(activeDevice.token);
          setIsDeviceRegistered(true);
        }
      } catch {
        // best-effort
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolvePushPlatform = React.useCallback((): 'ios' | 'android' | 'web' => {
    if (Platform.OS === 'ios') return 'ios';
    if (Platform.OS === 'android') return 'android';
    return 'web';
  }, []);

  const resolveProjectId = React.useCallback(() => {
    const fromExpoConfig = (Constants.expoConfig as { extra?: { eas?: { projectId?: string } } } | null)
      ?.extra?.eas?.projectId;
    const fromEasConfig = (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    return fromExpoConfig ?? fromEasConfig;
  }, []);

  const ensureDeviceRegistration = React.useCallback(async () => {
    setIsSyncingDevice(true);
    try {
      const permission = await Notifications.getPermissionsAsync();
      let finalStatus = permission.status;
      if (finalStatus !== 'granted') {
        const request = await Notifications.requestPermissionsAsync();
        finalStatus = request.status;
      }
      if (finalStatus !== 'granted') {
        show('Push permissions were denied on this device.', 'error');
        return;
      }
      const projectId = resolveProjectId();
      const tokenResponse = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();
      const token = tokenResponse.data;
      await registerNotificationDevice({
        token,
        platform: resolvePushPlatform(),
        appVersion: (Constants.expoConfig as { version?: string } | null)?.version,
        metadata: { enabledNotificationTypes: enabledCount },
      });
      setRegisteredToken(token);
      setIsDeviceRegistered(true);
      show('This device is now registered for push delivery.', 'success');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to register this device for push notifications.');
      show(parsed.message, 'error');
    } finally {
      setIsSyncingDevice(false);
    }
  }, [enabledCount, resolveProjectId, resolvePushPlatform, show]);

  const disableDeviceRegistration = React.useCallback(async () => {
    if (!registeredToken) {
      setIsDeviceRegistered(false);
      show('This device is already not registered for push delivery.', 'info');
      return;
    }
    setIsSyncingDevice(true);
    try {
      await deactivateNotificationDevice(registeredToken);
      setIsDeviceRegistered(false);
      setRegisteredToken(null);
      show('Push delivery paused for this device.', 'info');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to pause push delivery for this device.');
      show(parsed.message, 'error');
    } finally {
      setIsSyncingDevice(false);
    }
  }, [registeredToken, show]);

  const toggle = async (key: string) => {
    const nextEnabled = !toggles[key];
    setPushNotificationToggle(key, nextEnabled);
    try {
      await updateNotificationPreferences({ [key]: nextEnabled });
    } catch {
      setPushNotificationToggle(key, !nextEnabled);
      show('Failed to update push preference. Please try again.', 'error');
      return;
    }
    const nextCount = nextEnabled ? enabledCount + 1 : enabledCount - 1;
    if (nextCount === 1 && nextEnabled && !isDeviceRegistered) {
      await ensureDeviceRegistration();
    }
    if (nextCount === 0 && !nextEnabled && isDeviceRegistered) {
      await disableDeviceRegistration();
    }
  };

  const handleToggleAll = React.useCallback(async () => {
    const shouldEnableAll = enabledCount !== pushTotalCount;
    const previousToggles = { ...toggles };
    setAllPushNotificationToggles(shouldEnableAll);
    try {
      const allPrefs: Record<string, boolean> = {};
      for (const item of NOTIFICATIONS) {
        allPrefs[item.key] = shouldEnableAll;
      }
      await updateNotificationPreferences(allPrefs);
    } catch {
      for (const [key, value] of Object.entries(previousToggles)) {
        setPushNotificationToggle(key, value);
      }
      show('Failed to update push preferences. Please try again.', 'error');
      return;
    }
    if (shouldEnableAll && !isDeviceRegistered) {
      await ensureDeviceRegistration();
    }
    if (!shouldEnableAll && isDeviceRegistered) {
      await disableDeviceRegistration();
    }
    show(
      shouldEnableAll ? 'All push notifications enabled' : 'All push notifications paused',
      shouldEnableAll ? 'success' : 'info'
    );
  }, [
    disableDeviceRegistration,
    enabledCount,
    ensureDeviceRegistration,
    isDeviceRegistered,
    pushTotalCount,
    setAllPushNotificationToggles,
    show,
  ]);

  const allEnabled = enabledCount === pushTotalCount;

  const rightAction = (
    <AnimatedPressable
      onPress={() => void handleToggleAll()}
      disabled={isSyncingDevice}
      accessibilityLabel={allEnabled ? 'Disable all push notifications' : 'Enable all push notifications'}
      hapticFeedback="medium"
      style={styles.iconBtn}
    >
      {isSyncingDevice ? (
        <ActivityIndicator size="small" color={Colors.textPrimary} />
      ) : (
        <Ionicons
          name={allEnabled ? 'notifications-off-outline' : 'notifications-outline'}
          size={22}
          color={Colors.textPrimary}
        />
      )}
    </AnimatedPressable>
  );

  return (
    <FlagshipScreen header={<FlagshipHeader title="Push Notifications" subtitle="Manage your alert preferences" onBack={() => navigation.goBack()} rightAction={rightAction} />}>
      {pushPermissionStatus?.status === 'denied' && (
        <View style={styles.permissionBanner}>
          <Ionicons name="notifications-off-outline" size={18} color={Colors.danger} />
          <Text style={styles.permissionBannerText}>
            Push notifications are blocked. Enable them in Settings to receive alerts.
          </Text>
          <AnimatedPressable
            onPress={() => Linking.openSettings()}
            activeOpacity={0.7}
            scaleValue={0.95}
            hapticFeedback="light"
            accessibilityLabel="Open device settings"
          >
            <Text style={styles.permissionBannerAction}>Open Settings</Text>
          </AnimatedPressable>
        </View>
      )}

      <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
        <View style={[styles.notificationTrust, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Ionicons name="notifications-outline" size={18} color={Colors.brand} />
          <Text style={[styles.notificationTrustText, { color: Colors.textSecondary }]}>
            Choose which alerts you receive. You can change these at any time.
          </Text>
        </View>
      </Reanimated.View>

      {/* Progress indicator */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${(enabledCount / Math.max(pushTotalCount, 1)) * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>
            {enabledCount}/{pushTotalCount} enabled
          </Text>
        </View>
      </Reanimated.View>

      {/* Notification types */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
        <SettingsSection title="Notification Types" noCard>
          <View style={styles.card}>
            {NOTIFICATIONS.map((item, idx) => (
              <SettingsRow
                key={item.key}
                title={item.label}
                subtitle={item.subtitle}
                toggleValue={toggles[item.key]}
                onToggle={() => void toggle(item.key)}
                isFirst={idx === 0}
                isLast={idx === NOTIFICATIONS.length - 1}
              />
            ))}
          </View>
        </SettingsSection>
      </Reanimated.View>

      {/* Footer note */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(160)}>
        <Text style={styles.footerNote}>
          You can also manage push notifications from your device Settings app.
        </Text>
      </Reanimated.View>
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.md,
    marginHorizontal: Space.md,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: Colors.brand,
  },
  progressLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    letterSpacing: Type.caption.letterSpacing,
    minWidth: 60,
    textAlign: 'right',
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    marginHorizontal: Space.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  footerNote: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    lineHeight: Type.caption.lineHeight,
    marginTop: Space.sm,
    marginHorizontal: Space.md,
    letterSpacing: Type.caption.letterSpacing,
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    backgroundColor: Colors.surfaceAlt,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  permissionBannerText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  permissionBannerAction: {
    color: Colors.brand,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
  },
  notificationTrust: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    marginHorizontal: Space.md,
    marginBottom: Space.md,
  },
  notificationTrustText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
});
