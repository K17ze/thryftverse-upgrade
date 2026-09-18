/**
 * NotificationPreferencesScreen — consolidated notification control surface.
 *
 * The canonical notification preference editor: a single screen covering the
 * master push toggle, every per-category toggle (grouped by
 * PUSH_NOTIFICATION_GROUPS), quiet hours, and notification preview
 * visibility. PushNotificationsScreen is the channel-specific sub-screen —
 * it owns this device's push delivery registration only and links here for
 * categories and quiet hours.
 *
 * P0 FIX (report 18): Category toggles now sync to the server via
 * notificationsApi, not just device-local AsyncStorage. The false "Most
 * preferences sync across devices" banner has been removed — preferences
 * DO sync now.
 *
 * Quiet hours and the notification-preview policy are also server-persisted
 * (user-level fields on the preferences PUT). Local state stays as the
 * instant-reactive cache — the server is reconciled on mount and every
 * change is pushed with rollback on failure, matching the category-toggle
 * pattern.
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
import { View, Text, StyleSheet, Platform, Linking, ActivityIndicator } from 'react-native';
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
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';
import {
  PUSH_NOTIFICATION_DEFINITIONS,
  PUSH_NOTIFICATION_GROUPS } from '../preferences/settingsPreferences';
import {
  getNotificationPreferences,
  sendTestPushNotification,
  updateNotificationPreferences,
  type NotificationPreviewPolicy } from '../services/notificationsApi';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { Space, Radius, Typography } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { formatHour } from '../utils/timeFormat';

type Props = NativeStackScreenProps<RootStackParamList, 'NotificationPreferences'>;

const SHOW_PREVIEW_KEY = '@thryftverse/notif_prefs_show_preview';
// Snapshot of the category mix taken when the master switch pauses every
// alert — re-enabling restores it instead of force-enabling all eight.
const PAUSED_MIX_KEY = '@thryftverse/notif_prefs_paused_mix';

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_LABELS = HOUR_OPTIONS.map((h) => formatHour(h));

const PREVIEW_POLICY_LABELS: Record<NotificationPreviewPolicy, string> = {
  full: 'Show content',
  sender_only: 'Sender only',
  hidden: 'Hidden' };
const PREVIEW_POLICY_ORDER: NotificationPreviewPolicy[] = ['full', 'sender_only', 'hidden'];

export default function NotificationPreferencesScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { show } = useToast();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const {
    pushNotificationToggles: toggles,
    pushEnabledCount: enabledCount,
    setPushNotificationToggle,
    setAllPushNotificationToggles,
    quietHours,
    setQuietHours } = useSettingsPreferences();

  // Preview policy — server-persisted ('full' | 'sender_only' | 'hidden');
  // AsyncStorage is the first-paint cache until the GET reconciles.
  const [previewPolicy, setPreviewPolicy] = React.useState<NotificationPreviewPolicy>('full');
  const [previewPickerOpen, setPreviewPickerOpen] = React.useState(false);
  const [editingQuietTime, setEditingQuietTime] = React.useState<'start' | 'end' | null>(null);
  const [syncingKeys, setSyncingKeys] = React.useState<Set<string>>(new Set());
  const [prefsLoading, setPrefsLoading] = React.useState(true);
  const [pushPermissionStatus, setPushPermissionStatus] = React.useState<Notifications.NotificationPermissionsStatus | null>(null);

  React.useEffect(() => {
    Notifications.getPermissionsAsync()
      .then(setPushPermissionStatus)
      .catch(() => setPushPermissionStatus(null));
  }, []);

  // Sync server preferences on mount — categories, quiet hours, and the
  // preview policy are all server-persisted. Local state is the cache; the
  // server is authoritative when it returns a value.
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const serverPrefs = await getNotificationPreferences();
        if (!mounted) return;
        for (const [key, enabled] of Object.entries(serverPrefs.preferences)) {
          if (toggles[key] !== undefined && toggles[key] !== enabled) {
            setPushNotificationToggle(key, enabled);
          }
        }
        if (serverPrefs.quietHours) {
          setQuietHours(serverPrefs.quietHours);
        }
        if (serverPrefs.previewPolicy) {
          setPreviewPolicy(serverPrefs.previewPolicy);
          AsyncStorage.setItem(SHOW_PREVIEW_KEY, serverPrefs.previewPolicy).catch(() => {});
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

  // Hydrate the first-paint cache + the paused category mix on mount.
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [spVal, pausedVal] = await Promise.all([
          AsyncStorage.getItem(SHOW_PREVIEW_KEY),
          AsyncStorage.getItem(PAUSED_MIX_KEY),
        ]);
        if (!mounted) return;
        if (spVal !== null) {
          // Legacy boolean cache migrates to the policy vocabulary.
          if (spVal === 'true') setPreviewPolicy('full');
          else if (spVal === 'false') setPreviewPolicy('hidden');
          else if (spVal === 'full' || spVal === 'sender_only' || spVal === 'hidden') {
            setPreviewPolicy(spVal);
          }
        }
        if (pausedVal) {
          try {
            pausedMixRef.current = JSON.parse(pausedVal) as Record<string, boolean>;
          } catch { /* malformed cache — ignore */ }
        }
      } catch {
        // AsyncStorage read failure — keep defaults
      }
    })();
    return () => { mounted = false; };
  }, []);

  // The paused category mix — kept in a ref (not state) because it is only
  // read when the master switch turns back on.
  const pausedMixRef = React.useRef<Record<string, boolean> | null>(null);

  // Preview policy — persisted server-side so the lock-screen posture
  // follows the account, not the device. AsyncStorage stays as the local
  // cache; rollback mirrors the category-toggle pattern.
  const handlePreviewPolicyChange = React.useCallback((policy: NotificationPreviewPolicy) => {
    haptic.selection();
    setPreviewPickerOpen(false);
    if (policy === previewPolicy) return;
    const previous = previewPolicy;
    setPreviewPolicy(policy);
    AsyncStorage.setItem(SHOW_PREVIEW_KEY, policy).catch(() => {});
    updateNotificationPreferences({
      preferences: { ...toggles },
      previewPolicy: policy,
    }).catch(() => {
      setPreviewPolicy(previous);
      AsyncStorage.setItem(SHOW_PREVIEW_KEY, previous).catch(() => {});
      show('Failed to update preview setting. Try again.', 'error');
    });
  }, [haptic, previewPolicy, toggles, show]);

  // Quiet hours — user-level on the server so every device honours the
  // same DND window. Local state applies instantly; failure rolls back.
  const applyQuietHours = React.useCallback(
    async (patch: Partial<typeof quietHours>) => {
      const previous = quietHours;
      const next = { ...quietHours, ...patch };
      setQuietHours(patch);
      try {
        await updateNotificationPreferences({
          preferences: { ...toggles },
          quietHours: {
            ...next,
            // The window is wall-clock in the user's zone — the server
            // evaluates it there, not UTC.
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        });
      } catch {
        setQuietHours(previous);
        show('Failed to update quiet hours. Try again.', 'error');
      }
    },
    [quietHours, toggles, setQuietHours, show]
  );

  const masterOn = enabledCount > 0;

  // Master is a pause/resume, not a reset: turning it off silences every
  // category but keeps the user's mix (snapshotted locally + persisted),
  // and turning it back on restores that mix. A user with no snapshot gets
  // all categories enabled — the previous reset behaviour for first use.
  const handleMasterToggle = async (v: boolean) => {
    haptic.selection();
    const previousToggles = { ...toggles };

    if (!v) {
      const hadAnyEnabled = Object.values(previousToggles).some(Boolean);
      if (hadAnyEnabled) {
        pausedMixRef.current = previousToggles;
        AsyncStorage.setItem(PAUSED_MIX_KEY, JSON.stringify(previousToggles)).catch(() => {});
      }
      setAllPushNotificationToggles(false);
      try {
        const allOff: Record<string, boolean> = {};
        for (const key of Object.keys(toggles)) allOff[key] = false;
        await updateNotificationPreferences({ preferences: allOff });
      } catch {
        for (const [key, value] of Object.entries(previousToggles)) {
          setPushNotificationToggle(key, value);
        }
        pausedMixRef.current = null;
        AsyncStorage.removeItem(PAUSED_MIX_KEY).catch(() => {});
        show('Failed to update push preferences. Try again.', 'error');
      }
      return;
    }

    // Resume — restore the paused mix when one exists, else enable all.
    const snapshot = pausedMixRef.current;
    const restored: Record<string, boolean> = {};
    for (const key of Object.keys(toggles)) {
      restored[key] = snapshot?.[key] ?? true;
    }
    for (const [key, value] of Object.entries(restored)) {
      setPushNotificationToggle(key, value);
    }
    pausedMixRef.current = null;
    AsyncStorage.removeItem(PAUSED_MIX_KEY).catch(() => {});
    try {
      await updateNotificationPreferences({ preferences: restored });
    } catch {
      for (const [key, value] of Object.entries(previousToggles)) {
        setPushNotificationToggle(key, value);
      }
      pausedMixRef.current = snapshot;
      if (snapshot) AsyncStorage.setItem(PAUSED_MIX_KEY, JSON.stringify(snapshot)).catch(() => {});
      show('Failed to update push preferences. Try again.', 'error');
    }
  };

  const toggleCategory = async (key: string) => {
    const nextEnabled = !toggles[key];
    haptic.selection();
    setPushNotificationToggle(key, nextEnabled);
    setSyncingKeys((prev) => new Set(prev).add(key));
    try {
      await updateNotificationPreferences({ preferences: { [key]: nextEnabled } });
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
      // Exercise the real pipeline (queue → Expo → device) — a local
      // scheduled notification proves nothing about server delivery.
      await sendTestPushNotification({
        title: 'Test notification',
        body: 'Your notification settings are working correctly.',
      });
      show('Test push sent — it should arrive shortly.', 'success');
    } catch {
      show('Could not send test notification.', 'error');
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
          <Ionicons name="notifications-off-outline" size={18} color={colors.dangerText} />
          <Text style={[styles.permissionBannerText, { color: colors.textSecondary }]}>
            Push is blocked by device settings.
          </Text>
          <AnimatedPressable
            scaleValue={0.98}
            hapticFeedback="light"
            onPress={() => Linking.openSettings()}
            accessibilityRole="button"
            accessibilityLabel="Open device settings"
            hitSlop={8}
          >
            <Text style={[styles.permissionBannerAction, { color: colors.brand }]}>Open settings</Text>
          </AnimatedPressable>
        </View>
      )}

      {/* ── Master toggle — a pause/resume, not a category reset ── */}
        <SettingsSection title="Delivery" noCard>
          <SettingsRow
            icon="notifications-outline"
            title="Push notifications"
            subtitle={masterOn ? 'Alerts reach this device' : 'Paused — your categories are kept'}
            toggleValue={masterOn}
            onToggle={(v) => void handleMasterToggle(v)}
            isFirst
            isLast
          />
        </SettingsSection>

      {/* ── Category toggles — full definition set, grouped ── */}
        {prefsLoading ? (
          <SettingsSection title="Categories" noCard>
            <View style={styles.prefsLoading} accessibilityRole="progressbar">
              <ActivityIndicator size="small" color={colors.textSecondary} />
              <Text style={[styles.prefsLoadingText, { color: colors.textMuted }]}>
                Loading preferences…
              </Text>
            </View>
          </SettingsSection>
        ) : (
          PUSH_NOTIFICATION_GROUPS.map((group) => {
            const groupItems = PUSH_NOTIFICATION_DEFINITIONS.filter((n) => n.group === group.key);
            if (groupItems.length === 0) return null;
            return (
              <SettingsSection key={group.key} title={group.label} noCard>
                {groupItems.map((item, idx) => (
                  <SettingsRow
                    key={item.key}
                    icon={item.icon}
                    title={item.label}
                    subtitle={item.subtitle}
                    toggleValue={!!toggles[item.key]}
                    onToggle={() => void toggleCategory(item.key)}
                    disabled={!masterOn}
                    syncing={syncingKeys.has(item.key)}
                    isFirst={idx === 0}
                    isLast={idx === groupItems.length - 1}
                  />
                ))}
              </SettingsSection>
            );
          })
        )}

      {/* ── Quiet Hours ── */}
        <SettingsSection title="Quiet hours" noCard>
          <SettingsRow
            icon="moon-outline"
            title="Do Not Disturb"
            toggleValue={quietHours.enabled}
            onToggle={() => { haptic.selection(); void applyQuietHours({ enabled: !quietHours.enabled }); }}
            isFirst
            isLast={!quietHours.enabled}
          />
          {quietHours.enabled ? (
            <View style={styles.quietHoursRow}>
              <AnimatedPressable
                scaleValue={0.98}
                hapticFeedback="light"
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
                scaleValue={0.98}
                hapticFeedback="light"
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
          {quietHours.enabled ? (
            <SettingsInfoBanner
              icon="moon-outline"
              text={`Urgent alerts still arrive. Non-urgent push is silenced between ${formatHour(quietHours.startHour)} and ${formatHour(quietHours.endHour)}.`}
            />
          ) : null}
        </SettingsSection>

      {/* ── Notification preview — lock-screen policy, three choices ── */}
        <SettingsSection title="Lock screen" noCard>
          <SettingsRow
            icon="eye-off-outline"
            title="Notification preview"
            subtitle={PREVIEW_POLICY_LABELS[previewPolicy]}
            onPress={() => { haptic.selection(); setPreviewPickerOpen(true); }}
            isFirst
            isLast
          />
        </SettingsSection>

      {/* ── Diagnostics — quiet footer action, not a settings row ── */}
        <AnimatedPressable
          scaleValue={0.98}
          hapticFeedback="light"
          onPress={() => void handleTestNotification()}
          style={styles.testLink}
          accessibilityRole="button"
          accessibilityLabel="Send a test push notification"
        >
          <Text style={[styles.testLinkText, { color: colors.textMuted }]}>
            Send test notification
          </Text>
        </AnimatedPressable>

      {/* ── Quiet-hours pickers — bottom sheet, not a 24-cell wall ── */}
      <BottomSheetPicker
        visible={editingQuietTime !== null}
        onClose={() => setEditingQuietTime(null)}
        title={editingQuietTime === 'start' ? 'Quiet hours start' : 'Quiet hours end'}
        options={HOUR_LABELS}
        selectedValue={formatHour(editingQuietTime === 'start' ? quietHours.startHour : quietHours.endHour)}
        onSelect={(label) => {
          const hour = HOUR_OPTIONS[HOUR_LABELS.indexOf(label)];
          if (hour === undefined) return;
          if (editingQuietTime === 'start') {
            void applyQuietHours({ startHour: hour });
          } else if (editingQuietTime === 'end') {
            void applyQuietHours({ endHour: hour });
          }
          setEditingQuietTime(null);
        }}
      />

      <BottomSheetPicker
        visible={previewPickerOpen}
        onClose={() => setPreviewPickerOpen(false)}
        title="Notification preview"
        options={PREVIEW_POLICY_ORDER.map((policy) => PREVIEW_POLICY_LABELS[policy])}
        selectedValue={PREVIEW_POLICY_LABELS[previewPolicy]}
        onSelect={(label) => {
          const policy = PREVIEW_POLICY_ORDER.find((p) => PREVIEW_POLICY_LABELS[p] === label);
          if (policy) handlePreviewPolicyChange(policy);
        }}
      />
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
      borderBottomColor: colors.border },
    permissionBannerText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },
    permissionBannerAction: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },
    prefsLoading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingVertical: Space.md + Space.sm },
    prefsLoadingText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },
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
    quietTimeLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    quietTimeValue: {
      flex: 1,
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary },
    testLink: {
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: Space.md,
      marginTop: Space.lg },
    testLinkText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily } });
}
