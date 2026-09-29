'use client';

/**
 * InboxSplitView — the shared inbox shell for /inbox and /inbox/[id]
 * (Messenger/WhatsApp-web grammar). From md up it's master-detail: the
 * conversation rail (~340px, widening to 380px at lg per the desktop
 * contract) sits beside the thread, or beside an empty-state pane when
 * no conversation is open. Mobile keeps the list → chat navigation:
 * /inbox is the list page, /inbox/[id] the thread page.
 *
 * The open-thread variant fixes the shell to the viewport minus the
 * 64px shared header so the stream scrolls inside the pane; the list-
 * only variant only fixes height from md up so mobile keeps page scroll.
 */

import { ChatPanel } from './ChatPanel';
import { ConversationListPane } from './ConversationList';
import { EmptyState } from '@/components/ui/EmptyState';
import { useInboxRealtime } from '@/lib/hooks/chat-realtime';

export function InboxSplitView({ activeId }: { activeId?: string }) {
  // Inbox realtime — `chat.user:{id}` carries the new-DM / new-group /
  // added-to-group signals that can never arrive on a known conversation
  // topic, and the loaded rows' topics keep previews + unread badges
  // live. The open thread's badge is owned by its own mark-read, so
  // arrivals there never bump the row. Guests/fixtures never connect;
  // the 45s useConversations poll stays the baseline.
  useInboxRealtime(activeId);
  return (
    <div
      className={`mx-auto w-full max-w-[1440px] md:flex md:h-[calc(100dvh-4rem)] ${
        activeId ? 'flex h-[calc(100dvh-4rem)]' : ''
      }`}
    >
      <div className={activeId ? 'hidden h-full md:block' : 'w-full md:w-auto md:shrink-0 md:h-full'}>
        <ConversationListPane activeId={activeId} />
      </div>
      {activeId ? (
        <div className="h-full min-w-0 flex-1">
          <ChatPanel conversationId={activeId} />
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
