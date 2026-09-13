/**
 * useGroupMembersActions — member management actions for the group members
 * screen: remove / promote / demote / transfer-ownership (each behind a
 * confirmation sheet with optimistic store update + rollback), the
 * long-press action menu, and leave-group. Extracted verbatim from
 * GroupMembersScreen; navigation is handed back via onLeftGroup.
 */

import { useState } from 'react';
import { useStore } from '../../store/useStore';
import type { Conversation } from '../../domain';
import {
  demoteConversationMemberOnApi,
  leaveGroupOnApi,
  promoteConversationMemberOnApi,
  removeConversationMemberOnApi,
  transferConversationOwnershipOnApi,
} from '../../services/chatApi';
import { parseApiError } from '../../lib/apiClient';
import { useHaptic } from '../useHaptic';
import { useToast } from '../../context/ToastContext';
import {
  deriveMemberActionDescriptors,
  sanitizeMemberRoles,
  type GroupMemberActionKind,
  type GroupMemberMenuState,
  type GroupMemberRole,
  type GroupMembersConfirmSheetState,
} from '../../components/groupmembers/groupMembersViewModels';

export interface UseGroupMembersActionsParams {
  conversationId: string;
  conversation: Conversation | undefined;
  currentUserId: string | undefined;
  canManage: boolean;
  /** Screen-owned navigation after a successful leave (MainTabs → Inbox). */
  onLeftGroup: () => void;
}

export interface GroupMembersActionsResult {
  removingId: string | null;
  isLeaving: boolean;
  memberActionMenu: GroupMemberMenuState | null;
  dismissMemberActionMenu: () => void;
  confirmSheet: GroupMembersConfirmSheetState;
  dismissConfirmSheet: () => void;
  handleRemoveMember: (memberId: string, memberName: string) => void;
  handlePromoteMember: (memberId: string, memberName: string) => void;
  handleDemoteMember: (memberId: string, memberName: string) => void;
  handleTransferOwnership: (memberId: string, memberName: string) => void;
  handleMemberLongPress: (member: { id: string; name: string; role: GroupMemberRole }) => void;
  handleLeaveGroup: () => void;
}

export function useGroupMembersActions({
  conversationId,
  conversation,
  currentUserId,
  canManage,
  onLeftGroup,
}: UseGroupMembersActionsParams): GroupMembersActionsResult {
  const haptic = useHaptic();
  const { show } = useToast();
  const upsertConversation = useStore((state) => state.upsertConversation);
  const deleteConversation = useStore((state) => state.deleteConversation);

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [memberActionMenu, setMemberActionMenu] = useState<GroupMemberMenuState | null>(null);
  const [confirmSheet, setConfirmSheet] = useState<GroupMembersConfirmSheetState>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {} });

  const dismissMemberActionMenu = () => setMemberActionMenu(null);
  const dismissConfirmSheet = () => setConfirmSheet((s) => ({ ...s, visible: false }));

  const handleRemoveMember = (memberId: string, memberName: string) => {
    setConfirmSheet({
      visible: true,
      title: 'Remove member?',
      message: `Remove ${memberName} from this group?`,
      confirmLabel: 'Remove',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        haptic.heavy();
        setRemovingId(memberId);
        const prevParticipantIds = conversation?.participantIds;
        const prevParticipantProfiles = conversation?.participantProfiles;
        const prevMemberRoles = conversation?.memberRoles;
        const prevOwnerId = conversation?.ownerId;
        upsertConversation({
          ...conversation!,
          participantIds: (conversation?.participantIds ?? []).filter((id) => id !== memberId),
          participantProfiles: (conversation?.participantProfiles ?? []).filter((p) => p.id !== memberId) });
        try {
          const result = await removeConversationMemberOnApi(conversationId, memberId);
          upsertConversation({
            ...conversation!,
            participantIds: result.participantIds,
            participantProfiles: (conversation?.participantProfiles ?? []).filter((p) => p.id !== memberId) });
          show('Member removed', 'info');
        } catch (err) {
          upsertConversation({
            ...conversation!,
            participantIds: prevParticipantIds,
            participantProfiles: prevParticipantProfiles,
            memberRoles: prevMemberRoles,
            ownerId: prevOwnerId });
          show(parseApiError(err, 'Could not remove member. Try again.').message, 'error');
        } finally {
          setRemovingId(null);
        }
      } });
  };

  const handlePromoteMember = (memberId: string, memberName: string) => {
    setConfirmSheet({
      visible: true,
      title: 'Promote to admin?',
      message: `${memberName} will be able to manage members, edit group info, and remove others.`,
      confirmLabel: 'Promote',
      variant: 'default',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        haptic.medium();
        setRemovingId(memberId);
        const prevMemberRoles = conversation?.memberRoles;
        const prevOwnerId = conversation?.ownerId;
        upsertConversation({
          ...conversation!,
          memberRoles: { ...(conversation?.memberRoles ?? {}), [memberId]: 'admin' as const } });
        try {
          const result = await promoteConversationMemberOnApi(conversationId, memberId);
          upsertConversation({
            ...conversation!,
            memberRoles: sanitizeMemberRoles(result.memberRoles) });
          show(`${memberName} is now an admin.`, 'success');
        } catch (err) {
          upsertConversation({
            ...conversation!,
            memberRoles: prevMemberRoles,
            ownerId: prevOwnerId });
          show(parseApiError(err, 'Could not promote member.').message, 'error');
        } finally {
          setRemovingId(null);
        }
      } });
  };

  const handleDemoteMember = (memberId: string, memberName: string) => {
    setConfirmSheet({
      visible: true,
      title: 'Demote admin?',
      message: `${memberName} will no longer have admin privileges.`,
      confirmLabel: 'Demote',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        haptic.medium();
        setRemovingId(memberId);
        const prevMemberRoles = conversation?.memberRoles;
        const prevOwnerId = conversation?.ownerId;
        upsertConversation({
          ...conversation!,
          memberRoles: { ...(conversation?.memberRoles ?? {}), [memberId]: 'member' as const } });
        try {
          const result = await demoteConversationMemberOnApi(conversationId, memberId);
          upsertConversation({
            ...conversation!,
            memberRoles: sanitizeMemberRoles(result.memberRoles) });
          show(`${memberName} is now a member.`, 'info');
        } catch (err) {
          upsertConversation({
            ...conversation!,
            memberRoles: prevMemberRoles,
            ownerId: prevOwnerId });
          show(parseApiError(err, 'Could not demote member.').message, 'error');
        } finally {
          setRemovingId(null);
        }
      } });
  };

  const handleTransferOwnership = (memberId: string, memberName: string) => {
    setConfirmSheet({
      visible: true,
      title: 'Transfer ownership?',
      message: `You will no longer be the owner. ${memberName} will become the new group owner and have full control.`,
      confirmLabel: 'Transfer',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        haptic.heavy();
        setRemovingId(memberId);
        const prevMemberRoles = conversation?.memberRoles;
        const prevOwnerId = conversation?.ownerId;
        upsertConversation({
          ...conversation!,
          ownerId: memberId,
          memberRoles: {
            ...(conversation?.memberRoles ?? {}),
            [memberId]: 'owner' as const,
            ...(currentUserId ? { [currentUserId]: 'admin' as const } : {}),
          } });
        try {
          const result = await transferConversationOwnershipOnApi(conversationId, memberId);
          upsertConversation({
            ...conversation!,
            ownerId: result.ownerId,
            memberRoles: sanitizeMemberRoles(result.memberRoles) });
          show(`Ownership transferred to ${memberName}.`, 'success');
        } catch (err) {
          upsertConversation({
            ...conversation!,
            memberRoles: prevMemberRoles,
            ownerId: prevOwnerId });
          show(parseApiError(err, 'Could not transfer ownership.').message, 'error');
        } finally {
          setRemovingId(null);
        }
      } });
  };

  const handleMemberLongPress = (member: { id: string; name: string; role: GroupMemberRole }) => {
    if (!canManage || member.id === currentUserId) return;
    const isOwner = currentUserId === conversation?.ownerId;
    const handlers: Record<GroupMemberActionKind, () => void> = {
      promote: () => handlePromoteMember(member.id, member.name),
      demote: () => handleDemoteMember(member.id, member.name),
      remove: () => handleRemoveMember(member.id, member.name),
      transfer: () => handleTransferOwnership(member.id, member.name) };

    // Only owner can transfer ownership
    const canTransferOwnership = isOwner && member.id !== currentUserId;
    const actions = deriveMemberActionDescriptors(member.role, canTransferOwnership)
      .map((descriptor) => ({
        label: descriptor.label,
        destructive: descriptor.destructive,
        onPress: handlers[descriptor.kind] }));
    setMemberActionMenu({ member, actions });
  };

  const handleLeaveGroup = () => {
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
          if (!currentUserId) {
            show('Authentication required', 'error');
            return;
          }
          await leaveGroupOnApi(conversationId, currentUserId);
          deleteConversation(conversationId);
          show('You left the group', 'info');
          onLeftGroup();
        } catch (err) {
          show(parseApiError(err, 'Could not leave group. Try again.').message, 'error');
        } finally {
          setIsLeaving(false);
        }
      } });
  };

  return {
    removingId,
    isLeaving,
    memberActionMenu,
    dismissMemberActionMenu,
    confirmSheet,
    dismissConfirmSheet,
    handleRemoveMember,
    handlePromoteMember,
    handleDemoteMember,
    handleTransferOwnership,
    handleMemberLongPress,
    handleLeaveGroup,
  };
}
