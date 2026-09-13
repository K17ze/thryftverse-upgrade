/**
 * useGroupDangerActions — the destructive conversation actions for the
 * group details screen: leave-group (with the ownership-transfer guard)
 * and clear-chat, both behind the shared confirmation sheet.
 * Extracted verbatim from GroupChatInfoScreen.
 */

import { useState } from 'react';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { useHaptic } from '../useHaptic';
import { deleteConversationOnApi } from '../../services/chatApi';
import type { Conversation } from '../../domain/conversation';
import type { RootStackParamList } from '../../navigation/types';
import type { GroupInfoConfirmSheetSetter } from './types';

export function useGroupDangerActions({
  conversation,
  conversationId,
  currentUserId,
  currentRole,
  navigation,
  setConfirmSheet,
}: {
  conversation: Conversation | undefined;
  conversationId: string;
  currentUserId: string | undefined;
  currentRole: 'owner' | 'admin' | 'member' | undefined;
  navigation: NativeStackNavigationProp<RootStackParamList>;
  setConfirmSheet: GroupInfoConfirmSheetSetter;
}) {
  const { show } = useToast();
  const haptic = useHaptic();
  const deleteConversation = useStore((state) => state.deleteConversation);
  const replaceConversationMessages = useStore((state) => state.replaceConversationMessages);
  const [isLeaving, setIsLeaving] = useState(false);

  const leaveGroup = () => {
    if (!conversation) return;
    if (conversation.ownerId === currentUserId || currentRole === 'owner') {
      show('Transfer ownership before leaving this group.', 'info');
      navigation.navigate('GroupMembers', { conversationId });
      return;
    }
    setConfirmSheet({
      visible: true,
      title: 'Leave group?',
      message: 'You will be removed from this group on all devices. Other members will keep their copy.',
      confirmLabel: 'Leave group',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        haptic.heavy();
        setIsLeaving(true);
        try {
          await deleteConversationOnApi(conversationId, 'leave');
          deleteConversation(conversationId);
          show('You left the group', 'info');
          navigation.navigate('MainTabs', { screen: 'Inbox' });
        } catch {
          show('Could not leave group. Check your connection and try again.', 'error');
        } finally {
          setIsLeaving(false);
        }
      },
    });
  };

  const clearChat = () => {
    setConfirmSheet({
      visible: true,
      title: 'Clear chat messages?',
      message: 'Messages in this chat will be deleted from your device.',
      confirmLabel: 'Clear chat',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        haptic.medium();
        try {
          await deleteConversationOnApi(conversationId, 'me');
          replaceConversationMessages(conversationId, []);
          show('Chat history cleared', 'info');
        } catch {
          show('Could not clear chat messages.', 'error');
        }
      },
    });
  };

  return { isLeaving, leaveGroup, clearChat };
}
