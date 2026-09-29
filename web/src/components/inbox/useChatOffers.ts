'use client';

/**
 * useChatOffers — the real offer write path behind the in-thread offer
 * cards, the same one /offers uses:
 *
 *  - `useChatOffers` returns the viewer's offers normalised to the
 *    CommerceOffer shape (live /users/me/offers, fixture OFFERS module).
 *  - `offerForMessage` resolves the record behind an offer message —
 *    `message.offerId` when the payload threads it, else the standing
 *    offer on the thread's listing (fixture messages mint no offerId).
 *  - `useChatOfferActions` runs the mutations: accept goes through
 *    acceptOffer so the recorded order exists before the card can claim
 *    success, decline/cancel/counter post respondToOffer live or mutate
 *    the fixture store. A failed write toasts and changes nothing.
 */

import { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import * as commerceService from '@/lib/api/services/commerce';
import {
  OFFERS,
  counterOffer,
  recordSentOffer,
  type CommerceOffer,
} from '@/lib/data/fixtures-commerce';
import { acceptOffer, type OfferWithOrder } from '@/lib/commerce/offerAcceptance';
import { useSession } from '@/lib/session/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import type { OfferRowAction } from '@/components/orders/OfferRow';
import { formatPrice } from '@/lib/utils/format';
import type { Conversation, Listing, Message } from '@/lib/contracts/domain';

/** 'pending' | 'countered' — the standing-offer states actions attach to. */
const isLiveStatus = (s: CommerceOffer['status']) =>
  s === 'pending' || s === 'countered';

/** The viewer's offers in both directions — the /offers read contract. */
export function useChatOffers() {
  return useQuery<OfferWithOrder[]>({
    queryKey: ['offers'],
    queryFn: async () => {
      if (DATA_MODE === 'live') {
        const rows = await commerceService.fetchOffers();
        return rows.map(
          (o): OfferWithOrder => ({
            id: o.id,
            listingId: o.listingId,
            buyerId: o.buyerId,
            sellerId: o.sellerId,
            amount: o.offerPriceGbp,
            originalPrice: o.originalPriceGbp ?? o.offerPriceGbp,
            status: o.status,
            offeredByUserId: o.offeredByUserId,
            counterRound: o.counterRound,
            createdAt: o.createdAt,
            updatedAt: o.updatedAt ?? o.createdAt,
            expiresAt: o.expiresAt,
            ...(o.orderId ? { orderId: o.orderId } : {}),
          }),
        );
      }
      return [...OFFERS];
    },
    // The 15s conversation poll can't see another party's counter — the
    // offer list tracks on its own cadence in live mode.
    refetchInterval: DATA_MODE === 'live' ? 15_000 : false,
  });
}

/**
 * How the standing record behind an offer card was resolved. 'offerId'
 * means the message payload named its own offer — the card IS that
 * offer. 'listing' means the legacy fallback fired: the card shows the
 * standing offer on the thread's listing, which may be a different
 * (newer) move than the message that carries the card — the UI labels
 * it as the standing offer rather than the message's own.
 */
export type OfferResolutionVia = 'offerId' | 'listing' | null;

export interface OfferResolution {
  offer?: OfferWithOrder;
  via: OfferResolutionVia;
}

/**
 * Resolve the standing offer an offer message refers to, keeping the
 * provenance so the card can label a listing-fallback honestly. offerId
 * wins; legacy messages (fixtures mint none, older live payloads) match
 * the thread's listing, preferring the live record over history.
 * Unresolvable cards render status only — no fabricated action surface.
 */
export function offerResolutionForMessage(
  m: Message,
  conversation: Conversation | null | undefined,
  offers: OfferWithOrder[] | undefined,
): OfferResolution {
  if (!offers?.length) return { offer: undefined, via: null };
  if (m.offerId) {
    const found = offers.find((o) => o.id === m.offerId);
    return { offer: found, via: found ? 'offerId' : null };
  }
  const listingId = m.listing?.id ?? conversation?.listing?.id;
  if (!listingId) return { offer: undefined, via: null };
  const candidates = offers.filter((o) => o.listingId === listingId);
  if (!candidates.length) return { offer: undefined, via: null };
  return {
    offer: candidates.sort(
      (a, b) =>
        Number(isLiveStatus(b.status)) - Number(isLiveStatus(a.status)) ||
        Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    )[0],
    via: 'listing',
  };
}

/** The record behind an offer message (provenance-free view). */
export function offerForMessage(
  m: Message,
  conversation: Conversation | null | undefined,
  offers: OfferWithOrder[] | undefined,
): OfferWithOrder | undefined {
  return offerResolutionForMessage(m, conversation, offers).offer;
}

/**
 * Offer mutations for the thread surface. `respond` covers the direct
 * actions (accept / decline / cancel); counter amounts go through
 * `sendCounter` from the caller's OfferSheet. Success copy mirrors
 * /offers; failures toast and leave the standing state untouched.
 */
export function useChatOfferActions(conversationId: string) {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useSession();
  // No 'me' fallback — a viewer without a session writes nothing. The
  // chat panel walls guests before any action surface renders.
  const viewerId = user?.id;

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['offers'] });
    void qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
    void qc.invalidateQueries({ queryKey: ['conversations'] });
  }, [qc, conversationId]);

  /** One idempotency key per listing per send session — a retry after a
   *  dropped response replays the same key so the server's unique
   *  constraint dedupes instead of double-creating; makeOffer also
   *  reconciles unknown outcomes via lookup-by-key before surfacing a
   *  failure. Keyed by listing — one thread can carry several. Entries
   *  clear once a send is confirmed. */
  const offerKeysRef = useRef(new Map<string, string>());

  const respond = useCallback(
    (offer: OfferWithOrder, action: Exclude<OfferRowAction, 'counter'>) => {
      if (!viewerId) return;
      const ownMove = offer.offeredByUserId === viewerId;
      if (action === 'accept') {
        // The money move — the recorded order id must exist before the
        // card reports success, same contract as the /offers accept.
        void acceptOffer(offer, viewerId)
          .then(({ orderId }) => {
            void qc.invalidateQueries({ queryKey: ['orders'] });
            refresh();
            toast.show(`Offer accepted — ${formatPrice(offer.amount)} agreed`, 'success');
            router.push(`/orders/${orderId}`);
          })
          .catch(() => toast.show('Could not accept the offer — try again.', 'error'));
        return;
      }
      // decline | cancel — resolveOfferActions already restricted the verb
      // to the legal role: sellers decline, buyers cancel, and retracting
      // your own standing move lands as a withdrawal either way.
      const label = ownMove
        ? 'Offer withdrawn'
        : action === 'cancel'
          ? 'Offer cancelled'
          : 'Offer declined';
      if (DATA_MODE === 'live') {
        void commerceService
          .respondToOffer(offer.id, action)
          .then(() => {
            refresh();
            toast.show(label, 'info');
          })
          .catch(() => toast.show('Could not update the offer — try again.', 'error'));
        return;
      }
      offer.status = action === 'cancel' || ownMove ? 'cancelled' : 'declined';
      offer.updatedAt = new Date().toISOString();
      refresh();
      toast.show(label, 'info');
    },
    [qc, router, toast, viewerId, refresh],
  );

  const sendCounter = useCallback(
    (offer: OfferWithOrder, amount: number, expiryHours = 48) => {
      if (!viewerId) return;
      if (DATA_MODE === 'live') {
        void commerceService
          .respondToOffer(offer.id, 'counter', {
            counterPriceGbp: amount,
            conversationId,
            expiryHours,
          })
          .then(() => {
            refresh();
            toast.show(`Counter sent — ${formatPrice(amount)}`, 'success');
          })
          .catch(() => toast.show('Could not send the counter — try again.', 'error'));
        return;
      }
      counterOffer(offer, amount, viewerId, expiryHours);
      refresh();
      toast.show(`Counter sent — ${formatPrice(amount)}`, 'success');
    },
    [toast, viewerId, refresh, conversationId],
  );

  /**
   * Fresh offer on a listing shared into the thread — the buyer-seat
   * "Make offer" path off a listing_share card. Same write the PDP dock
   * runs (POST /listings/:id/offers); conversationId threads it so the
   * created offer lands as a message in this conversation.
   */
  const sendNewOffer = useCallback(
    (listing: Listing, amount: number, expiryHours = 48) => {
      if (!viewerId) return;
      if (DATA_MODE === 'live') {
        // The offer only reads as sent once the backend confirms — via
        // the create response or the lookup-by-key recovery inside
        // makeOffer when the response was lost mid-flight.
        let key = offerKeysRef.current.get(listing.id);
        if (!key) {
          key = commerceService.newOfferIdempotencyKey();
          offerKeysRef.current.set(listing.id, key);
        }
        void commerceService
          .makeOffer(listing.id, amount, {
            originalPriceGbp: listing.price,
            expiryHours,
            conversationId,
            idempotencyKey: key,
          })
          .then(() => {
            offerKeysRef.current.delete(listing.id);
            refresh();
            toast.show(`Offer sent — ${formatPrice(amount)}`, 'success');
          })
          .catch((error) =>
            toast.show(
              parseApiError(error, 'Could not send the offer — try again.').message,
              'error',
            ),
          );
        return;
      }
      recordSentOffer(listing, amount, expiryHours, conversationId);
      refresh();
      toast.show(`Offer sent — ${formatPrice(amount)}`, 'success');
    },
    [toast, viewerId, refresh, conversationId],
  );

  return { respond, sendCounter, sendNewOffer, viewerId };
}
