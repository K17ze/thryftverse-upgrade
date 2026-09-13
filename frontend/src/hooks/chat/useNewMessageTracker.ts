import { useCallback, useEffect, useRef } from "react";

import type { Message } from "./types";

/**
 * Tracks which message IDs have already been rendered so only genuinely
 * new messages (added after initial load) get the bubble enter animation.
 * On the first render where messages exist, all are marked as known so
 * historical messages never animate on mount (AGENTS.md §16). The ref is
 * updated after each render via the effect below.
 *
 * `messagesRef` is the composer-hydration ref owned by
 * useHydratedChatMessages — used to seed the tracker on conversation
 * switch without depending on the hook's message list.
 */
export function useNewMessageTracker(
  messages: Message[],
  messagesRef: React.MutableRefObject<Message[]>,
  conversationId: string,
): (id: string) => boolean {
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const knownInitializedRef = useRef(false);
  if (!knownInitializedRef.current && messages.length > 0) {
    knownMessageIdsRef.current = new Set(messages.map((m) => m.id));
    knownInitializedRef.current = true;
  }
  useEffect(() => {
    if (messages.length > 0) {
      knownMessageIdsRef.current = new Set(messages.map((m) => m.id));
    }
  }, [messages]);

  useEffect(() => {
    // Reset new-message tracking so the new conversation's historical
    // messages do not trigger bubble enter animations.
    knownMessageIdsRef.current = new Set(messagesRef.current.map((m) => m.id));
    knownInitializedRef.current = messagesRef.current.length > 0;
  }, [conversationId]);

  const isNewMessage = useCallback(
    (id: string) => !knownMessageIdsRef.current.has(id),
    [],
  );

  return isNewMessage;
}
