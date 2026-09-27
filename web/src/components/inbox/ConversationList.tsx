'use client';

/**
 * ConversationListPane — the inbox's left column (and the whole mobile
 * inbox). Header, quiet search, All / Requests segmented tabs, flat rows
 * separated by hairlines. Message requests render with an accent edge and
 * Accept / Decline actions — resolved locally against fixture state.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { StateGate } from '@/components/flagship/StateGate';
import { ConversationRow } from './ConversationRow';
import { ConversationRowMenu } from './ConversationRowMenu';
import { NewMessageSheet } from './NewMessageSheet';
import { ConfirmSheet } from './ConfirmSheet';
import { acceptFixtureRequest, liveConversationApi } from './groupAdmin';
import { useInboxSafety } from './inboxSafety';
import { conversationTitle, formatInboxTimestamp, lastMessagePreview } from './inboxModel';
import { useConversationPrefs } from './useConversationPrefs';

type Tab = 'all' | 'unread' | 'requests' | 'muted' | 'archived';
const TABS: Tab[] = ['all', 'unread', 'requests', 'muted', 'archived'];
function isTab(value: string | null): value is Tab {
  return !!value && (TABS as string[]).includes(value);
}

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
  // Raw (un-transformed) conversation rows — useConversations suppresses
  // muted unreads for badge surfaces; the row keeps the muted badge
  // visible-but-dimmed from the source record, matching the mobile row.
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
  // Request resolution persists in inboxPrefs — fixtures have no
  // request-response endpoint, so a declined request stays declined
  // across remounts (accept promotes to All). Live mode posts the
  // accept/decline edges the mobile chatApi calls and reverts on failure.
  const requestResolutions = useInboxPrefs((s) => s.requests);
  const setRequestResolution = useInboxPrefs((s) => s.setRequestResolution);
  const [composeOpen, setComposeOpen] = useState(false);
  const [blockTarget, setBlockTarget] = useState<Conversation | null>(null);
  // Archive/pin/mute resolution — hydrated local override first, then the
  // live flag — so the Archived and Muted tabs count what the server
  // holds too (useConversationPrefs gates the persisted read itself).
  const { hydrated, isMuted, isArchived, isPinned } = useConversationPrefs();
  // Request-row Block converges the two blocked lists — the same write
  // path ProfileOptionsMenu uses, so privacy surfaces never disagree.
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
  // Muted segment — mobile's dedicated Muted screen, folded into the tab
  // grammar. Regular threads only (archived and pending requests stay in
  // their own tabs); rows keep the standard menu so Unmute is one tap.
  const muted = useMemo(
    () => regular.filter((c) => isMuted(c)),
    [regular, isMuted],
  );
  // Unread filter — the WhatsApp/Airbnb chip grammar. Reads the raw
  // (pre-mute-suppression) unread flag so a muted-but-unread thread
  // still surfaces here with its dimmed badge.
  const unreadThreads = useMemo(
    () => regular.filter((c) => rawUnreadById.get(c.id)?.unread),
    [regular, rawUnreadById],
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

  // Pinned threads lead the list — a stable sort keeps the authored
  // recency order within each band (mobile inbox pin grammar).
  const visible = useMemo(() => {
    const rows = (
      tab === 'all'
        ? regular
        : tab === 'unread'
          ? unreadThreads
          : tab === 'requests'
            ? requests
            : tab === 'muted'
              ? muted
              : archived
    ).filter(matches);
    return [...rows].sort((a, b) => Number(isPinned(b)) - Number(isPinned(a)));
  }, [tab, regular, unreadThreads, requests, muted, archived, matches, isPinned]);

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
    // Decline persists via inboxPrefs — the fixture record keeps its flag
    // and the resolution hides it, mirroring server requestStatus='declined'.
    toast.show('Request declined', 'info');
  };

  /**
   * Block a request sender — mobile's third request action (accept /
   * decline / block). Posts the real /users/:id/block edge in live mode,
   * converges both blocked stores, and resolves the request out of the
   * queue. Declines honestly when the counterparty can't be resolved.
   */
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

  // The inbox is account-bound — a guest gets the sign-in surface, never
  // the fixture 'me' mailbox.
  if (isGuest) {
    return (
      <aside
        className={`flex w-full flex-col md:h-full md:w-[340px] md:shrink-0 md:border-r md:border-border-subtle ${className}`}
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
      className={`flex w-full flex-col md:h-full md:w-[340px] md:shrink-0 md:border-r md:border-border-subtle ${className}`}
      aria-label="Conversations"
    >
      <div className="shrink-0 px-4 pb-3 pt-5">
        <div className="flex items-center justify-between">
          <h1 className="text-screen-title font-bold text-text-primary">Messages</h1>
          <IconButton
            name="edit"
            aria-label="New message"
            onClick={() => setComposeOpen(true)}
            className="-mr-2"
          />
        </div>
        <label className="relative mt-3 block">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
            <Icon name="search" size={16} />
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search messages"
            aria-label="Search messages"
            className="h-9 w-full rounded-full border border-transparent bg-surface-alt pl-9 pr-3 text-body text-input-text placeholder:text-text-muted focus:border-border focus:outline-none"
          />
        </label>
        <div className="mt-3 overflow-x-auto">
          <SegmentedControl<Tab>
            options={[
              { value: 'all', label: 'All' },
              { value: 'unread', label: 'Unread', count: unreadThreads.length },
              {
                value: 'requests',
                label: requests.length ? `Requests · ${requests.length}` : 'Requests',
              },
              {
                value: 'muted',
                label: muted.length ? `Muted · ${muted.length}` : 'Muted',
              },
              { value: 'archived', label: 'Archived' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 md:overflow-y-auto">
        {/* Registry states via StateGate — offline resolves to the
            conversations offline copy instead of a generic failure; the
            per-tab/query empties stay bespoke below. */}
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
                <div key={c.id} className="group relative">
                  <ConversationRow
                    conversation={c}
                    active={c.id === activeId}
                    rawUnread={rawUnreadById.get(c.id)}
                  />
                  <ConversationRowMenu conversation={c} />
                </div>
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

/** Request row — brand accent edge, listing context, inline actions. */
function RequestRow({
  conversation: c,
  onAccept,
  onDecline,
  onBlock,
}: {
  conversation: Conversation;
  onAccept: () => void;
  onDecline: () => void;
  onBlock: () => void;
}) {
  return (
    <div className="px-3 py-1.5">
      <div className="relative rounded-lg border-l-2 border-brand bg-brand-subtle">
        <Link
          href={`/inbox/${c.id}`}
          aria-label={`Open message request from ${c.participantName}`}
          className="absolute inset-0 rounded-lg"
        />
        <div className="flex gap-3 p-3">
          <Avatar src={c.participantAvatar} name={c.participantName} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="clamp-1 text-body-emphasis font-semibold text-text-primary">
                {conversationTitle(c)}
              </span>
              <span className="tnum shrink-0 text-meta text-text-muted">
                {formatInboxTimestamp(c.lastMessageTime)}
              </span>
            </div>
            <p className="clamp-1 mt-0.5 text-body text-text-secondary">{lastMessagePreview(c)}</p>
            {c.listing ? (
              <p className="clamp-1 mt-0.5 text-meta font-semibold text-text-secondary">
                {c.listing.title}
              </p>
            ) : null}
            <div className="relative z-10 mt-2.5 flex items-center gap-2">
              <Button variant="outline" size="sm" fullWidth onClick={onDecline}>
                Decline
              </Button>
              <Button variant="primary" size="sm" fullWidth onClick={onAccept}>
                Accept
              </Button>
              <button
                type="button"
                onClick={onBlock}
                aria-label={`Block ${conversationTitle(c)}`}
                className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-muted hover:text-danger-text"
              >
                <Icon name="ban" size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Row shapes match the final list layout — avatar, two lines, thumb. */
function ConversationListSkeleton() {
  return (
    <div className="px-4" aria-busy aria-label="Loading conversations">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-[var(--density-row-py)]">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-8" />
            </div>
            <Skeleton className="mt-2 h-3 w-4/5" />
          </div>
          {i % 2 === 0 ? <Skeleton className="h-10 w-10 shrink-0 rounded-md" /> : null}
        </div>
      ))}
    </div>
  );
}
