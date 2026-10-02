'use client';

import {
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { Message } from '@/lib/contracts/domain';
import { DATA_MODE } from '@/lib/api/client';
import {
  useConversation,
  useConversations,
  useMarkConversationRead,
  useSendChatMessage,
  useUser,
} from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { useToast } from '@/components/ui/Toast';
import {
  useForwardMessage,
  useMessageHistory,
  usePinnedMessage,
  useThreadActions,
} from '@/lib/hooks/chat-queries';
import {
  isGroupManager,
  useGroupAdminStore,
} from '../groupAdmin';
import { useInboxSafety } from '../inboxSafety';
import { useReadReceiptsEnabled } from '@/lib/store/chatPrefs';
import { useGroupCapabilities } from '../useConversationAdmin';
import { useInboxPrefs } from '@/lib/store/inboxPrefs';
import {
  conversationTitle,
  isGroupConversation,
  memberCount,
} from '../inboxModel';
import { useChatPresence } from './useChatPresence';
import { useChatOperations } from './useChatOperations';
import { useChatStreamNavigation } from './useChatStreamNavigation';
import { useChatSafetyAndRole } from './useChatSafetyAndRole';
import { useChatOptimisticQueue } from './useChatOptimisticQueue';
import { useChatMessageFeed } from './useChatMessageFeed';
import { useChatCommerceWorkflow } from './useChatCommerceWorkflow';
import { useChatInteractions } from './useChatInteractions';
import { computeChatSubtitle } from './chatSubtitle';

export function useChatPanelWorkflow(conversationId: string) {
  const router = useRouter();
  const toast = useToast();
  const hydrated = useHydrated();
  const { user, isGuest } = useSession();
  const viewerId = user?.id ?? '';
  const { data: conversation, isLoading, isError, refetch } =
    useConversation(conversationId);
  const isGroup = conversation ? isGroupConversation(conversation) : false;
  const { data: participant } = useUser(conversation?.participantId ?? '');
  const sendMessage = useSendChatMessage(conversationId);
  const markConversationRead = useMarkConversationRead();
  const { capabilities } = useGroupCapabilities(conversation, viewerId);
  const blockedUserIds = useInboxSafety((s) => s.blockedUserIds);
  const toggleBlocked = useInboxSafety((s) => s.toggleBlocked);
  const receiptsEnabled = useReadReceiptsEnabled();
  const forwardMessage = useForwardMessage();

  const commerce = useChatCommerceWorkflow(conversationId);
  const interactions = useChatInteractions({
    conversationId,
    hasCounterTarget: commerce.counterTarget !== null,
    router,
    toast,
  });

  const history = useMessageHistory(conversationId, conversation);
  const threadActions = useThreadActions(conversationId, history.patchOlder);
  const { data: allConversations } = useConversations();

  const roleOverrides = useGroupAdminStore((s) =>
    conversation ? s.roleOverrides[conversation.id] : undefined,
  );
  const canPinMessage =
    !!conversation && isGroup && isGroupManager(conversation, viewerId, roleOverrides);

  const { pin, refresh: refreshPinned } = usePinnedMessage(
    conversationId,
    isGroup,
    hydrated && !isGuest,
    conversation,
  );

  const {
    pending,
    setPending,
    failedIds,
    setFailedIds,
    pendingInputs,
    send,
    onServerEcho,
  } = useChatOptimisticQueue({
    conversationId,
    viewerId,
    conversation,
    replyTarget: interactions.replyTarget,
    setReplyTarget: interactions.setReplyTarget,
    sendMessage,
    toast,
  });

  const { presenceQuery, peerTyping } = useChatPresence({
    conversationId,
    viewerId,
    conversation,
    isGroup,
    isGuest,
    hydrated,
    onServerEcho,
    onPinChanged: refreshPinned,
    patchOlder: history.patchOlder,
  });

  const requestResolutions = useInboxPrefs((s) => s.requests);
  const setRequestResolution = useInboxPrefs((s) => s.setRequestResolution);
  const qc = useQueryClient();

  const needsRead = !!conversation && (conversation.unread || (conversation.unreadCount ?? 0) > 0);
  useEffect(() => {
    if (needsRead) markConversationRead(conversationId);
  }, [conversationId, needsRead, markConversationRead]);

  const {
    requestBusy,
    forwardTarget,
    setForwardTarget,
    retryPending,
    discardPending,
    togglePin,
    reportMessage,
    forwardPicked,
    acceptRequest,
    declineRequest,
  } = useChatOperations({
    conversationId,
    isGroup,
    pin,
    refreshPinned,
    forwardMessage,
    toast,
    router,
    qc,
    send,
    pendingInputs,
    setPending,
    setFailedIds,
    setRequestResolution,
  });

  const requestResolution = hydrated
    ? requestResolutions[conversationId]
    : undefined;
  const pendingRequest =
    !isGroup &&
    conversation &&
    (conversation.isRequest === true ||
      (allConversations ?? []).find((c) => c.id === conversationId)?.isRequest === true) &&
    !requestResolution;

  const counterpartyBlocked =
    !isGroup && hydrated && !!conversation?.participantId
      ? blockedUserIds.includes(conversation.participantId)
      : false;
  const groupReadOnly = isGroup && capabilities != null && !capabilities.canSendMessages;
  const composerOpen = !counterpartyBlocked && !groupReadOnly && !pendingRequest;

  // Raw messages for safety/role analysis
  const rawMessages = useMemo(() => {
    return [...history.older, ...(conversation?.messages ?? []), ...pending];
  }, [history.older, conversation?.messages, pending]);

  const {
    quickReplyRole,
    safetyWarning,
    safetyDismissed,
    setSafetyDismissed,
    senderNameFor,
    previewTextFor,
  } = useChatSafetyAndRole({
    conversation,
    isGroup,
    viewerId,
    messages: rawMessages,
    chatOffers: commerce.chatOffers,
  });

  const {
    messages,
    mediaItems,
    mediaIndex,
    setMediaIndex,
    openMediaFor,
    searchQuery,
    matches,
    replyInfoFor,
    pinnedView,
    groups,
    lastMineReadId,
    replyable,
    actionable,
    editable,
    menuMessage,
  } = useChatMessageFeed({
    conversation,
    historyOlder: history.older,
    pending,
    query: interactions.query,
    pin,
    composerOpen,
    receiptsEnabled,
    senderNameFor,
    previewTextFor,
    msgMenu: interactions.msgMenu,
  });

  const {
    scrollRef,
    newBelow,
    arrivalAnnouncement,
    flashId,
    unreadAnchorId,
    scrollToMessage,
    loadOlder,
    onScroll: onStreamScroll,
    scrollToBottom: jumpToLatest,
  } = useChatStreamNavigation({
    conversationId,
    conversation,
    messages,
    searchOpen: interactions.searchOpen,
    history,
    senderNameFor,
    previewTextFor,
  });

  const { toggleReaction, togglePollVote } = threadActions;
  const toggleReactionFor = useCallback(
    (m: Message, emoji: string) => toggleReaction(m, emoji),
    [toggleReaction],
  );
  const togglePollVoteFor = useCallback(
    (m: Message, optionIndex: number) => togglePollVote(m, optionIndex),
    [togglePollVote],
  );

  const title = conversation ? conversationTitle(conversation) : '';
  const members = conversation ? memberCount(conversation) : 0;
  const presence = presenceQuery.data ?? null;
  const isPeerOnline =
    !isGroup &&
    (DATA_MODE === 'live'
      ? presence?.isOnline === true
      : conversation?.isOnline === true);

  const subtitle = computeChatSubtitle({
    isGroup,
    members,
    peerTyping,
    presence,
    conversation,
    participant,
  });

  return {
    isGuest,
    isLoading,
    isError,
    refetch,
    conversation,
    title,
    subtitle,
    isGroup,
    viewerId,
    isPeerOnline,
    pinnedView,
    canPinMessage,
    scrollToMessage,
    togglePin,
    safetyWarning,
    safetyDismissed,
    setSafetyDismissed,
    scrollRef,
    onStreamScroll,
    history,
    loadOlder,
    searchQuery,
    matches,
    groups,
    unreadAnchorId,
    flashId,
    failedIds,
    lastMineReadId,
    replyable,
    actionable,
    editable,
    openMediaFor,
    toggleReactionFor,
    togglePollVoteFor,
    replyInfoFor,
    messages,
    newBelow,
    jumpToLatest,
    arrivalAnnouncement,
    menuMessage,
    threadActions,
    retryPending,
    discardPending,
    setForwardTarget,
    reportMessage,
    pin,
    peerTyping,
    pendingRequest,
    counterpartyBlocked,
    toggleBlocked,
    groupReadOnly,
    sendMessage,
    send,
    forwardTarget,
    allConversations,
    forwardPicked,
    mediaItems,
    mediaIndex,
    setMediaIndex,
    requestBusy,
    acceptRequest,
    declineRequest,
    quickReplyRole,
    senderNameFor,
    previewTextFor,
    ...interactions,
    ...commerce,
  };
}
