'use client';

/**
 * PrivacyView — the /settings/privacy surface.
 *
 * Web deepening of the mobile PrivacySettingsScreen visibility switches,
 * BlockedUsersScreen, RestrictedAccountsScreen and the muted-accounts
 * list: profile-visibility toggles plus member lookups that resolve
 * against the live directory (fixture mode reads the fixture USERS
 * directory).
 *
 * Live mode syncs the real contract: private profile rides
 * PATCH /users/me/preferences, activity status and search visibility
 * their dedicated PATCH routes (hydrated from GET
 * /users/me/privacy-preferences), and each moderation list hydrates
 * from its own GET /users/me/*-users endpoint with the local store as
 * the fixture-mode truth. The DM gate lives at /settings/messaging —
 * it owns the server-enforced allowMessagesFrom field — so the row
 * here deep-links rather than duplicating the mutation.
 */

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';
import { Switch } from './Switch';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { USERS } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import {
  blockUser as blockUserApi,
  fetchBlockedUsers,
  fetchChatPrivacy,
  fetchMutedUsers,
  fetchPrivacyPreferences,
  fetchRestrictedUsers,
  muteUser as muteUserApi,
  restrictUser as restrictUserApi,
  searchUsers,
  unblockUser as unblockUserApi,
  unmuteUser as unmuteUserApi,
  unrestrictUser as unrestrictUserApi,
  updateActivityStatus,
  updatePrivateProfile,
  updateSearchVisibility,
} from '@/lib/api/services/users';
import { fetchAccountPreferences } from '@/lib/api/services/sellerHub';
import { useResolvedUsers } from '@/lib/hooks/home-modules';
import { useShopAway } from '@/lib/hooks/seller-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { useChatPrefs, type WhoCanMessage } from '@/lib/store/chatPrefs';
import { useSettingsPrefs, type PrivacyFlag } from '@/lib/store/settingsPrefs';

const LIVE = DATA_MODE === 'live';

// ── Profile privacy switches ────────────────────────────────────────────────
// Every row here is server-backed in live mode: privateProfile →
// PATCH /users/me/preferences, showActivity → PATCH /users/me/
// activity-status, searchVisible → PATCH /users/me/search-visibility.
// The store flags are the optimistic mirror and fixture truth.

const PRIVACY_SWITCHES: { key: PrivacyFlag; label: string; sub: string }[] = [
  {
    key: 'privateProfile',
    label: 'Private profile',
    sub: 'Only people who follow you can see your closet, looks and boards',
  },
  {
    key: 'showActivity',
    label: 'Activity status',
    sub: "Show when you're online and recently active",
  },
  {
    key: 'searchVisible',
    label: 'Search visibility',
    sub: 'Allow others to find you in member search',
  },
];

const WHO_CAN_MESSAGE_LABEL: Record<WhoCanMessage, string> = {
  everyone: 'Everyone',
  following: 'People you follow',
  none: 'No one',
};

// ── Member lookup + list ────────────────────────────────────────────────────

interface MemberManagerProps {
  /** 'block' | 'restrict' | 'mute' — drives labels and copy. */
  kind: 'block' | 'restrict' | 'mute';
  ids: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  emptyText: string;
}

const KIND_COPY: Record<
  MemberManagerProps['kind'],
  { verb: string; did: string; undid: string; removeVerb: string; rowSub: string; emptyIcon: 'ban' | 'eyeOff' | 'notificationsOff' }
> = {
  block: {
    verb: 'Block',
    did: 'blocked',
    undid: 'unblocked',
    removeVerb: 'Unblock',
    rowSub: 'Can’t message you, follow you or see your listings',
    emptyIcon: 'ban',
  },
  restrict: {
    verb: 'Restrict',
    did: 'restricted',
    undid: 'unrestricted',
    removeVerb: 'Unrestrict',
    rowSub: 'Their messages go to requests — they aren’t told',
    emptyIcon: 'eyeOff',
  },
  mute: {
    verb: 'Mute',
    did: 'muted',
    undid: 'unmuted',
    removeVerb: 'Unmute',
    rowSub: 'Their message notifications go quiet — they aren’t told',
    emptyIcon: 'notificationsOff',
  },
};

function MemberManager({ kind, ids, onAdd, onRemove, emptyText }: MemberManagerProps) {
  const { show } = useToast();
  const { user } = useSession();
  const [query, setQuery] = useState('');
  const deferredQ = useDeferredValue(query.trim().toLowerCase().replace(/^@/, ''));

  // Member rows resolve through the shared user resolver — live ids
  // fetch real profiles, misses drop; fixture ids read USERS.
  const { items: resolvedMembers } = useResolvedUsers(ids);

  // Live member search — the real directory, not the fixture pool.
  const searchQuery = useQuery({
    queryKey: ['privacy-member-search', deferredQ],
    queryFn: ({ signal }) => searchUsers(deferredQ, signal),
    enabled: LIVE && deferredQ.length > 0,
    staleTime: 30_000,
  });

  const members = useMemo(() => {
    if (LIVE) return resolvedMembers;
    return ids.map((id) => USERS.find((u) => u.id === id)).filter((u) => u != null);
  }, [resolvedMembers, ids]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, '');
    if (!q) return [];
    if (LIVE) {
      return (searchQuery.data ?? [])
        .filter((u) => u.id !== user?.id && !ids.includes(u.id))
        .slice(0, 4);
    }
    return USERS.filter(
      (u) => u.id !== 'me' && !ids.includes(u.id) && u.username.toLowerCase().includes(q),
    ).slice(0, 4);
  }, [query, ids, searchQuery.data, user?.id]);

  const copy = KIND_COPY[kind];
  const verb = copy.verb;

  return (
    <div>
      <div className="px-4 pb-3 pt-3 sm:px-5">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`${verb} a member — search username`}
          aria-label={`Search members to ${verb.toLowerCase()}`}
          className="h-11 w-full rounded-md border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none lg:max-w-[440px]"
        />
      </div>

      {matches.length > 0 ? (
        <ul className="divide-y divide-border-subtle border-b border-border-subtle">
          {matches.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <Avatar src={u.avatar} name={u.username} size={36} />
              <span className="min-w-0 flex-1 clamp-1 text-body-emphasis text-text-primary">
                @{u.username}
              </span>
              <button
                type="button"
                onClick={() => {
                  onAdd(u.id);
                  setQuery('');
                  show(`@${u.username} ${copy.did}`, 'info');
                }}
                className="pressable rounded-md px-2.5 py-1.5 text-caption font-semibold text-danger-text hover:bg-danger-subtle"
              >
                {verb}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {members.length > 0 ? (
        <ul className="divide-y divide-border-subtle">
          {members.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Avatar src={u.avatar} name={u.username} size={36} />
              <div className="min-w-0 flex-1">
                <p className="clamp-1 text-body-emphasis text-text-primary">@{u.username}</p>
                <p className="text-caption text-text-muted">{copy.rowSub}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onRemove(u.id);
                  show(`@${u.username} ${copy.undid}`, 'info');
                }}
                className="pressable rounded-md px-2.5 py-1.5 text-caption font-semibold text-text-primary hover:bg-brand-subtle"
              >
                {copy.removeVerb}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center px-5 py-8 text-center">
          <Icon name={copy.emptyIcon} size={24} className="text-text-muted" />
          <p className="mt-2.5 max-w-xs text-body text-text-secondary">{emptyText}</p>
        </div>
      )}
    </div>
  );
}

// ── View ────────────────────────────────────────────────────────────────────

export function PrivacyView() {
  const hydrated = useHydrated();
  const { show } = useToast();
  const qc = useQueryClient();
  const { isGuest, sessionLoading } = useSession();
  const syncs = LIVE && !isGuest;
  const privateProfile = useSettingsPrefs((s) => s.privateProfile);
  const showActivity = useSettingsPrefs((s) => s.showActivity);
  const searchVisible = useSettingsPrefs((s) => s.searchVisible);
  const setPrivacyFlag = useSettingsPrefs((s) => s.setPrivacyFlag);
  const blockedIds = useSettingsPrefs((s) => s.blockedIds);
  const restrictedIds = useSettingsPrefs((s) => s.restrictedIds);
  const mutedIds = useSettingsPrefs((s) => s.mutedIds);
  const blockUser = useSettingsPrefs((s) => s.blockUser);
  const unblockUser = useSettingsPrefs((s) => s.unblockUser);
  const restrictUser = useSettingsPrefs((s) => s.restrictUser);
  const unrestrictUser = useSettingsPrefs((s) => s.unrestrictUser);
  const muteUser = useSettingsPrefs((s) => s.muteUser);
  const unmuteUser = useSettingsPrefs((s) => s.unmuteUser);
  // The DM-gate row value mirrors the messaging-settings surface — the
  // chat-privacy reconcile below keeps it honest in live mode.
  const whoCanMessage = useChatPrefs((s) => s.whoCanMessage);
  const syncChatPrivacy = useChatPrefs((s) => s.syncFromServer);
  // The real away state — the row's value reads the same /users/me/
  // preferences (fixture store in demo) truth the seller-hub control
  // writes; the toggle itself lives there.
  const away = useShopAway();

  // Live moderation lists — each section's server truth is its own
  // GET /users/me/*-users endpoint; the store keeps fixture mode's ids.
  const blockedQuery = useQuery({
    queryKey: ['blocked-users'],
    queryFn: ({ signal }) => fetchBlockedUsers(signal),
    enabled: syncs,
    staleTime: 60_000,
  });
  const restrictedQuery = useQuery({
    queryKey: ['restricted-users'],
    queryFn: ({ signal }) => fetchRestrictedUsers(signal),
    enabled: syncs,
    staleTime: 60_000,
  });
  const mutedQuery = useQuery({
    queryKey: ['muted-users'],
    queryFn: ({ signal }) => fetchMutedUsers(signal),
    enabled: syncs,
    staleTime: 60_000,
  });
  // Visibility switches hydrate from their two read edges:
  // privacy-preferences carries activity + search visibility, the
  // shared account-preferences read carries privateProfile, and the
  // chat-privacy read keeps the DM-gate link's value honest.
  const privacyPrefsQuery = useQuery({
    queryKey: ['privacy-preferences'],
    queryFn: ({ signal }) => fetchPrivacyPreferences(signal),
    enabled: syncs,
    staleTime: 30_000,
  });
  const accountPrefsQuery = useQuery({
    queryKey: ['account-preferences'],
    queryFn: ({ signal }) => fetchAccountPreferences(signal),
    enabled: syncs,
    staleTime: 30_000,
  });
  const chatPrivacyQuery = useQuery({
    queryKey: ['chat-privacy'],
    queryFn: ({ signal }) => fetchChatPrivacy(signal),
    enabled: syncs,
    staleTime: 30_000,
  });

  // Reconcile server truth into the mirrors whenever the reads land.
  useEffect(() => {
    const prefs = privacyPrefsQuery.data;
    if (!prefs) return;
    setPrivacyFlag('showActivity', prefs.activityStatusVisible);
    setPrivacyFlag('searchVisible', prefs.searchVisibility === 'visible');
  }, [privacyPrefsQuery.data, setPrivacyFlag]);
  useEffect(() => {
    const prefs = accountPrefsQuery.data;
    if (prefs) setPrivacyFlag('privateProfile', prefs.privateProfile);
  }, [accountPrefsQuery.data, setPrivacyFlag]);
  useEffect(() => {
    if (chatPrivacyQuery.data) syncChatPrivacy(chatPrivacyQuery.data);
  }, [chatPrivacyQuery.data, syncChatPrivacy]);

  const liveBlockedIds = useMemo(
    () => (blockedQuery.data ?? []).map((b) => b.userId),
    [blockedQuery.data],
  );
  const liveRestrictedIds = useMemo(
    () => (restrictedQuery.data ?? []).map((r) => r.id),
    [restrictedQuery.data],
  );
  const liveMutedIds = useMemo(
    () => (mutedQuery.data ?? []).map((m) => m.id),
    [mutedQuery.data],
  );

  // Network/server failures carry no user-facing detail beyond "it didn't
  // save" — the offline classifier is the only message worth surfacing.
  const syncError = (error: unknown, fallback: string) => {
    const parsed = parseApiError(error);
    show(parsed.isNetworkError ? parsed.message : fallback, 'error');
  };

  /** Optimistic visibility write — the store mirror applies instantly,
   *  the live PATCH lands on the flag's endpoint, and a failed write
   *  restores the exact pre-write value. Fixture mode writes the store. */
  const setFlag = (key: PrivacyFlag, v: boolean) => {
    const previous = useSettingsPrefs.getState()[key];
    setPrivacyFlag(key, v);
    if (!syncs) return;
    let write: Promise<unknown> | null = null;
    let invalidateKey: string | null = null;
    if (key === 'showActivity') {
      write = updateActivityStatus(v);
      invalidateKey = 'privacy-preferences';
    } else if (key === 'searchVisible') {
      write = updateSearchVisibility(v ? 'visible' : 'hidden');
      invalidateKey = 'privacy-preferences';
    } else if (key === 'privateProfile') {
      write = updatePrivateProfile(v);
      invalidateKey = 'account-preferences';
    }
    if (!write) return;
    void write
      .then(() =>
        invalidateKey ? qc.invalidateQueries({ queryKey: [invalidateKey] }) : undefined,
      )
      .catch((error) => {
        setPrivacyFlag(key, previous);
        syncError(error, 'Couldn’t save — the preference was restored');
      });
  };

  /** Live member writes hit the real endpoint first, then invalidate the
   *  list query — the server is the display truth in live mode. Fixture
   *  mode writes the store. */
  const addBlocked = (id: string) => {
    if (syncs) {
      void blockUserApi(id)
        .then(() => void qc.invalidateQueries({ queryKey: ['blocked-users'] }))
        .catch(() => show("Couldn't block them — try again", 'error'));
      return;
    }
    blockUser(id);
  };
  const removeBlocked = (id: string) => {
    if (syncs) {
      void unblockUserApi(id)
        .then(() => void qc.invalidateQueries({ queryKey: ['blocked-users'] }))
        .catch(() => show("Couldn't unblock them — try again", 'error'));
      return;
    }
    unblockUser(id);
  };
  const addRestricted = (id: string) => {
    if (syncs) {
      void restrictUserApi(id)
        .then(() => void qc.invalidateQueries({ queryKey: ['restricted-users'] }))
        .catch(() => show("Couldn't restrict them — try again", 'error'));
      return;
    }
    restrictUser(id);
  };
  const removeRestricted = (id: string) => {
    if (syncs) {
      void unrestrictUserApi(id)
        .then(() => void qc.invalidateQueries({ queryKey: ['restricted-users'] }))
        .catch(() => show("Couldn't unrestrict them — try again", 'error'));
      return;
    }
    unrestrictUser(id);
  };
  const addMuted = (id: string) => {
    if (syncs) {
      void muteUserApi(id)
        .then(() => void qc.invalidateQueries({ queryKey: ['muted-users'] }))
        .catch(() => show("Couldn't mute them — try again", 'error'));
      return;
    }
    muteUser(id);
  };
  const removeMuted = (id: string) => {
    if (syncs) {
      void unmuteUserApi(id)
        .then(() => void qc.invalidateQueries({ queryKey: ['muted-users'] }))
        .catch(() => show("Couldn't unmute them — try again", 'error'));
      return;
    }
    unmuteUser(id);
  };

  // Only the three rendered rows need live values; the Record stays
  // total over PrivacyFlag so a future unbacked row can't dead-write
  // silently — unbacked keys just read the local flag.
  const flagValues: Record<PrivacyFlag, boolean> = {
    showCloset: true,
    showSaved: true,
    allowMessages: true,
    showActivity,
    privateProfile,
    searchVisible,
  };

  const shownBlocked = syncs ? liveBlockedIds : blockedIds;
  const shownRestricted = syncs ? liveRestrictedIds : restrictedIds;
  const shownMuted = syncs ? liveMutedIds : mutedIds;
  const listsReady =
    hydrated &&
    !(LIVE && sessionLoading) &&
    !(syncs && (blockedQuery.isLoading || restrictedQuery.isLoading || mutedQuery.isLoading));

  return (
    <>
      <SettingsSection title="Profile">
        {hydrated &&
        !(LIVE && sessionLoading) &&
        !(syncs && (privacyPrefsQuery.isLoading || accountPrefsQuery.isLoading)) ? (
          <>
            {PRIVACY_SWITCHES.map((row) => (
              <div key={row.key} className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="text-body-emphasis text-text-primary">{row.label}</p>
                  <p className="clamp-1 text-caption text-text-muted">{row.sub}</p>
                </div>
                <Switch
                  checked={flagValues[row.key]}
                  onChange={(v) => setFlag(row.key, v)}
                  aria-label={row.label}
                />
              </div>
            ))}
            {syncs && privacyPrefsQuery.isError ? (
              <div className="px-4 py-3 sm:px-5">
                <p className="text-caption text-text-muted">
                  Couldn’t reach the server — showing this device’s saved posture.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void privacyPrefsQuery.refetch();
                    void accountPrefsQuery.refetch();
                  }}
                  className="pressable mt-1 inline-flex min-h-11 items-center text-caption font-semibold text-text-primary"
                >
                  Try again
                </button>
              </div>
            ) : null}
            {/* The DM gate is server-enforced (allowMessagesFrom) and owned
                by the messaging surface — deep-link rather than keep a
                second, unbacked toggle. */}
            <SettingsRow
              icon="chat"
              label="Who can message me"
              subtitle="Managed in Messaging settings"
              value={WHO_CAN_MESSAGE_LABEL[whoCanMessage]}
              href="/settings/messaging"
            />
          </>
        ) : (
          <div aria-busy aria-label="Loading privacy settings">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[52px] w-full rounded-none" />
            ))}
          </div>
        )}
      </SettingsSection>

      {/* Shop activity — mobile puts Holiday mode inside privacy-style
          settings (Settings → Shop activity); web keeps the one control
          at /seller-hub/settings, so the row deep-links rather than
          duplicating the mutation. */}
      <SettingsSection title="Shop activity">
        <SettingsRow
          icon="bag"
          label="Holiday mode"
          subtitle="Pause your listings and hide your shop while you're away"
          value={away.data?.holidayMode === true ? 'On' : undefined}
          href="/seller-hub/settings"
        />
      </SettingsSection>

      <SettingsSection title={`Blocked users${hydrated && shownBlocked.length > 0 ? ` · ${shownBlocked.length}` : ''}`}>
        {listsReady ? (
          <MemberManager
            kind="block"
            ids={shownBlocked}
            onAdd={addBlocked}
            onRemove={removeBlocked}
            emptyText="Nobody blocked. Blocked members can’t message you, follow you, or see your listings."
          />
        ) : (
          <Skeleton className="h-[52px] w-full rounded-none" />
        )}
      </SettingsSection>

      <SettingsSection title={`Restricted${hydrated && shownRestricted.length > 0 ? ` · ${shownRestricted.length}` : ''}`}>
        {listsReady ? (
          <MemberManager
            kind="restrict"
            ids={shownRestricted}
            onAdd={addRestricted}
            onRemove={removeRestricted}
            emptyText="Nobody restricted. Restricted members can still see your profile, but their messages land in requests."
          />
        ) : (
          <Skeleton className="h-[52px] w-full rounded-none" />
        )}
      </SettingsSection>

      <SettingsSection title={`Muted${hydrated && shownMuted.length > 0 ? ` · ${shownMuted.length}` : ''}`}>
        {listsReady ? (
          <MemberManager
            kind="mute"
            ids={shownMuted}
            onAdd={addMuted}
            onRemove={removeMuted}
            emptyText="Nobody muted. Muting silences a member’s message notifications — they aren’t told."
          />
        ) : (
          <Skeleton className="h-[52px] w-full rounded-none" />
        )}
      </SettingsSection>

      <p className="px-4 pt-5 text-caption text-text-muted sm:px-5">
        {syncs
          ? 'Visibility, blocks, restricts and mutes are enforced by the platform — messages, follows and listing visibility are filtered before they ever reach the other member.'
          : LIVE
            ? 'Sign in to sync privacy settings to your account — the platform enforces them server-side.'
            : 'In this preview, lists and toggles are stored on this device. On an account, the platform enforces them server-side — messages, follows and listing visibility are filtered before they ever reach the other member.'}
      </p>
    </>
  );
}
