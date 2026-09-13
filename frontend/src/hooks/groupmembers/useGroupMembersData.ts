/**
 * useGroupMembersData — store reads and derived state for the group members
 * screen: the conversation, participant name/avatar lookups, the viewer's
 * role, the canAddMembers capability fetch, the member view-model list, and
 * the member-search filter. Extracted verbatim from GroupMembersScreen.
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import type { User } from '../../store/useStore';
import type { Conversation } from '../../domain';
import { fetchGroupSettingsFromApi } from '../../services/chatApi';
import {
  buildParticipantAvatarLookup,
  buildParticipantNameLookup,
  deriveCurrentRole,
  deriveGroupMembers,
  filterGroupMembers,
  type GroupMemberRole,
  type GroupMemberView,
} from '../../components/groupmembers/groupMembersViewModels';

export interface GroupMembersDataResult {
  conversation: Conversation | undefined;
  currentUser: User | null;
  currentRole: GroupMemberRole | undefined;
  canManage: boolean;
  canAddMembers: boolean;
  members: GroupMemberView[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredMembers: GroupMemberView[];
}

export function useGroupMembersData(conversationId: string): GroupMembersDataResult {
  const conversations = useStore((state) => state.conversations);
  const currentUser = useStore((state) => state.currentUser);

  const [searchQuery, setSearchQuery] = useState('');

  const conversation = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  // Build a participant name lookup from the conversation's participant
  // profiles, same pattern used by InboxScreen. Avoids unsafe store type
  // casts.
  const participantNameLookup = useMemo(
    () => buildParticipantNameLookup(conversation?.participantProfiles, currentUser),
    [conversation?.participantProfiles, currentUser]
  );

  const participantAvatarLookup = useMemo(
    () => buildParticipantAvatarLookup(conversation?.participantProfiles),
    [conversation?.participantProfiles]
  );

  const currentRole = useMemo(
    () => deriveCurrentRole(currentUser?.id, conversation?.ownerId, conversation?.memberRoles),
    [conversation, currentUser?.id]
  );

  const canManage = currentRole === 'owner' || currentRole === 'admin';
  const [canAddMembers, setCanAddMembers] = useState(canManage);

  useEffect(() => {
    let active = true;
    if (canManage) {
      setCanAddMembers(true);
      return () => {
        active = false;
      };
    }
    fetchGroupSettingsFromApi(conversationId)
      .then((snapshot) => {
        if (active) setCanAddMembers(snapshot.capabilities.canAddMembers);
      })
      .catch(() => {
        if (active) setCanAddMembers(false);
      });
    return () => {
      active = false;
    };
  }, [canManage, conversationId]);

  // Determine roles from memberRoles / ownerId
  const members = useMemo(
    () => deriveGroupMembers(conversation, currentUser?.id, currentUser?.avatar, participantNameLookup, participantAvatarLookup),
    [conversation, currentUser?.id, currentUser?.avatar, participantNameLookup, participantAvatarLookup]
  );

  const filteredMembers = useMemo(
    () => filterGroupMembers(members, searchQuery),
    [members, searchQuery]
  );

  return {
    conversation,
    currentUser,
    currentRole,
    canManage,
    canAddMembers,
    members,
    searchQuery,
    setSearchQuery,
    filteredMembers,
  };
}
