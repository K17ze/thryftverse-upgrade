/**
 * useGroupChatInfoData — store-backed data and capability derivations for
 * the group details screen: the conversation lookup, member/agent counts,
 * viewer role and the server-reported settings capabilities (with the
 * role-derived fallback while the endpoint is unavailable).
 * Extracted verbatim from GroupChatInfoScreen.
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import {
  fetchGroupSettingsFromApi,
  type GroupSettingsCapabilities,
} from '../../services/chatApi';

export function useGroupChatInfoData(conversationId: string) {
  const conversations = useStore((state) => state.conversations);
  const currentUser = useStore((state) => state.currentUser);
  const mutedIds = useStore((state) => state.mutedConversationIds);

  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId),
    [conversations, conversationId]
  );
  const memberCount = conversation?.participantIds?.length ?? 0;
  const connectedAgentCount = conversation?.botIds?.length ?? 0;
  const isMuted = mutedIds.includes(conversationId);
  const currentRole = currentUser?.id ? conversation?.memberRoles?.[currentUser.id] : undefined;
  const isGroupManager = Boolean(
    currentUser?.id &&
      (conversation?.ownerId === currentUser.id || currentRole === 'owner' || currentRole === 'admin')
  );
  const [groupCapabilities, setGroupCapabilities] = useState<GroupSettingsCapabilities | null>(null);
  const canEditGroupInfo = groupCapabilities?.canEditGroupInfo ?? isGroupManager;
  const canAddMembers = groupCapabilities?.canAddMembers ?? isGroupManager;

  useEffect(() => {
    let active = true;
    fetchGroupSettingsFromApi(conversationId)
      .then((snapshot) => {
        if (active) setGroupCapabilities(snapshot.capabilities);
      })
      .catch(() => {
        // Existing role-derived access remains the honest fallback while the
        // settings endpoint is unavailable. Mutations are still server-gated.
      });
    return () => {
      active = false;
    };
  }, [conversationId]);

  const memberProfiles = useMemo(
    () => conversation?.participantProfiles ?? [],
    [conversation?.participantProfiles]
  );

  return {
    conversation,
    currentUser,
    memberCount,
    connectedAgentCount,
    isMuted,
    currentRole,
    isGroupManager,
    canEditGroupInfo,
    canAddMembers,
    memberProfiles,
  };
}
