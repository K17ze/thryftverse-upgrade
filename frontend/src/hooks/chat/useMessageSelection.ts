/**
 * useMessageSelection — selection mode, selected set, context menu actions.
 *
 * Owns:
 * - Selection mode (on/off)
 * - Selected message IDs set
 * - Context menu visibility + selected message
 * - Translated message IDs toggle
 * - Enter/exit/toggle selection
 * - Long press handler (context menu vs selection toggle)
 *
 * Per spec 16: Context menu actions include copy, reply, react, delete, retry,
 * report, translate.
 */

import { useCallback, useState } from "react";

import type { Message } from "./types";

interface UseMessageSelectionOptions {
  selectionMode: boolean;
}

export function useMessageSelection(_: UseMessageSelectionOptions) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(
    new Set(),
  );
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [translatedMessageIds, setTranslatedMessageIds] = useState<Set<string>>(
    new Set(),
  );

  const toggleMessageSelection = useCallback((msgId: string) => {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  }, []);

  const enterSelectionMode = useCallback((msgId: string) => {
    setSelectionMode(true);
    setSelectedMessageIds(new Set([msgId]));
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
  }, []);

  const toggleTranslated = useCallback((msgId: string) => {
    setTranslatedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  }, []);

  return {
    selectionMode,
    setSelectionMode,
    selectedMessageIds,
    setSelectedMessageIds,
    contextMenuVisible,
    setContextMenuVisible,
    selectedMessage,
    setSelectedMessage,
    translatedMessageIds,
    setTranslatedMessageIds,
    toggleMessageSelection,
    enterSelectionMode,
    exitSelectionMode,
    toggleTranslated,
  };
}
