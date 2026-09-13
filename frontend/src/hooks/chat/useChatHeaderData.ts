import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchPublicProfile, unblockUser, PublicProfileUser } from "../../services/profileApi";

import { useToast } from "../../context/ToastContext";
import { useStore, type User } from "../../store/useStore";

import { t } from "../../i18n";

import type { Conversation } from "../../domain";

export interface UseChatHeaderDataOptions {
  conversation: Conversation | undefined;
  isGroup: boolean;
  routePartnerUserId?: string;
  currentUser: User | null | undefined;
  /** Sender-id → display-name map (owned by useHydratedChatMessages). */
  userLookup: Map<string, string>;
  isTyping: boolean;
}

export interface UseChatHeaderDataResult {
  resolvedPartnerId: string | null;
  partnerProfile: PublicProfileUser | null;
  partnerSummary:
    | NonNullable<Conversation["participantProfiles"]>[number]
    | undefined;
  sellerHandle: string;
  avatarUri: string | null;
  topBarTitle: string;
  topBarSubtitle: string;
  topBarInitials: string;
  isPartnerBlocked: boolean;
  handleUnblockPartner: () => void;
}

/**
 * Chat header data — partner resolution, public profile fetch, display
 * handle, avatar, top-bar strings, and blocked-partner state. Verbatim
 * derivation extracted from ChatScreen; inputs come from the orchestrator.
 */
export function useChatHeaderData({
  conversation,
  isGroup,
  routePartnerUserId,
  currentUser,
  userLookup,
  isTyping,
}: UseChatHeaderDataOptions): UseChatHeaderDataResult {
  const blockedUsers = useStore((state) => state.blockedUsers);
  const addBlockedUser = useStore((state) => state.addBlockedUser);
  const removeBlockedUser = useStore((state) => state.removeBlockedUser);
  const setConversationBlocked = useStore((state) => state.setConversationBlocked);
  const profileMediaOverrides = useStore(
    (state) => state.profileMediaOverrides,
  );

  const resolvedPartnerId = useMemo(() => {
    if (isGroup) return null;

    if (routePartnerUserId) return routePartnerUserId;

    if (conversation?.sellerId) return conversation.sellerId;

    return (
      conversation?.participantIds?.find(
        (id) => id !== "me" && id !== currentUser?.id,
      ) ?? null
    );
  }, [
    conversation?.participantIds,
    conversation?.sellerId,
    currentUser?.id,
    isGroup,
    routePartnerUserId,
  ]);

  const [partnerProfile, setPartnerProfile] = useState<PublicProfileUser | null>(null);

  useEffect(() => {
    let active = true;
    setPartnerProfile(null);
    if (!resolvedPartnerId) return () => { active = false; };
    fetchPublicProfile(resolvedPartnerId)
      .then((profile) => {
        if (active) setPartnerProfile(profile);
      })
      .catch(() => {
        // The conversation remains usable when a public profile is unavailable.
      });
    return () => {
      active = false;
    };
  }, [resolvedPartnerId]);

  const partnerSummary = resolvedPartnerId
    ? conversation?.participantProfiles?.find((participant) => participant.id === resolvedPartnerId)
    : undefined;

  const isPartnerBlocked = !isGroup && resolvedPartnerId
    ? blockedUsers.includes(resolvedPartnerId) || Boolean(conversation?.isBlocked)
    : false;

  const { show } = useToast();

  const handleUnblockPartner = useCallback(() => {
    if (!resolvedPartnerId) return;
    const partnerId = resolvedPartnerId;
    const conversationId = conversation?.id;
    removeBlockedUser(partnerId);
    if (conversationId) setConversationBlocked(conversationId, false);
    unblockUser(partnerId).catch(() => {
      // Roll back the optimistic unblock — without the server write the
      // partner stays blocked and the banner must not pretend otherwise.
      addBlockedUser(partnerId);
      if (conversationId) setConversationBlocked(conversationId, true);
      show('Could not unblock — try again', 'error');
    });
  }, [resolvedPartnerId, conversation?.id, addBlockedUser, removeBlockedUser, setConversationBlocked, show]);

  const sellerHandle = resolvedPartnerId
    ? (partnerProfile?.displayName || partnerProfile?.username || partnerSummary?.displayName || partnerSummary?.username || userLookup.get(resolvedPartnerId) || t('chat.fallbackUserName'))
    : t('chat.fallbackUserName');

  const avatarUri = !isGroup
    ? conversation?.avatar ||
      (resolvedPartnerId
        ? profileMediaOverrides[resolvedPartnerId]?.avatar
        : undefined) ||
      partnerProfile?.avatar ||
      partnerSummary?.avatar ||
      null
    : conversation?.avatar ?? null;
  const topBarTitle = isGroup
    ? (conversation?.title ?? t('chat.groupChatLabel'))
    : sellerHandle;
  const topBarSubtitle = isTyping
    ? 'typing…'
    : isGroup
      ? `${conversation?.participantIds?.length ?? 0} members`
      : t('chat.marketplaceChatLabel');
  const topBarInitials = isGroup
    ? (conversation?.title
        ?.split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() ?? "G")
    : sellerHandle.slice(0, 2).toUpperCase();

  return {
    resolvedPartnerId,
    partnerProfile,
    partnerSummary,
    sellerHandle,
    avatarUri,
    topBarTitle,
    topBarSubtitle,
    topBarInitials,
    isPartnerBlocked,
    handleUnblockPartner,
  };
}
