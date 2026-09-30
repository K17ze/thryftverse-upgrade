'use client';

/**
 * NotificationPrefsView — the /settings/notifications surface.
 *
 * Web deepening of the mobile NotificationPreferencesScreen + the
 * channel-specific PushNotificationsScreen / EmailNotificationsScreen:
 * one grouped matrix where every category shows its push and email
 * posture side by side.
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useHydrated } from '@/lib/store/useStore';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import * as notificationsService from '@/lib/api/services/notifications';
import * as usersService from '@/lib/api/services/users';
import {
  useSettingsPrefs,
  channelAnyEnabled,
  wirePushPreferences,
  wireEmailPreferences,
  PUSH_PREF_WIRE_CATEGORY,
  EMAIL_PREF_WIRE_FIELD,
  type NotificationPrefKey,
  type NotifChannel,
  type QuietHours,
} from '@/lib/store/settingsPrefs';
import { CHANNEL_KEYS } from './notifications/notificationsTypes';
import { NotificationDeliverySection } from './notifications/NotificationDeliverySection';
import { NotificationMatrixSection } from './notifications/NotificationMatrixSection';
import { QuietHoursSection } from './notifications/QuietHoursSection';

const isLive = DATA_MODE === 'live';

export function NotificationPrefsView() {
  const hydrated = useHydrated();
  const { show } = useToast();
  const { isGuest, sessionLoading } = useSession();
  const push = useSettingsPrefs((s) => s.push);
  const email = useSettingsPrefs((s) => s.email);
  const setPref = useSettingsPrefs((s) => s.setPref);
  const setChannelMaster = useSettingsPrefs((s) => s.setChannelMaster);
  const restoreChannelPrefs = useSettingsPrefs((s) => s.restoreChannelPrefs);
  const syncNotificationPrefs = useSettingsPrefs((s) => s.syncNotificationPrefs);
  const syncEmailPrefs = useSettingsPrefs((s) => s.syncEmailPrefs);
  const quietHours = useSettingsPrefs((s) => s.quietHours);
  const setQuietHours = useSettingsPrefs((s) => s.setQuietHours);

  // The wire only exists for an authed live session — guests and fixture
  // mode keep the device-local mirror.
  const syncs = isLive && !isGuest;
  const livePrefs = useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: ({ signal }) => notificationsService.fetchNotificationPreferences(signal),
    enabled: syncs,
    staleTime: 30_000,
  });
  const emailPrefs = useQuery({
    queryKey: ['users', 'me', 'email-preferences'],
    queryFn: ({ signal }) => usersService.fetchEmailPreferences(signal),
    enabled: syncs,
    staleTime: 30_000,
  });

  // Reconcile server truth into the mirror whenever the reads land.
  useEffect(() => {
    if (livePrefs.data) syncNotificationPrefs(livePrefs.data);
  }, [livePrefs.data, syncNotificationPrefs]);
  useEffect(() => {
    if (emailPrefs.data) syncEmailPrefs(emailPrefs.data);
  }, [emailPrefs.data, syncEmailPrefs]);

  const syncError = (error: unknown, fallback: string) => {
    const parsed = parseApiError(error);
    show(parsed.isNetworkError ? parsed.message : fallback, 'error');
  };

  /** Optimistic category write → PUT the wire projection */
  const syncPref = (channel: NotifChannel, key: NotificationPrefKey, v: boolean) => {
    setPref(channel, key, v);
    if (!syncs) return;
    if (channel === 'push' && key in PUSH_PREF_WIRE_CATEGORY) {
      void notificationsService
        .updateNotificationPreferences({
          preferences: wirePushPreferences(useSettingsPrefs.getState().push),
        })
        .catch((error) => {
          setPref('push', key, !v);
          syncError(error, 'Couldn’t save — the preference was restored');
        });
      return;
    }
    if (channel === 'email' && key in EMAIL_PREF_WIRE_FIELD) {
      void usersService
        .updateEmailPreferences(wireEmailPreferences(useSettingsPrefs.getState().email))
        .catch((error) => {
          setPref('email', key, !v);
          syncError(error, 'Couldn’t save — the preference was restored');
        });
    }
  };

  /** Pause/resume — snapshots the mix like mobile */
  const syncChannelMaster = (channel: NotifChannel, v: boolean) => {
    const before = useSettingsPrefs.getState();
    const map = before[channel];
    const paused = channel === 'push' ? before.pausedPush : before.pausedEmail;
    setChannelMaster(channel, v, CHANNEL_KEYS[channel]);
    if (!syncs) return;
    const rollback = (error: unknown) => {
      restoreChannelPrefs(channel, map, paused);
      syncError(error, 'Couldn’t save — the preferences were restored');
    };
    if (channel === 'push') {
      void notificationsService
        .updateNotificationPreferences({
          preferences: wirePushPreferences(useSettingsPrefs.getState().push),
        })
        .catch(rollback);
      return;
    }
    void usersService
      .updateEmailPreferences(wireEmailPreferences(useSettingsPrefs.getState().email))
      .catch(rollback);
  };

  /** Quiet hours — user-level on the server */
  const syncQuietHours = (patch: Partial<QuietHours>) => {
    const before = useSettingsPrefs.getState().quietHours;
    setQuietHours(patch);
    if (!syncs) return;
    const next = useSettingsPrefs.getState().quietHours;
    void notificationsService
      .updateNotificationPreferences({
        quietHours: {
          enabled: next.enabled,
          startHour: next.startHour,
          endHour: next.endHour,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      })
      .catch((error) => {
        setQuietHours(before);
        syncError(error, 'Couldn’t update quiet hours — restored');
      });
  };

  if (
    !hydrated ||
    (isLive && sessionLoading) ||
    (syncs && (livePrefs.isLoading || emailPrefs.isLoading))
  ) {
    return (
      <div aria-busy aria-label="Loading preferences" className="mt-2 space-y-px">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-[52px] w-full rounded-none" />
        ))}
      </div>
    );
  }

  const pushOn = channelAnyEnabled(push, CHANNEL_KEYS.push);
  const emailOn = channelAnyEnabled(email, CHANNEL_KEYS.email);

  return (
    <>
      <NotificationDeliverySection
        syncs={syncs}
        isError={livePrefs.isError || emailPrefs.isError}
        onRetry={() => {
          void livePrefs.refetch();
          void emailPrefs.refetch();
        }}
        pushOn={pushOn}
        emailOn={emailOn}
        onSyncPushMaster={(v) => syncChannelMaster('push', v)}
        onSyncEmailMaster={(v) => syncChannelMaster('email', v)}
      />

      <NotificationMatrixSection
        push={push}
        email={email}
        pushOn={pushOn}
        emailOn={emailOn}
        onPref={syncPref}
      />

      <QuietHoursSection
        quietHours={quietHours}
        onSyncQuietHours={syncQuietHours}
      />

      <p className="px-4 pt-5 text-caption text-text-muted sm:px-5">
        Security alerts can’t be switched off — they protect your account.
        {syncs
          ? ' Push and email choices plus quiet hours sync to your account.'
          : isLive
            ? ' Preferences are stored on this device — sign in to sync them to your account.'
            : ' In this preview, preferences are stored on this device; the platform syncs them across devices once the notification API is connected.'}
      </p>
    </>
  );
}
