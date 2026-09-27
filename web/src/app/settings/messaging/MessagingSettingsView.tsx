'use client';

/**
 * /settings/messaging — ported from mobile ChatSettingsScreen: message
 * scope radio (everyone / following / nobody → 'none'), read receipts,
 * the two in-chat marketplace cards, then the control rows for muted /
 * archived / requests / blocked / restricted.
 *
 * Persisted in `useChatPrefs` — there is no dedicated web chat-privacy
 * edge yet, so the scopes persist locally and the page says so rather
 * than implying a server sync that has not happened.
 */

import { useMemo } from 'react';
import { useConversations } from '@/lib/hooks/queries';
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

  if (!hydrated || isLoading) {
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
                onClick={() => setWhoCanMessage(scope.value)}
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
              onChange={setReadReceipts}
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
              onChange={setOffersInChat}
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
              onChange={setOrderUpdatesInChat}
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
        Chat preferences are stored on this device. Read receipts apply to
        your own messages straight away; the message scope is applied where
        new conversations are started.
      </p>
    </div>
  );
}
