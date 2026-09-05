import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Linking, Platform, Pressable } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { PUSH_NOTIFICATION_DEFINITIONS, PUSH_NOTIFICATION_GROUPS } from '../preferences/settingsPreferences';
import { useToast } from '../context/ToastContext';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';
import { useStore } from '../store/useStore';
import { parseApiError } from '../lib/apiClient';
import { deactivateNotificationDevice, registerNotificationDevice, getNotificationPreferences, updateNotificationPreferences, listNotificationDevices } from '../services/notificationsApi';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SettingsSection } from '../components/settings/SettingsSection';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsRow } from '../components/settings/SettingsRow';
import { SettingsInfoBanner } from '../components/settings/SettingsInfoBanner';
import { haptics } from '../utils/haptics';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';

import { Space, Radius, Typography, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { formatHour } from '../utils/timeFormat';
type Props = NativeStackScreenProps<RootStackParamList, 'PushNotifications'>;

const NOTIFICATIONS = PUSH_NOTIFICATION_DEFINITIONS;

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

export default function PushNotificationsScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const currentUser = useStore((state) => state.currentUser);
  const { show } = useToast();
  const {
    pushNotificationToggles: toggles,
    pushEnabledCount: enabledCount,
    pushTotalCount,
    setPushNotificationToggle,
    setAllPushNotificationToggles,
    quietHours,
    setQuietHours } = useSettingsPreferences();
  const [isSyncingDevice, setIsSyncingDevice] = React.useState(false);
  const [registeredDeviceId, setRegisteredDeviceId] = React.useState<number | null>(null);
  const [isDeviceRegistered, setIsDeviceRegistered] = React.useState(false);
  const [pushPermissionStatus, setPushPermissionStatus] = React.useState<Notifications.NotificationPermissionsStatus | null>(null);
  const [editingQuietTime, setEditingQuietTime] = React.useState<'start' | 'end' | null>(null);
  const [syncingKeys, setSyncingKeys] = React.useState<Set<string>>(new Set());

  const styles = useMemo(() => createStyles(colors), [colors]);

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
          setRegisteredDeviceId(activeDevice.id);
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
        metadata: { enabledNotificationTypes: enabledCount } });
      // The server returns a redacted device — we use the id for management.
      // The raw token is never stored in client state.
      setRegisteredDeviceId(null); // Will be set on next device list fetch
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

  const toggle = async (key: string) => {
    const nextEnabled = !toggles[key];
    setPushNotificationToggle(key, nextEnabled);
    setSyncingKeys((prev) => new Set(prev).add(key));
    try {
      await updateNotificationPreferences({ [key]: nextEnabled });
    } catch {
      setPushNotificationToggle(key, !nextEnabled);
      show('Failed to update push preference. Try again.', 'error');
      return;
    } finally {
      setSyncingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
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
      show('Failed to update push preferences. Try again.', 'error');
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
        <ActivityIndicator size="small" color={colors.textPrimary} />
      ) : (
        <Ionicons
          name={allEnabled ? 'notifications-off-outline' : 'notifications-outline'}
          size={22}
          color={colors.textPrimary}
        />
      )}
    </AnimatedPressable>
  );

  return (
    <FlagshipScreen header={<FlagshipHeader title="Notifications" onBack={() => navigation.goBack()} rightAction={rightAction} />}>
      {pushPermissionStatus?.status === 'denied' && (
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
          {enabledCount === 0 ? 'All notifications off' : 'Push notifications on'}
        </Text>
        <Text style={[styles.postureSubtitle, { color: colors.textSecondary }]}>
          {enabledCount === 0 ? 'You won\'t receive any push alerts' : isDeviceRegistered ? 'This device is registered' : 'Register this device to receive alerts'}
        </Text>
      </View>

      {PUSH_NOTIFICATION_GROUPS.map((group) => {
        const groupItems = NOTIFICATIONS.filter((n) => n.group === group.key);
        if (groupItems.length === 0) return null;
        return (
          <View key={group.key}>
            <SettingsSection title={group.label} noCard>
              {groupItems.map((item, idx) => (
                <SettingsRow
                  key={item.key}
                  title={item.label}
                  icon={item.icon}
                  toggleValue={toggles[item.key]}
                  onToggle={() => void toggle(item.key)}
                  syncing={syncingKeys.has(item.key)}
                  isFirst={idx === 0}
                  isLast={idx === groupItems.length - 1}
                />
              ))}
            </SettingsSection>
          </View>
        );
      })}

      {/* Quiet Hours — suppress non-urgent notifications during a time window */}
      <SettingsSection title="Quiet hours" noCard>
        <SettingsRow
          title="Do Not Disturb"
          toggleValue={quietHours.enabled}
          onToggle={() => setQuietHours({ enabled: !quietHours.enabled })}
          isFirst
          isLast={!quietHours.enabled}
        />
        {quietHours.enabled ? (
          <View style={styles.quietHoursRow}>
            <AnimatedPressable
              style={styles.quietTimePicker}
              onPress={() => setEditingQuietTime(editingQuietTime === 'start' ? null : 'start')}
              accessibilityRole="button"
              accessibilityLabel={`Quiet hours start: ${formatHour(quietHours.startHour)}. Tap to change.`}
            >
              <Text style={styles.quietTimeLabel}>From</Text>
              <Text style={styles.quietTimeValue}>{formatHour(quietHours.startHour)}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
            </AnimatedPressable>
            <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
            <AnimatedPressable
              style={[styles.quietTimePicker, { backgroundColor: colors.surfaceAlt }]}
              onPress={() => setEditingQuietTime(editingQuietTime === 'end' ? null : 'end')}
              accessibilityRole="button"
              accessibilityLabel={`Quiet hours end: ${formatHour(quietHours.endHour)}. Tap to change.`}
            >
              <Text style={[styles.quietTimeLabel, { color: colors.textMuted }]}>To</Text>
              <Text style={[styles.quietTimeValue, { color: colors.textPrimary }]}>{formatHour(quietHours.endHour)}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
            </AnimatedPressable>
          </View>
        ) : null}
        {quietHours.enabled && editingQuietTime ? (
          <View style={styles.quietHoursPickerSheet}>
            <Text style={[styles.quietHoursPickerTitle, { color: colors.textSecondary }]}>
              {editingQuietTime === 'start' ? 'Start time' : 'End time'}
            </Text>
            <View style={styles.quietHoursPickerGrid}>
              {HOUR_OPTIONS.map((h) => {
                const selected = editingQuietTime === 'start'
                  ? quietHours.startHour === h
                  : quietHours.endHour === h;
                return (
                  <AnimatedPressable
                    key={h}
                    style={[
                      styles.quietHourCell,
                      { backgroundColor: colors.surfaceAlt },
                      selected && [styles.quietHourCellActive, { backgroundColor: colors.brand }],
                    ]}
                    onPress={() => {
                      haptics.tap();
                      if (editingQuietTime === 'start') {
                        setQuietHours({ startHour: h });
                      } else {
                        setQuietHours({ endHour: h });
                      }
                      setEditingQuietTime(null);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Set ${editingQuietTime === 'start' ? 'start' : 'end'} time to ${formatHour(h)}`}
                  >
                    <Text style={[styles.quietHourCellText, { color: colors.textPrimary }, selected && [styles.quietHourCellTextActive, { color: colors.textInverse }]]}>
                      {formatHour(h)}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>
          </View>
        ) : null}
        {quietHours.enabled ? (
          <SettingsInfoBanner
            icon="moon-outline"
            text={`Urgent alerts still arrive. Non-urgent push is silenced between ${formatHour(quietHours.startHour)} and ${formatHour(quietHours.endHour)} on this device.`}
          />
        ) : null}
      </SettingsSection>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    iconBtn: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center' },
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
      marginTop: Space.xs / 2 },
    quietHoursRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      gap: Space.sm },
    quietTimePicker: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      minHeight: Space.xxl },
    quietTimePickerPressed: {
      opacity: 0.7,
      transform: [{ scale: 0.98 }] },
    quietTimeLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    quietTimeValue: {
      flex: 1,
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary },
    quietHoursPickerSheet: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm },
    quietHoursPickerTitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      marginBottom: Space.xs },
    quietHoursPickerGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs + 2 },
    quietHourCell: {
      paddingHorizontal: Space.md - Space.xs,
      paddingVertical: Space.sm + 2,
      borderRadius: Radius.sm,
      backgroundColor: colors.surfaceAlt,
      minHeight: Control.chrome + Space.xs,
      alignItems: 'center',
      justifyContent: 'center' },
    quietHourCellActive: {
      backgroundColor: colors.brand },
    quietHourCellPressed: {
      opacity: 0.7,
      transform: [{ scale: 0.96 }] },
    quietHourCellText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textPrimary },
    quietHourCellTextActive: {
      color: colors.textInverse,
      fontFamily: Typography.family.bold } });
}
