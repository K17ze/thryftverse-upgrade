/**
 * PushNotificationsScreen — channel-specific push delivery sub-screen.
 *
 * Owns this device's push delivery: OS permission state and Expo push-token
 * registration (register/pause via /notifications/devices). Notification
 * categories and quiet hours are NOT duplicated here — they live in the
 * canonical NotificationPreferencesScreen, linked below.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useToast } from '../context/ToastContext';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';
import { parseApiError } from '../lib/apiClient';
import { deactivateNotificationDevice, registerNotificationDevice, listNotificationDevices } from '../services/notificationsApi';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SettingsSection } from '../components/settings/SettingsSection';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsRow } from '../components/settings/SettingsRow';
import { haptics } from '../utils/haptics';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';

type Props = NativeStackScreenProps<RootStackParamList, 'PushNotifications'>;

export default function PushNotificationsScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const { show } = useToast();
  const { pushEnabledCount: enabledCount } = useSettingsPreferences();
  const [isSyncingDevice, setIsSyncingDevice] = React.useState(false);
  const [registeredDeviceId, setRegisteredDeviceId] = React.useState<number | null>(null);
  const [isDeviceRegistered, setIsDeviceRegistered] = React.useState(false);
  const [pushPermissionStatus, setPushPermissionStatus] = React.useState<Notifications.NotificationPermissionsStatus | null>(null);

  const styles = useMemo(() => createStyles(colors), [colors]);

  React.useEffect(() => {
    Notifications.getPermissionsAsync()
      .then(setPushPermissionStatus)
      .catch(() => setPushPermissionStatus(null));
  }, []);

  React.useEffect(() => {
    void (async () => {
      try {
        const devices = await listNotificationDevices();
        const activeDevice = devices.find((d) => d.isActive);
        if (activeDevice) {
          setRegisteredDeviceId(activeDevice.id);
          setIsDeviceRegistered(true);
        }
      } catch {
        // best-effort
      }
    })();
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
        metadata: { enabledNotificationTypes: enabledCount } });
      // The server returns a redacted device — we use the id for management.
      // The raw token is never stored in client state.
      setRegisteredDeviceId(null); // Will be set on next device list fetch
      setIsDeviceRegistered(true);
      haptics.success();
      show('This device is now registered for push delivery.', 'success');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to register this device for push notifications.');
      show(parsed.message, 'error');
    } finally {
      setIsSyncingDevice(false);
    }
  }, [enabledCount, resolveProjectId, resolvePushPlatform, show]);

  const disableDeviceRegistration = React.useCallback(async () => {
    // If we don't have the device id, try to fetch it first
    let deviceId = registeredDeviceId;
    if (!deviceId) {
      try {
        const devices = await listNotificationDevices();
        const activeDevice = devices.find((d) => d.isActive);
        if (activeDevice) {
          deviceId = activeDevice.id;
          setRegisteredDeviceId(activeDevice.id);
        }
      } catch {
        // best-effort
      }
    }
    if (!deviceId) {
      setIsDeviceRegistered(false);
      show('This device is already not registered for push delivery.', 'info');
      return;
    }
    setIsSyncingDevice(true);
    try {
      await deactivateNotificationDevice(deviceId);
      setIsDeviceRegistered(false);
      setRegisteredDeviceId(null);
      show('Push delivery paused for this device.', 'info');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to pause push delivery for this device.');
      show(parsed.message, 'error');
    } finally {
      setIsSyncingDevice(false);
    }
  }, [registeredDeviceId, show]);

  const handleDeliveryToggle = React.useCallback((v: boolean) => {
    haptics.tap();
    if (v) {
      void ensureDeviceRegistration();
    } else {
      void disableDeviceRegistration();
    }
  }, [disableDeviceRegistration, ensureDeviceRegistration]);

  const permissionDenied = pushPermissionStatus?.status === 'denied';

  return (
    <FlagshipScreen header={<FlagshipHeader title="Push notifications" onBack={() => navigation.goBack()} />}>
      {permissionDenied && (
        <View style={styles.permissionBanner}>
          <Ionicons name="notifications-off-outline" size={18} color={colors.danger} />
          <Text style={styles.permissionBannerText}>
            Push is blocked. Enable it in Settings to receive alerts.
          </Text>
          <AnimatedPressable
            onPress={() => Linking.openSettings()}
            activeOpacity={0.7}
            scaleValue={0.95}
            hapticFeedback="light"
            accessibilityLabel="Open device settings"
            hitSlop={8}
          >
            <Text style={styles.permissionBannerAction}>Open settings</Text>
          </AnimatedPressable>
        </View>
      )}

      {/* Posture summary — flat canvas, no card chrome */}
      <View style={styles.postureSummary}>
        <Text style={[styles.postureTitle, { color: colors.textPrimary }]}>
          {isDeviceRegistered ? 'Push on for this device' : 'Push off for this device'}
        </Text>
        <Text style={[styles.postureSubtitle, { color: colors.textSecondary }]}>
          {isDeviceRegistered
            ? 'This device is registered to receive push alerts'
            : 'Register this device to receive push alerts'}
        </Text>
      </View>

      <SettingsSection title="This device" noCard>
        <SettingsRow
          icon="phone-portrait-outline"
          title="Push delivery"
          subtitle={isDeviceRegistered ? 'Registered for push alerts' : 'Not registered'}
          toggleValue={isDeviceRegistered}
          onToggle={handleDeliveryToggle}
          syncing={isSyncingDevice}
          isFirst
          isLast
        />
      </SettingsSection>

      <SettingsSection title="What you receive" noCard>
        <SettingsRow
          icon="options-outline"
          title="Categories & quiet hours"
          subtitle="Choose which alerts arrive and when"
          onPress={() => navigation.navigate('NotificationPreferences')}
          isFirst
          isLast
        />
      </SettingsSection>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    permissionBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      backgroundColor: colors.surfaceAlt,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    permissionBannerText: {
      flex: 1,
      color: colors.textSecondary,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },
    permissionBannerAction: {
      color: colors.brand,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },
    postureSummary: {
      paddingHorizontal: Space.md,
      paddingTop: Space.md,
      paddingBottom: Space.sm },
    postureTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    postureSubtitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      marginTop: Space.xs / 2 } });
}
