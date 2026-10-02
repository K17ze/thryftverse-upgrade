'use client';

import { memo } from 'react';
import type { Message } from '@/lib/contracts/domain';
import type { OfferWithOrder } from '@/lib/commerce/offerAcceptance';
import type { OfferRowAction } from '@/components/orders/OfferRow';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import {
  DeletedMessageTombstone,
  MessageBubble,
  type MessageCluster,
} from '../MessageBubble';
import { ListingShareCard } from '../ListingShareCard';
import {
  NewMessagesDivider,
  isOffer,
  isMine,
  isSystem,
} from './ChatStreamUtils';
import { OfferCardRow } from './OfferCardRow';

export interface StreamRowProps {
  m: Message;
  /** Same-sender run position — the parent resolves it against the
   *  row's in-group siblings (system rows and tombstones break a run). */
  cluster: MessageCluster;
  isGroup: boolean;
  viewerId: string;
  conversationId: string;
  /** Thread listing id — the offer resolution's fallback target. */
  conversationListingId?: string;
  /** Cluster-first incoming group message label — resolved by the parent. */
  senderLabel?: string;
  /** Run-trailing group sender face — compared by field in the memo
   *  (the parent resolves a fresh object each pass). */
  senderAvatar?: { name: string; avatar?: string };
  /** In-thread search query — matching text is marked inside the row. */
  highlight?: string;
  /** Resolved reply preview — compared by field like MessageBubble's. */
  replyTo?: { senderName: string; text: string };
  unreadAnchor: boolean;
  flashed: boolean;
  failed: boolean;
  showSeen: boolean;
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
}

/**
 * One stream row — message bubble, offer card, listing share or
 * tombstone plus the unread divider and the failed-send affordance.
 * Memoized on message identity + the derived per-row values: a poll
 * refetch or SSE merge creates a new `messages` array but keeps each
 * unchanged message's reference, so unrelated rows skip their render.
 */
export const StreamRow = memo(function StreamRow({
  m,
  cluster,
  isGroup,
  viewerId,
  conversationId,
  conversationListingId,
  senderLabel,
  senderAvatar,
  highlight,
  replyTo,
  unreadAnchor,
  flashed,
  failed,
  showSeen,
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
}: StreamRowProps) {
  const mine = isMine(m);
  const tight = cluster === 'middle' || cluster === 'last';

  // Incoming group messages carry the sender's avatar on the run's LAST
  // bubble (single or last), with an indent spacer on the earlier ones.
  const groupIncoming = isGroup && !mine && !isSystem(m) && !m.isDeleted;

  const canReply = replyable(m);
  // The actions menu opens on any persisted message, plus the two
  // non-persisted edge cases the mobile grammar covers: a failed pending
  // send (Retry / Discard — the only actions a message that never landed
  // can offer) and a saved tombstone (Unsave — the backend still permits
  // retracting a save on a deleted-for-everyone row).
  const menuable =
    actionable(m) || failed || (m.isDeleted === true && isSaved(m));

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!menuable) return;
    // Touch long-press / right-click opens the actions menu — the web
    // analogue of the mobile long-press sheet.
    e.preventDefault();
    onOpenMenu(e.clientX, e.clientY, m);
  };

  return (
    <div
      data-mid={m.id}
      onContextMenu={handleContextMenu}
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: 'auto 64px',
      }}
      className={`-mx-2 rounded-xl px-2 transition-colors duration-300 ${
        flashed ? 'bg-brand-subtle' : ''
      }`}
    >
      {unreadAnchor ? <NewMessagesDivider /> : null}

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
            <OfferCardRow
              m={m}
              mine={mine}
              conversationListingId={conversationListingId}
              chatOffers={chatOffers}
              viewerId={viewerId}
              canReply={canReply}
              menuable={menuable}
              tight={tight}
              highlight={highlight}
              showSeen={showSeen}
              onReply={onReply}
              onReact={onReact}
              onCounterOffer={onCounterOffer}
              onRespondToOffer={onRespondToOffer}
            />
          ) : m.type === 'listing_share' && m.listing ? (
            <ListingShareCard
              message={m}
              mine={mine}
              showSeen={showSeen}
              senderLabel={senderLabel}
              onReply={canReply ? () => onReply(m) : undefined}
              onReact={menuable ? (anchor) => onReact(m, anchor) : undefined}
              tight={tight}
              onMakeOffer={
                m.listing.isSold !== true &&
                (m.listing.sellerId ? m.listing.sellerId !== viewerId : true)
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
              showSeen={showSeen}
              senderLabel={senderLabel}
              highlight={highlight}
              replyTo={replyTo}
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

      {failed ? (
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
},
(a, b) =>
  a.m === b.m &&
  a.cluster === b.cluster &&
  a.isGroup === b.isGroup &&
  a.viewerId === b.viewerId &&
  a.conversationId === b.conversationId &&
  a.conversationListingId === b.conversationListingId &&
  a.senderLabel === b.senderLabel &&
  a.senderAvatar?.name === b.senderAvatar?.name &&
  a.senderAvatar?.avatar === b.senderAvatar?.avatar &&
  a.highlight === b.highlight &&
  a.replyTo?.senderName === b.replyTo?.senderName &&
  a.replyTo?.text === b.replyTo?.text &&
  a.unreadAnchor === b.unreadAnchor &&
  a.flashed === b.flashed &&
  a.failed === b.failed &&
  a.showSeen === b.showSeen &&
  a.chatOffers === b.chatOffers &&
  a.replyable === b.replyable &&
  a.actionable === b.actionable &&
  a.isSaved === b.isSaved &&
  a.onReply === b.onReply &&
  a.onReact === b.onReact &&
  a.onOpenMenu === b.onOpenMenu &&
  a.onReplyPress === b.onReplyPress &&
  a.onMediaPress === b.onMediaPress &&
  a.onToggleReaction === b.onToggleReaction &&
  a.onTogglePollVote === b.onTogglePollVote &&
  a.onRespondToOffer === b.onRespondToOffer &&
  a.onCounterOffer === b.onCounterOffer &&
  a.onMakeShareOffer === b.onMakeShareOffer);
