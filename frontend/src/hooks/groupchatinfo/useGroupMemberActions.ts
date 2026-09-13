/**
 * useGroupMemberActions — member inspection + management actions for the
 * group details screen: the selected-member sheet state, the promote /
 * demote role mutation with store reconciliation, and the confirmed
 * member-removal flow. Extracted verbatim from GroupChatInfoScreen.
 */

import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import {
  promoteConversationMemberOnApi,
  demoteConversationMemberOnApi,
  removeConversationMemberOnApi,
} from '../../services/chatApi';
import { parseApiError } from '../../lib/apiClient';
import type { Conversation } from '../../domain/conversation';
import type { GroupMemberActionsTarget } from '../../components/groupchat/GroupMemberActionsSheet';
import { sanitizeMemberRoles } from '../../components/groupchatinfo/groupChatInfoViewModels';
import type { GroupInfoConfirmSheetSetter } from './types';

export function useGroupMemberActions({
  conversation,
  conversationId,
  setConfirmSheet,
}: {
  conversation: Conversation | undefined;
  conversationId: string;
  setConfirmSheet: GroupInfoConfirmSheetSetter;
}) {
  const upsertConversation = useStore((state) => state.upsertConversation);
  const { show } = useToast();
  const [selectedMember, setSelectedMember] = useState<GroupMemberActionsTarget | null>(null);

  const applyMemberRoles = (result: { memberRoles: Record<string, string> }) => {
    if (!conversation) return;
    upsertConversation({
      ...conversation,
      memberRoles: sanitizeMemberRoles(result.memberRoles),
    });
  };

  const toggleMemberAdmin = async (member: GroupMemberActionsTarget) => {
    const name = member.displayName ?? member.username;
    const wasAdmin = member.role === 'admin';
    setSelectedMember(null);
    try {
      const result = wasAdmin
        ? await demoteConversationMemberOnApi(conversationId, member.id)
        : await promoteConversationMemberOnApi(conversationId, member.id);
      applyMemberRoles(result);
      show(wasAdmin ? `${name} is now a member.` : `${name} is now an admin.`, wasAdmin ? 'info' : 'success');
    } catch (err) {
      show(parseApiError(err, 'Could not update admin status.').message, 'error');
    }
  };

  const removeMember = (member: GroupMemberActionsTarget) => {
    const name = member.displayName ?? member.username;
    setSelectedMember(null);
    if (!conversation) return;
    setConfirmSheet({
      visible: true,
      title: `Remove ${name}?`,
      message: `They will be removed from ${conversation.title || 'this group'} on all devices.`,
      confirmLabel: 'Remove member',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        try {
          const result = await removeConversationMemberOnApi(conversationId, member.id);
          upsertConversation({
            ...conversation,
            participantIds: result.participantIds,
          });
          show(`Removed ${name} from group`, 'info');
        } catch (err) {
          show(parseApiError(err, 'Could not remove member. Try again.').message, 'error');
        }
      },
    });
  };

  return {
    selectedMember,
    setSelectedMember,
    toggleMemberAdmin,
    removeMember,
  };
}
