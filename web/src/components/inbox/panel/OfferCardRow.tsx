'use client';

import { useEffect, useState } from 'react';
import type { Message } from '@/lib/contracts/domain';
import type { OfferWithOrder } from '@/lib/commerce/offerAcceptance';
import type { OfferRowAction } from '@/components/orders/OfferRow';
import { OfferCard } from '../OfferCard';
import {
  effectiveOfferStatus,
  resolveOfferActions,
} from '@/components/orders/OfferRow';
import { offerResolutionForMessage } from '../useChatOffers';

/**
 * Offer expiry clock — lazily-expired standing offers flip their status
 * and action set on a 30s tick. The interval lives on the card row so
 * only offer messages re-render on it; a panel-level clock would rebuild
 * the whole stream every tick.
 */
export function useOfferClockMs(): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return nowMs;
}

export interface OfferCardRowProps {
  m: Message;
  mine: boolean;
  /** The thread's listing — the legacy fallback when the message minted
   *  no offerId (fixture messages never carry one). */
  conversationListingId?: string;
  chatOffers?: OfferWithOrder[];
  viewerId: string;
  canReply: boolean;
  menuable: boolean;
  tight: boolean;
  highlight?: string;
  showSeen: boolean;
  onReply: (m: Message) => void;
  onReact: (m: Message, anchor: { x: number; y: number }) => void;
  onCounterOffer: (offer: OfferWithOrder) => void;
  onRespondToOffer: (
    offer: OfferWithOrder,
    action: Exclude<OfferRowAction, 'counter'>,
  ) => void;
}

/**
 * Offer message → OfferCard — resolves the standing record behind the
 * message and owns the expiry clock. An unresolvable offer renders
 * status-only, never a fabricated action surface.
 */
export function OfferCardRow({
  m,
  mine,
  conversationListingId,
  chatOffers,
  viewerId,
  canReply,
  menuable,
  tight,
  highlight,
  showSeen,
  onReply,
  onReact,
  onCounterOffer,
  onRespondToOffer,
}: OfferCardRowProps) {
  const nowMs = useOfferClockMs();
  const resolution = offerResolutionForMessage(
    m,
    conversationListingId,
    chatOffers,
  );
  const offer = resolution.offer;

  return (
    <OfferCard
      message={m}
      mine={mine}
      offer={offer}
      standing={resolution.via === 'listing'}
      showSeen={showSeen}
      status={
        offer ? effectiveOfferStatus(offer, nowMs) : (m.offerStatus ?? 'pending')
      }
      actions={offer ? resolveOfferActions(offer, viewerId, nowMs) : []}
      ownMove={offer ? offer.offeredByUserId === viewerId : mine}
      highlight={highlight}
      onReply={canReply ? () => onReply(m) : undefined}
      onReact={menuable ? (anchor) => onReact(m, anchor) : undefined}
      tight={tight}
      onAction={(action) => {
        if (!offer) return;
        if (action === 'counter') onCounterOffer(offer);
        else onRespondToOffer(offer, action);
      }}
    />
  );
}
