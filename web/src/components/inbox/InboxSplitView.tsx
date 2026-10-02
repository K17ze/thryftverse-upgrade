'use client';

/**
 * InboxSplitView — the shared inbox shell for /inbox and /inbox/[id]
 * (Messenger/WhatsApp-web grammar). From md up it's master-detail: the
 * conversation rail (~340px, widening to 380px at lg per the desktop
 * contract) sits beside the thread, or beside an empty-state pane when
 * no conversation is open. Mobile keeps the list → chat navigation:
 * /inbox is the list page, /inbox/[id] the thread page.
 *
 * Desktop auto-open: a bare /inbox never leaves the detail pane empty
 * while threads wait — the topmost unread row (pinned-aware, same order
 * the rail renders; muted threads report unread:false through the shared
 * hook so quiet threads never demand attention) opens in place, falling
 * back to the most recent thread. It's view-level state, NOT navigation
 * — the URL stays /inbox and Back keeps its meaning. The pick latches:
 * opening the thread clears its unread flag, and without the latch the
 * "first unread" derivation would march down the list reading every
 * thread in turn. Requests and archived threads are never auto-opened —
 * requests wait on an explicit accept, archived threads wait on the
 * archived tab.
 *
 * The open-thread variant fixes the shell to the viewport minus the
 * 64px shared header so the stream scrolls inside the pane; the list-
 * only variant only fixes height from md up so mobile keeps page scroll.
 */

import { useEffect, useMemo, useState } from 'react';
import { ChatPanel } from './ChatPanel';
import { ChatSkeleton } from './panel/ChatSkeleton';
import { ConversationListPane } from './ConversationList';
import { EmptyState } from '@/components/ui/EmptyState';
import { useConversations } from '@/lib/hooks/queries';
import { useInboxRealtime } from '@/lib/hooks/chat-realtime';
import { useSession } from '@/lib/session/SessionProvider';
import { useInboxPrefs } from '@/lib/store/inboxPrefs';
import { useMediaQuery } from '@/components/filters/useMediaQuery';
import { useConversationPrefs } from './useConversationPrefs';

export function InboxSplitView({ activeId }: { activeId?: string }) {
  const { user, isGuest } = useSession();
  // The detail pane exists from md up — that's where an empty right-hand
  // column is wasted space. Mobile (<md) stays tap-to-open: no thread
  // mounts, so no mark-read fires without the viewer choosing a row.
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const { data, isLoading } = useConversations();
  const { hydrated, isArchived, isPinned } = useConversationPrefs();
  const requestResolutions = useInboxPrefs((s) => s.requests);
  const [autoId, setAutoId] = useState<string | null>(null);

  // The auto-open candidate in the rail's own order (pinned first, then
  // the feed's recency sort). Guests have no inbox to open; prefs must be
  // hydrated before archive/request overrides are trustworthy.
  const candidate = useMemo(() => {
    if (!hydrated || isGuest || !user) return undefined;
    const eligible = (data ?? []).filter(
      (c) =>
        (!c.isRequest || requestResolutions[c.id] === 'accepted') &&
        !isArchived(c),
    );
    const ordered = [...eligible].sort(
      (a, b) => Number(isPinned(b)) - Number(isPinned(a)),
    );
    return (
      ordered.find((c) => c.unread || (c.unreadCount ?? 0) > 0)?.id ??
      ordered[0]?.id
    );
  }, [data, hydrated, isGuest, user, requestResolutions, isArchived, isPinned]);

  useEffect(() => {
    if (activeId || !isDesktop) return;
    if (autoId) {
      // The latched thread vanished (deleted/left) — re-pick once.
      if (data && !data.some((c) => c.id === autoId)) {
        setAutoId(candidate ?? null);
      }
      return;
    }
    if (candidate) setAutoId(candidate);
  }, [activeId, isDesktop, autoId, candidate, data]);

  const openId =
    activeId ?? (isDesktop && !isGuest ? (autoId ?? undefined) : undefined);

  // Inbox realtime — `chat.user:{id}` carries the new-DM / new-group /
  // added-to-group signals that can never arrive on a known conversation
  // topic, and the loaded rows' topics keep previews + unread badges
  // live. The open thread's badge is owned by its own mark-read, so
  // arrivals there never bump the row. Guests/fixtures never connect;
  // the 45s useConversations poll stays the baseline.
  useInboxRealtime(openId);
  return (
    <div
      className={`mx-auto w-full max-w-[1440px] md:flex md:h-[calc(100dvh-4rem)] ${
        activeId ? 'flex h-[calc(100dvh-4rem)]' : ''
      }`}
    >
      <div className={activeId ? 'hidden h-full md:block' : 'w-full md:w-auto md:shrink-0 md:h-full'}>
        <ConversationListPane activeId={openId} />
      </div>
      {openId ? (
        <div className={`h-full min-w-0 flex-1 ${activeId ? '' : 'hidden md:block'}`}>
          <ChatPanel conversationId={openId} />
        </div>
      ) : isDesktop && isLoading ? (
        // The rail's skeleton handles the list; the pane waits quietly
        // for the auto-open pick rather than flashing the empty state.
        <div className="hidden h-full min-w-0 flex-1 md:block">
          <ChatSkeleton />
        </div>
      ) : (
        <div className="hidden min-w-0 flex-1 items-center justify-center md:flex">
          <EmptyState
            icon="chat"
            title="Your messages"
            subtitle="Select a conversation to read and reply."
            compact
          />
        </div>
      )}
    </div>
  );
}
