'use client';

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Conversation } from '@/lib/contracts/domain';
import { useConversations } from '@/lib/hooks/queries';
import { data as dataApi, DATA_MODE } from '@/lib/api/client';
import { blockUser } from '@/lib/api/services/users';
import { useSession } from '@/lib/session/SessionProvider';
import { useInboxPrefs } from '@/lib/store/inboxPrefs';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { useToast } from '@/components/ui/Toast';
import { acceptFixtureRequest, liveConversationApi } from '../groupAdmin';
import { useInboxSafety } from '../inboxSafety';
import { useChatDrafts } from '../useChatDrafts';
import {
  conversationRole,
  conversationTitle,
  isGroupConversation,
} from '../inboxModel';
import { useConversationPrefs } from '../useConversationPrefs';
import { focusAdjacentGroupControl } from '@/lib/a11y/focus';
import type { Tab } from './inboxListTypes';

export function useConversationListWorkflow() {
  const router = useRouter();
  const { user, isGuest } = useSession();
  const { data, isLoading, isError, refetch } = useConversations();
  const { data: rawUnreadRows } = useQuery({
    queryKey: ['conversations', user?.id ?? 'guest'],
    queryFn: ({ signal }) => dataApi.conversations(user?.id, signal),
    select: (rows) =>
      rows.map((c) => ({
        id: c.id,
        unread: c.unread,
        unreadCount: c.unreadCount,
      })),
  });
  const rawUnreadById = useMemo(() => {
    const map = new Map<string, { unread: boolean; count: number }>();
    for (const c of rawUnreadRows ?? []) {
      map.set(c.id, {
        unread: c.unread || (c.unreadCount ?? 0) > 0,
        count: c.unreadCount ?? 0,
      });
    }
    return map;
  }, [rawUnreadRows]);
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('all');
  const tabsId = useId();
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

  const parkFocusBeforeRequestUnmount = () => {
    if (
      focusAdjacentGroupControl(
        document.activeElement,
        '[data-request-row]',
        '[data-conversation-row]',
      )
    )
      return;
    document.getElementById('main-content')?.focus({ preventScroll: true });
  };

  const acceptRequest = (c: Conversation) => {
    parkFocusBeforeRequestUnmount();
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
    parkFocusBeforeRequestUnmount();
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
    const departLink = document.querySelector<HTMLElement>(
      `a[data-conversation-row][href="/inbox/${CSS.escape(c.id)}"]`,
    );
    const departRow =
      departLink?.closest<HTMLElement>('[data-request-row]') ?? departLink;
    const rowRoots = departRow
      ? Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-request-row], a[data-conversation-row]:not([data-request-row] *)',
          ),
        )
      : [];
    const rowIdx = departRow ? rowRoots.indexOf(departRow) : -1;
    const nextRow =
      rowIdx >= 0 ? rowRoots[rowIdx + 1] ?? rowRoots[rowIdx - 1] : null;
    const parkTarget =
      (nextRow?.matches('a[data-conversation-row]')
        ? nextRow
        : nextRow?.querySelector<HTMLElement>('a[data-conversation-row]')) ??
      null;
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
        window.setTimeout(() => {
          if (parkTarget?.isConnected) {
            parkTarget.focus({ preventScroll: true });
          } else {
            document
              .getElementById('main-content')
              ?.focus({ preventScroll: true });
          }
        }, 0);
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

  return {
    router,
    user,
    isGuest,
    data,
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
  };
}
