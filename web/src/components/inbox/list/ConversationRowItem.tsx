'use client';

import { memo, useRef } from 'react';
import type { Conversation } from '@/lib/contracts/domain';
import { ConversationRow } from '../ConversationRow';
import { ConversationRowMenu, type ConversationRowMenuHandle } from '../ConversationRowMenu';

/**
 * Conversation row + its contextual menu — one wrapper so the row's
 * right-click (contextmenu) opens the same menu the hover kebab does,
 * anchored at the pointer. The desktop analogue of the mobile
 * long-press sheet.
 *
 * Memoized: realtime merges rebuild the conversations array but keep
 * each untouched row's reference, so an arrival in one thread re-renders
 * only that row. `rawUnread` resolves fresh per pass — it's compared by
 * field, same grammar as MessageBubble's reply preview.
 */
function ConversationRowItemImpl({
  conversation: c,
  active,
  rawUnread,
  draft,
}: {
  conversation: Conversation;
  active: boolean;
  rawUnread?: { unread: boolean; count: number };
  draft?: string;
}) {
  const menuRef = useRef<ConversationRowMenuHandle>(null);
  return (
    <div
      className="group relative"
      // content-visibility: auto lets the browser skip layout/paint for
      // rows far offscreen (cheap windowing for long inboxes) while the
      // node stays in the a11y tree and find-in-page; the intrinsic hint
      // is the density row's best-known height so the scrollbar doesn't
      // guess.
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 72px' }}
      onContextMenu={(e) => {
        e.preventDefault();
        menuRef.current?.openAt(e.clientX, e.clientY);
      }}
    >
      <ConversationRow
        conversation={c}
        active={active}
        rawUnread={rawUnread}
        draft={draft}
      />
      <ConversationRowMenu conversation={c} ref={menuRef} />
    </div>
  );
}

export const ConversationRowItem = memo(
  ConversationRowItemImpl,
  (a, b) =>
    a.conversation === b.conversation &&
    a.active === b.active &&
    a.draft === b.draft &&
    a.rawUnread?.unread === b.rawUnread?.unread &&
    a.rawUnread?.count === b.rawUnread?.count,
);
