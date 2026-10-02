'use client';

import { Composer } from '../Composer';
import type { Message } from '@/lib/contracts/domain';
import type { SendChatMessageInput } from '@/lib/hooks/queries';

interface ChatComposerSlotProps {
  conversationId: string;
  title: string;
  participantId?: string;
  peerTyping: boolean;
  pendingRequest: boolean;
  counterpartyBlocked: boolean;
  groupReadOnly: boolean;
  quickReplyRole?: 'buyer' | 'seller' | null;
  isSending: boolean;
  onSend: (input: SendChatMessageInput) => void;
  replyTarget: Message | null;
  onCancelReply: () => void;
  senderNameFor: (m: Message) => string;
  previewTextFor: (m: Message) => string;
  editing: Message | null;
  onEditSubmit: (id: string, text: string) => void;
  onCancelEdit: () => void;
  onToggleBlocked: (participantId: string) => void;
}

/**
 * Bottom orchestration slot for thread interaction:
 *  - Realtime 3-dot typing indicator (4s auto-expiry)
 *  - Blocked peer state with unblock CTA
 *  - Group admin-only broadcast enforcement
 *  - Full multi-modal message composer (attachments, quotes, edit staging)
 */
export function ChatComposerSlot({
  conversationId,
  title,
  participantId,
  peerTyping,
  pendingRequest,
  counterpartyBlocked,
  groupReadOnly,
  quickReplyRole,
  isSending,
  onSend,
  replyTarget,
  onCancelReply,
  senderNameFor,
  previewTextFor,
  editing,
  onEditSubmit,
  onCancelEdit,
  onToggleBlocked,
}: ChatComposerSlotProps) {
  return (
    <>
      {/* Typing — three-dot indicator (the mobile TypingIndicator
          grammar) anchored above the composer; entries expire 4s after
          the last event so a stale "typing…" never lingers. */}
      {peerTyping ? (
        <div className="shrink-0 px-4 pb-1" aria-live="polite">
          <div className="mx-auto flex w-full items-center gap-1.5 lg:max-w-3xl">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                aria-hidden
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-muted"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
            <span className="sr-only">{title} is typing</span>
          </div>
        </div>
      ) : null}

      {pendingRequest ? null : counterpartyBlocked ? (
        <div className="shrink-0 border-t border-border-subtle px-4 py-3">
          <div className="mx-auto flex w-full items-center justify-between gap-3 lg:max-w-3xl">
            <p className="text-meta text-text-muted">
              You blocked {title} — unblock to send messages.
            </p>
            <button
              type="button"
              onClick={() => participantId && onToggleBlocked(participantId)}
              className="pressable shrink-0 text-body-emphasis font-semibold text-brand"
            >
              Unblock
            </button>
          </div>
        </div>
      ) : groupReadOnly ? (
        <div className="shrink-0 border-t border-border-subtle px-4 py-3.5">
          <p className="mx-auto w-full text-center text-meta text-text-muted lg:max-w-3xl">
            Only admins can send messages in this group.
          </p>
        </div>
      ) : (
        <Composer
          threadId={conversationId}
          quickReplyRole={quickReplyRole}
          sending={isSending}
          onSend={onSend}
          replyTo={
            replyTarget
              ? {
                  senderName: senderNameFor(replyTarget),
                  text: previewTextFor(replyTarget),
                }
              : null
          }
          onCancelReply={onCancelReply}
          editTarget={
            editing ? { id: editing.id, text: editing.text ?? '' } : null
          }
          onEditSubmit={onEditSubmit}
          onCancelEdit={onCancelEdit}
        />
      )}
    </>
  );
}
