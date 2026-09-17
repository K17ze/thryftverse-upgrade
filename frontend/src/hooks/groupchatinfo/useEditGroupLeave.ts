/**
 * useEditGroupLeave — the leave-group action for the edit-group screen,
 * behind the shared confirmation sheet. Distinct from
 * useGroupDangerActions.leaveGroup: this flow uses leaveGroupOnApi (the
 * members endpoint) and has no ownership-transfer guard — only members
 * who can already edit reach this screen. Extracted verbatim from
 * EditGroupScreen.
 */

import { useState } from 'react';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { useHaptic } from '../useHaptic';
import { leaveGroupOnApi } from '../../services/chatApi';
import { parseApiError } from '../../lib/apiClient';
import type { RootStackParamList } from '../../navigation/types';
import type { GroupInfoConfirmSheetSetter } from './types';

export function useEditGroupLeave({
  conversationId,
  currentUserId,
  setConfirmSheet,
  navigation,
}: {
  conversationId: string;
  currentUserId: string | undefined;
  setConfirmSheet: GroupInfoConfirmSheetSetter;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const { show } = useToast();
  const haptic = useHaptic();
  const deleteConversation = useStore((state) => state.deleteConversation);
  const [isLeaving, setIsLeaving] = useState(false);

  const leaveGroup = () => {
    setConfirmSheet({
      visible: true,
      title: 'Leave group?',
      message:
        'You will be removed from this group on all devices. Other members will keep the conversation.',
      confirmLabel: 'Leave group',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        haptic.heavy();
        setIsLeaving(true);
        try {
          await leaveGroupOnApi(conversationId, currentUserId ?? '');
          deleteConversation(conversationId);
          show('You left the group.', 'info');
          navigation.navigate('MainTabs', { screen: 'Inbox' });
        } catch (error) {
          show(parseApiError(error, 'Could not leave the group.').message, 'error');
        } finally {
          setIsLeaving(false);
        }
      },
    });
  };

  return { isLeaving, leaveGroup };
}
