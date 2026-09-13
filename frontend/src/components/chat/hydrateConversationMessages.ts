import { t } from "../../i18n";

import { type Message } from "../../hooks/chat";
import type { Conversation } from "../../domain";

/**
 * Map raw store conversation messages into the chat `Message` shape used by
 * the message list (sender resolution, sender labels, offer/system/media
 * typing, lifecycle passthrough).
 *
 * Pure function — call inside useMemo keyed on the input references.
 */
export function hydrateConversationMessages(
  entries: Conversation["messages"] | undefined,
  botLookup: Map<string, string>,
  userLookup: Map<string, string>,
  currentUserId: string | undefined,
): Message[] {
  if (!entries?.length) {
    return [];
  }

  return entries.map((entry) => {
    const resolvedSenderId = entry.senderId;

    const isCurrentUserSender =
      resolvedSenderId === "me" || resolvedSenderId === currentUserId;

    const sender: "me" | "other" = isCurrentUserSender ? "me" : "other";

    const senderLabel =
      botLookup.get(resolvedSenderId) ??
      userLookup.get(resolvedSenderId) ??
      (resolvedSenderId === "system" ? "System" : t('chat.fallbackUserName'));

    if (entry.offerPrice !== undefined && entry.originalPrice !== undefined) {
      return {
        id: entry.id,

        type: "offer",

        sender,

        senderId: resolvedSenderId,

        senderLabel,

        timestamp: entry.timestamp ?? entry.date ?? new Date().toISOString(),

        offer: {
          price: entry.offerPrice,

          originalPrice: entry.originalPrice,

          status: entry.offerStatus as "pending" | "declined" | "countered" | "accepted" | "expired" | "cancelled" | undefined },

        text: entry.text,

        // Lifecycle passthrough — offer bubbles keep their send/read state
        // across store-driven hydration resets.
        status: entry.status,

        readStatus: entry.readStatus,

        readBy: entry.readBy,

        clientMessageId: entry.clientMessageId };
    }

    return {
      id: entry.id,

      type:
        entry.isSystem || entry.type === "system"
          ? "system"
          : entry.type === "voice"
            ? "voice"
            : entry.mediaUri
              ? "media"
              : "text",

      sender,

      senderId: resolvedSenderId,

      senderLabel,

      timestamp: entry.timestamp ?? entry.date ?? new Date().toISOString(),

      text: entry.text ?? entry.systemTitle ?? "",

      isSystem: entry.isSystem,

      systemTitle: entry.systemTitle,

      date: entry.timestamp,

      reactions: entry.reactions?.map((r) => ({
        emoji: r.emoji,

        userIds: r.userIds,

        count: r.userIds.length,

        reactedByMe: r.userIds.includes(currentUserId ?? "me") })),

      mediaUri: entry.mediaUri,

      mediaType: entry.mediaType,

      uploadStatus: entry.uploadStatus,

      // Lifecycle passthrough — bubbles keep pending/sent/read state and
      // receipt data across store-driven hydration resets.
      status: entry.status,

      readStatus: entry.readStatus,

      readBy: entry.readBy,

      isReadByMe: entry.isReadByMe,

      clientMessageId: entry.clientMessageId,

      voiceUri: entry.voiceUri,

      voiceDurationMs: entry.voiceDurationMs,

      replyToMessageId: entry.replyToMessageId };
  });
}
