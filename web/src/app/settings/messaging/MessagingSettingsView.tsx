'use client';

/**
 * /settings/messaging — ported from mobile ChatSettingsScreen: message
 * scope radio (everyone / following / nobody → 'none'), read receipts,
 * the two in-chat marketplace cards, then the control rows for muted /
 * archived / requests / blocked / restricted.
 *
 * Live mode syncs through GET/PATCH /users/me/chat-privacy — the same
 * edge mobile's accountApi.updateChatPrivacy writes. `whoCanMessage`
 * is the server-enforced DM gate (wire 'nobody' ↔ local 'none');
 * `useChatPrefs` is the optimistic mirror and the fixture-mode truth,
 * hydrated from server truth on mount and reverted on a failed write.
 */

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useConversations } from '@/lib/hooks/queries';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import {
  fetchChatPrivacy,
  updateChatPrivacy,
  type ChatPrivacySettings,
} from '@/lib/api/services/users';
import { useSession } from '@/lib/session/SessionProvider';
import {
  useChatPrefs,
  useReadReceiptsEnabled,
  type WhoCanMessage,
} from '@/lib/store/chatPrefs';
import { useConversationPrefs } from '@/components/inbox/useConversationPrefs';
import { useInboxPrefs } from '@/lib/store/inboxPrefs';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { useHydrated } from '@/lib/store/useStore';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { Switch } from '@/components/settings/Switch';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';

const isLive = DATA_MODE === 'live';

/** Local scope vocabulary ↔ the wire's allowMessagesFrom enum. */
function scopeToWire(value: WhoCanMessage): ChatPrivacySettings['allowMessagesFrom'] {
  return value === 'none' ? 'nobody' : value;
}

const MESSAGE_SCOPES: Array<{
  value: WhoCanMessage;
  label: string;
  subtitle: string;
}> = [
  {
    value: 'everyone',
    label: 'Everyone',
    subtitle: 'Anyone on ThryftVerse can message you',
  },
  {
    value: 'following',
    label: 'People you follow',
    subtitle: 'Requests from everyone else land in Requests',
  },
  { value: 'none', label: 'No one', subtitle: 'Only you can start chats' },
];

export function MessagingSettingsView() {
  const hydrated = useHydrated();
  const { show } = useToast();
  const qc = useQueryClient();
  const { isGuest, sessionLoading } = useSession();
  const { data, isLoading } = useConversations();
  const conversations = useMemo(() => data ?? [], [data]);
  const { isMuted, isArchived } = useConversationPrefs();
  const requestResolutions = useInboxPrefs((s) => s.requests);
  const { blockedIds, restrictedIds } = useSettingsPrefs();

  const whoCanMessage = useChatPrefs((s) => s.whoCanMessage);
  const setWhoCanMessage = useChatPrefs((s) => s.setWhoCanMessage);
  const readReceipts = useReadReceiptsEnabled();
  const setReadReceipts = useChatPrefs((s) => s.setReadReceipts);
  const offersInChat = useChatPrefs((s) => s.offersInChat);
  const setOffersInChat = useChatPrefs((s) => s.setOffersInChat);
  const orderUpdatesInChat = useChatPrefs((s) => s.orderUpdatesInChat);
  const setOrderUpdatesInChat = useChatPrefs((s) => s.setOrderUpdatesInChat);
  const syncChatPrivacy = useChatPrefs((s) => s.syncFromServer);

  // The wire only exists for an authed live session — guests and fixture
  // mode keep the device-local mirror.
  const syncs = isLive && !isGuest;
  const chatPrivacy = useQuery({
    queryKey: ['chat-privacy'],
    queryFn: ({ signal }) => fetchChatPrivacy(signal),
    enabled: syncs,
    staleTime: 30_000,
  });

  // Reconcile server truth into the mirror whenever the read lands.
  useEffect(() => {
    if (chatPrivacy.data) syncChatPrivacy(chatPrivacy.data);
  }, [chatPrivacy.data, syncChatPrivacy]);

  // Network/server failures carry no user-facing detail beyond "it didn't
  // save" — the offline classifier is the only message worth surfacing.
  const syncError = (error: unknown, fallback: string) => {
    const parsed = parseApiError(error);
    show(parsed.isNetworkError ? parsed.message : fallback, 'error');
  };

  /** Optimistic write — the mirror applies instantly, the live PATCH
   *  carries just the touched field, and a failed write restores the
   *  exact pre-write value. Fixture mode writes the store. */
  const syncPref = (
    apply: () => void,
    revert: () => void,
    patch: Partial<ChatPrivacySettings>,
  ) => {
    apply();
    if (!syncs) return;
    void updateChatPrivacy(patch)
      .then(() => void qc.invalidateQueries({ queryKey: ['chat-privacy'] }))
      .catch((error) => {
        revert();
        syncError(error, 'Couldn’t save — the preference was restored');
      });
  };

  const selectScope = (value: WhoCanMessage) => {
    const previous = whoCanMessage;
    syncPref(
      () => setWhoCanMessage(value),
      () => setWhoCanMessage(previous),
      { allowMessagesFrom: scopeToWire(value) },
    );
  };
  const toggleReadReceipts = (v: boolean) =>
    syncPref(
      () => setReadReceipts(v),
      () => setReadReceipts(!v),
      { readReceiptsEnabled: v },
    );
  const toggleOffersInChat = (v: boolean) =>
    syncPref(
      () => setOffersInChat(v),
      () => setOffersInChat(!v),
      { offersInChatEnabled: v },
    );
  const toggleOrderUpdatesInChat = (v: boolean) =>
    syncPref(
      () => setOrderUpdatesInChat(v),
      () => setOrderUpdatesInChat(!v),
      { orderUpdatesInChatEnabled: v },
    );

  const mutedCount = useMemo(
    () => conversations.filter((c) => isMuted(c) && !isArchived(c)).length,
    [conversations, isMuted, isArchived],
  );
  const archivedCount = useMemo(
    () => conversations.filter((c) => isArchived(c)).length,
    [conversations, isArchived],
  );
  const requestCount = useMemo(
    () =>
      conversations.filter(
        (c) => c.isRequest && !requestResolutions[c.id],
      ).length,
    [conversations, requestResolutions],
  );

  if (!hydrated || isLoading || (isLive && sessionLoading) || (syncs && chatPrivacy.isLoading)) {
    return (
      <div className="space-y-8" aria-busy aria-label="Loading chat settings">
        {[0, 1, 2].map((section) => (
          <div key={section} className="space-y-2">
            <Skeleton className="mx-4 h-4 w-28 sm:mx-5" />
            <div className="space-y-px border-y border-border-subtle">
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-[52px] w-full rounded-none" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Mobile: Allow messages from — Everyone / People you follow / Nobody. */}
      <SettingsSection title="Who can message me">
        <div role="radiogroup" aria-label="Who can message me">
          {MESSAGE_SCOPES.map((scope) => {
            const checked = whoCanMessage === scope.value;
            return (
              <button
                key={scope.value}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => selectScope(scope.value)}
                className="pressable flex min-h-[52px] w-full items-center gap-1 px-4 py-2 text-left sm:px-5"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-11 w-9 shrink-0 items-center ${
                    checked ? 'text-brand' : 'text-text-muted'
                  }`}
                >
                  <span
                    className={`grid size-5 place-items-center rounded-full border transition-colors ${
                      checked ? 'border-brand' : 'border-border'
                    }`}
                  >
                    <span
                      className={`size-2.5 rounded-full bg-brand transition-transform ${
                        checked ? 'scale-100' : 'scale-0'
                      }`}
                    />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="clamp-1 block text-body-emphasis text-text-primary">
                    {scope.label}
                  </span>
                  <span className="clamp-1 mt-0.5 block text-caption text-text-muted">
                    {scope.subtitle}
                  </span>
                </span>
                {checked ? (
                  <Icon
                    name="check"
                    filled
                    size={18}
                    className="shrink-0 text-brand"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </SettingsSection>

      {/* Mobile: chat experience toggles. Read receipts off caps your own
          read status at delivered — the thread never claims a read. */}
      <SettingsSection title="Chat experience">
        <SettingsRow
          icon="check"
          label="Read receipts"
          subtitle="When off, your messages stop at delivered — nobody sees that you read theirs"
          trailing={
            <Switch
              checked={readReceipts}
              onChange={toggleReadReceipts}
              aria-label="Read receipts"
            />
          }
        />
        <SettingsRow
          icon="offer"
          label="Offers in chat"
          subtitle="Offer and counter-offer cards inside transaction conversations"
          trailing={
            <Switch
              checked={offersInChat}
              onChange={toggleOffersInChat}
              aria-label="Offers in chat"
            />
          }
        />
        <SettingsRow
          icon="box"
          label="Order updates in chat"
          subtitle="Shipping and delivery status cards inside conversations"
          trailing={
            <Switch
              checked={orderUpdatesInChat}
              onChange={toggleOrderUpdatesInChat}
              aria-label="Order updates in chat"
            />
          }
        />
      </SettingsSection>

      {/* Mobile: control surface — muted / archived / requests / blocked /
          restricted rows with live counts. */}
      <SettingsSection title="Conversations">
        <SettingsRow
          icon="notificationsOff"
          label="Muted conversations"
          value={mutedCount > 0 ? String(mutedCount) : 'None'}
          href="/inbox?tab=muted"
        />
        <SettingsRow
          icon="folder"
          label="Archived conversations"
          value={archivedCount > 0 ? String(archivedCount) : 'None'}
          href="/inbox?tab=archived"
        />
        <SettingsRow
          icon="mailUnread"
          label="Message requests"
          value={requestCount > 0 ? String(requestCount) : 'None'}
          href="/inbox?tab=requests"
        />
      </SettingsSection>

      <SettingsSection title="Privacy and safety">
        <SettingsRow
          icon="ban"
          label="Blocked"
          value={blockedIds.length > 0 ? String(blockedIds.length) : 'None'}
          href="/settings/privacy"
        />
        <SettingsRow
          icon="eyeOff"
          label="Restricted"
          value={
            restrictedIds.length > 0 ? String(restrictedIds.length) : 'None'
          }
          href="/settings/privacy"
        />
      </SettingsSection>

      <p className="mt-6 px-4 text-caption text-text-muted sm:px-5">
        {syncs
          ? 'These sync to your account — the platform gates new DMs on your message scope before a conversation is ever created.'
          : isLive
            ? 'Chat preferences are stored on this device — sign in to sync them to your account.'
            : 'In this preview, chat preferences are stored on this device. On an account, the platform gates new DMs on your message scope.'}
      </p>
    </div>
  );
}
