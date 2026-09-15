import {
  sendConversationMessageOnApi,
  sendListingShareMessage } from "../../services/chatApi";

import type { Message } from "../../hooks/chat";

/**
 * Forward support matrix — only message kinds with a faithful send path
 * in the target conversation are forwardable. Everything else (offers,
 * polls, documents, commerce/system cards, tombstones) has no honest
 * representation in another thread; the caller must refuse rather than
 * silently drop the payload and claim success.
 */
export function isForwardableMessage(msg: Message | null | undefined): boolean {
  if (!msg || msg.isDeleted) return false;
  // Card and system payloads persist a plaintext body ("Offer: £50") but
  // have no faithful forwarding representation — forwarding them as dead
  // text would silently drop the actionable card. Refuse rather than
  // degrade: offer cards, polls, commerce-state cards, system rows,
  // documents (no document-send path on the client), and agent rows.
  if (msg.offer || msg.poll || msg.commerceState) return false;
  if (msg.documentUri || msg.botId || msg.isDemo || msg.isAgent) return false;
  if (msg.type === "system" || msg.type === "purchase_status" || msg.type === "commerce_state") return false;
  if (msg.type === "offer" || msg.type === "offer_declined" || msg.type === "document") return false;
  if (msg.mediaUri && (msg.mediaType === "image" || msg.mediaType === "video")) {
    return true;
  }
  if (msg.voiceUri) return true;
  if (msg.listing?.id) return true;
  return msg.type === undefined || msg.type === "text" ? Boolean(msg.text?.trim()) : false;
}

/**
 * Forward a message into another conversation, preserving its content:
 * media keeps its attachment + caption, voice notes keep duration and
 * waveform, listing shares re-send the real product card, and text goes
 * through verbatim. Rejects (throws) when the send fails so callers can
 * surface an honest error instead of an unconditional "forwarded" toast.
 *
 * Caller contract: only call when isForwardableMessage(msg) is true.
 */
export async function forwardMessageToConversation(
  targetConversationId: string,
  msg: Message,
  currentUserId?: string,
): Promise<void> {
  const text = msg.text ?? "";

  if (msg.mediaUri && (msg.mediaType === "image" || msg.mediaType === "video")) {
    await sendConversationMessageOnApi(
      targetConversationId,
      text,
      undefined,
      undefined,
      { type: msg.mediaType, mediaUri: msg.mediaUri },
      currentUserId,
    );
    return;
  }

  if (msg.voiceUri) {
    await sendConversationMessageOnApi(
      targetConversationId,
      text,
      undefined,
      undefined,
      {
        type: "voice",
        mediaUri: msg.voiceUri,
        voiceDurationMs: msg.voiceDurationMs,
        voiceWaveform: msg.voiceWaveform },
      currentUserId,
    );
    return;
  }

  if (msg.listing?.id) {
    await sendListingShareMessage(
      targetConversationId,
      {
        id: msg.listing.id,
        title: msg.listing.title,
        price: msg.listing.price,
        originalPrice: msg.listing.originalPrice ?? null,
        image: msg.listing.image ?? msg.listing.images?.[0] ?? null,
        brand: msg.listing.brand ?? null,
        size: msg.listing.size ?? null,
        condition: msg.listing.condition ?? null,
        sellerId: msg.listing.sellerId ?? null,
        sellerUsername: msg.listing.sellerUsername ?? null,
        sellerRating: msg.listing.sellerRating ?? null,
        isSold: msg.listing.isSold === true },
      currentUserId,
    );
    return;
  }

  await sendConversationMessageOnApi(
    targetConversationId,
    text,
    undefined,
    undefined,
    undefined,
    currentUserId,
  );
}
