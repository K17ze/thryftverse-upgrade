'use client';

import { useMemo, useState } from 'react';
import type { Conversation, Message } from '@/lib/contracts/domain';
import type { OfferWithOrder } from '@/lib/commerce/offerAcceptance';
import { marketplaceMeta } from '@/lib/api/services/chat';
import { useResolvedListings } from '@/lib/hooks/home-modules';
import { senderLabelFor } from '../inboxModel';
import { detectThreadSafetyWarning } from '../chatSafety';
import { isMine } from './ChatStreamUtils';

interface UseChatSafetyAndRoleOptions {
  conversation?: Conversation | null;
  isGroup: boolean;
  viewerId: string;
  messages: Message[];
  chatOffers?: OfferWithOrder[];
}

export function useChatSafetyAndRole({
  conversation,
  isGroup,
  viewerId,
  messages,
  chatOffers,
}: UseChatSafetyAndRoleOptions) {
  const [safetyDismissed, setSafetyDismissed] = useState<string | null>(null);

  const meta = marketplaceMeta(conversation);
  const safetyListingId =
    conversation?.listing?.id ?? meta.itemId ?? meta.listingId;

  const { items: threadListingResolved } = useResolvedListings(
    safetyListingId ? [safetyListingId] : [],
  );
  const threadListing = threadListingResolved[0];

  const threadOffer = useMemo(
    () =>
      safetyListingId
        ? chatOffers?.find((o) => o.listingId === safetyListingId)
        : undefined,
    [chatOffers, safetyListingId],
  );

  const metaOwnerId = meta.ownerId;
  const threadSellerId =
    threadListing?.sellerId ?? threadOffer?.sellerId ?? meta.listingSellerId ?? metaOwnerId;

  const quickReplyRole: 'buyer' | 'seller' | null =
    !isGroup && safetyListingId
      ? threadSellerId && threadSellerId === viewerId
        ? 'seller'
        : 'buyer'
      : null;

  const safetyWarning = useMemo(() => {
    if (!conversation || isGroup || !safetyListingId) return null;
    const sellerId = threadSellerId;
    const isSelling = sellerId
      ? sellerId === viewerId
      : !messages.some(
            (m) => isMine(m) && (m.type === 'offer' || m.offerPrice != null),
          ) &&
          !messages.some(
            (m) => m.listing?.sellerId === conversation.participantId,
          );
    return detectThreadSafetyWarning(messages, {
      isMarketplace: true,
      isSelling,
    });
  }, [
    conversation,
    isGroup,
    safetyListingId,
    threadSellerId,
    messages,
    viewerId,
  ]);

  const senderNameFor = (m: Message): string =>
    !conversation
      ? 'Member'
      : isMine(m)
        ? 'You'
        : isGroup
          ? senderLabelFor(conversation, m.senderId)
          : conversation.participantName;

  const previewTextFor = (m: Message): string =>
    m.isDeleted
      ? 'This message was deleted'
      : m.text ??
        (m.mediaType === 'video'
          ? 'Video'
          : m.mediaUri
            ? 'Photo'
            : m.type === 'voice' || m.voiceUri
              ? 'Voice message'
              : m.type === 'document' || m.documentUri
                ? (m.documentName ?? 'Document')
                : m.systemTitle ?? 'Message');

  return {
    safetyListingId,
    threadListing,
    threadSellerId,
    quickReplyRole,
    safetyWarning,
    safetyDismissed,
    setSafetyDismissed,
    senderNameFor,
    previewTextFor,
  };
}
