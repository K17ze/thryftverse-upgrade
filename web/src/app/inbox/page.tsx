'use client';

/**
 * Inbox — /inbox. The shared InboxSplitView with no open thread: the
 * conversation rail beside an empty-state pane on desktop, the list
 * alone on mobile (tapping a row navigates to /inbox/[id]).
 */

import { InboxSplitView } from '@/components/inbox/InboxSplitView';

export default function InboxPage() {
  return <InboxSplitView />;
}
