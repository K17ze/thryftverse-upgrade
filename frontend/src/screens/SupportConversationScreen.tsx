import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useConnectivity } from '../hooks/useConnectivity';
import { OfflineBanner } from '../components/OfflineBanner';
import { KeyboardStickyView } from '../platform/keyboard/KeyboardProvider';
import type { SupportContextKind } from '../contracts/support';
import {
  useSupportConversationData,
  useSupportMessageList,
  useSupportComposer,
  useSupportConversationActions,
  useSupportConversationDerived } from '../hooks/supportconversation';
import { SupportContextBar } from '../components/supportconversation/SupportContextBar';
import { SupportMessageList } from '../components/supportconversation/SupportMessageList';
import { SupportStateBanner } from '../components/supportconversation/SupportStateBanner';
import { SupportComposer } from '../components/supportconversation/SupportComposer';
import { SupportHandoffAction } from '../components/supportconversation/SupportHandoffAction';

type Props = NativeStackScreenProps<RootStackParamList, 'SupportConversation'>;

// ─── Main component ──────────────────────────────────────────────────────────
export default function SupportConversationScreen({ navigation, route }: Props) {
  const { conversationId, contextKind, contextId } = route.params ?? {};
  const { colors } = useAppTheme();
  const { show } = useToast();
  const haptic = useHaptic();
  const { isOffline } = useConnectivity();

  // ── Data: conversation + message list, pagination, reload ──
  const {
    conversation,
    setConversation,
    messages,
    setMessages,
    isLoading,
    loadError,
    hasMore,
    isLoadingMore,
    handleLoadMore,
    handleRetryLoad } = useSupportConversationData({ conversationId, show });

  // ── List plumbing: ref, initial scroll-to-bottom, derived listData ──
  const { listRef, listData, scrollToBottom } = useSupportMessageList({
    messages,
    hasMore,
    isLoading });

  // ── Derived state: ownership, handoff eligibility, header, context ──
  const {
    ownershipState,
    canRequestHandoff,
    title,
    headerSubtitle,
    context } = useSupportConversationDerived({
    conversation,
    routeContextKind: contextKind as SupportContextKind | undefined,
    routeContextId: contextId });

  // ── Composer: input, optimistic send, failed-message retry ──
  const {
    input,
    setInput,
    isSending,
    composerEnabled,
    canSend,
    handleSend,
    handleRetry } = useSupportComposer({
    conversationId,
    ownershipState,
    messages,
    setMessages,
    scrollToBottom,
    show,
    haptic });

  // ── Actions: handoff, resolution confirm, feedback ──
  const {
    isHandingOff,
    handleHandoff,
    showFeedback,
    isConfirming,
    handleConfirmResolution,
    handleFeedback } = useSupportConversationActions({
    conversationId,
    conversation,
    setConversation,
    show,
    haptic });

  // ── Loading state ──
  if (isLoading) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        header={<FlagshipHeader title="Support" onBack={() => navigation.goBack()} />}
      >
        <FlagshipState
          variant="loading"
          title="Loading conversation"
          style={{ flex: 1 }}
        />
      </FlagshipScreen>
    );
  }

  // ── Error state ──
  if (loadError) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        header={<FlagshipHeader title="Support" onBack={() => navigation.goBack()} />}
      >
        <FlagshipState
          variant="error"
          title="Could not load"
          subtitle={loadError}
          actionLabel="Try again"
          onAction={handleRetryLoad}
          style={{ flex: 1 }}
        />
      </FlagshipScreen>
    );
  }

  // ── Main render ──
  return (
    <FlagshipScreen
      scrollEnabled={false}
      keyboardAvoiding={false}
      header={
        <FlagshipHeader
          title={title}
          subtitle={headerSubtitle}
          onBack={() => navigation.goBack()}
          rightAction={
            canRequestHandoff ? (
              <SupportHandoffAction
                isHandingOff={isHandingOff}
                onPress={handleHandoff}
              />
            ) : undefined
          }
        />
      }
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      stickyFooter={
        <KeyboardStickyView style={{ backgroundColor: colors.background }}>
          <SupportStateBanner
            ownershipState={ownershipState}
            showFeedback={showFeedback}
            isConfirming={isConfirming}
            onFeedback={handleFeedback}
            onConfirmResolution={handleConfirmResolution}
          />
          <SupportComposer
            input={input}
            onChangeInput={setInput}
            composerEnabled={composerEnabled}
            canSend={canSend}
            isSending={isSending}
            onSend={handleSend}
          />
        </KeyboardStickyView>
      }
    >
      {/* Offline banner — does not block interaction */}
      {isOffline && (
        <OfflineBanner message="You are offline. Messages may not send." />
      )}

      {/* Context bar — flat row, no card */}
      {context.hasContext && (
        <SupportContextBar context={context} />
      )}

      {/* Message list or empty state */}
      <SupportMessageList
        isEmpty={messages.length === 0}
        listData={listData}
        listRef={listRef}
        isLoadingMore={isLoadingMore}
        onLoadMore={handleLoadMore}
        onRetryMessage={handleRetry}
      />
    </FlagshipScreen>
  );
}
