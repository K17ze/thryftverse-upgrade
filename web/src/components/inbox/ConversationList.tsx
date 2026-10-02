'use client';

/**
 * ConversationListPane — the inbox's left column (and the whole mobile
 * inbox). Header, quiet search, All / Requests segmented tabs, flat rows
 * separated by hairlines. Message requests render with an accent edge and
 * Accept / Decline actions — resolved locally against fixture state.
 */

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { StateGate } from '@/components/flagship/StateGate';
import { tabId, tabPanelId } from '@/components/ui/Tabs';
import { NewMessageSheet } from './NewMessageSheet';
import { ConfirmSheet } from './ConfirmSheet';
import { conversationTitle } from './inboxModel';
import {
  isTab,
  SECONDARY_LABELS,
  SECONDARY_TABS,
  type Tab,
} from './list/inboxListTypes';
import { ConversationListSkeleton } from './list/ConversationListSkeleton';
import { ConversationRowItem } from './list/ConversationRowItem';
import { RequestRow } from './list/RequestRow';
import { ConversationListHeader } from './list/ConversationListHeader';
import { ConversationListTabs } from './list/ConversationListTabs';
import { useConversationListWorkflow } from './list/useConversationListWorkflow';

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
  const {
    router,
    isGuest,
    isLoading,
    isError,
    refetch,
    rawUnreadById,
    tab,
    setTab,
    tabsId,
    q,
    setQ,
    query,
    secondaryOpen,
    setSecondaryOpen,
    drafts,
    listRef,
    composeOpen,
    setComposeOpen,
    blockTarget,
    setBlockTarget,
    hydrated,
    requests,
    buying,
    selling,
    unreadThreads,
    groupThreads,
    muted,
    visible,
    unreadOf,
    acceptRequest,
    declineRequest,
    confirmBlockSender,
    onListKeyDown,
  } = useConversationListWorkflow();

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
          // While a secondary chip owns the list, no primary tab controls
          // the panel — withhold pairing rather than fabricate references.
          idBase={SECONDARY_TABS.includes(tab) ? undefined : tabsId}
          // ...but the owning chip does — point it at the live panel id.
          panelId={SECONDARY_TABS.includes(tab) ? tabPanelId(tabsId, tab) : undefined}
        />
      </div>

      {/* The thread list is the rail's tabpanel */}
      <div
        ref={listRef}
        onKeyDown={onListKeyDown}
        role="tabpanel"
        id={tabPanelId(tabsId, tab)}
        aria-labelledby={
          SECONDARY_TABS.includes(tab) ? undefined : tabId(tabsId, tab)
        }
        aria-label={
          SECONDARY_TABS.includes(tab)
            ? SECONDARY_LABELS[tab as keyof typeof SECONDARY_LABELS]
            : undefined
        }
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
