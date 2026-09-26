'use client';

/**
 * Conversation info — /inbox/[id]/info. The detail-pane pattern this inbox
 * already uses: on desktop the thread stays open beside a right-side info
 * column (list · thread · details), on mobile the info surface is the
 * pushed screen the header tap navigates to.
 */

import { useParams } from 'next/navigation';
import { ConversationListPane } from '@/components/inbox/ConversationList';
import { ChatPanel } from '@/components/inbox/ChatPanel';
import { ConversationInfoPanel } from '@/components/inbox/ConversationInfoPanel';

export default function ConversationInfoPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-[1440px]">
      <div className="hidden h-full md:block">
        <ConversationListPane activeId={id} />
      </div>
      <div className="hidden h-full min-w-0 flex-1 md:block">
        <ChatPanel conversationId={id} />
      </div>
      <div className="h-full min-w-0 flex-1 md:w-[380px] md:flex-none md:border-l md:border-border-subtle lg:w-[420px]">
        <ConversationInfoPanel conversationId={id} />
      </div>
    </div>
  );
}
