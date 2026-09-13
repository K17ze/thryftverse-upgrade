/**
 * useGroupMembershipGuard — realtime membership-event reconciliation for
 * the group details screen. When the event stream reports that the current
 * user was removed or left, the store is reconciled and the user is
 * dropped back to the inbox. Extracted verbatim from GroupChatInfoScreen.
 */

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useStore } from '../../store/useStore';
import { useChatGroupMembershipEvent } from '../../services/realtimeClient';
import type { RootStackParamList } from '../../navigation/types';

export function useGroupMembershipGuard(
  conversationId: string,
  currentUserId: string | undefined,
  navigation: NativeStackNavigationProp<RootStackParamList>
) {
  const reconcileGroupMembershipEvent = useStore(
    (state) => state.reconcileGroupMembershipEvent
  );

  useChatGroupMembershipEvent(conversationId, (event) => {
    const removedUserId =
      event.type === 'chat.member.removed'
        ? event.payload.memberUserId
        : event.type === 'chat.member.left'
          ? event.payload.actorUserId
          : null;
    reconcileGroupMembershipEvent(event);
    if (removedUserId && removedUserId === currentUserId) {
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Inbox' } }] });
    }
  });
}
