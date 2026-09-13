import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  View,
  StyleSheet,
  type NativeSyntheticEvent,
  type NativeScrollEvent } from "react-native";

import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";

import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { RootStackParamList } from "../navigation/types";
import { openProfile } from "../navigation/openProfile";
import { openProductDetail } from "../platform/product/openProductDetail";

import { useAppTheme } from "../theme/ThemeContext";
import { useChatPreferences } from '../hooks/useChatPreferences';
import { chatThemeBackground } from '../services/chatPreferencesApi';

import { useFormattedPrice } from "../hooks/useFormattedPrice";

import { useBackendData } from "../context/BackendDataContext";


import { useStore } from "../store/useStore";

import {
  clearComposerStateOnApi } from "../services/chatApi";

import { useToast } from "../context/ToastContext";

import { useHaptic } from "../hooks/useHaptic";
import { useA11yAudit } from "../hooks/useA11yAudit";

import { ChatComposer } from "../components/chat/ChatComposer";

import { ChatMessageList } from "../components/chat/ChatMessageList";

import { ChatTopBar } from "../components/chat/ChatTopBar";

import { ChatListingContextBar } from "../components/chat/ChatListingContextBar";
import { ChatTransactionStrip } from "../components/chat/ChatTransactionStrip";

import { ChatSafetyBanner } from "../components/chat/ChatSafetyBanner";

import { ChatBlockedBanner } from "../components/chat/ChatBlockedBanner";

import { ChatSelectionToolbar } from "../components/chat/ChatSelectionToolbar";

import { ChatSheets } from "../components/chat/ChatSheets";

import { PinnedMessageBar } from "../components/chat/PinnedMessageBar";

import { useChatMessageRenderer } from "../components/chat/useChatMessageRenderer";

import { detectChatSafetyWarning } from "../utils/chatSafetyWarnings";

import { useVisuallyComplete } from "../performance/visuallyComplete";

import {
  useConversationMessages,
  useConversationComposer,
  useConversationCommerce,
  useConversationAgents,
  useConversationSafety,
  useMessageSelection,
  usePinnedMessage,
  useHydratedChatMessages,
  useChatHeaderData,
  useChatContextualStack,
  useChatSearchScroll,
  useNewMessageTracker } from "../hooks/chat";
import { useTypingIndicator, useChatGroupIdentityEvent } from "../services/realtimeClient";
type Props = NativeStackScreenProps<RootStackParamList, "Chat">;

export default function ChatScreen({ navigation, route }: Props) {
  const a11yRef = useRef<any>(null);
  useA11yAudit(a11yRef, 'ChatScreen');
  const { colors, isDark } = useAppTheme();
  const reportReady = useVisuallyComplete('Chat');

  const styles = useMemo(() => StyleSheet.create({
    screenRoot: {
      flex: 1,
      backgroundColor: colors.background } }), [colors]);

  const { conversationId, itemId: routeItemId, offerPayload: routeOfferPayload } = route.params;
  const chatPreferences = useChatPreferences(conversationId);
  const chatBackground = chatThemeBackground(chatPreferences.query.data?.theme, isDark, colors.background);

  const currentUser = useStore((state) => state.currentUser);

  const conversations = useStore((state) => state.conversations);

  const appendConversationMessage = useStore(
    (state) => state.appendConversationMessage,
  );

  const replaceConversationMessages = useStore(
    (state) => state.replaceConversationMessages,
  );

  const markConversationRead = useStore((state) => state.markConversationRead);

  const setConversationDraft = useStore((state) => state.setConversationDraft);

  const addMessageReaction = useStore((state) => state.addMessageReaction);

  const { show } = useToast();

  const haptic = useHaptic();

  const insets = useSafeAreaInsets();

  const { listings } = useBackendData();

  const sellerQuickReplies = useStore((state) => state.sellerQuickReplies);
  const buyerQuickReplies = useStore((state) => state.buyerQuickReplies);

  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId),

    [conversationId, conversations],
  );

  const isGroup = conversation?.type === "group";

  // ── Pinned message ──────────────────────────────────────────────────
  // Fetch the conversation's pinned message on mount and when realtime
  // pin/unpin events arrive. Only group chats support pinning.
  const pinnedMessage = usePinnedMessage(conversationId, isGroup, conversations);

  // ─── Controller hook: hydrated messages + sender-label lookups ───
  // useHydratedChatMessages owns the bot/user lookup maps, the store→Message
  // hydration transform, and the early composer-hydration messagesRef.
  const {
    hydratedMessages,
    messagesRef,
    userLookup } = useHydratedChatMessages({
    conversation,
    currentUser });

  // ─── Controller hook: composer state, attachments, search, reply ───
  // useConversationComposer owns text input, reply context, attachment picker,
  // pending attachment, voice recording toggle, reaction picker, search state,
  // and cross-device composer state hydration/persistence.
  const {
    input,
    setInput,
    setTypingInput,
    notifyStoppedTyping,
    replyTo,
    setReplyTo,
    attachmentPickerVisible,
    setAttachmentPickerVisible,
    isVoiceRecording,
    setIsVoiceRecording,
    pendingAttachment,
    setPendingAttachment,
    reactingToMessage,
    setReactingToMessage,
    searchQuery,
    setSearchQuery,
    searchMatchIndex,
    setSearchMatchIndex,
    isSearchActive,
    setIsSearchActive,
    handleAttachmentSelect } = useConversationComposer({
    conversationId,
    initialSearchQuery: route.params?.focusQuery,
    messagesRef,
    show,
    haptic,
    setConversationDraft });

  // ─── Controller hook: AI chat agents (demo-mode service) ───
  // useConversationAgents owns deployed agents, agent picker visibility,
  // agent suggested replies, deploy/remove/suggest handlers, and agent
  // quick replies from connected custom bots.
  const {
    chatAgentPickerVisible,
    setChatAgentPickerVisible,
    deployedChatAgents,
    chatAgentSuggestions,
    handleDeployChatAgent,
    handleSelectChatAgentSuggestion,
    agentQuickReplies } = useConversationAgents({
    conversationId,
    show,
    haptic,
    setInput });

  // ─── Controller hook: safety warnings ───
  // useConversationSafety owns composer-level safety detection, danger/
  // caution dismissal state, and per-message dismissed warning IDs.
  const {
    composerDangerWarning,
    composerCautionWarning,
    dismissedWarningIds,
    setDangerWarningDismissed,
    setCautionWarningDismissed,
    dismissMessageWarning } = useConversationSafety({ input });

  // Suggested replies are dismissible for the current conversation session.
  // Once dismissed they do not reappear until the conversation changes.
  const [suggestedRepliesDismissed, setSuggestedRepliesDismissed] = useState(false);

  const isTyping = useTypingIndicator(conversationId);

  // Real-time group identity updates — when an admin changes the group name,
  // avatar, cover, or description, merge it into the local store immediately
  // so the chat header and info screen stay current without a refetch.
  const upsertConversation = useStore((state) => state.upsertConversation);
  useChatGroupIdentityEvent(conversationId, (payload) => {
    upsertConversation({
      id: payload.conversationId,
      title: payload.title ?? undefined,
      description: payload.description ?? undefined,
      avatar: payload.avatar ?? undefined,
      coverPhoto: payload.coverPhoto ?? undefined,
    } as any);
  });

  const { formatFromFiat } = useFormattedPrice();

  // ─── Controller hook: message list state, sync, send, retry, delete ───
  // useConversationMessages owns the message list, API sync, sending, retry,
  // delete (with undo), offer auto-send, date separators, scroll helpers.
  // ChatScreen retains composer state, selection, safety, agents, and rendering.
  const {
    messages,
    setMessages,
    isSyncing,
    syncError,
    isOffline,
    showScrollToBottom,
    unreadBelowCount,
    recentlyDeleted,
    composerSending,
    listRef,
    scrollToBottom,
    scrollToMessage,
    confirmAgentDraft,
    retryAgentDraft,
    sendMessage: hookSendMessage,
    handleSendVoice,
    handleRetryUpload,
    handleRetrySendMessage,
    handleSendPendingAttachment: hookSendPendingAttachment,
    handleUndoDelete,
    handleBulkDelete: hookBulkDelete,
    handleDeleteMessage,
    confirmation: conversationConfirmation,
    clearConfirmation: clearConversationConfirmation,
    dateSeparatorIndices,
    unreadDividerIndex,
    handleMessageListScroll: hookHandleMessageListScroll,
    syncMessagesFromApi } = useConversationMessages({
    conversationId,
    routeOfferPayload,
    currentUser,
    hydratedMessages,
    formatFromFiat,
    show,
    haptic,
    onOfferSent: () => {},
    clearComposerState: clearComposerStateOnApi,
    navigation,
    isGroup,
    conversationUnread: conversation?.unread,
    markConversationRead,
    appendConversationMessage,
    replaceConversationMessages });

  // Update composer hydration ref with the latest messages (the ref was
  // created before useConversationComposer so the hook has a stable object;
  // effects inside the hook read .current after render, so this is safe).
  messagesRef.current = messages;

  // Readiness milestones: 'data-ready' when messages exist (hydrated from
  // the store or synced) or the first API sync settles/errors; a ref tracks
  // that a sync actually began because `isSyncing` starts false before the
  // mount sync kicks in. 'interaction-ready' lands with it — composer and
  // list are usable once history is on screen.
  const chatSyncBeganRef = useRef(false);
  useEffect(() => {
    if (isSyncing) chatSyncBeganRef.current = true;
    if (messages.length > 0 || syncError || (chatSyncBeganRef.current && !isSyncing)) {
      reportReady('data-ready');
      reportReady('interaction-ready');
    }
  }, [messages.length, isSyncing, syncError, reportReady]);

  // New-message tracker — only genuinely new messages (added after initial
  // load) get the bubble enter animation (AGENTS.md §16).
  const isNewMessage = useNewMessageTracker(messages, messagesRef, conversationId);

  // ─── Controller hook: commerce (offers, commerce events) ───
  // useConversationCommerce owns accept/decline/counter/expire offer
  // handlers with optimistic updates and API-failure revert.
  const {
    handleAcceptOffer,
    handleDeclineOffer,
    handleCounterOffer,
    handleOfferExpired } = useConversationCommerce({
    messages,
    setMessages,
    routeItemId,
    conversationItemId: conversation?.itemId,
    context: conversation?.context,
    onUpdateContext: (updatedContext) => {
      if (!conversation) return;
      upsertConversation({ ...conversation, context: updatedContext });
    },
    show,
    haptic,
    navigation });

  // ─── Controller hook: message selection ───
  // useMessageSelection owns selection mode, selected IDs, context menu
  // visibility, and enter/exit/toggle selection handlers.
  const {
    selectionMode,
    selectedMessageIds,
    contextMenuVisible,
    setContextMenuVisible,
    selectedMessage,
    setSelectedMessage,
    toggleMessageSelection,
    exitSelectionMode } = useMessageSelection({ selectionMode: false });

  // Adapter: bind composer state to hookSendMessage's (input, replyTo, setInput, setReplyTo) signature
  const handleSend = useCallback(() => {
    notifyStoppedTyping();
    hookSendMessage(input, replyTo, setInput, setReplyTo);
  }, [hookSendMessage, input, replyTo, setInput, setReplyTo, notifyStoppedTyping]);

  // Adapter: wrap hookHandleMessageListScroll for FlashList's NativeSyntheticEvent type
  const handleMessageListScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      hookHandleMessageListScroll(e);
    },
    [hookHandleMessageListScroll],
  );

  // Reset per-session dismissals when the conversation changes.
  useEffect(() => {
    setSuggestedRepliesDismissed(false);
  }, [conversationId]);

  // ─── Controller hook: header data ───
  // useChatHeaderData owns partner resolution, the public profile fetch,
  // seller handle, avatar, top-bar strings, and blocked-partner state.
  const {
    resolvedPartnerId,
    partnerProfile,
    partnerSummary,
    avatarUri,
    topBarTitle,
    topBarSubtitle,
    topBarInitials,
    isPartnerBlocked,
    handleUnblockPartner } = useChatHeaderData({
    conversation,
    isGroup,
    routePartnerUserId: route.params?.partnerUserId,
    currentUser,
    userLookup,
    isTyping });

  // Per spec 16: "Do not stack quick replies + agent suggestions." When agent
  // suggestions are active (agent deployed, suggestions available, no input),
  // suppress quick replies so only one suggestion area is visible.
  const agentSuggestionsActive =
    deployedChatAgents.length > 0 &&
    chatAgentSuggestions.length > 0 &&
    input.trim().length === 0;

  // In-conversation search — match list + scroll-to-match effect.
  const searchMatches = useChatSearchScroll({
    messages,
    searchQuery,
    searchMatchIndex,
    listRef });

  // Adapter: bind selection state to hookBulkDelete's (selectedMessageIds, exitSelectionMode) signature
  const handleBulkDelete = useCallback(() => {
    hookBulkDelete(selectedMessageIds, exitSelectionMode);
  }, [hookBulkDelete, selectedMessageIds]);

  // Adapter: bind pending attachment state to hookSendPendingAttachment's (caption, pendingAttachment, setPendingAttachment) signature
  const handleSendPendingAttachment = useCallback(
    (caption: string) => {
      hookSendPendingAttachment(caption, pendingAttachment, setPendingAttachment);
    },
    [hookSendPendingAttachment, pendingAttachment, setPendingAttachment],
  );

  const linkedListing = useMemo(() => {
    const itemId = routeItemId ?? conversation?.itemId;
    if (!itemId) return null;
    return listings.find((l) => l.id === itemId) ?? null;
  }, [routeItemId, conversation?.itemId, listings]);

  const quickReplyRole = linkedListing
    ? linkedListing.sellerId === currentUser?.id
      ? "seller"
      : "buyer"
    : null;

  // "Make an offer" attachment-rail action — buyer-side only, requires a
  // linked listing. Mirrors handleCounterOffer's MakeOffer params so the
  // created offer links back to this conversation.
  const handleMakeOfferFromSheet = useCallback(() => {
    if (!linkedListing) return;
    navigation.navigate("MakeOffer", {
      itemId: linkedListing.id,
      price: linkedListing.price,
      title: linkedListing.title,
      conversationId,
    });
  }, [linkedListing, conversationId, navigation]);

  // Conversation-level safety warning (triggered by conversation state,
  // e.g. off-platform payment requests in messages). This is distinct
  // from the real-time composer typing warnings, which stay in the
  // composer. The conversation-level warning is rendered above the
  // message list as the highest-priority contextual element.
  const conversationSafetyWarning = useMemo(() => {
    if (!conversation) return null;
    return detectChatSafetyWarning(
      conversation,
      currentUser?.id,
      conversation.messages,
    );
  }, [conversation, currentUser?.id]);

  // Contextual-stack resolver — which contextual elements (safety warning,
  // listing transaction strip, agent row, suggested replies) may be visible
  // simultaneously within the message-list height budget.
  const { isContextualSlotVisible } = useChatContextualStack({
    hasSafetyWarning: !!conversationSafetyWarning,
    isGroup,
    hasSoldLinkedListing: !!linkedListing && !!linkedListing.isSold,
    deployedAgentsCount: deployedChatAgents.length,
    agentSuggestionsActive,
    suggestedRepliesDismissed });

  // FlashList v2 performance: memoized renderItem prevents full re-render of
  // all visible messages on every parent state change (e.g. input text, agent
  // panel toggle). The row renderer closes over many component-scope values,
  // so the hook keeps a ref to the latest version behind a stable callback
  // reference for FlashList's cell recycling.
  // (Audit §FlashList v2 / LIST_RENDERING_POLICY.md §3.1)
  const { renderMessageItem, messageKeyExtractor } = useChatMessageRenderer({
    messages,
    dateSeparatorIndices,
    unreadDividerIndex,
    conversationId,
    isGroup,
    currentUserId: currentUser?.id,
    selectionMode,
    selectedMessageIds,
    dismissedWarningIds,
    isSearchActive,
    searchQuery,
    formatFromFiat,
    navigation,
    isNewMessage,
    onAcceptOffer: handleAcceptOffer,
    onDeclineOffer: handleDeclineOffer,
    onCounterOffer: handleCounterOffer,
    onOfferExpired: handleOfferExpired,
    onOpenContextMenu: (msg) => {
      setSelectedMessage(msg);
      setContextMenuVisible(true);
    },
    onToggleMessageSelection: toggleMessageSelection,
    onReactionPress: setReactingToMessage,
    onSwipeReply: setReplyTo,
    onReplyPress: scrollToMessage,
    onConfirmAgentDraft: confirmAgentDraft,
    onRetryAgentDraft: retryAgentDraft,
    onRetryUpload: handleRetryUpload,
    onRetrySendMessage: handleRetrySendMessage,
    onDismissWarning: dismissMessageWarning });

  return (
    <SafeAreaView ref={a11yRef} testID="chat-screen" edges={["bottom"]} style={styles.screenRoot}>
      <View style={styles.screenRoot}>
        <ChatTopBar
          title={topBarTitle}
          subtitle={topBarSubtitle}
          avatarUrl={avatarUri}
          initials={topBarInitials}
          groupId={isGroup ? conversation?.id : undefined}
          variant={isGroup ? "group" : "dm"}
          isVerified={!isGroup && (partnerProfile?.identityVerified === true || partnerSummary?.identityVerified === true)}
          onBack={() => navigation.goBack()}
          onSearch={() => {
            if (isSearchActive) {
              setIsSearchActive(false);
              setSearchQuery("");
            } else {
              setIsSearchActive(true);
            }
          }}
          onInfo={() => {
            if (!conversation) return;
            navigation.navigate(
              isGroup ? "GroupChatInfo" : "ConversationInfo",
              { conversationId: conversation.id },
            );
          }}
          onTitlePress={() => {
            if (!conversation) return;
            if (isGroup) {
              navigation.navigate("GroupChatInfo", {
                conversationId: conversation.id });
            } else if (resolvedPartnerId) {
              openProfile(navigation, resolvedPartnerId, currentUser?.id);
            } else {
              navigation.navigate("ConversationInfo", {
                conversationId: conversation.id });
            }
          }}
          isSearchActive={isSearchActive}
          searchValue={searchQuery}
          onSearchValueChange={(q: string) => {
            setSearchQuery(q);
            setSearchMatchIndex(0);
          }}
          searchResultLabel={
            searchMatches.length > 0
              ? `${searchMatchIndex + 1}/${searchMatches.length}`
              : undefined
          }
          onPreviousResult={() =>
            setSearchMatchIndex((i) => Math.max(0, i - 1))
          }
          onNextResult={() =>
            setSearchMatchIndex((i) =>
              Math.min(searchMatches.length - 1, i + 1),
            )
          }
          onCloseSearch={() => {
            setIsSearchActive(false);
            setSearchQuery("");
          }}
        />

        {/* Contextual stack — resolved by priority + height budget.
            Safety warning is the highest-priority contextual element and
            sits directly below the top bar. It is only shown when the
            conversation state triggers it (never as permanent chrome). */}
        {isContextualSlotVisible("safetyWarning") && conversationSafetyWarning ? (
          <ChatSafetyBanner warning={conversationSafetyWarning} />
        ) : null}

        {isPartnerBlocked ? (
          <ChatBlockedBanner onUnblock={handleUnblockPartner} />
        ) : null}

        {!isGroup && conversation?.context?.listing && (
          <ChatListingContextBar
            context={conversation.context}
            priceDisplay={formatFromFiat(
              conversation.context.listing.price,
              'GBP',
              { displayMode: "fiat" },
            )}
            onPress={() =>
              openProductDetail(navigation, { referenceKind: 'listing', canonicalId: conversation.context!.listing!.id, sourceSurface: 'ChatContextBar' })
            }
            onPressOrder={
              conversation.context?.order
                ? () =>
                    navigation.navigate("OrderDetail", {
                      orderId: conversation.context!.order!.id,
                    })
                : undefined
            }
          />
        )}

        {/* Transaction strip — shows order milestone + deadline + CTA.
            Only rendered when there is an active commerce state (sold
            listing with an order) and the contextual-stack budget
            admits it (priority 2, below the safety warning). */}
        {isContextualSlotVisible("listingTransaction") &&
          !isGroup &&
          linkedListing &&
          linkedListing.isSold && (
          <ChatTransactionStrip listingId={linkedListing.id} />
        )}

        {selectionMode ? (
          <ChatSelectionToolbar
            selectedCount={selectedMessageIds.size}
            onExit={exitSelectionMode}
            onDelete={handleBulkDelete}
          />
        ) : null}

        {/* Pinned message bar — above the message list, below the top bar. */}
        {pinnedMessage ? (
          <PinnedMessageBar
            senderLabel={pinnedMessage.senderLabel}
            text={pinnedMessage.text}
            onPress={() => {
              const idx = messages.findIndex((m) => m.id === pinnedMessage.messageId);
              if (idx >= 0) listRef.current?.scrollToIndex({ index: idx, animated: true });
            }}
          />
        ) : null}

        {/* Message list — persistent. Flexes to fill remaining space but
            is never squeezed below ~40% of screen height (audit). */}
        <ChatMessageList
          isSyncing={isSyncing}
          syncError={syncError}
          messages={messages}
          listRef={listRef}
          renderItem={renderMessageItem}
          keyExtractor={messageKeyExtractor}
          chatBackground={chatBackground}
          onScroll={handleMessageListScroll}
          onRetrySync={() => void syncMessagesFromApi()}
        />

        <ChatComposer
          bottomInset={insets.bottom}
          value={input}
          onChangeText={setTypingInput}
          onSend={handleSend}
          onAttachmentPress={() => setAttachmentPickerVisible(true)}
          onCameraPress={() => handleAttachmentSelect("camera")}
          onVoiceRecord={handleSendVoice}
          isVoiceRecording={isVoiceRecording}
          onVoiceRecordingChange={setIsVoiceRecording}
          isSending={composerSending}
          dangerWarning={composerDangerWarning?.message}
          cautionWarning={composerCautionWarning?.message}
          onDismissDangerWarning={() => setDangerWarningDismissed(true)}
          onDismissCautionWarning={() => setCautionWarningDismissed(true)}
          quickRepliesSuppressed={agentSuggestionsActive || messages.length > 0}
          agentQuickReplies={agentQuickReplies}
          quickReplyRole={quickReplyRole}
          sellerQuickReplies={sellerQuickReplies}
          buyerQuickReplies={buyerQuickReplies}
          onSelectReply={setInput}
          onManageReplies={(role) =>
            navigation.navigate("ManageQuickReplies", { role })}
          replyTo={replyTo}
          onCloseReply={() => setReplyTo(null)}
          reactingToMessage={reactingToMessage}
          onReact={(emoji) => {
            if (reactingToMessage && conversationId) {
              addMessageReaction(
                conversationId,
                reactingToMessage.id,
                emoji,
              );
            }
            setReactingToMessage(null);
          }}
          isOffline={isOffline}
          recentlyDeletedCount={recentlyDeleted.length}
          onUndoDelete={handleUndoDelete}
          showSuggestedReplies={
            isContextualSlotVisible("suggestedReplies") &&
            agentSuggestionsActive}
          agentSuggestions={chatAgentSuggestions}
          onSelectSuggestion={handleSelectChatAgentSuggestion}
          agentName={deployedChatAgents[0]?.name}
          agentAvatar={deployedChatAgents[0]?.avatar}
          onDismissSuggestedReplies={() => {
            haptic.light();
            setSuggestedRepliesDismissed(true);
          }}
          showAgentRow={
            isContextualSlotVisible("agentRow") &&
            deployedChatAgents.length > 0}
          deployedAgents={deployedChatAgents}
          onOpenAgentPicker={() => setChatAgentPickerVisible(true)}
        />

        <ChatSheets
          composerSending={composerSending}
          conversationId={conversationId}
          currentUserId={currentUser?.id}
          attachmentPickerVisible={attachmentPickerVisible}
          onCloseAttachmentPicker={() => setAttachmentPickerVisible(false)}
          onAttachmentSelect={handleAttachmentSelect}
          hasLinkedListing={!!linkedListing}
          isSeller={quickReplyRole === 'seller'}
          onMakeOffer={handleMakeOfferFromSheet}
          pendingAttachment={pendingAttachment}
          onClosePendingAttachment={() => setPendingAttachment(null)}
          onSendPendingAttachment={handleSendPendingAttachment}
          chatAgentPickerVisible={chatAgentPickerVisible}
          onCloseAgentPicker={() => setChatAgentPickerVisible(false)}
          onOpenAgentPicker={() => setChatAgentPickerVisible(true)}
          onDeployAgent={handleDeployChatAgent}
          deployedAgents={deployedChatAgents}
          showScrollToBottom={showScrollToBottom}
          unreadBelowCount={unreadBelowCount}
          onScrollToBottom={scrollToBottom}
          contextMenuVisible={contextMenuVisible}
          onCloseContextMenu={() => setContextMenuVisible(false)}
          selectedMessage={selectedMessage}
          onReplyMessage={setReplyTo}
          onReactToMessage={setReactingToMessage}
          onDeleteMessage={handleDeleteMessage}
          onRetryUpload={handleRetryUpload}
          onRetrySendMessage={handleRetrySendMessage}
          onPrefillComposer={setInput}
          conversations={conversations}
          confirmation={conversationConfirmation}
          onClearConfirmation={clearConversationConfirmation}
        />
      </View>
    </SafeAreaView>
  );
}
