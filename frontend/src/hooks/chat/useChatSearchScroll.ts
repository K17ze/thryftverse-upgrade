import { useEffect, useMemo } from "react";

import type { FlashListRef } from "@shopify/flash-list";

import type { Message } from "./types";

export interface ChatSearchMatch {
  msg: Message;
  idx: number;
}

/**
 * In-conversation search — the match list (message + chronological index)
 * plus the scroll-to-match effect that centres the current match in the
 * FlashList whenever the match index changes.
 */
export function useChatSearchScroll({
  messages,
  searchQuery,
  searchMatchIndex,
  listRef,
}: {
  messages: Message[];
  searchQuery: string;
  searchMatchIndex: number;
  listRef: { current: FlashListRef<Message> | null };
}): ChatSearchMatch[] {
  const searchMatches = useMemo(() => {
    const q = String(searchQuery ?? "")
      .trim()
      .toLowerCase();

    if (!q) return [];

    return messages

      .map((m, idx) => ({ msg: m, idx }))

      .filter(({ msg }) =>
        String(msg.text ?? "")
          .toLowerCase()
          .includes(q),
      );
  }, [messages, searchQuery]);

  useEffect(() => {
    if (searchMatches.length > 0 && listRef.current) {
      const targetIndex =
        searchMatches[Math.min(searchMatchIndex, searchMatches.length - 1)]
          ?.idx ?? 0;

      try {
        listRef.current.scrollToIndex({
          index: targetIndex,
          animated: true,
          viewPosition: 0.5 });
      } catch {
        // FlashList may not have rendered the item yet
      }
    }
  }, [searchMatchIndex, searchMatches]);

  return searchMatches;
}
