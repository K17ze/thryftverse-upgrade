/**
 * NotificationPreferencesScreen — consolidated notification control surface.
 *
 * A single screen covering the master push toggle, per-category toggles
 * (offers, messages, listings, orders, live shopping, price drops, marketing),
 * quiet hours, and notification preview visibility.
 *
 * P0 FIX (report 18): Category toggles now sync to the server via
 * notificationsApi, not just device-local AsyncStorage. The false "Most
 * preferences sync across devices" banner has been removed — preferences
 * DO sync now. The false quiet-hours "held until" claim has been replaced
 * with a truthful description of device-local quiet hours.
 *
 * The progress meter gamification ("5 of 8 enabled") has been removed.
 * Interruption is not a completion game — per AGENTS.md §4 anti-AI design.
 *
 * Design (per AGENTS.md §4):
 * - Flat composition, hairline separators, no card-on-card
 * - One dominant panel (the posture hero)
 * - Max two non-avatar radius sizes (Radius.md for cells, Radius.lg for hero)
 * - Max three type sizes per viewport (title, body, caption)
 * - All colors via useAppTheme(), all geometry via design tokens
 *
 * State coverage (per AGENTS.md §14):
 * - Populated: full preference set
 * - Disabled: master toggle disables all dependent rows
 * - Syncing: server preference sync in progress
 * - Error: server sync failed, rollback to last known state
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Linking, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { SettingsInfoBanner } from '../components/settings/SettingsInfoBanner';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';
import {
  PUSH_NOTIFICATION_DEFINITIONS,
  PUSH_NOTIFICATION_GROUPS,
} from '../preferences/settingsPreferences';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from '../services/notificationsApi';
import { Space, Radius, Type, Typography } from '../theme/designTokens';

type Props = NativeStackScreenProps<RootStackParamList, 'NotificationPreferences'>;

const SHOW_PREVIEW_KEY = '@thryftverse/notif_prefs_show_preview';

function formatHour(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:00 ${period}`;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

export default function NotificationPreferencesScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { show } = useToast();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const {
    pushNotificationToggles: toggles,
    pushEnabledCount: enabledCount,
    pushTotalCount,
    setPushNotificationToggle,
    setAllPushNotificationToggles,
    quietHours,
    setQuietHours,
  } = useSettingsPreferences();

  // Local-only toggles — persisted to AsyncStorage so they survive restarts.
  const [showPreview, setShowPreview] = React.useState(true);
  const [editingQuietTime, setEditingQuietTime] = React.useState<'start' | 'end' | null>(null);
  const [syncingKeys, setSyncingKeys] = React.useState<Set<string>>(new Set());
  const [prefsLoading, setPrefsLoading] = React.useState(true);
  const [pushPermissionStatus, setPushPermissionStatus] = React.useState<Notifications.NotificationPermissionsStatus | null>(null);

  React.useEffect(() => {
    Notifications.getPermissionsAsync()
      .then(setPushPermissionStatus)
      .catch(() => setPushPermissionStatus(null));
  }, []);

  // Sync server preferences on mount — categories are server-persisted.
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const serverPrefs = await getNotificationPreferences();
        if (!mounted) return;
        for (const [key, enabled] of Object.entries(serverPrefs)) {
          if (toggles[key] !== undefined && toggles[key] !== enabled) {
            setPushNotificationToggle(key, enabled);
          }
        }
      } catch {
        // best-effort — local state remains as cache
      } finally {
        if (mounted) setPrefsLoading(false);
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hydrate local toggles from AsyncStorage on mount.
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const spVal = await AsyncStorage.getItem(SHOW_PREVIEW_KEY);
        if (!mounted) return;
        if (spVal !== null) setShowPreview(spVal === 'true');
      } catch {
        // AsyncStorage read failure — keep defaults
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleShowPreviewChange = React.useCallback((v: boolean) => {
    haptic.selection();
    setShowPreview(v);
    AsyncStorage.setItem(SHOW_PREVIEW_KEY, String(v)).catch(() => {});
  }, [haptic]);

  const masterOn = enabledCount > 0;

  const handleMasterToggle = async (v: boolean) => {
    haptic.selection();
    const previousToggles = { ...toggles };
    setAllPushNotificationToggles(v);
    try {
      const allPrefs: Record<string, boolean> = {};
      for (const key of Object.keys(toggles)) {
        allPrefs[key] = v;
      }
      await updateNotificationPreferences(allPrefs);
    } catch {
      for (const [key, value] of Object.entries(previousToggles)) {
        setPushNotificationToggle(key, value);
      }
      show('Failed to update push preferences. Try again.', 'error');
    }
  };

  const toggleCategory = async (key: string) => {
    const nextEnabled = !toggles[key];
    haptic.selection();
    setPushNotificationToggle(key, nextEnabled);
    setSyncingKeys((prev) => new Set(prev).add(key));
    try {
      await updateNotificationPreferences({ [key]: nextEnabled });
    } catch {
      // Rollback on failure
      setPushNotificationToggle(key, !nextEnabled);
      show('Failed to update preference. Try again.', 'error');
    } finally {
      setSyncingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleTestNotification = async () => {
    haptic.medium();
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        show('Enable push notifications to test them.', 'error');
        return;
      }
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Test notification 🔔',
          body: 'Your notification settings are working correctly.',
          data: { type: 'test' },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 },
      });
      show('Test notification scheduled — check your notifications.', 'success');
    } catch {
      show('Could not schedule test notification.', 'error');
    }
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Notifications"
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* ── Posture summary — flat, no gamification ── */}
      {pushPermissionStatus?.status === 'denied' && (
        <View
          style={[styles.permissionBanner, { backgroundColor: colors.surfaceAlt }]}
          accessibilityRole="alert"
          accessibilityLabel="Push notifications blocked by device settings"
        >
          <Ionicons name="notifications-off-outline" size={18} color={colors.danger} />
          <Text style={[styles.permissionBannerText, { color: colors.textSecondary }]}>
            Push is blocked by device settings.
          </Text>
          <Pressable onPress={() => Linking.openSettings()} accessibilityRole="button">
            <Text style={[styles.permissionBannerAction, { color: colors.brand }]}>Open Settings</Text>
          </Pressable>
        </View>
      )}

      {/* ── Master toggle ── */}
        <SettingsSection title="Push notifications" noCard>
          <SettingsRow
            icon="notifications-outline"
            title="Enable push notifications"
            subtitle="Master switch for all push alerts"
            toggleValue={masterOn}
            onToggle={(v) => void handleMasterToggle(v)}
            isFirst
            isLast
          />
        </SettingsSection>

      {/* ── Category toggles ── */}
        <SettingsSection title="Categories" noCard>
          {prefsLoading ? (
            <View style={styles.prefsLoading} accessibilityRole="progressbar">
              <ActivityIndicator size="small" color={colors.textSecondary} />
              <Text style={[styles.prefsLoadingText, { color: colors.textMuted }]}>
                Loading preferences…
              </Text>
            </View>
          ) : (
          <>
          <SettingsRow
            icon="pricetags-outline"
            title="Offer notifications"
            subtitle="When buyers make an offer on your item"
            toggleValue={!!toggles.offers}
            onToggle={() => void toggleCategory('offers')}
            disabled={!masterOn}
            syncing={syncingKeys.has('offers')}
            isFirst
          />
          <SettingsRow
            icon="chatbubble-outline"
            title="Message notifications"
            subtitle="When someone sends you a message"
            toggleValue={!!toggles.messages}
            onToggle={() => void toggleCategory('messages')}
            disabled={!masterOn}
            syncing={syncingKeys.has('messages')}
          />
          <SettingsRow
            icon="heart-outline"
            title="Listing notifications"
            subtitle="New listings from sellers you follow"
            toggleValue={!!toggles.wishlist}
            onToggle={() => void toggleCategory('wishlist')}
            disabled={!masterOn}
            syncing={syncingKeys.has('wishlist')}
          />
          <SettingsRow
            icon="cube-outline"
            title="Order notifications"
            subtitle="Shipping and delivery status changes"
            toggleValue={!!toggles.orderUpdates}
            onToggle={() => void toggleCategory('orderUpdates')}
            disabled={!masterOn}
            syncing={syncingKeys.has('orderUpdates')}
          />
          <SettingsRow
            icon="trophy-outline"
            title="Auction alerts"
            subtitle="Outbid, auction ending, and auction won alerts"
            toggleValue={!!toggles.auctionAlerts}
            onToggle={() => void toggleCategory('auctionAlerts')}
            disabled={!masterOn}
            syncing={syncingKeys.has('auctionAlerts')}
          />
          <SettingsRow
            icon="pricetag-outline"
            title="Price drop alerts"
            subtitle="For items on your wishlist"
            toggleValue={!!toggles.priceDrops}
            onToggle={() => void toggleCategory('priceDrops')}
            disabled={!masterOn}
            syncing={syncingKeys.has('priceDrops')}
          />
          <SettingsRow
            icon="megaphone-outline"
            title="Marketing notifications"
            subtitle="Promotions, features and announcements"
            toggleValue={!!toggles.news}
            onToggle={() => void toggleCategory('news')}
            disabled={!masterOn}
            syncing={syncingKeys.has('news')}
            isLast
          />
          </>
          )}
        </SettingsSection>

      {/* ── Quiet Hours ── */}
        <SettingsSection title="Quiet hours" noCard>
          <SettingsRow
            icon="moon-outline"
            title="Do Not Disturb"
            subtitle="Pause non-urgent notifications during set hours"
            toggleValue={quietHours.enabled}
            onToggle={() => { haptic.selection(); setQuietHours({ enabled: !quietHours.enabled }); }}
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
                <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
              </Pressable>
              <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
              <Pressable
                style={({ pressed }) => [styles.quietTimePicker, { backgroundColor: colors.surfaceAlt }, pressed && styles.quietTimePickerPressed]}
                onPress={() => setEditingQuietTime(editingQuietTime === 'end' ? null : 'end')}
                accessibilityRole="button"
                accessibilityLabel={`Quiet hours end: ${formatHour(quietHours.endHour)}. Tap to change.`}
              >
                <Text style={[styles.quietTimeLabel, { color: colors.textMuted }]}>To</Text>
                <Text style={[styles.quietTimeValue, { color: colors.textPrimary }]}>{formatHour(quietHours.endHour)}</Text>
                <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
              </Pressable>
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
                    <Pressable
                      key={h}
                      style={({ pressed }) => [
                        styles.quietHourCell,
                        { backgroundColor: colors.surfaceAlt },
                        selected && [styles.quietHourCellActive, { backgroundColor: colors.brand }],
                        pressed && styles.quietHourCellPressed,
                      ]}
                      onPress={() => {
                        haptic.light();
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
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          {quietHours.enabled ? (
            <SettingsInfoBanner
              icon="moon-outline"
              text={`Urgent alerts (order updates, security) still arrive during quiet hours. Non-urgent push notifications are silenced on this device between ${formatHour(quietHours.startHour)} and ${formatHour(quietHours.endHour)}. This setting applies to this device only.`}
            />
          ) : null}
        </SettingsSection>

      {/* ── Notification preview ── */}
        <SettingsSection title="Privacy" noCard>
          <SettingsRow
            icon="eye-off-outline"
            title="Notification preview"
            subtitle="Show message content in notification previews"
            toggleValue={showPreview}
            onToggle={handleShowPreviewChange}
            isFirst
            isLast
          />
        </SettingsSection>

      {/* ── Test notification ── */}
        <SettingsSection title="Diagnostics" noCard>
          <SettingsRow
            icon="notifications-outline"
            title="Send test notification"
            subtitle="Verify your notification settings are working"
            onPress={handleTestNotification}
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
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    permissionBannerText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
    },
    permissionBannerAction: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
    },
    prefsLoading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingVertical: Space.md + Space.sm,
    },
    prefsLoadingText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
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
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      minHeight: Space.xxl,
    },
    quietTimePickerPressed: {
      opacity: 0.7,
      transform: [{ scale: 0.98 }],
    },
    quietTimeLabel: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
    },
    quietTimeValue: {
      flex: 1,
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    quietHoursPickerSheet: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
    },
    quietHoursPickerTitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
      marginBottom: Space.xs,
    },
    quietHoursPickerGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs + 2,
    },
    quietHourCell: {
      paddingHorizontal: Space.sm + Space.xs,
      paddingVertical: Space.sm + 2,
      borderRadius: Radius.sm,
      backgroundColor: colors.surfaceAlt,
      minHeight: Space.xl + Space.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quietHourCellActive: {
      backgroundColor: colors.brand,
    },
    quietHourCellPressed: {
      opacity: 0.7,
      transform: [{ scale: 0.96 }],
    },
    quietHourCellText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      color: colors.textPrimary,
    },
    quietHourCellTextActive: {
      color: colors.textInverse,
      fontFamily: Typography.family.bold,
    },
  });
}
