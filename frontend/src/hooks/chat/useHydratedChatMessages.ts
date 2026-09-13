import { useMemo, useRef } from "react";

import type { Conversation } from "../../domain";

import { useStore, type User } from "../../store/useStore";

import { hydrateConversationMessages } from "../../components/chat/hydrateConversationMessages";

import type { Message } from "./types";

export interface UseHydratedChatMessagesOptions {
  conversation: Conversation | undefined;
  currentUser: User | null | undefined;
}

export interface UseHydratedChatMessagesResult {
  /** Sender-id → display-name map for the current user + participants. */
  userLookup: Map<string, string>;
  hydratedMessages: Message[];
  /** Early ref for composer hydration — the composer hook only reads this
      inside effects, so an empty initial value is safe; by the time any
      effect runs the ref holds the latest messages. */
  messagesRef: React.MutableRefObject<Message[]>;
}

/**
 * Hydrated message pipeline for ChatScreen — bot/user sender-label lookup
 * maps plus the store→Message hydration transform. Pure derivation; the
 * caller owns the returned refs.
 */
export function useHydratedChatMessages({
  conversation,
  currentUser,
}: UseHydratedChatMessagesOptions): UseHydratedChatMessagesResult {
  const bots = useStore((state) => state.availableChatBots);
  const customBots = useStore((state) => state.customBots);

  const botLookup = useMemo(() => {
    const map = new Map<string, string>();

    for (const bot of [...bots, ...customBots]) {
      map.set(bot.id, bot.name);
    }

    return map;
  }, [bots, customBots]);

  const userLookup = useMemo(() => {
    const map = new Map<string, string>();

    map.set("me", currentUser?.username ?? "you");

    if (currentUser?.id) {
      map.set(currentUser.id, currentUser.username);
    }

    for (const participant of conversation?.participantProfiles ?? []) {
      map.set(participant.id, participant.displayName || participant.username);
    }

    return map;
  }, [conversation?.participantProfiles, currentUser?.id, currentUser?.username]);

  const hydratedMessages = useMemo<Message[]>(
    () =>
      hydrateConversationMessages(
        conversation?.messages,
        botLookup,
        userLookup,
        currentUser?.id,
      ),
    [botLookup, conversation?.messages, currentUser?.id, userLookup],
  );

  // Early ref for composer hydration — updated after useConversationMessages
  // returns. useConversationComposer only reads this inside effects, so an
  // empty initial value is safe; by the time any effect runs the ref will
  // hold the latest messages.
  const messagesRef = useRef<Message[]>([]);

  return { hydratedMessages, messagesRef, userLookup };
}
