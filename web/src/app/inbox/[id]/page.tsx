'use client';

/**
 * Conversation — /inbox/[id]. The shared InboxSplitView with the thread
 * open in the right pane and its row highlighted on desktop; on mobile
 * the thread alone with a back affordance.
 */

import { useParams } from 'next/navigation';
import { InboxSplitView } from '@/components/inbox/InboxSplitView';

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  return <InboxSplitView activeId={id} />;
}
