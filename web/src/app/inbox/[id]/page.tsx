'use client';

/**
 * Conversation — /inbox/[id]. Desktop: same two-pane shell as /inbox with
 * the thread open in the right pane and the row highlighted. Mobile: the
 * thread alone with a back affordance.
 *
 * Mobile height subtracts the 64px header + 68px tab bar (AppShell chrome
 * is shared and can't be edited from this slice).
 */

import { useParams } from 'next/navigation';
import { ConversationListPane } from '@/components/inbox/ConversationList';
import { ChatPanel } from '@/components/inbox/ChatPanel';

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-[1440px] md:h-[calc(100dvh-4rem)]">
      <div className="hidden h-full md:block">
        <ConversationListPane activeId={id} />
      </div>
      <div className="h-full min-w-0 flex-1">
        <ChatPanel conversationId={id} />
      </div>
    </div>
  );
}
