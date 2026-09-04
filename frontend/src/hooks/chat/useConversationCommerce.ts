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

import { acceptListingOfferOnApi, declineListingOfferOnApi } from "../../services/listingOffersApi";

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
  context,
  onUpdateContext,
  show,
  haptic,
  navigation,
}: UseConversationCommerceOptions) {
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
        await acceptListingOfferOnApi(offerId);
        const linkedItemId = routeItemId || conversationItemId;
        if (linkedItemId) {
          navigation.navigate("Checkout", { itemId: linkedItemId });
        } else {
          show("Offer accepted. Checkout requires a linked listing.", "info");
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
    [messages, setMessages, routeItemId, conversationItemId, context, onUpdateContext, show, haptic, navigation],
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
    [messages, setMessages, context, onUpdateContext, show, haptic],
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
      });
    },
    [messages, routeItemId, conversationItemId, show, haptic, navigation],
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
