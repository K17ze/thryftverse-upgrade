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

  // Typing indicator state — shows after 500ms of continuous typing and
  // hides after 3s of inactivity (WhatsApp 2026 typing indicator pattern).
  const [isTyping, setIsTyping] = useState(false);
  const typingStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setTypingInput = useCallback((value: string) => {
    setInput(value);
    // Clear any pending stop timer — the user is actively typing
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    if (value.length > 0) {
      // Start the show timer if not already typing and no pending start
      if (!typingStartTimerRef.current && !isTyping) {
        typingStartTimerRef.current = setTimeout(() => {
          setIsTyping(true);
          typingStartTimerRef.current = null;
        }, 500);
      }
      // Schedule the stop timer for 3s of inactivity
      typingStopTimerRef.current = setTimeout(() => {
        setIsTyping(false);
        typingStopTimerRef.current = null;
      }, 3000);
    } else {
      // Input cleared — cancel start timer and stop typing immediately
      if (typingStartTimerRef.current) {
        clearTimeout(typingStartTimerRef.current);
        typingStartTimerRef.current = null;
      }
      setIsTyping(false);
    }
  }, [isTyping]);

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
    // Reset typing state when switching conversations
    setIsTyping(false);
    if (typingStartTimerRef.current) {
      clearTimeout(typingStartTimerRef.current);
      typingStartTimerRef.current = null;
    }
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
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
      if (typingStartTimerRef.current) {
        clearTimeout(typingStartTimerRef.current);
      }
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
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
    setTypingInput,
    isTyping,
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
