'use client';

/**
 * MessageBubble — high-craft message container orchestrator.
 * Features 20px chat radius with an asymmetric tail corner, tight-run clustering,
 * optimistic receipts, media previews, audio waveforms, interactive polls,
 * inline translations, and quiet gutter actions.
 */

import { memo } from 'react';
import type { Message } from '@/lib/contracts/domain';
import { DATA_MODE } from '@/lib/api/client';
import { useReadReceiptsEnabled } from '@/lib/store/chatPrefs';
import { ClientTime } from '@/components/ui/ClientTime';
import { useToast } from '@/components/ui/Toast';

// Re-exported primitives for external consumers (OfferCard, ListingShareCard, ChatPanel)
export {
  formatMessageTime,
  MessageReceipt,
  Highlight,
  DeletedMessageTombstone,
  MessageText,
  MessageActions,
  type MessageCluster,
} from './bubble/MessagePrimitives';

export {
  MessageActionsMenu,
  type MenuReaction,
  type MessageActionsMenuProps,
} from './bubble/MessageActionsMenu';

import {
  formatMessageTime,
  MessageReceipt,
  DeletedMessageTombstone,
  MessageText,
  MessageActions,
  type MessageCluster,
} from './bubble/MessagePrimitives';
import { VoiceAttachment } from './bubble/VoiceAttachment';
import { DocumentAttachment } from './bubble/DocumentAttachment';
import { TranslationRow } from './bubble/TranslationRow';
import { PollBlock } from './bubble/PollBlock';
import { MediaAttachment } from './bubble/MediaAttachment';
import { MessageReactionChips } from './bubble/MessageReactionChips';
import { MessageReplyQuote } from './bubble/MessageReplyQuote';

export interface MessageBubbleProps {
  message: Message;
  mine: boolean;
  /** Live voice playback grants + transcription reads are scoped to the conversation. */
  conversationId?: string;
  /** True for the final outgoing message once it's read — shows "Seen". */
  showSeen?: boolean;
  /** Group threads: sender name shown above cluster-first incoming bubbles. */
  senderLabel?: string;
  /** In-thread search query — matching text is marked inside the bubble. */
  highlight?: string;
  /** Resolved reply preview — the caller looks up replyToMessageId. */
  replyTo?: { senderName: string; text: string } | null;
  /** Reply affordance gate. */
  replyable?: boolean;
  /** Actions-menu gate — persisted / failed / saved-tombstone messages. */
  menuable?: boolean;
  /** Press on the reply quote — jumps to the parent message. */
  onReplyPress?: (messageId: string) => void;
  /** Reply affordance — the caller stages the quoted compose bar. */
  onReply?: (message: Message) => void;
  /** Opens the actions menu (quick-react row) anchored at the gutter button. */
  onReact?: (message: Message, anchor: { x: number; y: number }) => void;
  /** Tapping a reaction chip toggles the viewer's reaction on that emoji. */
  onToggleReaction?: (message: Message, emoji: string) => void;
  /** Tap on the inline photo/video — opens the shared media lightbox. */
  onMediaPress?: (message: Message) => void;
  /** Tap on a poll option — toggles the viewer's vote. */
  onTogglePollVote?: (message: Message, optionIndex: number) => void;
  /** Failed outgoing send — suppresses receipt and renders failed styling. */
  failed?: boolean;
  /** Same-sender run position — tightens the gap, tails the last bubble. */
  cluster?: MessageCluster;
}

/**
 * The bubble takes message-keyed callbacks (the caller passes one stable
 * handler, the bubble supplies its own message) so the memo below can
 * hold across a thread re-render — per-row closures would defeat it.
 */
function MessageBubbleImpl({
  message: m,
  mine,
  conversationId,
  showSeen,
  senderLabel,
  highlight,
  replyTo,
  replyable,
  menuable,
  onReplyPress,
  onReply,
  onReact,
  onToggleReaction,
  onMediaPress,
  onTogglePollVote,
  failed,
  cluster = 'single',
}: MessageBubbleProps) {
  const toast = useToast();
  const receiptsEnabled = useReadReceiptsEnabled();

  if (m.isSystem || m.type === 'system' || m.sender === 'system') {
    return (
      <p className="my-3 px-6 text-center text-meta text-text-muted">
        {m.systemTitle ?? m.text}
      </p>
    );
  }

  if (m.isDeleted) {
    return <DeletedMessageTombstone mine={mine} senderLabel={senderLabel} />;
  }

  const mediaOnly = Boolean(m.mediaUri) && !m.text;
  const reactions = m.reactions ?? [];
  const metaTone = mine ? 'text-text-inverse/60' : 'text-text-muted';
  // Cluster grammar — same-sender runs tighten to a 2px gap; the tail
  // corner belongs to the run's final bubble only.
  const tight = cluster === 'middle' || cluster === 'last';
  const tail = cluster === 'single' || cluster === 'last';

  const copyText = async () => {
    if (!m.text) return;
    try {
      await navigator.clipboard.writeText(m.text);
      toast.show('Message copied', 'success');
    } catch {
      toast.show("Couldn't copy — clipboard access was blocked", 'error');
    }
  };

  return (
    <div
      className={`group/msg relative ${tight ? 'mt-0.5' : 'mt-1.5'} flex ${
        reactions.length > 0 ? 'mb-3' : ''
      } ${mine ? 'justify-end' : 'justify-start'}`}
    >
      <div className="relative max-w-[78%] md:max-w-[65%]">
        {!mine && senderLabel ? (
          <p className="mb-0.5 ml-2 text-meta font-semibold text-text-secondary">
            {senderLabel}
          </p>
        ) : null}
        <div
          className={`rounded-chat ${
            mediaOnly ? 'p-1.5' : 'px-3.5 py-2'
          } ${
            mine
              ? `${tail ? 'rounded-br-sm' : ''} bg-brand text-text-inverse`
              : `${tail ? 'rounded-bl-sm' : ''} bg-surface-alt text-text-primary`
          }`}
        >
          <MessageReplyQuote
            replyTo={replyTo ?? null}
            replyToMessageId={m.replyToMessageId}
            mine={mine}
            onReplyPress={onReplyPress}
          />

          <MediaAttachment
            message={m}
            mediaOnly={mediaOnly}
            onMediaPress={onMediaPress}
          />

          {m.type === 'voice' || m.voiceUri ? (
            <VoiceAttachment
              m={m}
              mine={mine}
              conversationId={conversationId}
            />
          ) : null}

          {m.type === 'document' || m.documentUri ? (
            <DocumentAttachment m={m} mine={mine} />
          ) : null}

          {m.poll ? (
            <PollBlock
              poll={m.poll}
              mine={mine}
              readOnly={!onTogglePollVote || menuable === false}
              onToggle={(idx) => onTogglePollVote?.(m, idx)}
            />
          ) : null}

          {m.text ? (
            <p className="whitespace-pre-wrap break-words text-body">
              <MessageText
                text={m.text}
                query={highlight ?? ''}
                mine={mine}
                markClassName={mine ? 'bg-brand-pressed' : 'bg-brand-subtle'}
              />
            </p>
          ) : null}

          {/* Inline translate — mobile parity */}
          {!mine && m.text && DATA_MODE === 'live' ? (
            <TranslationRow message={m} />
          ) : null}

          <div
            className={`mt-0.5 flex items-center justify-end gap-1 ${
              mediaOnly ? 'px-1.5 pb-0.5' : ''
            } ${metaTone}`}
          >
            {m.isEdited ? <span className="text-micro">Edited</span> : null}
            <ClientTime
              iso={m.timestamp}
              format={formatMessageTime}
              className="text-micro"
            />
            {mine && !failed ? <MessageReceipt status={m.readStatus} /> : null}
          </div>
        </div>

        {mine && showSeen && receiptsEnabled ? (
          <p className="mt-0.5 text-right text-meta text-text-muted">Seen</p>
        ) : null}

        {/* Reaction chips */}
        <MessageReactionChips
          message={m}
          mine={mine}
          menuable={menuable}
          onToggleReaction={onToggleReaction}
        />

        {/* Quiet gutter actions */}
        <MessageActions
          mine={mine}
          onReply={replyable && onReply ? () => onReply(m) : undefined}
          onCopy={m.text ? copyText : undefined}
          onReact={
            menuable && onReact ? (anchor) => onReact(m, anchor) : undefined
          }
        />
      </div>
    </div>
  );
}

export const MessageBubble = memo(
  MessageBubbleImpl,
  (a, b) =>
    a.message === b.message &&
    a.mine === b.mine &&
    a.conversationId === b.conversationId &&
    a.failed === b.failed &&
    a.showSeen === b.showSeen &&
    a.senderLabel === b.senderLabel &&
    a.highlight === b.highlight &&
    a.cluster === b.cluster &&
    a.replyable === b.replyable &&
    a.menuable === b.menuable &&
    a.replyTo?.senderName === b.replyTo?.senderName &&
    a.replyTo?.text === b.replyTo?.text &&
    a.onReplyPress === b.onReplyPress &&
    a.onReply === b.onReply &&
    a.onReact === b.onReact &&
    a.onToggleReaction === b.onToggleReaction &&
    a.onMediaPress === b.onMediaPress &&
    a.onTogglePollVote === b.onTogglePollVote,
);
