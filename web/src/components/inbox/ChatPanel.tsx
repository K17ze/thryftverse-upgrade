'use client';

/**
 * ChatPanel — conversation thread orchestrator (desktop right pane / mobile full screen).
 * Connects presence, realtime SSE stream, date-grouped message feed,
 * offer lifecycles, and optimistic composer.
 * Factored into domain components (<400 LOC standard):
 *  - ChatSkeleton
 *  - ChatHeader
 *  - ChatSearchRail
 *  - ChatListingContext
 *  - MessageRequestBanner
 *  - PinnedMessageBar
 *  - ChatMessageList
 *  - ChatActionMenuWrapper
 *  - ChatModals
 *  - useChatPanelWorkflow
 */

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { CLOSED_CONFIRM } from './ConfirmSheet';
import { ChatSafetyBanner } from './ChatSafetyBanner';

// Domain components
import { ChatHeader } from './panel/ChatHeader';
import { ChatSearchRail } from './panel/ChatSearchRail';
import { ChatListingContext } from './panel/ChatListingContext';
import { MessageRequestBanner } from './panel/MessageRequestBanner';
import { PinnedMessageBar } from './panel/PinnedMessageBar';
import { ChatMessageList } from './panel/ChatMessageList';
import { ChatModals } from './panel/ChatModals';
import { ChatActionMenuWrapper } from './panel/ChatActionMenuWrapper';
import { ChatPanelEarlyStates } from './panel/ChatPanelEarlyStates';
import { ChatComposerSlot } from './panel/ChatComposerSlot';
import { useChatPanelWorkflow } from './panel/useChatPanelWorkflow';
import { isMine, isSystem } from './panel/ChatStreamUtils';

export function ChatPanel({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const workflow = useChatPanelWorkflow(conversationId);

  // Early states: Guest barrier, loading skeleton, error retry, or not-found
  if (workflow.isGuest || workflow.isLoading || workflow.isError || !workflow.conversation) {
    return (
      <ChatPanelEarlyStates
        isGuest={workflow.isGuest}
        isLoading={workflow.isLoading}
        isError={workflow.isError}
        hasConversation={!!workflow.conversation}
        onRetry={() => void workflow.refetch()}
      />
    );
  }

  const { conversation, title } = workflow;

  return (
    <div
      role="region"
      aria-label={`Conversation with ${title}`}
      className="flex h-full min-w-0 flex-col bg-background"
    >
      <ChatHeader
        conversationId={conversationId}
        title={title}
        subtitle={workflow.subtitle as string | null}
        isGroup={workflow.isGroup}
        conversation={conversation}
        viewerId={workflow.viewerId}
        isPeerOnline={workflow.isPeerOnline}
        searchOpen={workflow.searchOpen}
        onToggleSearch={() => {
          if (workflow.searchOpen) workflow.setQuery('');
          workflow.setSearchOpen((o) => !o);
        }}
        onBack={() => router.push('/inbox')}
        onInfo={() => router.push(`/inbox/${conversationId}/info`)}
      />

      {/* Message request — the native MessageRequests grammar at thread
          top: the sender wants to message you; Accept unlocks the
          composer, Decline removes the thread from the inbox. The thread
          stays read-only while pending (the send edge rejects it). */}
      <MessageRequestBanner
        show={Boolean(workflow.pendingRequest)}
        title={title}
        busy={workflow.requestBusy}
        onAccept={workflow.acceptRequest}
        onDecline={workflow.declineRequest}
      />

      <ChatSearchRail
        ref={workflow.searchInputRef}
        open={workflow.searchOpen}
        query={workflow.query}
        title={title}
        matchCount={workflow.matches.length}
        onQueryChange={workflow.setQuery}
        onClose={() => workflow.setSearchOpen(false)}
      />

      {/* Group description — the dismissible info bar from GroupChatScreen */}
      {workflow.isGroup && conversation.description && !workflow.descDismissed ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-alt px-4 py-2">
          <Icon name="people" size={16} className="shrink-0 text-text-muted" />
          <p className="clamp-2 min-w-0 flex-1 text-meta text-text-secondary">
            {conversation.description}
          </p>
          <IconButton
            name="close"
            size={14}
            aria-label="Dismiss group description"
            className="-my-1.5 shrink-0"
            onClick={() => workflow.setDescDismissed(true)}
          />
        </div>
      ) : null}

      <PinnedMessageBar
        pinnedView={workflow.pinnedView}
        canPin={workflow.canPinMessage}
        onScrollToMessage={workflow.scrollToMessage}
        onUnpin={() => {
          const m = workflow.conversation?.messages.find((x) => x.id === workflow.pinnedView?.messageId) ?? workflow.pin?.message;
          if (m) workflow.togglePin(m);
        }}
      />

      <ChatListingContext listing={conversation.listing} />

      {/* In-thread safety prompt — rendered only when the detector fired
          on incoming content; danger pins, caution dismisses. */}
      {workflow.safetyWarning && workflow.safetyDismissed !== workflow.safetyWarning.level ? (
        <ChatSafetyBanner
          warning={workflow.safetyWarning}
          onDismiss={
            workflow.safetyWarning.dismissible
              ? () => workflow.setSafetyDismissed(workflow.safetyWarning?.level ?? null)
              : undefined
          }
        />
      ) : null}

      {/* Message stream — the relative wrapper anchors the jump pill
          without the pill taking part in scroll layout. */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={workflow.scrollRef}
          onScroll={workflow.onStreamScroll}
          role="log"
          aria-label="Messages"
          className="h-full overflow-y-auto px-3 py-4 md:px-4"
        >
          {/* Readable column — bubbles centre inside a ~3xl measure on
              desktop so lines never stretch across the pane (the WhatsApp-
              web grammar); the pane chrome (header, banners, composer)
              stays full-width. */}
          <div className="mx-auto w-full lg:max-w-3xl">
            {/* Older-history affordance — the button is the keyboard-explicit
                path; scrolling to the top auto-loads too. An exhausted
                history reads its end state once. */}
            {workflow.history.hasMore || workflow.history.loading ? (
              <div className="mb-1 flex justify-center">
                <Chip
                  onClick={workflow.loadOlder}
                  disabled={workflow.history.loading}
                  aria-live="polite"
                >
                  {workflow.history.loading
                    ? 'Loading…'
                    : workflow.history.error
                      ? 'Couldn’t load — try again'
                      : 'Load older messages'}
                </Chip>
              </div>
            ) : workflow.history.older.length > 0 ? (
              <p className="mb-1 text-center text-meta text-text-muted">
                Beginning of conversation
              </p>
            ) : null}

            {workflow.searchQuery && workflow.matches.length === 0 ? (
              <p className="py-10 text-center text-body text-text-muted">
                No results for “{workflow.searchQuery}”
              </p>
            ) : (
              <ChatMessageList
                groups={workflow.groups}
                conversation={conversation}
                isGroup={workflow.isGroup}
                viewerId={workflow.viewerId}
                conversationId={conversationId}
                searchQuery={workflow.searchQuery}
                unreadAnchorId={workflow.unreadAnchorId}
                flashId={workflow.flashId}
                failedIds={workflow.failedIds}
                lastMineReadId={workflow.lastMineReadId}
                chatOffers={workflow.chatOffers}
                replyable={workflow.replyable}
                actionable={workflow.actionable}
                isSaved={workflow.threadActions.isSaved}
                onReply={workflow.replyMessage}
                onReact={workflow.reactAt}
                onOpenMenu={workflow.openMessageMenu}
                onReplyPress={workflow.scrollToMessage}
                onMediaPress={workflow.openMediaFor}
                onToggleReaction={workflow.toggleReactionFor}
                onTogglePollVote={workflow.togglePollVoteFor}
                onRespondToOffer={workflow.respondToOffer}
                onCounterOffer={workflow.setCounterTarget}
                onMakeShareOffer={workflow.setShareOfferId}
                replyInfoFor={workflow.replyInfoFor}
              />
            )}

            {!workflow.searchQuery && workflow.messages.length === 0 ? (
              <p className="py-10 text-center text-body text-text-muted">
                Say hello to {title}.
              </p>
            ) : null}
          </div>
        </div>

        {/* Jump-to-latest — appears only when arrivals land while the
            viewer is reading up; pressing it smooth-scrolls to the tail.
            The polite live region announces it without moving focus, and
            the overlay never blocks or shifts the stream. */}
        <div
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center"
        >
          {workflow.newBelow ? (
            <button
              type="button"
              onClick={workflow.jumpToLatest}
              className="pressable pointer-events-auto flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-meta font-semibold text-text-inverse shadow-modal"
            >
              <Icon name="chevronDown" size={14} aria-hidden />
              New messages
            </button>
          ) : null}
        </div>
      </div>

      {/* Polite arrival log — announces incoming messages when the
          composer isn't holding focus (set by the stream effect). */}
      <p aria-live="polite" role="status" className="sr-only">
        {workflow.arrivalAnnouncement}
      </p>

      <ChatActionMenuWrapper
        msgMenu={workflow.msgMenu}
        menuMessage={workflow.menuMessage}
        failedIds={workflow.failedIds}
        canPinMessage={workflow.canPinMessage}
        pinMessageId={workflow.pin?.messageId}
        threadActions={workflow.threadActions}
        replyable={workflow.replyable}
        actionable={workflow.actionable}
        editable={workflow.editable}
        isMine={isMine}
        isSystem={isSystem}
        onRetryPending={workflow.retryPending}
        onDiscardPending={workflow.discardPending}
        onReply={workflow.setReplyTarget}
        onForward={workflow.setForwardTarget}
        onTogglePin={workflow.togglePin}
        onReport={workflow.reportMessage}
        onCopyText={workflow.copyMessageText}
        onStartEdit={(m) => {
          // One composer staging at a time — a staged edit
          // replaces a staged reply (the reply bar would hide
          // behind the edit bar anyway).
          workflow.setReplyTarget(null);
          workflow.setEditing(m);
        }}
        onRequestConfirm={workflow.setConfirm}
        onClose={() => workflow.setMsgMenu(null)}
      />

      <ChatComposerSlot
        conversationId={conversationId}
        title={title}
        participantId={conversation.participantId}
        peerTyping={workflow.peerTyping}
        pendingRequest={Boolean(workflow.pendingRequest)}
        counterpartyBlocked={workflow.counterpartyBlocked}
        groupReadOnly={workflow.groupReadOnly}
        quickReplyRole={workflow.quickReplyRole}
        isSending={workflow.sendMessage.isPending}
        onSend={workflow.send}
        replyTarget={workflow.replyTarget}
        onCancelReply={() => workflow.setReplyTarget(null)}
        senderNameFor={workflow.senderNameFor}
        previewTextFor={workflow.previewTextFor}
        editing={workflow.editing}
        onEditSubmit={(id, text) => {
          workflow.threadActions.editMessage(id, text);
          workflow.setEditing(null);
        }}
        onCancelEdit={() => workflow.setEditing(null)}
        onToggleBlocked={workflow.toggleBlocked}
      />


      <ChatModals
        confirmState={workflow.confirm}
        onCloseConfirm={() => workflow.setConfirm(CLOSED_CONFIRM)}
        forwardOpen={workflow.forwardTarget !== null}
        onCloseForward={() => workflow.setForwardTarget(null)}
        forwardTargets={(workflow.allConversations ?? []).filter((c) => c.id !== conversationId)}
        onForwardPick={workflow.forwardPicked}
        mediaItems={workflow.mediaItems}
        mediaIndex={workflow.mediaIndex}
        onMediaIndexChange={workflow.setMediaIndex}
        onCloseMedia={() => workflow.setMediaIndex(null)}
        counterTarget={workflow.counterTarget}
        counterListing={workflow.counterListing}
        onCloseCounter={() => workflow.setCounterTarget(null)}
        onSendCounter={(amount, expiryHours) => {
          if (workflow.counterTarget) workflow.sendCounter(workflow.counterTarget, amount, expiryHours);
          workflow.setCounterTarget(null);
        }}
        shareOfferListing={workflow.shareOfferListing}
        onCloseShareOffer={() => workflow.setShareOfferId(null)}
        onSendShareOffer={(amount, expiryHours) => {
          if (workflow.shareOfferListing) workflow.sendNewOffer(workflow.shareOfferListing, amount, expiryHours);
          workflow.setShareOfferId(null);
        }}
      />
    </div>
  );
}
