/**
 * useConversationCommerce — offers, commerce events, payment warnings.
 *
 * Owns:
 * - Accept/decline/counter offer handlers (optimistic + revert on API failure)
 * - Offer expired handler
 * - Commerce state navigation (order detail)
 *
 * Per spec 16: Commerce system events use quiet event cards.
 * Per AGENTS.md §11: Optimistic updates revert on API failure so UI tells the truth.
 */

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { acceptListingOfferOnApi, declineListingOfferOnApi } from "../../services/listingOffersApi";
import { queryKeys } from "../../platform/server/queryKeys";
import type { ListingDetailResult } from "../../platform/product/useListingQueries";
import { useBackendData } from "../../context/BackendDataContext";
import { useStore } from "../../store/useStore";

import type { ConversationContext } from "../../domain";
import type { Message } from "./types";

const MESSAGE_OFFER_TO_CONTEXT_STATUS: Record<string, ConversationContext["offer"] extends infer T ? T extends { status: infer S } ? S : never : never> = {
  pending: "pending",
  countered: "countered",
  accepted: "accepted",
  declined: "rejected",
  expired: "expired",
  cancelled: "withdrawn",
};

interface UseConversationCommerceOptions {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  routeItemId?: string;
  conversationItemId?: string;
  /**
   * The conversation being viewed. Threaded into the offer create/counter
   * payloads so `listing_offers.conversation_id` links the negotiation to
   * this thread (drives the offer badge in ChatListingContextBar). The
   * counter endpoint also inherits the parent offer's conversation_id
   * server-side when this is absent, so callers that don't pass it degrade
   * gracefully.
   */
  conversationId?: string;
  context?: ConversationContext;
  onUpdateContext?: (context: ConversationContext) => void;
  show: (msg: string, type: "success" | "error" | "info") => void;
  haptic: { light: () => void; medium: () => void };
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
}

export function useConversationCommerce({
  messages,
  setMessages,
  routeItemId,
  conversationItemId,
  conversationId,
  context,
  onUpdateContext,
  show,
  haptic,
  navigation,
}: UseConversationCommerceOptions) {
  const queryClient = useQueryClient();
  const { refreshListings } = useBackendData();
  const currentUserId = useStore((s) => s.currentUser?.id);

  const handleAcceptOffer = useCallback(
    async (msgId: string) => {
      const msg = messages.find((m) => m.id === msgId);
      const offerId = msg?.offer?.offerId;
      if (!offerId) {
        show("Cannot accept this offer — missing offer reference.", "error");
        return;
      }

      haptic.medium();

      const prevStatus = msg?.offer?.status;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.offer
            ? { ...m, offer: { ...m.offer, status: "accepted" as const } }
            : m,
        ),
      );

      if (context?.offer && onUpdateContext) {
        onUpdateContext({ ...context, offer: { ...context.offer, status: "accepted" } });
      }

      try {
        const result = await acceptListingOfferOnApi(offerId);
        const linkedItemId = routeItemId || conversationItemId;
        if (linkedItemId) {
          // Accepting creates an order and commits the listing server-side —
          // same propagation as checkout settlement: the cached listing
          // detail, the seller's listings pages, and the discovery feed.
          void queryClient.invalidateQueries({ queryKey: queryKeys.listing.detail(linkedItemId) });
          const cached = queryClient.getQueryData<ListingDetailResult>(
            queryKeys.listing.detail(linkedItemId),
          );
          // The accepter is the seller — the cached detail's sellerId is
          // authoritative, with the current user as fallback.
          const sellerId = cached?.listing?.sellerId ?? currentUserId;
          if (sellerId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.user.listingsAll(sellerId) });
          }
          void refreshListings();
        }
        // The actor here is the SELLER. Accept creates a real order +
        // reservation and returns a checkout payload — navigate to the
        // order that was just created, never to a fresh listing checkout.
        // Seam: CheckoutScreen cannot consume an orderId yet (parallel
        // refactor); OrderDetail's capability resolver renders the
        // "Complete payment" action for the buyer once checkout accepts
        // order-scoped entry.
        const orderId = result.checkout?.orderId;
        if (orderId) {
          navigation.navigate("OrderDetail", { orderId });
        } else {
          show("Offer accepted. The order could not be opened from here.", "info");
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId && m.offer
              ? { ...m, offer: { ...m.offer, status: prevStatus ?? "pending" } }
              : m,
          ),
        );
        if (context?.offer && onUpdateContext) {
          const revertedStatus = prevStatus ? MESSAGE_OFFER_TO_CONTEXT_STATUS[prevStatus] ?? "pending" : "pending";
          onUpdateContext({ ...context, offer: { ...context.offer, status: revertedStatus } });
        }
        show("Could not accept offer. Try again.", "error");
      }
    },
    [messages, setMessages, routeItemId, conversationItemId, conversationId, context, onUpdateContext, show, haptic, navigation, queryClient, refreshListings, currentUserId],
  );

  const handleDeclineOffer = useCallback(
    async (msgId: string) => {
      const msg = messages.find((m) => m.id === msgId);
      const offerId = msg?.offer?.offerId;
      if (!offerId) {
        show("Cannot decline this offer — missing offer reference.", "error");
        return;
      }

      haptic.light();

      const prevStatus = msg?.offer?.status;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.offer
            ? { ...m, offer: { ...m.offer, status: "declined" as const } }
            : m,
        ),
      );

      if (context?.offer && onUpdateContext) {
        onUpdateContext({ ...context, offer: { ...context.offer, status: "rejected" } });
      }

      try {
        await declineListingOfferOnApi(offerId);
        // The listing's active-offer count dropped — invalidate its cached
        // detail so the social-proof line doesn't serve a stale count.
        const linkedItemId = routeItemId || conversationItemId;
        if (linkedItemId) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.listing.detail(linkedItemId) });
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId && m.offer
              ? { ...m, offer: { ...m.offer, status: prevStatus ?? "pending" } }
              : m,
          ),
        );
        if (context?.offer && onUpdateContext) {
          const revertedStatus = prevStatus ? MESSAGE_OFFER_TO_CONTEXT_STATUS[prevStatus] ?? "pending" : "pending";
          onUpdateContext({ ...context, offer: { ...context.offer, status: revertedStatus } });
        }
        show("Could not decline offer. Try again.", "error");
      }
    },
    [messages, setMessages, routeItemId, conversationItemId, context, onUpdateContext, show, haptic, queryClient],
  );

  const handleCounterOffer = useCallback(
    (msgId: string, offerPrice?: number, originalPrice?: number) => {
      haptic.medium();
      const linkedItemId = routeItemId || conversationItemId;
      if (!linkedItemId) {
        show("Cannot counter without a linked listing.", "info");
        return;
      }
      const currentMsg = messages.find((m) => m.id === msgId);
      const currentRound = currentMsg?.offer?.counterRound ?? 0;
      navigation.navigate("MakeOffer", {
        itemId: linkedItemId,
        price: originalPrice ?? 0,
        title: "Item",
        counterOffer: true,
        previousOffer: offerPrice ?? 0,
        counterRound: currentRound + 1,
        parentOfferId: currentMsg?.offer?.offerId,
        // Links the counter-offer row to this conversation so the chat
        // context bar can render the live offer badge. The backend counter
        // endpoint also inherits the parent's conversation_id when this is
        // absent — this is belt-and-suspenders, not a correctness fix.
        conversationId,
      });
    },
    [messages, routeItemId, conversationItemId, conversationId, show, haptic, navigation],
  );

  const handleOfferExpired = useCallback(
    (msgId: string) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.offer && m.offer.status === "pending"
            ? { ...m, offer: { ...m.offer, status: "expired" as const } }
            : m,
        ),
      );
    },
    [setMessages],
  );

  return {
    handleAcceptOffer,
    handleDeclineOffer,
    handleCounterOffer,
    handleOfferExpired,
  };
}
