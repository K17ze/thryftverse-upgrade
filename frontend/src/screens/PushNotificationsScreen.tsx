import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Linking, Platform, Pressable } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { Colors } from '../constants/colors';
import { Space, Radius, Type } from '../theme/designTokens';
import { PUSH_NOTIFICATION_DEFINITIONS, PUSH_NOTIFICATION_GROUPS } from '../preferences/settingsPreferences';
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
import { haptics } from '../utils/haptics';

type Props = StackScreenProps<RootStackParamList, 'PushNotifications'>;

const NOTIFICATIONS = PUSH_NOTIFICATION_DEFINITIONS;

function formatHour(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:00 ${period}`;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

export default function PushNotificationsScreen({ navigation }: Props) {
  const currentUser = useStore((state) => state.currentUser);
  const { show } = useToast();
  const {
    pushNotificationToggles: toggles,
    pushEnabledCount: enabledCount,
    pushTotalCount,
    setPushNotificationToggle,
    setAllPushNotificationToggles,
    quietHours,
    setQuietHours,
  } = useSettingsPreferences();
  const [isSyncingDevice, setIsSyncingDevice] = React.useState(false);
  const [registeredToken, setRegisteredToken] = React.useState<string | null>(null);
  const [isDeviceRegistered, setIsDeviceRegistered] = React.useState(false);
  const [pushPermissionStatus, setPushPermissionStatus] = React.useState<Notifications.NotificationPermissionsStatus | null>(null);
  const [editingQuietTime, setEditingQuietTime] = React.useState<'start' | 'end' | null>(null);

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
    <FlagshipScreen header={<FlagshipHeader title="Notifications" onBack={() => navigation.goBack()} rightAction={rightAction} />}>
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

      <View style={[styles.notificationTrust, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
        <Ionicons name="notifications-outline" size={18} color={Colors.brand} />
        <Text style={[styles.notificationTrustText, { color: Colors.textSecondary }]}>
          Choose which alerts you receive. You can change these at any time.
        </Text>
      </View>

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

      {PUSH_NOTIFICATION_GROUPS.map((group) => {
        const groupItems = NOTIFICATIONS.filter((n) => n.group === group.key);
        if (groupItems.length === 0) return null;
        const groupIconColor = group.key === 'orders' ? Colors.success : group.key === 'social' ? Colors.brand : Colors.textMuted;
        return (
          <SettingsSection key={group.key} title={group.label} noCard>
            {groupItems.map((item, idx) => (
              <SettingsRow
                key={item.key}
                title={item.label}
                subtitle={item.subtitle}
                icon={item.icon}
                iconColor={groupIconColor}
                toggleValue={toggles[item.key]}
                onToggle={() => void toggle(item.key)}
                isFirst={idx === 0}
                isLast={idx === groupItems.length - 1}
              />
            ))}
          </SettingsSection>
        );
      })}

      {/* Quiet Hours — suppress non-urgent notifications during a time window */}
      <SettingsSection title="Quiet Hours" noCard>
        <SettingsRow
          title="Do Not Disturb"
          subtitle="Pause non-urgent notifications during set hours"
          toggleValue={quietHours.enabled}
          onToggle={() => setQuietHours({ enabled: !quietHours.enabled })}
          isFirst
          isLast={!quietHours.enabled}
        />
        {quietHours.enabled ? (
          <View style={styles.quietHoursRow}>
            <Pressable
              style={({ pressed }) => [styles.quietTimePicker, pressed && styles.quietTimePickerPressed]}
              onPress={() => setEditingQuietTime(editingQuietTime === 'start' ? null : 'start')}
              accessibilityRole="button"
              accessibilityLabel={`Quiet hours start: ${formatHour(quietHours.startHour)}. Tap to change.`}
            >
              <Text style={styles.quietTimeLabel}>From</Text>
              <Text style={styles.quietTimeValue}>{formatHour(quietHours.startHour)}</Text>
              <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
            </Pressable>
            <Ionicons name="arrow-forward" size={16} color={Colors.textMuted} />
            <Pressable
              style={({ pressed }) => [styles.quietTimePicker, pressed && styles.quietTimePickerPressed]}
              onPress={() => setEditingQuietTime(editingQuietTime === 'end' ? null : 'end')}
              accessibilityRole="button"
              accessibilityLabel={`Quiet hours end: ${formatHour(quietHours.endHour)}. Tap to change.`}
            >
              <Text style={styles.quietTimeLabel}>To</Text>
              <Text style={styles.quietTimeValue}>{formatHour(quietHours.endHour)}</Text>
              <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
            </Pressable>
          </View>
        ) : null}
        {quietHours.enabled && editingQuietTime ? (
          <View style={styles.quietHoursPickerSheet}>
            <Text style={styles.quietHoursPickerTitle}>
              {editingQuietTime === 'start' ? 'Start time' : 'End time'}
            </Text>
            <View style={styles.quietHoursPickerGrid}>
              {HOUR_OPTIONS.map((h) => {
                const selected = editingQuietTime === 'start'
                  ? quietHours.startHour === h
                  : quietHours.endHour === h;
                return (
                  <Pressable
                    key={h}
                    style={({ pressed }) => [
                      styles.quietHourCell,
                      selected && styles.quietHourCellActive,
                      pressed && styles.quietHourCellPressed,
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
                    <Text style={[styles.quietHourCellText, selected && styles.quietHourCellTextActive]}>
                      {formatHour(h)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
        {quietHours.enabled ? (
          <SettingsInfoBanner
            icon="moon-outline"
            text={`Urgent alerts (order updates, security) still arrive during quiet hours. Non-urgent notifications are held until ${formatHour(quietHours.endHour)}.`}
          />
        ) : null}
      </SettingsSection>

      <Text style={styles.footerNote}>
        You can also manage push notifications from your device Settings app.
      </Text>
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
  quietHoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.sm,
  },
  quietTimePicker: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    minHeight: 48,
  },
  quietTimePickerPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  quietTimeLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  quietTimeValue: {
    flex: 1,
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  quietHoursPickerSheet: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  quietHoursPickerTitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    marginBottom: Space.xs,
  },
  quietHoursPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  quietHourCell: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quietHourCellActive: {
    backgroundColor: Colors.brand,
  },
  quietHourCellPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  quietHourCellText: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  quietHourCellTextActive: {
    color: Colors.textInverse,
    fontFamily: Typography.family.bold,
  },
});
