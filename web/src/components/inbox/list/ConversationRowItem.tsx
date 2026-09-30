'use client';

import { useRef } from 'react';
import type { Conversation } from '@/lib/contracts/domain';
import { ConversationRow } from '../ConversationRow';
import { ConversationRowMenu, type ConversationRowMenuHandle } from '../ConversationRowMenu';

/**
 * Conversation row + its contextual menu — one wrapper so the row's
 * right-click (contextmenu) opens the same menu the hover kebab does,
 * anchored at the pointer. The desktop analogue of the mobile
 * long-press sheet.
 */
export function ConversationRowItem({
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
