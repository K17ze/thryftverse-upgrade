/**
 * useConversationComposer — text input, attachments, voice, send/voice toggle,
 * reply quote.
 *
 * Owns:
 * - Text input state
 * - Reply-to quote context
 * - Attachment picker visibility + pending attachment
 * - Voice recording toggle
 * - Cross-device composer state hydration + persistence (draft text, reply)
 * - Reacting-to-message state (emoji reaction picker)
 * - Search state (query, active, match index)
 *
 * Per spec 16: Composer default: add · text · camera/media · send/voice.
 * A single suggestion area appears only when useful.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchComposerStateFromApi,
  upsertComposerStateOnApi,
  clearComposerStateOnApi,
} from "../../services/chatApi";

import * as ImagePicker from "expo-image-picker";

import { isVideoUri } from "../../utils/media";

import type { ChatAction } from "../../components/chat/ChatActionSheet";
import type { Message } from "./types";

interface UseConversationComposerOptions {
  conversationId: string | undefined;
  initialSearchQuery?: string;
  /** Ref to the current messages array — used for hydration lookup only. */
  messagesRef: React.MutableRefObject<Message[]>;
  show: (msg: string, type: "success" | "error" | "info") => void;
  haptic: { light: () => void; success: () => void };
  setConversationDraft: (conversationId: string, draft: string) => void;
}

export function useConversationComposer({
  conversationId,
  initialSearchQuery,
  messagesRef,
  show,
  haptic,
  setConversationDraft,
}: UseConversationComposerOptions) {
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [attachmentPickerVisible, setAttachmentPickerVisible] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{
    uri: string;
    mediaType: "image" | "video";
  } | null>(null);
  const [reactingToMessage, setReactingToMessage] = useState<Message | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery ?? "");
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [isSearchActive, setIsSearchActive] = useState(!!initialSearchQuery);

  // Persist draft to store
  useEffect(() => {
    if (conversationId) setConversationDraft(conversationId, input);
  }, [input, conversationId, setConversationDraft]);

  // Cross-device composer state hydration
  const hydratedComposerRef = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationId) return;
    hydratedComposerRef.current = null;
    let cancelled = false;
    (async () => {
      try {
        const state = await fetchComposerStateFromApi(conversationId);
        if (cancelled) return;
        hydratedComposerRef.current = conversationId;
        if (state.draftText && !input) {
          setInput(state.draftText);
        }
        if (state.replyToMessageId) {
          const replied = messagesRef.current.find(
            (m) => m.id === state.replyToMessageId,
          );
          if (replied) setReplyTo(replied);
        }
      } catch {
        // Hydration is best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Debounced cross-device composer state persistence
  const composerPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!conversationId) return;
    if (composerPersistTimerRef.current) {
      clearTimeout(composerPersistTimerRef.current);
    }
    composerPersistTimerRef.current = setTimeout(() => {
      upsertComposerStateOnApi(conversationId, {
        draftText: input,
        replyToMessageId: replyTo?.id ?? null,
      }).catch(() => undefined);
    }, 1500);
    return () => {
      if (composerPersistTimerRef.current) {
        clearTimeout(composerPersistTimerRef.current);
      }
    };
  }, [input, replyTo, conversationId]);

  // On unmount, flush the latest composer state
  useEffect(() => {
    return () => {
      if (composerPersistTimerRef.current) {
        clearTimeout(composerPersistTimerRef.current);
      }
      if (conversationId && input) {
        upsertComposerStateOnApi(conversationId, {
          draftText: input,
          replyToMessageId: replyTo?.id ?? null,
        }).catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearComposerState = useCallback(
    (id: string) => clearComposerStateOnApi(id),
    [],
  );

  const handleAttachmentSelect = useCallback(
    async (type: ChatAction) => {
      if (type === "gallery") {
        try {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) {
            show("Allow gallery access to upload media.", "error");
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.All,
            allowsMultipleSelection: false,
            quality: 0.9,
          });
          if (!result.canceled && result.assets?.[0]?.uri) {
            const uri = result.assets[0].uri;
            const mediaType = isVideoUri(uri) ? "video" : "image";
            setPendingAttachment({ uri, mediaType });
            haptic.light();
          }
        } catch {
          show("Could not open gallery.", "error");
        }
      } else if (type === "camera") {
        try {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            show("Allow camera access to capture media.", "error");
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.All,
            quality: 0.9,
          });
          if (!result.canceled && result.assets?.[0]?.uri) {
            const uri = result.assets[0].uri;
            const mediaType = isVideoUri(uri) ? "video" : "image";
            setPendingAttachment({ uri, mediaType });
            haptic.light();
          }
        } catch {
          show("Could not open camera.", "error");
        }
      }
    },
    [show, haptic],
  );

  return {
    input,
    setInput,
    replyTo,
    setReplyTo,
    attachmentPickerVisible,
    setAttachmentPickerVisible,
    isVoiceRecording,
    setIsVoiceRecording,
    pendingAttachment,
    setPendingAttachment,
    reactingToMessage,
    setReactingToMessage,
    searchQuery,
    setSearchQuery,
    searchMatchIndex,
    setSearchMatchIndex,
    isSearchActive,
    setIsSearchActive,
    clearComposerState,
    handleAttachmentSelect,
  };
}
