'use client';

/**
 * Inbox — /inbox. Desktop: two-pane (conversation list ~340px, empty
 * state right until a thread is opened at /inbox/[id]). Mobile: list
 * only; tapping a row navigates to the thread route.
 */

import { ConversationListPane } from '@/components/inbox/ConversationList';
import { EmptyState } from '@/components/ui/EmptyState';

export default function InboxPage() {
  return (
    <div className="mx-auto w-full max-w-[1440px] md:flex md:h-[calc(100dvh-4rem)]">
      <ConversationListPane />
      <div className="hidden min-w-0 flex-1 items-center justify-center md:flex">
        <EmptyState
          icon="chat"
          title="Your messages"
          subtitle="Select a conversation to read and reply."
          compact
        />
      </div>
    </div>
  );
}
