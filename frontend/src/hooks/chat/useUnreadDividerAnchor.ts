import { useRef } from "react";

import type { Message } from "./types";

/**
 * useUnreadDividerAnchor — resolve the "New messages" divider to the true
 * first-unread index, anchored to a message id so cursor-pagination
 * prepends never move it.
 *
 * The upstream `unreadDividerIndex` from useConversationMessages is only a
 * signal that the conversation was unread when opened (any value >= 0);
 * its raw index points at the latest incoming message, not the first
 * unread one. This hook snapshots the first incoming message the viewer
 * had not read — `sender === 'other'` with `isReadByMe === false` — on the
 * first populated render, before the open-time read receipt round-trips
 * through the store. The anchor id is then re-resolved to an index on
 * every render, so prepending older history keeps the banner on the same
 * message.
 *
 * Fallback: when no `isReadByMe === false` message exists at snapshot time
 * (e.g. the store was empty and the first data arrived after the
 * open-time read marked everything), the upstream index is used so the
 * banner still lands on a real incoming message rather than vanishing.
 *
 * Returns `{ index, messageId }` — index for the DM row renderer (which
 * compares against the item index), messageId for list renderers that key
 * on the item itself (group chat, where a filtered list shifts indices).
 */
export function useUnreadDividerAnchor(
  conversationId: string | undefined,
  messages: Message[],
  unreadDividerIndex: number,
): { index: number; messageId: string | null } {
  const snapshotRef = useRef<{
    conversationId?: string;
    taken: boolean;
    anchorId: string | null;
  }>({ taken: false, anchorId: null });

  // Conversation change — drop the previous anchor so a stale banner
  // never leaks into a different thread.
  if (snapshotRef.current.conversationId !== conversationId) {
    snapshotRef.current = {
      conversationId,
      taken: false,
      anchorId: null };
  }

  if (
    !snapshotRef.current.taken &&
    unreadDividerIndex >= 0 &&
    messages.length > 0
  ) {
    snapshotRef.current.taken = true;
    const firstUnread = messages.find(
      (m) => m.sender === "other" && !m.isSystem && m.isReadByMe === false,
    );
    snapshotRef.current.anchorId =
      (firstUnread ?? messages[unreadDividerIndex])?.id ?? null;
  }

  const anchorId = snapshotRef.current.anchorId;
  if (!anchorId) {
    return { index: -1, messageId: null };
  }
  return {
    index: messages.findIndex((m) => m.id === anchorId),
    messageId: anchorId };
}
