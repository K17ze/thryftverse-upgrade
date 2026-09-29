'use client';

/**
 * NotificationPrefsView — the /settings/notifications surface.
 *
 * Web deepening of the mobile NotificationPreferencesScreen + the
 * channel-specific PushNotificationsScreen / EmailNotificationsScreen:
 * one grouped matrix where every category shows its push and email
 * posture side by side (mobile ships them as separate screens; the web
 * column layout makes the channel split readable at a glance).
 *
 * Master toggles are pause/resume like mobile — pausing snapshots the
 * category mix, resuming restores it. Category rows for a paused channel
 * dim rather than pretend they still fire.
 *
 * Live mode syncs through two wires: GET/PUT /notifications/preferences
 * (push categories + quiet hours) and GET/PUT /users/me/email-preferences
 * (the email matrix). The local store is the optimistic mirror hydrated
 * from server truth, every push write projects onto the coarser wire
 * categories (PUSH_PREF_WIRE_CATEGORY), every email write projects 1:1
 * (EMAIL_PREF_WIRE_FIELD), and a failed write restores the exact
 * pre-write posture. Fixture and guest sessions keep the
 * localStorage-only path.
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SettingsSection } from './SettingsSection';
import { Switch } from './Switch';
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

const isLive = DATA_MODE === 'live';

interface PrefRowDef {
  key: NotificationPrefKey;
  label: string;
  sub: string;
  /** Channels this category actually delivers on (mobile parity). */
  push?: boolean;
  email?: boolean;
  /** Always-on categories the member can't switch off. */
  locked?: boolean;
}

interface PrefGroupDef {
  title: string;
  rows: PrefRowDef[];
}

const GROUPS: PrefGroupDef[] = [
  {
    title: 'Essential',
    rows: [
      {
        key: 'securityAlerts',
        label: 'Security alerts',
        sub: 'Sign-ins, password and payout changes — always on',
        email: true,
        locked: true,
      },
    ],
  },
  {
    title: 'Orders & fulfilment',
    rows: [
      {
        key: 'orderUpdates',
        label: 'Order updates',
        sub: 'Purchases, sales and delivery status',
        push: true,
        email: true,
      },
      {
        key: 'fulfilmentReminders',
        label: 'Dispatch reminders',
        sub: 'Deadlines on items you’ve sold',
        push: true,
      },
    ],
  },
  {
    title: 'Marketplace',
    rows: [
      { key: 'likes', label: 'Likes', sub: 'When someone favourites your item', push: true },
      {
        key: 'offers',
        label: 'Offers',
        sub: 'Offers and counter-offers on your items',
        push: true,
      },
      {
        key: 'priceDrops',
        label: 'Price drops',
        sub: 'Wishlisted items going cheaper',
        push: true,
        email: true,
      },
      {
        key: 'savedSearchAlerts',
        label: 'Saved-search alerts',
        sub: 'New listings matching your saved searches',
        push: true,
        email: true,
      },
    ],
  },
  {
    title: 'Social',
    rows: [
      { key: 'followers', label: 'New followers', sub: 'When someone follows you', push: true },
      {
        key: 'comments',
        label: 'Comments & mentions',
        sub: 'Replies and mentions on your posts',
        push: true,
      },
      {
        key: 'messages',
        label: 'Messages',
        sub: 'Chat replies and offer messages',
        push: true,
        email: true,
      },
    ],
  },
  {
    title: 'Co-Own & auctions',
    rows: [
      {
        key: 'auctionAlerts',
        label: 'Auction alerts',
        sub: 'Outbid, ending soon and auction results',
        push: true,
        email: true,
      },
      {
        key: 'coownDistributions',
        label: 'Distribution notices',
        sub: 'Payouts on assets you co-own',
        email: true,
      },
      {
        key: 'coownCorporateActions',
        label: 'Corporate actions',
        sub: 'Votes and asset events',
        email: true,
      },
    ],
  },
  {
    title: 'Marketing',
    rows: [
      {
        key: 'marketing',
        label: 'News & promotions',
        sub: 'Features, events and member offers',
        push: true,
        email: true,
      },
    ],
  },
];

/** Keys that participate in each channel's master toggle — locked and
 * channel-less categories are excluded so the master posture is honest. */
const CHANNEL_KEYS: Record<NotifChannel, NotificationPrefKey[]> = {
  push: GROUPS.flatMap((g) => g.rows.filter((r) => r.push && !r.locked).map((r) => r.key)),
  email: GROUPS.flatMap((g) => g.rows.filter((r) => r.email && !r.locked).map((r) => r.key)),
};

function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

// ── Rows ────────────────────────────────────────────────────────────────────

function MasterRow({
  label,
  on,
  paused,
  onChange,
}: {
  label: string;
  on: boolean;
  paused: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-body-emphasis text-text-primary">{label}</p>
        <p className="text-caption text-text-muted">
          {paused ? 'Paused — your categories are kept' : 'Alerts reach this account'}
        </p>
      </div>
      <Switch checked={on} onChange={onChange} aria-label={label} />
    </div>
  );
}

function MatrixRow({
  def,
  pushChecked,
  emailChecked,
  pushDisabled,
  emailDisabled,
  onPref,
}: {
  def: PrefRowDef;
  pushChecked: boolean;
  emailChecked: boolean;
  pushDisabled: boolean;
  emailDisabled: boolean;
  onPref: (channel: NotifChannel, key: NotificationPrefKey, v: boolean) => void;
}) {
  return (
    <div className="flex min-h-[52px] items-center gap-2 px-4 py-2.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-body-emphasis text-text-primary">{def.label}</p>
        <p className="clamp-1 text-caption text-text-muted">{def.sub}</p>
      </div>
      <span className="flex w-11 shrink-0 justify-center">
        {def.push ? (
          <Switch
            checked={pushChecked}
            onChange={(v) => onPref('push', def.key, v)}
            disabled={pushDisabled || def.locked}
            aria-label={`${def.label} — push`}
          />
        ) : (
          <span aria-hidden className="text-body text-text-muted">
            —
          </span>
        )}
      </span>
      <span className="flex w-11 shrink-0 justify-center">
        {def.email ? (
          <Switch
            checked={emailChecked}
            onChange={(v) => onPref('email', def.key, v)}
            disabled={emailDisabled || def.locked}
            aria-label={`${def.label} — email`}
          />
        ) : (
          <span aria-hidden className="text-body text-text-muted">
            —
          </span>
        )}
      </span>
    </div>
  );
}

function ColumnHeader({ hasPush, hasEmail }: { hasPush: boolean; hasEmail: boolean }) {
  return (
    <div className="flex items-center gap-2 border-b border-border-subtle px-4 pb-1.5 pt-2 sm:px-5">
      <span className="flex-1" />
      <span className="w-11 shrink-0 text-center text-meta font-semibold uppercase tracking-wide text-text-muted">
        {hasPush ? 'Push' : ''}
      </span>
      <span className="w-11 shrink-0 text-center text-meta font-semibold uppercase tracking-wide text-text-muted">
        {hasEmail ? 'Email' : ''}
      </span>
    </div>
  );
}

// ── View ────────────────────────────────────────────────────────────────────

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

  // Network/server failures carry no user-facing detail beyond "it didn't
  // save" — the offline classifier is the only message worth surfacing.
  const syncError = (error: unknown, fallback: string) => {
    const parsed = parseApiError(error);
    show(parsed.isNetworkError ? parsed.message : fallback, 'error');
  };

  /** Optimistic category write → PUT the wire projection; a failed write
   *  restores just the toggled key. Push keys without a wire seat (the
   *  locked security-alerts row) and email keys outside
   *  EMAIL_PREF_WIRE_FIELD stay device-local. */
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
    // The email wire is 1:1 with the mapped rows — the whole projected
    // map ships on every write.
    if (channel === 'email' && key in EMAIL_PREF_WIRE_FIELD) {
      void usersService
        .updateEmailPreferences(wireEmailPreferences(useSettingsPrefs.getState().email))
        .catch((error) => {
          setPref('email', key, !v);
          syncError(error, 'Couldn’t save — the preference was restored');
        });
    }
  };

  /** Pause/resume — snapshots the mix like mobile; a failed write
   *  restores the map and the snapshot atomically. */
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

  /** Quiet hours — user-level on the server so every device honours the
   *  same window. The mirror applies instantly; failure rolls back. */
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
          // The window is wall-clock in the user's zone — the server
          // evaluates it there, not UTC.
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

  const selectClass =
    'h-11 rounded-md border border-border bg-input px-2 text-body text-input-text focus:border-text-muted focus:outline-none';

  return (
    <>
      <SettingsSection title="Delivery">
        {syncs && (livePrefs.isError || emailPrefs.isError) ? (
          <div className="px-4 py-3.5 sm:px-5">
            <p className="text-caption text-text-muted">
              Couldn’t reach the server — showing this device’s saved preferences.
            </p>
            <button
              type="button"
              onClick={() => {
                void livePrefs.refetch();
                void emailPrefs.refetch();
              }}
              className="pressable mt-1 inline-flex min-h-11 items-center text-caption font-semibold text-text-primary"
            >
              Try again
            </button>
          </div>
        ) : null}
        <MasterRow
          label="Push notifications"
          on={pushOn}
          paused={!pushOn}
          onChange={(v) => syncChannelMaster('push', v)}
        />
        <MasterRow
          label="Email notifications"
          on={emailOn}
          paused={!emailOn}
          onChange={(v) => syncChannelMaster('email', v)}
        />
      </SettingsSection>

      {GROUPS.map((group) => {
        const hasPush = group.rows.some((r) => r.push);
        const hasEmail = group.rows.some((r) => r.email);
        return (
          <SettingsSection key={group.title} title={group.title}>
            <ColumnHeader hasPush={hasPush} hasEmail={hasEmail} />
            <div className="divide-y divide-border-subtle">
              {group.rows.map((def) => (
                <MatrixRow
                  key={def.key}
                  def={def}
                  pushChecked={push[def.key]}
                  emailChecked={email[def.key]}
                  pushDisabled={!pushOn && !def.locked}
                  emailDisabled={!emailOn && !def.locked}
                  onPref={syncPref}
                />
              ))}
            </div>
          </SettingsSection>
        );
      })}

      <SettingsSection title="Quiet hours">
        <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="text-body-emphasis text-text-primary">Do Not Disturb</p>
            <p className="text-caption text-text-muted">
              {quietHours.enabled
                ? `Push silenced ${formatHour(quietHours.startHour)} – ${formatHour(quietHours.endHour)}`
                : 'Silence non-urgent push overnight'}
            </p>
          </div>
          <Switch
            checked={quietHours.enabled}
            onChange={(v) => syncQuietHours({ enabled: v })}
            aria-label="Do Not Disturb"
          />
        </div>
        {quietHours.enabled ? (
          <div className="flex items-center gap-3 px-4 pb-4 pt-1 sm:px-5">
            <label className="flex items-center gap-2 text-caption text-text-muted">
              From
              <select
                aria-label="Quiet hours start"
                value={quietHours.startHour}
                onChange={(e) => syncQuietHours({ startHour: Number(e.target.value) })}
                className={selectClass}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-caption text-text-muted">
              To
              <select
                aria-label="Quiet hours end"
                value={quietHours.endHour}
                onChange={(e) => syncQuietHours({ endHour: Number(e.target.value) })}
                className={selectClass}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </SettingsSection>

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
