'use client';

/**
 * PrivacyView — the /settings/privacy surface.
 *
 * Web deepening of the mobile PrivacySettingsScreen visibility switches,
 * BlockedUsersScreen, RestrictedAccountsScreen and the muted-accounts
 * list: profile-visibility toggles plus member lookups that resolve
 * against the live directory (fixture mode reads the fixture USERS
 * directory).
 */

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
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
  unblockUser as unblockUserApi,
  unmuteUser as unmuteUserApi,
  unrestrictUser as unrestrictUserApi,
  updateActivityStatus,
  updatePrivateProfile,
  updateSearchVisibility,
} from '@/lib/api/services/users';
import { fetchAccountPreferences } from '@/lib/api/services/sellerHub';
import { useShopAway } from '@/lib/hooks/seller-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { useChatPrefs } from '@/lib/store/chatPrefs';
import { useSettingsPrefs, type PrivacyFlag } from '@/lib/store/settingsPrefs';
import { MemberManager } from './privacy/MemberManager';
import { PrivacySwitchesSection } from './privacy/PrivacySwitchesSection';

const LIVE = DATA_MODE === 'live';

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

  const whoCanMessage = useChatPrefs((s) => s.whoCanMessage);
  const syncChatPrivacy = useChatPrefs((s) => s.syncFromServer);
  const away = useShopAway();

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

  const syncError = (error: unknown, fallback: string) => {
    const parsed = parseApiError(error);
    show(parsed.isNetworkError ? parsed.message : fallback, 'error');
  };

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

  const profileLoading =
    !hydrated ||
    (LIVE && sessionLoading) ||
    (syncs && (privacyPrefsQuery.isLoading || accountPrefsQuery.isLoading));

  return (
    <>
      <SettingsSection title="Profile">
        <PrivacySwitchesSection
          isLoading={profileLoading}
          isError={privacyPrefsQuery.isError}
          onRetry={() => {
            void privacyPrefsQuery.refetch();
            void accountPrefsQuery.refetch();
          }}
          syncs={syncs}
          flagValues={flagValues}
          onSetFlag={setFlag}
          whoCanMessage={whoCanMessage}
        />
      </SettingsSection>

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
