'use client';

/**
 * ChatMessageList — date-separated message stream renderer.
 * Handles same-sender runs, avatar grouping in group chats, unread divider,
 * offer cards, listing shares, message bubbles, and send failure affordances.
 */

import type { Conversation, Message } from '@/lib/contracts/domain';
import type { OfferWithOrder } from '@/lib/commerce/offerAcceptance';
import type { OfferRowAction } from '@/components/orders/OfferRow';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import {
  DeletedMessageTombstone,
  MessageBubble,
  type MessageCluster,
} from '../MessageBubble';
import { OfferCard } from '../OfferCard';
import { ListingShareCard } from '../ListingShareCard';
import {
  effectiveOfferStatus,
  resolveOfferActions,
} from '@/components/orders/OfferRow';
import { offerResolutionForMessage } from '../useChatOffers';
import {
  senderAvatarFor,
  senderLabelFor,
} from '../inboxModel';
import {
  NewMessagesDivider,
  sameRun,
  isOffer,
  isMine,
  isSystem,
  type MessageGroup,
} from './ChatStreamUtils';

interface ChatMessageListProps {
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
  nowMs: number;
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
  nowMs,
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
            const tight = cluster === 'middle' || cluster === 'last';

            // Cluster-first incoming group message gets a sender label —
            // the same name resolution the mobile GroupChatScreen uses.
            const senderLabel =
              isGroup && !mine && !isSystem(m) && !hasPrev
                ? senderLabelFor(conversation, m.senderId)
                : undefined;

            // Incoming group messages carry the sender's avatar on the
            // run's LAST bubble (single or last), with an indent
            // spacer on the earlier ones — the mobile ChatMessageItem
            // avatar-recurrence rule, so consecutive senders are
            // scannable without a label on every row.
            const groupIncoming =
              isGroup && !mine && !isSystem(m) && !m.isDeleted;
            const senderAvatar =
              groupIncoming && (cluster === 'single' || cluster === 'last')
                ? senderAvatarFor(conversation, m.senderId)
                : undefined;

            const canReply = replyable(m);
            // The actions menu opens on any persisted message, plus
            // the two non-persisted edge cases the mobile grammar
            // covers: a failed pending send (Retry / Discard — the
            // only actions a message that never landed can offer) and
            // a saved tombstone (Unsave — the backend still permits
            // retracting a save on a deleted-for-everyone row).
            const failed = failedIds.has(m.id);
            const menuable =
              actionable(m) || failed || (m.isDeleted === true && isSaved(m));

            const handleContextMenu = (e: React.MouseEvent) => {
              if (!menuable) return;
              // Touch long-press / right-click opens the
              // actions menu — the web analogue of the mobile
              // long-press sheet.
              e.preventDefault();
              onOpenMenu(e.clientX, e.clientY, m);
            };

            return (
              <div
                key={m.id}
                data-mid={m.id}
                onContextMenu={handleContextMenu}
                className={`-mx-2 rounded-xl px-2 transition-colors duration-300 ${
                  flashId === m.id ? 'bg-brand-subtle' : ''
                }`}
              >
                {m.id === unreadAnchorId ? <NewMessagesDivider /> : null}

                <div className={groupIncoming ? 'flex items-end gap-2' : undefined}>
                  {groupIncoming ? (
                    <span
                      className="w-6 shrink-0 pb-0.5"
                      aria-hidden={senderAvatar ? undefined : true}
                    >
                      {senderAvatar ? (
                        <Avatar
                          src={senderAvatar.avatar}
                          name={senderAvatar.name}
                          size={24}
                        />
                      ) : null}
                    </span>
                  ) : null}

                  <div className={groupIncoming ? 'min-w-0 flex-1' : undefined}>
                    {m.isDeleted ? (
                      <DeletedMessageTombstone
                        mine={mine}
                        senderLabel={senderLabel}
                        tight={tight}
                      />
                    ) : isOffer(m) ? (
                      (() => {
                        // The standing record drives the card — effective
                        // status, amount and the legal action set all come
                        // from it; an unresolvable message renders read-only.
                        // `via` keeps the provenance: a listing-fallback
                        // card is labelled the standing offer, not the
                        // offer this message described.
                        const resolution = offerResolutionForMessage(
                          m,
                          conversation,
                          chatOffers,
                        );
                        const offer = resolution.offer;
                        return (
                          <OfferCard
                            message={m}
                            mine={mine}
                            offer={offer}
                            standing={resolution.via === 'listing'}
                            showSeen={m.id === lastMineReadId}
                            status={
                              offer
                                ? effectiveOfferStatus(offer, nowMs)
                                : (m.offerStatus ?? 'pending')
                            }
                            actions={
                              offer
                                ? resolveOfferActions(offer, viewerId, nowMs)
                                : []
                            }
                            ownMove={
                              offer
                                ? offer.offeredByUserId === viewerId
                                : mine
                            }
                            highlight={searchQuery || undefined}
                            onReply={canReply ? () => onReply(m) : undefined}
                            onReact={
                              menuable
                                ? (anchor) => onReact(m, anchor)
                                : undefined
                            }
                            tight={tight}
                            onAction={(action) => {
                              if (!offer) return;
                              if (action === 'counter') onCounterOffer(offer);
                              else onRespondToOffer(offer, action);
                            }}
                          />
                        );
                      })()
                    ) : m.type === 'listing_share' && m.listing ? (
                      // Buyer-seat offer CTA (the native share card's
                      // action dock): only when the viewer isn't the
                      // listing's seller and the item isn't sold. An
                      // unproven sellerId still shows it — the create
                      // edge rejects own-listing offers honestly.
                      <ListingShareCard
                        message={m}
                        mine={mine}
                        showSeen={m.id === lastMineReadId}
                        senderLabel={senderLabel}
                        onReply={canReply ? () => onReply(m) : undefined}
                        onReact={
                          menuable
                            ? (anchor) => onReact(m, anchor)
                            : undefined
                        }
                        tight={tight}
                        onMakeOffer={
                          m.listing.isSold !== true &&
                          (m.listing.sellerId
                            ? m.listing.sellerId !== viewerId
                            : true)
                            ? () => onMakeShareOffer(m.listing!.id)
                            : undefined
                        }
                      />
                    ) : (
                      <MessageBubble
                        message={m}
                        mine={mine}
                        conversationId={conversationId}
                        failed={failed}
                        showSeen={m.id === lastMineReadId}
                        senderLabel={senderLabel}
                        highlight={searchQuery || undefined}
                        replyTo={replyInfoFor(m)}
                        replyable={canReply}
                        menuable={menuable}
                        onReplyPress={onReplyPress}
                        onReply={onReply}
                        onReact={onReact}
                        onMediaPress={onMediaPress}
                        onToggleReaction={onToggleReaction}
                        onTogglePollVote={onTogglePollVote}
                        cluster={cluster}
                      />
                    )}
                  </div>
                </div>

                {failedIds.has(m.id) ? (
                  <div
                    className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                  >
                    <button
                      type="button"
                      onClick={(e) => onOpenMenu(e.clientX, e.clientY, m)}
                      className="pressable mt-0.5 flex items-center gap-1 text-meta text-danger-text"
                    >
                      <Icon name="alert" size={13} aria-hidden /> Not delivered
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
