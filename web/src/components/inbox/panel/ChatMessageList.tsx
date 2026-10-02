'use client';

/**
 * ChatMessageList — date-separated message stream renderer.
 * Handles same-sender runs, avatar grouping in group chats, unread divider,
 * offer cards, listing shares, message bubbles, and send failure affordances.
 *
 * Render cost is bounded two ways:
 *  - every message row is memoized — SSE merges, typing ticks and menu
 *    state re-run the parent map but skip rows whose props held (message
 *    payloads keep React Query identity; the comparator tracks the
 *    derived per-row values by field);
 *  - each row carries `content-visibility: auto` — off-screen rows skip
 *    layout/paint while staying in the a11y tree and find-in-page, and
 *    the intrinsic hint keeps scroll geometry honest until first render
 *    (the MasonryGrid virtualization-lite grammar).
 */

import type { Conversation, Message } from '@/lib/contracts/domain';
import type { OfferWithOrder } from '@/lib/commerce/offerAcceptance';
import type { OfferRowAction } from '@/components/orders/OfferRow';
import type { MessageCluster } from '../MessageBubble';
import {
  senderAvatarFor,
  senderLabelFor,
} from '../inboxModel';
import {
  sameRun,
  isMine,
  isSystem,
  type MessageGroup,
} from './ChatStreamUtils';
import { StreamRow } from './StreamRow';

export interface ChatMessageListProps {
  groups: MessageGroup[];
  conversation: Conversation;
  isGroup: boolean;
  viewerId: string;
  conversationId: string;
  searchQuery: string;
  unreadAnchorId: string | null;
  flashId: string | null;
  failedIds: ReadonlySet<string>;
  lastMineReadId?: string;
  chatOffers?: OfferWithOrder[];
  replyable: (m: Message) => boolean;
  actionable: (m: Message) => boolean;
  isSaved: (m: Message) => boolean;
  onReply: (m: Message) => void;
  onReact: (m: Message, anchor: { x: number; y: number }) => void;
  onOpenMenu: (x: number, y: number, m: Message) => void;
  onReplyPress: (id: string) => void;
  onMediaPress: (m: Message) => void;
  onToggleReaction: (m: Message, emoji: string) => void;
  onTogglePollVote: (m: Message, optionIndex: number) => void;
  onRespondToOffer: (
    offer: OfferWithOrder,
    action: Exclude<OfferRowAction, 'counter'>,
  ) => void;
  onCounterOffer: (offer: OfferWithOrder) => void;
  onMakeShareOffer: (listingId: string) => void;
  replyInfoFor: (m: Message) => { senderName: string; text: string } | undefined;
}

export function ChatMessageList({
  groups,
  conversation,
  isGroup,
  viewerId,
  conversationId,
  searchQuery,
  unreadAnchorId,
  flashId,
  failedIds,
  lastMineReadId,
  chatOffers,
  replyable,
  actionable,
  isSaved,
  onReply,
  onReact,
  onOpenMenu,
  onReplyPress,
  onMediaPress,
  onToggleReaction,
  onTogglePollVote,
  onRespondToOffer,
  onCounterOffer,
  onMakeShareOffer,
  replyInfoFor,
}: ChatMessageListProps) {
  return (
    <>
      {groups.map((g) => (
        <div key={g.key || 'undated'}>
          {g.label ? (
            <p className="my-4 text-center text-meta text-text-muted">
              {g.label}
            </p>
          ) : null}
          {g.messages.map((m, i) => {
            const mine = isMine(m);
            // Same-sender run — system rows and tombstones break the
            // cluster; the divider sits above the anchored message.
            const prev = g.messages[i - 1];
            const next = g.messages[i + 1];
            const hasPrev = !!prev && sameRun(prev, m);
            const hasNext = !!next && sameRun(next, m);
            const cluster: MessageCluster =
              !hasPrev && !hasNext
                ? 'single'
                : !hasPrev
                  ? 'first'
                  : !hasNext
                    ? 'last'
                    : 'middle';

            // Cluster-first incoming group message gets a sender label —
            // the same name resolution the mobile GroupChatScreen uses.
            const senderLabel =
              isGroup && !mine && !isSystem(m) && !hasPrev
                ? senderLabelFor(conversation, m.senderId)
                : undefined;

            // The run's LAST incoming bubble (single or last) carries the
            // sender's avatar; earlier rows keep an indent spacer — the
            // mobile ChatMessageItem avatar-recurrence rule.
            const groupIncoming =
              isGroup && !mine && !isSystem(m) && !m.isDeleted;
            const senderAvatar =
              groupIncoming && (cluster === 'single' || cluster === 'last')
                ? senderAvatarFor(conversation, m.senderId)
                : undefined;

            return (
              <StreamRow
                key={m.id}
                m={m}
                cluster={cluster}
                isGroup={isGroup}
                viewerId={viewerId}
                conversationId={conversationId}
                conversationListingId={conversation.listing?.id}
                senderLabel={senderLabel}
                senderAvatar={senderAvatar}
                highlight={searchQuery || undefined}
                replyTo={replyInfoFor(m)}
                unreadAnchor={m.id === unreadAnchorId}
                flashed={flashId === m.id}
                failed={failedIds.has(m.id)}
                showSeen={m.id === lastMineReadId}
                chatOffers={chatOffers}
                replyable={replyable}
                actionable={actionable}
                isSaved={isSaved}
                onReply={onReply}
                onReact={onReact}
                onOpenMenu={onOpenMenu}
                onReplyPress={onReplyPress}
                onMediaPress={onMediaPress}
                onToggleReaction={onToggleReaction}
                onTogglePollVote={onTogglePollVote}
                onRespondToOffer={onRespondToOffer}
                onCounterOffer={onCounterOffer}
                onMakeShareOffer={onMakeShareOffer}
              />
            );
          })}
        </div>
      ))}
    </>
  );
}
