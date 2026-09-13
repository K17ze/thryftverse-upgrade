/**
 * useGroupMembersRealtime — subscribes to group membership events for this
 * conversation: reconciles the store, drops the conversation locally when
 * the removed/left user is the viewer, and hands the navigation reset back
 * to the screen via onSelfRemoved. Extracted verbatim from
 * GroupMembersScreen.
 */

import { useRef } from 'react';
import { useStore } from '../../store/useStore';
import { useChatGroupMembershipEvent } from '../../services/realtimeClient';

export function useGroupMembersRealtime(
  conversationId: string,
  currentUserId: string | undefined,
  onSelfRemoved: () => void,
): void {
  const deleteConversation = useStore((state) => state.deleteConversation);
  const reconcileGroupMembershipEvent = useStore((state) => state.reconcileGroupMembershipEvent);

  const onSelfRemovedRef = useRef(onSelfRemoved);
  onSelfRemovedRef.current = onSelfRemoved;

  useChatGroupMembershipEvent(conversationId, (event) => {
    const removedUserId = event.type === 'chat.member.removed'
      ? event.payload.memberUserId
      : event.type === 'chat.member.left'
        ? event.payload.actorUserId
        : null;
    reconcileGroupMembershipEvent(event);
    if (removedUserId && removedUserId === currentUserId) {
      deleteConversation(conversationId);
      onSelfRemovedRef.current();
    }
  });
}
