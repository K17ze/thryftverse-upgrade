import React, { useEffect, useMemo, useRef, useState } from "react";

import { AnimatedPressable } from "../components/AnimatedPressable";

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  Pressable,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import NetInfo from "@react-native-community/netinfo";

import { AppState } from "react-native";
import {
  useSafeAreaInsets,
  SafeAreaView,
} from "react-native-safe-area-context";

import { StackScreenProps } from "@react-navigation/stack";

import { RootStackParamList } from "../navigation/types";

import { Colors } from "../constants/colors";

import { TypeStyles } from "../theme/designTokens";

import { useFormattedPrice } from "../hooks/useFormattedPrice";

import { useBackendData } from "../context/BackendDataContext";

import { getListingCoverUri, isVideoUri } from "../utils/media";

import { useStore } from "../store/useStore";

import {
  fetchConversationMessagesFromApi,
  sendConversationMessageOnApi,
  deleteConversationMessageOnApi,
} from "../services/chatApi";

import { useToast } from "../context/ToastContext";

import { useHaptic } from "../hooks/useHaptic";

import { KeyboardStickyView } from "../platform/keyboard/KeyboardProvider";

import { ChatComposerBar } from "../components/chat/ChatComposerBar";

import { MessageBubble } from "../components/chat/MessageBubble";

import { MarketplaceChatCard } from "../components/chat/MarketplaceChatCard";

import { ChatTopBar } from "../components/chat/ChatTopBar";

import { ChatListingContextBar } from "../components/chat/ChatListingContextBar";

import {
  ChatActionSheet,
  ChatAction,
} from "../components/chat/ChatActionSheet";

import { AttachmentReviewSheet } from "../components/chat/AttachmentReviewSheet";

import { Space, Radius, Type } from "../theme/designTokens";

import { MessageContextMenu } from "../components/chat/MessageContextMenu";

import { EmojiReactionsBar } from "../components/chat/EmojiReactionsBar";

import { ReplyQuote } from "../components/chat/ReplyQuote";

import { ScrollToBottomFAB } from "../components/chat/ScrollToBottomFAB";

import {
  LinkPreviewCard,
  extractFirstUrl,
} from "../components/chat/LinkPreviewCard";

import { SkeletonChatLoader } from "../components/chat/SkeletonChatLoader";

import * as Clipboard from "expo-clipboard";

import * as ImagePicker from "expo-image-picker";

import { Caption } from "../components/ui/Text";

import {
  isFirstInCluster as isFirstInClusterHelper,
  isLastInCluster as isLastInClusterHelper,
} from "../utils/messageGrouping";

import { detectChatSafetyWarning } from "../utils/chatSafetyWarnings";

import {
  isTrustedSystemMessage,
  resolveSystemMessageProvenance,
} from "../utils/systemMessageProvenance";

type Props = StackScreenProps<RootStackParamList, "Chat">;

type MsgType =
  "text" | "offer" | "offer_declined" | "purchase_status" | "media" | "system";

interface Message {
  id: string;

  type: MsgType;

  sender: "me" | "them";

  senderId?: string;

  senderLabel?: string;

  text?: string;

  isSystem?: boolean;

  systemTitle?: string;

  offer?: {
    price: number;
    originalPrice: number;
    status?: "pending" | "declined" | "countered" | "accepted";
  };

  date?: string;

  replyToMessageId?: string;

  reactions?: Array<{ emoji: string; count: number; reactedByMe: boolean }>;

  mediaUri?: string;

  mediaType?: "image" | "video";

  uploadStatus?: "uploading" | "failed" | "sent";

  status?: "sending" | "sent" | "failed";
}

const INITIAL_MESSAGES: Message[] = [];

function formatDateSeparator(dateStr: string): string | null {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const input = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - input.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: "short" });
  }
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function ChatScreen({ navigation, route }: Props) {
  const { conversationId, itemId: routeItemId } = route.params;

  const currentUser = useStore((state) => state.currentUser);

  const conversations = useStore((state) => state.conversations);

  const bots = useStore((state) => state.availableChatBots);

  const appendConversationMessage = useStore(
    (state) => state.appendConversationMessage,
  );

  const replaceConversationMessages = useStore(
    (state) => state.replaceConversationMessages,
  );

  const markConversationRead = useStore((state) => state.markConversationRead);

  const setConversationDraft = useStore((state) => state.setConversationDraft);

  const addMessageReaction = useStore((state) => state.addMessageReaction);

  const { show } = useToast();

  const haptic = useHaptic();

  const insets = useSafeAreaInsets();

  const { listings } = useBackendData();

  const sellerQuickReplies = useStore((state) => state.sellerQuickReplies);
  const buyerQuickReplies = useStore((state) => state.buyerQuickReplies);

  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId),

    [conversationId, conversations],
  );

  const isGroup = conversation?.type === "group";

  const botLookup = useMemo(() => {
    const map = new Map<string, string>();

    for (const bot of bots) {
      map.set(bot.id, bot.name);
    }

    return map;
  }, [bots]);

  const userLookup = useMemo(() => {
    const map = new Map<string, string>();

    map.set("me", currentUser?.username ?? "you");

    if (currentUser?.id) {
      map.set(currentUser.id, currentUser.username);
    }

    return map;
  }, [currentUser?.id, currentUser?.username]);

  const profileMediaOverrides = useStore(
    (state) => state.profileMediaOverrides,
  );

  const hydratedMessages = useMemo<Message[]>(() => {
    if (!conversation?.messages.length) {
      return [];
    }

    return conversation.messages.map((entry) => {
      const resolvedSenderId = entry.senderId;

      const isCurrentUserSender =
        resolvedSenderId === "me" || resolvedSenderId === currentUser?.id;

      const sender: "me" | "them" = isCurrentUserSender ? "me" : "them";

      const senderLabel =
        botLookup.get(resolvedSenderId) ??
        userLookup.get(resolvedSenderId) ??
        (resolvedSenderId === "system" ? "System" : "Thryft user");

      if (entry.offerPrice !== undefined && entry.originalPrice !== undefined) {
        return {
          id: entry.id,

          type: "offer",

          sender,

          senderId: resolvedSenderId,

          senderLabel,

          offer: {
            price: entry.offerPrice,

            originalPrice: entry.originalPrice,

            status: entry.offerStatus,
          },

          text: entry.text,
        };
      }

      return {
        id: entry.id,

        type:
          entry.isSystem || entry.type === "system"
            ? "system"
            : entry.mediaUri
              ? "media"
              : "text",

        sender,

        senderId: resolvedSenderId,

        senderLabel,

        text: entry.text ?? entry.systemTitle ?? "",

        isSystem: entry.isSystem,

        systemTitle: entry.systemTitle,

        date: entry.timestamp,

        reactions: entry.reactions?.map((r) => ({
          emoji: r.emoji,

          count: r.userIds.length,

          reactedByMe: r.userIds.includes(currentUser?.id ?? "me"),
        })),

        mediaUri: entry.mediaUri,

        mediaType: entry.mediaType,

        uploadStatus: entry.uploadStatus,
      };
    });
  }, [botLookup, conversation?.messages, currentUser?.id, userLookup]);

  const [messages, setMessages] = useState<Message[]>(hydratedMessages);

  const [input, setInput] = useState("");

  const [contextMenuVisible, setContextMenuVisible] = useState(false);

  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  const [replyTo, setReplyTo] = useState<Message | null>(null);

  const [reactingToMessage, setReactingToMessage] = useState<Message | null>(
    null,
  );

  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const [selectionMode, setSelectionMode] = useState(false);

  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(
    new Set(),
  );

  const [isSyncing, setIsSyncing] = useState(false);

  const [syncError, setSyncError] = useState(false);

  const [attachmentPickerVisible, setAttachmentPickerVisible] = useState(false);

  const [pendingAttachment, setPendingAttachment] = useState<{
    uri: string;
    mediaType: "image" | "video";
  } | null>(null);

  const [recentlyDeleted, setRecentlyDeleted] = useState<Message[]>([]);

  const undoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const deleteApiStatusRef = useRef<"pending" | "success" | "error">("pending");

  const wasOfflineRef = useRef(false);

  const [searchQuery, setSearchQuery] = useState(
    route.params?.focusQuery ?? "",
  );

  const [searchMatchIndex, setSearchMatchIndex] = useState(0);

  const [isSearchActive, setIsSearchActive] = useState(
    !!route.params?.focusQuery,
  );

  const [isOffline, setIsOffline] = useState(false);

  const [composerSending, setComposerSending] = useState(false);

  const listRef = React.useRef<FlatList>(null);

  const { formatFromFiat } = useFormattedPrice();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(
      (state: { isConnected: boolean | null }) => {
        const isNowOffline = !state.isConnected;

        setIsOffline(isNowOffline);

        // Reconcile on reconnect

        if (wasOfflineRef.current && !isNowOffline) {
          void syncMessagesFromApi();
        }

        wasOfflineRef.current = isNowOffline;
      },
    );

    return () => unsubscribe();
  }, []);

  const syncMessagesFromApi = async () => {
    setIsSyncing(true);

    setSyncError(false);

    try {
      const syncedMessages =
        await fetchConversationMessagesFromApi(conversationId);

      if (!syncedMessages.length) return;

      replaceConversationMessages(conversationId, syncedMessages);
    } catch {
      setSyncError(true);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === "active") {
        void syncMessagesFromApi();
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => subscription.remove();
  }, [conversationId]);

  useEffect(() => {
    setMessages(hydratedMessages);
  }, [hydratedMessages]);

  useEffect(() => {
    markConversationRead(conversationId);
  }, [conversationId, markConversationRead]);

  useEffect(() => {
    setConversationDraft(conversationId, input);
  }, [input, conversationId, setConversationDraft]);

  const resolvedPartnerId = useMemo(() => {
    if (isGroup) return null;

    if (route.params?.partnerUserId) return route.params.partnerUserId;

    if (conversation?.sellerId) return conversation.sellerId;

    return (
      conversation?.participantIds?.find(
        (id) => id !== "me" && id !== currentUser?.id,
      ) ?? null
    );
  }, [
    conversation?.participantIds,
    conversation?.sellerId,
    currentUser?.id,
    isGroup,
    route.params?.partnerUserId,
  ]);

  const deployedBotIds = conversation?.botIds ?? [];

  const sellerHandle = resolvedPartnerId
    ? (userLookup.get(resolvedPartnerId) ?? "Thryft user")
    : "Thryft user";

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
          viewPosition: 0.5,
        });
      } catch {
        // FlatList may not have rendered the item yet
      }
    }
  }, [searchMatchIndex, searchMatches]);

  const pushMessage = (next: Message) => {
    setMessages((prev) => [...prev, next]);
  };

  const appendToConversationStore = (
    next: Message,
    senderIdOverride?: string,
  ) => {
    appendConversationMessage(conversationId, {
      id: next.id,

      senderId:
        senderIdOverride ??
        (next.sender === "me" ? (currentUser?.id ?? "me") : "system"),

      text: next.text,

      offerPrice: next.offer?.price,

      originalPrice: next.offer?.originalPrice,

      offerStatus:
        next.offer?.status === "countered" ? "pending" : next.offer?.status,

      isSystem: senderIdOverride === "system",

      timestamp: "just now",

      type:
        next.type === "offer"
          ? "offer"
          : next.type === "media"
            ? "text"
            : "text",

      sender: next.sender === "me" ? "me" : "other",

      mediaUri: next.mediaUri,

      mediaType: next.mediaType,

      uploadStatus: next.uploadStatus,
    });
  };

  const sendMessage = () => {
    const trimmed = input.trim();

    if (!trimmed) return;

    setComposerSending(true);

    const localId =
      String(Date.now()) + "_" + Math.random().toString(36).slice(2, 7);

    const outgoing: Message = {
      id: localId,

      type: "text",

      sender: "me",

      senderLabel: currentUser?.username ?? "you",

      text: trimmed,

      status: "sending",
    };

    if (replyTo) {
      outgoing.replyToMessageId = replyTo.id;
    }

    pushMessage(outgoing);

    appendToConversationStore(outgoing, currentUser?.id ?? "me");

    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

    sendConversationMessageOnApi(conversationId, trimmed)
      .then((serverMsg) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === localId
              ? { ...m, id: serverMsg.id, status: "sent" as const }
              : m,
          ),
        );
      })

      .catch(() => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === localId ? { ...m, status: "failed" as const } : m,
          ),
        );

        show("Message failed to send. Tap to retry.", "error");
      })

      .finally(() => setComposerSending(false));

    setInput("");

    setReplyTo(null);
  };

  const handleAcceptOffer = (msgId: string) => {
    haptic.medium();

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.offer
          ? { ...m, offer: { ...m.offer, status: "accepted" as const } }
          : m,
      ),
    );

    const linkedItemId = routeItemId || conversation?.itemId;

    if (linkedItemId) {
      navigation.navigate("Checkout", { itemId: linkedItemId });
    } else {
      show("Offer accepted. Checkout requires a linked listing.", "info");
    }
  };

  const handleDeclineOffer = (msgId: string) => {
    haptic.light();

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.offer
          ? { ...m, offer: { ...m.offer, status: "declined" as const } }
          : m,
      ),
    );
  };

  const handleMessageLongPress = (msg: Message) => {
    if (selectionMode) {
      toggleMessageSelection(msg.id);

      return;
    }

    setSelectedMessage(msg);

    setContextMenuVisible(true);

    haptic.medium();
  };

  const toggleMessageSelection = (msgId: string) => {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);

      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);

      if (next.size === 0) setSelectionMode(false);

      return next;
    });
  };

  const enterSelectionMode = (msgId: string) => {
    setSelectionMode(true);

    setSelectedMessageIds(new Set([msgId]));
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);

    setSelectedMessageIds(new Set());
  };

  const scheduleUndoClear = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    undoTimerRef.current = setTimeout(() => setRecentlyDeleted([]), 5000);
  };

  const handleUndoDelete = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    if (deleteApiStatusRef.current === "success") {
      show(
        "Messages were deleted on the server and cannot be restored.",
        "info",
      );

      setRecentlyDeleted([]);

      return;
    }

    setMessages((prev) => {
      const restored = [...recentlyDeleted];

      const all = [...prev, ...restored];

      all.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

      return all;
    });

    setRecentlyDeleted([]);

    show("Messages restored", "success");
  };

  const handleBulkDelete = () => {
    const idsToDelete = new Set(selectedMessageIds);

    const toDelete = messages.filter((m) => idsToDelete.has(m.id));

    if (toDelete.length === 0) {
      exitSelectionMode();
      return;
    }

    Alert.alert(
      "Delete messages?",

      `This will remove ${toDelete.length} message${toDelete.length === 1 ? "" : "s"}.`,

      [
        { text: "Cancel", style: "cancel" },

        {
          text: "Delete",

          style: "destructive",

          onPress: async () => {
            haptic.medium();

            deleteApiStatusRef.current = "pending";

            setRecentlyDeleted(toDelete);

            setMessages((prev) => prev.filter((m) => !idsToDelete.has(m.id)));

            exitSelectionMode();

            scheduleUndoClear();

            try {
              await Promise.all(
                toDelete.map((m) =>
                  deleteConversationMessageOnApi(conversationId, m.id),
                ),
              );

              deleteApiStatusRef.current = "success";
            } catch {
              deleteApiStatusRef.current = "error";

              show(
                "Some messages may not have been deleted on the server.",
                "error",
              );
            }
          },
        },
      ],
    );
  };

  const handleDeleteMessage = (msg: Message) => {
    Alert.alert(
      "Delete message?",

      "This message will be removed.",

      [
        { text: "Cancel", style: "cancel" },

        {
          text: "Delete",

          style: "destructive",

          onPress: async () => {
            haptic.medium();

            deleteApiStatusRef.current = "pending";

            setRecentlyDeleted([msg]);

            setMessages((prev) => prev.filter((m) => m.id !== msg.id));

            scheduleUndoClear();

            try {
              await deleteConversationMessageOnApi(conversationId, msg.id);

              deleteApiStatusRef.current = "success";
            } catch {
              deleteApiStatusRef.current = "error";

              show(
                "Message deleted locally. It may still be visible to others.",
                "info",
              );
            }
          },
        },
      ],
    );
  };

  const scrollToBottom = () => {
    listRef.current?.scrollToEnd({ animated: true });

    setShowScrollToBottom(false);
  };

  const sendMediaMessage = (
    msgId: string,
    uri: string,
    mediaType: "image" | "video",
  ) => {
    sendConversationMessageOnApi(conversationId, "", {
      mediaUri: uri,

      mediaType,
    })
      .then((serverMsg) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, id: serverMsg.id, uploadStatus: "sent" as const }
              : m,
          ),
        );
      })

      .catch(() => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, uploadStatus: "failed" as const } : m,
          ),
        );

        show("Upload failed. Tap media to retry.", "error");
      });
  };

  const handleRetryUpload = (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);

    if (!msg?.mediaUri || !msg.mediaType) return;

    if (msg.uploadStatus === "uploading") return; // Guard against in-flight retry spam

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, uploadStatus: "uploading" as const } : m,
      ),
    );

    sendMediaMessage(msgId, msg.mediaUri, msg.mediaType);

    haptic.light();
  };

  const handleRetrySendMessage = (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);

    if (!msg?.text || msg.status === "sending") return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, status: "sending" as const } : m,
      ),
    );

    sendConversationMessageOnApi(conversationId, msg.text)
      .then((serverMsg) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, id: serverMsg.id, status: "sent" as const }
              : m,
          ),
        );
      })

      .catch(() => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, status: "failed" as const } : m,
          ),
        );

        show("Message failed to send. Tap to retry.", "error");
      });

    haptic.light();
  };

  const createMediaMessage = (uri: string): Message => {
    const mediaType = isVideoUri(uri) ? "video" : "image";

    return {
      id:
        String(Date.now()) +
        "_" +
        mediaType +
        "_" +
        Math.random().toString(36).slice(2, 7),

      type: "media",

      sender: "me",

      senderLabel: currentUser?.username ?? "you",

      text: "",

      mediaUri: uri,

      mediaType,

      uploadStatus: "uploading",
    };
  };

  const handleAttachmentSelect = async (type: ChatAction) => {
    if (type === "gallery") {
      try {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permission.granted) {
          show("Allow gallery access to upload media.", "error");
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.ImagesAndVideos,

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
          mediaTypes: ImagePicker.MediaTypeOptions.ImagesAndVideos,

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
  };

  const handleSendPendingAttachment = (caption: string) => {
    if (!pendingAttachment) return;
    const { uri, mediaType } = pendingAttachment;
    const outgoing = createMediaMessage(uri);
    if (caption) {
      outgoing.text = caption;
    }
    pushMessage(outgoing);
    appendToConversationStore(outgoing, currentUser?.id ?? "me");
    haptic.success();
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    sendMediaMessage(outgoing.id, uri, mediaType);
    setPendingAttachment(null);
  };

  const mediaTypeLabel = (t: "image" | "video") =>
    t === "video" ? "Video" : "Photo";

  // Date separator computation: show a date pill when the day changes between consecutive messages
  const dateSeparatorIndices = useMemo(() => {
    const indices = new Set<number>();
    const extractDate = (d?: string) => {
      if (!d) return "";
      // Extract YYYY-MM-DD portion if available
      const match = d.match(/^(\d{4}-\d{2}-\d{2})/);
      return match ? match[1] : (d.split("T")[0] ?? d.split(" ")[0] ?? "");
    };
    for (let i = 0; i < messages.length; i++) {
      if (i === 0) {
        indices.add(i);
        continue;
      }
      const prevDate = extractDate(messages[i - 1]?.date);
      const currDate = extractDate(messages[i]?.date);
      if (currDate && prevDate && currDate !== prevDate) {
        indices.add(i);
      }
    }
    return indices;
  }, [messages]);

  const scrollToMessage = (messageId: string) => {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx >= 0 && listRef.current) {
      try {
        listRef.current.scrollToIndex({
          index: idx,
          animated: true,
          viewPosition: 0.5,
        });
      } catch {
        // FlatList may not have rendered the item yet
      }
    }
  };

  const renderMessage = (msg: Message, index: number) => {
    const prevMsg = messages[index - 1];
    const nextMsg = messages[index + 1];

    const clusterFirst = isFirstInClusterHelper(
      { sender: msg.sender, type: msg.type, date: msg.date },
      prevMsg
        ? { sender: prevMsg.sender, type: prevMsg.type, date: prevMsg.date }
        : undefined,
    );

    const clusterLast = isLastInClusterHelper(
      { sender: msg.sender, type: msg.type, date: msg.date },
      nextMsg
        ? { sender: nextMsg.sender, type: nextMsg.type, date: nextMsg.date }
        : undefined,
    );

    const isFirstInCluster = clusterFirst;
    const isLastInCluster = clusterLast;

    // Spacing tiers (8px base grid)
    let spacingTop: number = Space.sm;
    if (!prevMsg) spacingTop = Space.md;
    else if (prevMsg.sender === msg.sender) spacingTop = 2;
    else spacingTop = Space.md;

    // Cluster rhythm: tight bottom inside cluster, normal at cluster end
    let marginBottom: number = 2;
    if (isLastInCluster) marginBottom = Space.sm;

    const showDateSeparator = dateSeparatorIndices.has(index);
    const dateLabel = msg.date ? formatDateSeparator(msg.date) : null;

    const dateSeparator =
      showDateSeparator && dateLabel ? (
        <View style={styles.dateWrap}>
          <Text style={styles.dateText}>{dateLabel}</Text>
        </View>
      ) : null;

    // Purchase status message — inline centered event
    if (msg.type === "purchase_status") {
      const content = (
        <View key={msg.id} style={styles.statusWrap}>
          <MarketplaceChatCard type="purchase_status" text={msg.text} />
          <Text style={styles.statusHint}>
            Open My Orders for tracking information.
          </Text>
        </View>
      );
      return dateSeparator ? (
        <View key={msg.id + "_group"}>
          {dateSeparator}
          {content}
        </View>
      ) : (
        content
      );
    }

    // System message — only render trusted styling if provenance is verified
    if (
      (msg.type === "system" || msg.isSystem) &&
      msg.senderId &&
      isTrustedSystemMessage({
        id: msg.id,
        senderId: msg.senderId,
        isSystem: msg.isSystem,
        type: msg.type === "system" ? "system" : undefined,
        systemTitle: msg.systemTitle,
        text: msg.text,
        timestamp: msg.date ?? "",
      } as any)
    ) {
      const provenance = resolveSystemMessageProvenance({
        id: msg.id,
        senderId: msg.senderId,
        isSystem: msg.isSystem,
        type: msg.type === "system" ? "system" : undefined,
        systemTitle: msg.systemTitle,
        text: msg.text,
        timestamp: msg.date ?? "",
      } as any);
      const content = (
        <View key={msg.id} style={styles.statusWrap}>
          <MarketplaceChatCard
            type="system"
            systemTitle={msg.systemTitle}
            text={msg.text}
          />
          {provenance.isProtected && (
            <Text style={styles.systemProvenanceBadge}>Verified</Text>
          )}
        </View>
      );
      return dateSeparator ? (
        <View key={msg.id + "_group"}>
          {dateSeparator}
          {content}
        </View>
      ) : (
        content
      );
    }

    // Offer message — use MarketplaceChatCard
    if (msg.type === "offer" || msg.type === "offer_declined") {
      const isMe = msg.sender === "me";
      const content = (
        <View
          key={msg.id}
          style={[
            styles.msgRow,
            isMe && styles.msgRowRight,
            { marginTop: spacingTop, marginBottom },
          ]}
        >
          <MarketplaceChatCard
            type="offer"
            isMe={isMe}
            senderLabel={isGroup && !isMe ? msg.senderLabel : undefined}
            offer={msg.offer}
            formattedPrice={formatFromFiat(msg.offer!.price, "GBP", {
              displayMode: "fiat",
            })}
            formattedOriginalPrice={formatFromFiat(
              msg.offer!.originalPrice,
              "GBP",
              { displayMode: "fiat" },
            )}
            onAccept={() => handleAcceptOffer(msg.id)}
            onDecline={() => handleDeclineOffer(msg.id)}
          />
        </View>
      );
      return dateSeparator ? (
        <View key={msg.id + "_group"}>
          {dateSeparator}
          {content}
        </View>
      ) : (
        content
      );
    }

    const isMe = msg.sender === "me";
    const isMedia = msg.type === "media" && msg.mediaUri;
    if (!msg.text && !isMedia) return null;

    const bubble = (
      <View style={[styles.selectionRow, isMe && styles.selectionRowRight]}>
        {selectionMode ? (
          <AnimatedPressable
            style={[
              styles.checkbox,
              selectedMessageIds.has(msg.id) && styles.checkboxActive,
            ]}
            onPress={() => toggleMessageSelection(msg.id)}
            activeOpacity={0.7}
            hapticFeedback="light"
          >
            {selectedMessageIds.has(msg.id) ? (
              <Ionicons name="checkmark" size={14} color={Colors.textInverse} />
            ) : null}
          </AnimatedPressable>
        ) : null}
        <View
          key={msg.id}
          style={[
            styles.msgRow,
            isMe && styles.msgRowRight,
            { marginTop: spacingTop, marginBottom },
          ]}
        >
          <MessageBubble
            text={msg.text ?? ""}
            isMe={isMe}
            senderLabel={isGroup && !isMe ? msg.senderLabel : undefined}
            timestamp={isLastInCluster ? msg.date || "just now" : undefined}
            status={
              isMe
                ? msg.status === "sending"
                  ? "sending"
                  : msg.status === "failed"
                    ? "failed"
                    : msg.uploadStatus === "uploading"
                      ? "sending"
                      : msg.uploadStatus === "failed"
                        ? "failed"
                        : "sent"
                : undefined
            }
            onLongPress={() => handleMessageLongPress(msg)}
            onReactionPress={() => setReactingToMessage(msg)}
            onMediaPress={
              msg.mediaUri
                ? () => {
                    const uri = msg.mediaUri!;
                    navigation.navigate("ChatMediaPreview", {
                      mediaUri: uri,
                      mediaType: msg.mediaType ?? "image",
                      senderLabel: msg.senderLabel,
                      timestamp: msg.date,
                      messageId: msg.id,
                    });
                  }
                : undefined
            }
            replyTo={
              msg.replyToMessageId
                ? (() => {
                    const parent = messages.find(
                      (m) => m.id === msg.replyToMessageId,
                    );
                    return parent
                      ? {
                          senderName: parent.senderLabel ?? "Thryft user",
                          text: parent.text ?? "",
                        }
                      : null;
                  })()
                : null
            }
            onReplyPress={
              msg.replyToMessageId
                ? () => scrollToMessage(msg.replyToMessageId!)
                : undefined
            }
            reactions={msg.reactions}
            mediaUri={msg.mediaUri}
            mediaType={msg.mediaType}
            uploadStatus={msg.uploadStatus}
            onRetry={
              msg.uploadStatus === "failed"
                ? () => handleRetryUpload(msg.id)
                : msg.status === "failed"
                  ? () => handleRetrySendMessage(msg.id)
                  : undefined
            }
            isFirstInCluster={isFirstInCluster}
            isLastInCluster={isLastInCluster}
            showAvatar={!isMe && isFirstInCluster}
          />
          {!isMedia &&
            (() => {
              const url = extractFirstUrl(msg.text ?? "");
              return url ? (
                <View
                  style={[
                    styles.linkPreviewWrap,
                    isMe && styles.linkPreviewWrapRight,
                  ]}
                >
                  <LinkPreviewCard url={url} />
                </View>
              ) : null;
            })()}
        </View>
      </View>
    );

    if (showDateSeparator && dateLabel) {
      return (
        <View key={msg.id + "_group"}>
          {dateSeparator}
          {bubble}
        </View>
      );
    }

    return bubble;
  };

  const avatarUri = !isGroup
    ? conversation?.avatar ||
      (resolvedPartnerId
        ? profileMediaOverrides[resolvedPartnerId]?.avatar
        : undefined) ||
      null
    : null;
  const topBarTitle = isGroup
    ? (conversation?.title ?? "Group chat")
    : sellerHandle;
  const topBarSubtitle = isGroup
    ? `${conversation?.participantIds?.length ?? 0} members`
    : "Marketplace chat";
  const topBarInitials = isGroup
    ? (conversation?.title
        ?.split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() ?? "G")
    : sellerHandle.slice(0, 2).toUpperCase();

  const linkedListing = useMemo(() => {
    const itemId = routeItemId ?? conversation?.itemId;
    if (!itemId) return null;
    return listings.find((l) => l.id === itemId) ?? null;
  }, [routeItemId, conversation?.itemId, listings]);

  return (
    <SafeAreaView edges={["bottom"]} style={styles.screenRoot}>
      <View style={styles.screenRoot}>
        <ChatTopBar
          title={topBarTitle}
          subtitle={topBarSubtitle}
          avatarUrl={avatarUri}
          initials={topBarInitials}
          variant={isGroup ? "group" : "dm"}
          onBack={() => navigation.goBack()}
          onSearch={() => {
            if (isSearchActive) {
              setIsSearchActive(false);
              setSearchQuery("");
            } else {
              setIsSearchActive(true);
            }
          }}
          onInfo={() => {
            if (!conversation) return;
            navigation.navigate(
              isGroup ? "GroupChatInfo" : "ConversationInfo",
              { conversationId: conversation.id },
            );
          }}
          onTitlePress={() => {
            if (!conversation) return;
            if (isGroup) {
              navigation.navigate("GroupChatInfo", {
                conversationId: conversation.id,
              });
            } else if (resolvedPartnerId) {
              navigation.navigate("UserProfile", { userId: resolvedPartnerId });
            } else {
              navigation.navigate("ConversationInfo", {
                conversationId: conversation.id,
              });
            }
          }}
          isSearchActive={isSearchActive}
          searchValue={searchQuery}
          onSearchValueChange={(q: string) => {
            setSearchQuery(q);
            setSearchMatchIndex(0);
          }}
          searchResultLabel={
            searchMatches.length > 0
              ? `${searchMatchIndex + 1}/${searchMatches.length}`
              : undefined
          }
          onPreviousResult={() =>
            setSearchMatchIndex((i) => Math.max(0, i - 1))
          }
          onNextResult={() =>
            setSearchMatchIndex((i) =>
              Math.min(searchMatches.length - 1, i + 1),
            )
          }
          onCloseSearch={() => {
            setIsSearchActive(false);
            setSearchQuery("");
          }}
        />

        {!isGroup && linkedListing && (
          <ChatListingContextBar
            thumbnailUri={getListingCoverUri(linkedListing.images, "")}
            title={linkedListing.title}
            price={formatFromFiat(linkedListing.price, "GBP", {
              displayMode: "fiat",
            })}
            availability={linkedListing.isSold ? "Sold" : "Available"}
            primaryActionLabel={
              linkedListing.sellerId === currentUser?.id
                ? "View item"
                : "View item"
            }
            primaryActionIcon="eye-outline"
            onPrimaryAction={() =>
              navigation.navigate("ItemDetail", { itemId: linkedListing.id })
            }
            secondaryActionLabel={
              linkedListing.isSold
                ? undefined
                : linkedListing.sellerId === currentUser?.id
                  ? "Manage"
                  : "Buy now"
            }
            secondaryActionIcon={
              linkedListing.sellerId === currentUser?.id
                ? "settings-outline"
                : "flash-outline"
            }
            onSecondaryAction={
              linkedListing.isSold
                ? undefined
                : linkedListing.sellerId === currentUser?.id
                  ? () =>
                      navigation.navigate("ManageListing", {
                        itemId: linkedListing.id,
                      })
                  : () =>
                      navigation.navigate("Checkout", {
                        itemId: linkedListing.id,
                      })
            }
            onTitlePress={() =>
              navigation.navigate("ItemDetail", { itemId: linkedListing.id })
            }
            defaultCollapsed
          />
        )}

        {selectionMode ? (
          <View style={styles.selectionToolbar}>
            <AnimatedPressable
              onPress={exitSelectionMode}
              activeOpacity={0.7}
              scaleValue={0.92}
              hapticFeedback="light"
            >
              <Ionicons
                name="close-outline"
                size={24}
                color={Colors.textPrimary}
              />
            </AnimatedPressable>
            <Caption color={Colors.textMuted}>
              {selectedMessageIds.size} selected
            </Caption>
            <AnimatedPressable
              onPress={handleBulkDelete}
              activeOpacity={0.7}
              scaleValue={0.92}
              hapticFeedback="medium"
              accessibilityLabel="Delete selected"
            >
              <Ionicons name="trash-outline" size={22} color={Colors.danger} />
            </AnimatedPressable>
          </View>
        ) : null}

        {isSyncing ? (
          <SkeletonChatLoader count={6} />
        ) : syncError && !messages.length ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyGlyph}>
              <Ionicons
                name="cloud-offline-outline"
                size={40}
                color={Colors.textMuted}
              />
            </View>
            <Text style={styles.emptyTitle}>Couldn't load messages</Text>
            <Text style={styles.emptyBody}>
              Check your connection and try again.
            </Text>
            <Pressable
              onPress={() => void syncMessagesFromApi()}
              style={styles.retryBtn}
              accessibilityRole="button"
              accessibilityLabel="Retry loading messages"
            >
              <Ionicons name="refresh" size={16} color={Colors.textInverse} />
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : messages.length ? (
          <FlatList
            ref={listRef}
            data={messages}
            renderItem={({ item, index }) => renderMessage(item, index)}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="always"
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } =
                e.nativeEvent;
              const isNearBottom =
                contentSize.height -
                  contentOffset.y -
                  layoutMeasurement.height <
                150;
              setShowScrollToBottom(!isNearBottom);
            }}
            scrollEventThrottle={200}
          />
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyGlyph}>
              <Ionicons
                name="chatbubbles-outline"
                size={40}
                color={Colors.textMuted}
              />
            </View>
            <Text style={styles.emptyTitle}>Start the conversation</Text>
            <Text style={styles.emptyBody}>
              Send a message, photo, or make an offer to get started.
            </Text>
            <View style={styles.emptyCtaRow}>
              <Ionicons name="arrow-down" size={16} color={Colors.textMuted} />
              <Caption color={Colors.textMuted}>Type below</Caption>
            </View>
          </View>
        )}

        <KeyboardStickyView offset={{ closed: Math.max(insets.bottom, Space.sm) + 8, opened: 8 }}>
        <View
          style={[
            styles.composerWrap,
            { paddingBottom: Math.max(insets.bottom, Space.sm) + 8 },
          ]}
        >
          {replyTo ? (
            <ReplyQuote
              senderName={replyTo.senderLabel ?? "Thryft user"}
              text={replyTo.text ?? ""}
              onClose={() => setReplyTo(null)}
            />
          ) : null}

          {reactingToMessage ? (
            <EmojiReactionsBar
              reactions={reactingToMessage.reactions ?? []}
              onReact={(emoji) => {
                if (reactingToMessage) {
                  addMessageReaction(
                    conversationId,
                    reactingToMessage.id,
                    emoji,
                  );
                }
                setReactingToMessage(null);
              }}
            />
          ) : null}

          {isOffline && (
            <View style={styles.offlineBanner}>
              <Ionicons
                name="cloud-offline-outline"
                size={16}
                color={Colors.textSecondary}
              />
              <Text style={styles.offlineBannerText}>
                You are offline. Messages will be sent when you reconnect.
              </Text>
            </View>
          )}

          {recentlyDeleted.length > 0 && (
            <View style={styles.undoBanner}>
              <Text style={styles.undoBannerText}>
                {recentlyDeleted.length} message
                {recentlyDeleted.length === 1 ? "" : "s"} deleted
              </Text>
              <AnimatedPressable
                onPress={handleUndoDelete}
                activeOpacity={0.7}
                scaleValue={0.95}
                hapticFeedback="light"
                accessibilityLabel="Undo message deletion"
              >
                <Text style={styles.undoBannerAction}>Undo</Text>
              </AnimatedPressable>
            </View>
          )}

          <ChatComposerBar
            value={input}
            onChangeText={setInput}
            onSend={sendMessage}
            onAttachmentPress={() => setAttachmentPickerVisible(true)}
            onCameraPress={() => handleAttachmentSelect("camera")}
            placeholder="Message..."
            isSending={composerSending}
            quickReplies={
              linkedListing
                ? linkedListing.sellerId === currentUser?.id
                  ? [
                      ...sellerQuickReplies.slice(0, 4).map((text) => ({
                        label:
                          text.length > 30 ? text.slice(0, 28) + "…" : text,
                        onPress: () => setInput(text),
                      })),
                      {
                        label: "Manage replies",
                        onPress: () =>
                          navigation.navigate("ManageQuickReplies", {
                            role: "seller",
                          }),
                      },
                    ]
                  : [
                      ...buyerQuickReplies.slice(0, 4).map((text) => ({
                        label:
                          text.length > 30 ? text.slice(0, 28) + "…" : text,
                        onPress: () => setInput(text),
                      })),
                      {
                        label: "Manage replies",
                        onPress: () =>
                          navigation.navigate("ManageQuickReplies", {
                            role: "buyer",
                          }),
                      },
                    ]
                : undefined
            }
            safetyWarning={
              conversation
                ? detectChatSafetyWarning(
                    conversation,
                    currentUser?.id,
                    conversation.messages,
                  )?.message
                : undefined
            }
          />
        </View>
        </KeyboardStickyView>

        <ChatActionSheet
          visible={attachmentPickerVisible}
          onClose={() => setAttachmentPickerVisible(false)}
          onSelect={(action) => {
            if (action === "gallery" || action === "camera") {
              handleAttachmentSelect(action);
            }
          }}
        />

        {pendingAttachment && (
          <AttachmentReviewSheet
            visible={!!pendingAttachment}
            uri={pendingAttachment.uri}
            mediaType={pendingAttachment.mediaType}
            onClose={() => setPendingAttachment(null)}
            onSend={handleSendPendingAttachment}
          />
        )}

        <ScrollToBottomFAB
          visible={showScrollToBottom}
          onPress={scrollToBottom}
        />

        <MessageContextMenu
          visible={contextMenuVisible}
          onClose={() => setContextMenuVisible(false)}
          onAction={(action) => {
            if (!selectedMessage) return;
            switch (action) {
              case "copy": {
                Clipboard.setStringAsync(selectedMessage.text ?? "");
                show("Copied", "success");
                break;
              }
              case "reply":
                setReplyTo(selectedMessage);
                break;
              case "react":
                setReactingToMessage(selectedMessage);
                break;
              case "delete":
                handleDeleteMessage(selectedMessage);
                break;
              case "retry":
                if (selectedMessage.uploadStatus === "failed") {
                  handleRetryUpload(selectedMessage.id);
                } else {
                  handleRetrySendMessage(selectedMessage.id);
                }
                break;
              case "report":
                show("Report submitted. Thank you.", "success");
                break;
              default:
                break;
            }
          }}
          messageText={selectedMessage?.text ?? undefined}
          isOwnMessage={selectedMessage?.sender === "me"}
          isFailed={
            selectedMessage?.status === "failed" ||
            selectedMessage?.uploadStatus === "failed"
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  selectionToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: Colors.surfaceAlt,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Space.sm,
    paddingHorizontal: Space.xl,
    paddingBottom: Space.xxl,
  },

  emptyGlyph: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Space.md,
    width: 80,
    height: 80,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
  },

  emptyTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: TypeStyles.title.fontFamily,
    color: Colors.textPrimary,
    textAlign: "center",
    letterSpacing: Type.subtitle.letterSpacing,
  },

  emptyBody: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: Type.caption.lineHeight,
    marginTop: Space.xs,
  },

  emptyCtaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    marginTop: Space.md,
  },

  messageList: {
    paddingVertical: Space.sm,
  },

  dateWrap: {
    alignItems: "center",
    marginVertical: Space.sm + 2,
    paddingVertical: 3,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    alignSelf: "center",
  },

  dateText: {
    fontSize: Type.meta.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  statusWrap: {
    marginVertical: Space.xs,
    paddingHorizontal: Space.md,
    alignItems: "center",
  },

  systemProvenanceBadge: {
    fontSize: Type.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.brand,
    marginTop: 2,
  },

  statusHint: {
    fontSize: Type.meta.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: Colors.textMuted,
    marginTop: Space.xs,
    textAlign: "center",
  },

  msgRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Space.xs,
    paddingHorizontal: Space.md,
  },

  msgRowRight: {
    flexDirection: "row-reverse",
  },

  linkPreviewWrap: {
    maxWidth: "78%",
    alignSelf: "flex-start",
    marginTop: Space.xs,
  },

  linkPreviewWrapRight: {
    alignSelf: "flex-end",
  },

  selectionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Space.sm,
  },

  selectionRowRight: {
    flexDirection: "row-reverse",
  },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: Radius.sm,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: Space.sm,
  },

  checkboxActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },

  composerWrap: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm + 4,
    paddingTop: Space.xs,
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },

  undoBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surfaceAlt,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    marginHorizontal: -Space.md,
    marginTop: -Space.xs,
    marginBottom: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },

  undoBannerText: {
    color: Colors.textSecondary,
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },

  undoBannerAction: {
    color: Colors.brand,
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },

  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.xs,
    backgroundColor: `${Colors.textMuted}10`,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    marginHorizontal: -Space.md,
    marginTop: -Space.xs,
    marginBottom: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
  },

  offlineBannerText: {
    color: Colors.textSecondary,
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },

  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    backgroundColor: Colors.brand,
    paddingHorizontal: Space.md + 4,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.lg,
    marginTop: Space.sm,
  },

  retryBtnText: {
    color: Colors.textInverse,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },
});
