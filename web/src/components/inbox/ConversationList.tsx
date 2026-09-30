'use client';

/**
 * ConversationListPane — the inbox's left column (and the whole mobile
 * inbox). Header, quiet search, All / Requests segmented tabs, flat rows
 * separated by hairlines. Message requests render with an accent edge and
 * Accept / Decline actions — resolved locally against fixture state.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Conversation } from '@/lib/contracts/domain';
import { useConversations } from '@/lib/hooks/queries';
import { data as dataApi, DATA_MODE } from '@/lib/api/client';
import { blockUser } from '@/lib/api/services/users';
import { useSession } from '@/lib/session/SessionProvider';
import { useInboxPrefs } from '@/lib/store/inboxPrefs';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { useToast } from '@/components/ui/Toast';
import { EmptyState } from '@/components/ui/EmptyState';
import { StateGate } from '@/components/flagship/StateGate';
import { NewMessageSheet } from './NewMessageSheet';
import { ConfirmSheet } from './ConfirmSheet';
import { acceptFixtureRequest, liveConversationApi } from './groupAdmin';
import { useInboxSafety } from './inboxSafety';
import { useChatDrafts } from './useChatDrafts';
import {
  conversationRole,
  conversationTitle,
  isGroupConversation,
} from './inboxModel';
import { useConversationPrefs } from './useConversationPrefs';
import {
  isTab,
  type Tab,
} from './list/inboxListTypes';
import { ConversationListSkeleton } from './list/ConversationListSkeleton';
import { ConversationRowItem } from './list/ConversationRowItem';
import { RequestRow } from './list/RequestRow';
import { ConversationListHeader } from './list/ConversationListHeader';
import { ConversationListTabs } from './list/ConversationListTabs';

export type { Tab } from './list/inboxListTypes';
export { TABS, SECONDARY_TABS, isTab } from './list/inboxListTypes';

/**
 * Deep link — /inbox?tab=muted|archived|requests lands on the matching
 * segment (Settings → Messaging links here). Isolated under Suspense so
 * the search-param read never deopts the pane.
 */
function TabFromUrl({ onTab }: { onTab: (tab: Tab) => void }) {
  const searchParams = useSearchParams();
  const param = searchParams.get('tab');
  useEffect(() => {
    if (isTab(param)) onTab(param);
  }, [param, onTab]);
  return null;
}

export function ConversationListPane({
  activeId,
  className = '',
}: {
  activeId?: string | null;
  className?: string;
}) {
  const router = useRouter();
  const { user, isGuest } = useSession();
  const { data, isLoading, isError, refetch } = useConversations();
  const { data: rawConversations } = useQuery({
    queryKey: ['conversations', user?.id ?? 'guest'],
    queryFn: () => dataApi.conversations(user?.id),
  });
  const rawUnreadById = useMemo(() => {
    const map = new Map<string, { unread: boolean; count: number }>();
    for (const c of rawConversations ?? []) {
      map.set(c.id, {
        unread: c.unread || (c.unreadCount ?? 0) > 0,
        count: c.unreadCount ?? 0,
      });
    }
    return map;
  }, [rawConversations]);
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const viewerId = user?.id ?? 'me';
  const drafts = useChatDrafts((s) => s.drafts);
  const listRef = useRef<HTMLDivElement>(null);
  const requestResolutions = useInboxPrefs((s) => s.requests);
  const setRequestResolution = useInboxPrefs((s) => s.setRequestResolution);
  const [composeOpen, setComposeOpen] = useState(false);
  const [blockTarget, setBlockTarget] = useState<Conversation | null>(null);
  const { hydrated, isMuted, isArchived, isPinned } = useConversationPrefs();
  const blockedUserIds = useInboxSafety((s) => s.blockedUserIds);
  const toggleBlocked = useInboxSafety((s) => s.toggleBlocked);
  const prefBlock = useSettingsPrefs((s) => s.blockUser);
  const requestState = useCallback(
    (id: string) => (hydrated ? requestResolutions[id] : undefined),
    [hydrated, requestResolutions],
  );

  const conversations = useMemo(() => data ?? [], [data]);

  const requests = useMemo(
    () => conversations.filter((c) => c.isRequest && !requestState(c.id)),
    [conversations, requestState],
  );
  const regular = useMemo(
    () =>
      conversations.filter(
        (c) => (!c.isRequest || requestState(c.id) === 'accepted') && !isArchived(c),
      ),
    [conversations, requestState, isArchived],
  );
  const archived = useMemo(
    () => conversations.filter((c) => isArchived(c)),
    [conversations, isArchived],
  );
  const muted = useMemo(
    () => regular.filter((c) => isMuted(c)),
    [regular, isMuted],
  );
  const unreadThreads = useMemo(
    () => regular.filter((c) => rawUnreadById.get(c.id)?.unread),
    [regular, rawUnreadById],
  );
  const buying = useMemo(
    () => regular.filter((c) => conversationRole(c, viewerId) === 'buying'),
    [regular, viewerId],
  );
  const selling = useMemo(
    () => regular.filter((c) => conversationRole(c, viewerId) === 'selling'),
    [regular, viewerId],
  );
  const groupThreads = useMemo(
    () => regular.filter((c) => isGroupConversation(c)),
    [regular],
  );
  const unreadOf = useCallback(
    (rows: Conversation[]) =>
      rows.filter((c) => rawUnreadById.get(c.id)?.unread).length,
    [rawUnreadById],
  );

  const query = q.trim().toLowerCase();
  const matches = useCallback(
    (c: Conversation) =>
      !query ||
      conversationTitle(c).toLowerCase().includes(query) ||
      c.lastMessage.toLowerCase().includes(query) ||
      c.participantProfiles?.some((p) =>
        (p.displayName ?? p.username).toLowerCase().includes(query),
      ) ||
      c.listing?.title.toLowerCase().includes(query),
    [query],
  );

  const visible = useMemo(() => {
    const rows = (
      tab === 'all'
        ? regular
        : tab === 'buying'
          ? buying
          : tab === 'selling'
            ? selling
            : tab === 'unread'
              ? unreadThreads
              : tab === 'requests'
                ? requests
                : tab === 'groups'
                  ? groupThreads
                  : tab === 'muted'
                    ? muted
                    : archived
    ).filter(matches);
    return [...rows].sort((a, b) => Number(isPinned(b)) - Number(isPinned(a)));
  }, [
    tab,
    regular,
    buying,
    selling,
    unreadThreads,
    requests,
    groupThreads,
    muted,
    archived,
    matches,
    isPinned,
  ]);

  const acceptRequest = (c: Conversation) => {
    setRequestResolution(c.id, 'accepted');
    if (DATA_MODE === 'live') {
      liveConversationApi
        .acceptRequest(c.id)
        .then(() => qc.invalidateQueries({ queryKey: ['conversations'] }))
        .catch(() => {
          setRequestResolution(c.id, null);
          toast.show("Couldn't accept the request — try again", 'error');
        });
      return;
    }
    acceptFixtureRequest(c.id);
    void qc.invalidateQueries({ queryKey: ['conversations'] });
    toast.show(`Request from ${c.participantName} accepted`, 'success');
  };

  const declineRequest = (c: Conversation) => {
    setRequestResolution(c.id, 'declined');
    if (DATA_MODE === 'live') {
      liveConversationApi
        .declineRequest(c.id)
        .then(() => qc.invalidateQueries({ queryKey: ['conversations'] }))
        .catch(() => {
          setRequestResolution(c.id, null);
          toast.show("Couldn't decline the request — try again", 'error');
        });
      return;
    }
    toast.show('Request declined', 'info');
  };

  const confirmBlockSender = (c: Conversation) => {
    setBlockTarget(null);
    const uid = c.participantId;
    const name = conversationTitle(c);
    if (!uid) {
      toast.show("Couldn't block this account — try again", 'error');
      return;
    }
    const write = DATA_MODE === 'live' ? blockUser(uid) : Promise.resolve();
    void write
      .then(() => {
        if (!blockedUserIds.includes(uid)) toggleBlocked(uid);
        prefBlock(uid);
        setRequestResolution(c.id, 'declined');
        if (DATA_MODE === 'live') {
          void qc.invalidateQueries({ queryKey: ['conversations'] });
        }
        toast.show(`${name} blocked — they can't message you`, 'success');
      })
      .catch(() => {
        toast.show("Couldn't block this account — try again", 'error');
      });
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (
      e.key !== 'ArrowDown' &&
      e.key !== 'ArrowUp' &&
      e.key !== 'Home' &&
      e.key !== 'End'
    )
      return;
    const rows = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[data-conversation-row]') ?? [],
    );
    if (!rows.length) return;
    e.preventDefault();
    const at = rows.indexOf(document.activeElement as HTMLElement);
    let next: number;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = rows.length - 1;
    else if (at === -1) {
      const activeIdx = rows.findIndex(
        (r) => r.getAttribute('aria-current') === 'page',
      );
      next = activeIdx >= 0 ? activeIdx : 0;
    } else {
      next = e.key === 'ArrowDown' ? Math.min(rows.length - 1, at + 1) : Math.max(0, at - 1);
    }
    rows[next]?.focus();
  };

  if (isGuest) {
    return (
      <aside
        className={`flex w-full flex-col md:h-full md:w-[340px] md:shrink-0 md:border-r md:border-border-subtle lg:w-[380px] ${className}`}
        aria-label="Conversations"
      >
        <EmptyState
          compact
          icon="chat"
          title="Sign in to see your messages"
          subtitle="Offers, orders and conversations live on your account."
          actionLabel="Sign in"
          onAction={() => router.push('/auth')}
        />
      </aside>
    );
  }

  return (
    <aside
      className={`flex w-full flex-col md:h-full md:w-[340px] md:shrink-0 md:border-r md:border-border-subtle lg:w-[380px] ${className}`}
      aria-label="Conversations"
    >
      <div className="shrink-0 px-4 pb-3 pt-5">
        <ConversationListHeader
          query={q}
          composeOpen={composeOpen}
          onQueryChange={setQ}
          onOpenCompose={() => setComposeOpen(true)}
        />
        <ConversationListTabs
          tab={tab}
          onTabChange={(t) => {
            setTab(t);
            setSecondaryOpen(false);
          }}
          secondaryOpen={secondaryOpen}
          onToggleSecondary={() => setSecondaryOpen((o) => !o)}
          buyingUnreadCount={unreadOf(buying)}
          sellingUnreadCount={unreadOf(selling)}
          requestsCount={requests.length}
          unreadThreadsCount={unreadThreads.length}
          groupThreadsCount={groupThreads.length}
          mutedThreadsCount={muted.length}
        />
      </div>

      <div
        ref={listRef}
        onKeyDown={onListKeyDown}
        className="min-h-0 flex-1 md:overflow-y-auto"
      >
        <StateGate
          domain="conversations"
          compact
          isLoading={isLoading}
          isError={isError}
          skeleton={<ConversationListSkeleton />}
          onRetry={() => void refetch()}
        >
          {visible.length === 0 ? (
            <EmptyState
              compact
              icon="inbox"
              title={
                query
                  ? 'No matches'
                  : tab === 'unread'
                    ? 'All caught up'
                    : tab === 'requests'
                      ? 'No requests'
                      : tab === 'buying'
                        ? 'Nothing you’re buying'
                        : tab === 'selling'
                          ? 'Nothing you’re selling'
                          : tab === 'groups'
                            ? 'No group chats'
                            : tab === 'muted'
                              ? 'No muted conversations'
                              : tab === 'archived'
                                ? 'Nothing archived'
                                : 'No messages yet'
              }
              subtitle={
                query
                  ? 'Try a different name or keyword.'
                  : tab === 'unread'
                    ? 'Threads with unread messages appear here.'
                    : tab === 'requests'
                      ? 'Message requests from people you don\u2019t follow appear here.'
                      : tab === 'buying'
                        ? 'Conversations about items you’re buying appear here.'
                        : tab === 'selling'
                          ? 'Conversations about your listings appear here.'
                          : tab === 'groups'
                            ? 'Group conversations appear here.'
                            : tab === 'muted'
                              ? 'Muted threads stay quiet — mute any conversation from its ··· menu.'
                              : tab === 'archived'
                                ? 'Archived threads live here — use the ··· menu on any conversation.'
                                : 'When you message buyers or sellers, conversations appear here.'
              }
            />
          ) : (
            <div className="divide-y divide-border-subtle pb-2">
              {visible.map((c) =>
                tab === 'requests' ? (
                  <RequestRow
                    key={c.id}
                    conversation={c}
                    onAccept={() => acceptRequest(c)}
                    onDecline={() => declineRequest(c)}
                    onBlock={() => setBlockTarget(c)}
                  />
                ) : (
                  <ConversationRowItem
                    key={c.id}
                    conversation={c}
                    active={c.id === activeId}
                    rawUnread={rawUnreadById.get(c.id)}
                    draft={hydrated ? drafts[c.id] : undefined}
                  />
                ),
              )}
            </div>
          )}
        </StateGate>
      </div>

      <NewMessageSheet open={composeOpen} onClose={() => setComposeOpen(false)} />
      <ConfirmSheet
        state={{
          open: !!blockTarget,
          title: `Block ${blockTarget ? conversationTitle(blockTarget) : ''}?`,
          message:
            'They won\u2019t be able to message you, follow you, or see your listings. The request is removed.',
          confirmLabel: 'Block',
          variant: 'danger',
          onConfirm: async () => {
            if (blockTarget) confirmBlockSender(blockTarget);
          },
        }}
        onClose={() => setBlockTarget(null)}
      />
      <Suspense fallback={null}>
        <TabFromUrl onTab={setTab} />
      </Suspense>
    </aside>
  );
}
