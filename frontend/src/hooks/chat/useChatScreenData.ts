/**
 * useChatScreenData — screen-level data foundation for ChatScreen.
 *
 * Owns:
 * - Conversation lookup + derived metadata (isGroup, participants, title)
 * - Bot/user lookup maps for sender label resolution
 * - Hydrated message list (store messages → chat Message shape)
 * - Partner profile fetch (public profile for DM conversations)
 * - Conversation-level safety warning detection
 * - Linked listing resolution (from route param or conversation itemId)
 * - Realtime typing indicator + group identity event subscription
 * - Suggested-replies dismissal state (per-conversation session)
 * - Currency formatting (formatFromFiat, currencyCode)
 * - Screen height (stable for the session, used by contextual-stack budget)
 * - Store action references (markConversationRead, addMessageReaction, etc.)
 *
 * This hook is the data layer called first by ChatScreen. It has no
 * dependency on the controller hooks (useConversationComposer,
 * useConversationAgents, etc.) — those are called after this hook
 * and consume its outputs.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { Dimensions } from "react-native";

import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import type { RootStackParamList } from "../../navigation/types";
import type { Conversation } from "../../domain";
import type { Listing } from "../../services/listingsApi";
import type { PublicProfileUser } from "../../services/profileApi";
import { fetchPublicProfile } from "../../services/profileApi";
import type { ChatSafetyWarning } from "../../utils/chatSafetyWarnings";
import { detectChatSafetyWarning } from "../../utils/chatSafetyWarnings";

import { useStore } from "../../store/useStore";
import { useBackendData } from "../../context/BackendDataContext";
import { useToast } from "../../context/ToastContext";
import { useHaptic } from "../useHaptic";
import { useFormattedPrice } from "../useFormattedPrice";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useTypingIndicator,
  useChatGroupIdentityEvent,
} from "../../services/realtimeClient";

import { t } from "../../i18n";

import type { Message } from "./types";

type ChatNav = NativeStackNavigationProp<RootStackParamList, "Chat">;

export interface UseChatScreenDataOptions {
  conversationId: string | undefined;
  routeItemId?: string;
  routePartnerUserId?: string;
  navigation: ChatNav;
}

export interface UseChatScreenDataResult {
  // ── Current user ──
  currentUser: { id?: string; username?: string } | null;

  // ── Conversation ──
  conversation: Conversation | undefined;
  isGroup: boolean;

  // ── Lookup maps ──
  botLookup: Map<string, string>;
  userLookup: Map<string, string>;

  // ── Hydrated messages ──
  hydratedMessages: Message[];
  messagesRef: React.MutableRefObject<Message[]>;

  // ── Profile media overrides (store) ──
  profileMediaOverrides: Record<string, { avatar: string | null; cover: string | null }>;

  // ── Quick replies (store) ──
  sellerQuickReplies: { id: string; title: string; message: string }[];
  buyerQuickReplies: { id: string; title: string; message: string }[];

  // ── Backend listings ──
  listings: Listing[];

  // ── Shared services ──
  show: (msg: string, type: "success" | "error" | "info") => void;
  haptic: ReturnType<typeof useHaptic>;
  insets: { bottom: number; top: number; left: number; right: number };

  // ── Store actions ──
  appendConversationMessage: (
    conversationId: string,
    message: import("../../domain").Message,
  ) => void;
  replaceConversationMessages: (
    conversationId: string,
    messages: import("../../domain").Message[],
  ) => void;
  markConversationRead: (id: string) => void;
  setConversationDraft: (conversationId: string, draft: string) => void;
  addMessageReaction: (
    conversationId: string,
    messageId: string,
    emoji: string,
  ) => void;
  upsertConversation: (conversation: Conversation) => void;

  // ── Currency formatting ──
  formatFromFiat: (
    amount: number,
    currency?: import("../../constants/currencies").SupportedCurrencyCode,
    opts?: { displayMode?: import("../../utils/currency").CurrencyDisplayMode },
  ) => string;
  currencyCode: import("../../constants/currencies").SupportedCurrencyCode;

  // ── Partner profile ──
  resolvedPartnerId: string | null;
  partnerProfile: PublicProfileUser | null;
  partnerSummary:
    | NonNullable<Conversation["participantProfiles"]>[number]
    | undefined;
  sellerHandle: string;

  // ── Top bar derived values ──
  avatarUri: string | null;
  topBarTitle: string;
  topBarSubtitle: string;
  topBarInitials: string;

  // ── Linked listing ──
  linkedListing: Listing | null;

  // ── Conversation-level safety warning ──
  conversationSafetyWarning: ChatSafetyWarning | null;

  // ── Typing indicator ──
  isTyping: boolean;

  // ── Suggested replies dismissal ──
  suggestedRepliesDismissed: boolean;
  setSuggestedRepliesDismissed: React.Dispatch<React.SetStateAction<boolean>>;

  // ── Screen height (stable for session) ──
  screenHeight: number;
}

export function useChatScreenData({
  conversationId,
  routeItemId,
  routePartnerUserId,
  navigation,
}: UseChatScreenDataOptions): UseChatScreenDataResult {
  // ── Store subscriptions ──
  const currentUser = useStore((state) => state.currentUser);
  const conversations = useStore((state) => state.conversations);
  const bots = useStore((state) => state.availableChatBots);
  const customBots = useStore((state) => state.customBots);

  const appendConversationMessage = useStore(
    (state) => state.appendConversationMessage,
  );
  const replaceConversationMessages = useStore(
    (state) => state.replaceConversationMessages,
  );
  const markConversationRead = useStore((state) => state.markConversationRead);
  const setConversationDraft = useStore((state) => state.setConversationDraft);
  const addMessageReaction = useStore((state) => state.addMessageReaction);
  const upsertConversation = useStore((state) => state.upsertConversation);

  const profileMediaOverrides = useStore(
    (state) => state.profileMediaOverrides,
  );
  const sellerQuickReplies = useStore((state) => state.sellerQuickReplies);
  const buyerQuickReplies = useStore((state) => state.buyerQuickReplies);

  // ── Shared services ──
  const { show } = useToast();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const { listings } = useBackendData();
  const { formatFromFiat, currencyCode } = useFormattedPrice();

  // ── Conversation lookup ──
  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId),
    [conversationId, conversations],
  );

  const isGroup = conversation?.type === "group";

  // ── Bot lookup map ──
  const botLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const bot of [...bots, ...customBots]) {
      map.set(bot.id, bot.name);
    }
    return map;
  }, [bots, customBots]);

  // ── User lookup map ──
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

  // ── Linked listing ──
  const linkedListing = useMemo(() => {
    const itemId = routeItemId ?? conversation?.itemId;
    if (!itemId) return null;
    return listings.find((l) => l.id === itemId) ?? null;
  }, [routeItemId, conversation?.itemId, listings]);

  // ── Hydrated messages (store → chat Message shape) ──
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
        (resolvedSenderId === "system" ? "System" : t('chat.fallbackUserName'));

      if (entry.offerPrice !== undefined && entry.originalPrice !== undefined) {
        return {
          id: entry.id,
          type: "offer" as const,
          sender,
          senderId: resolvedSenderId,
          senderLabel,
          offer: {
            price: entry.offerPrice,
            originalPrice: entry.originalPrice,
            status: (entry.offer?.status ?? entry.offerStatus) as
              | "pending"
              | "declined"
              | "countered"
              | "accepted"
              | "expired"
              | "cancelled"
              | undefined,
            expiresAt: entry.offer?.expiresAt,
            counterRound: entry.offer?.counterRound,
            itemId: linkedListing?.id,
            itemTitle: linkedListing?.title,
            itemImage: linkedListing?.images?.[0],
            itemBrand: linkedListing?.brand ?? undefined,
            itemSize: linkedListing?.size ?? undefined,
          },
          text: entry.text,
          date: entry.timestamp,
        };
      }

      if (entry.type === "listing_share") {
        return {
          id: entry.id,
          type: "listing_share" as const,
          sender,
          senderId: resolvedSenderId,
          senderLabel,
          listing: entry.listing ?? (linkedListing ? {
            id: linkedListing.id,
            title: linkedListing.title,
            price: linkedListing.price,
            originalPrice: linkedListing.originalPrice,
            image: linkedListing.images[0],
            brand: linkedListing.brand ?? undefined,
            size: linkedListing.size ?? undefined,
            condition: linkedListing.condition ?? undefined,
            sellerUsername: conversation?.participantProfiles?.[0]?.username,
            sellerRating: 5.0,
            isSold: linkedListing.isSold,
          } : undefined),
          date: entry.timestamp,
        };
      }

      return {
        id: entry.id,
        type:
          entry.isSystem || entry.type === "system"
            ? ("system" as const)
            : entry.mediaUri
              ? ("media" as const)
              : ("text" as const),
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
  }, [botLookup, conversation?.messages, conversation?.participantProfiles, currentUser?.id, linkedListing, userLookup, t]);

  // ── Early ref for composer hydration ──
  const messagesRef = useRef<Message[]>([]);

  // ── Suggested replies dismissal (per-conversation session) ──
  const [suggestedRepliesDismissed, setSuggestedRepliesDismissed] =
    useState(false);

  useEffect(() => {
    setSuggestedRepliesDismissed(false);
  }, [conversationId]);

  // ── Typing indicator ──
  const isTyping = useTypingIndicator(conversationId);

  // ── Real-time group identity updates ──
  useChatGroupIdentityEvent(conversationId, (payload) => {
    if (!conversation) return;
    upsertConversation({
      ...conversation,
      id: payload.conversationId,
      title: payload.title ?? conversation.title,
      description: payload.description ?? conversation.description,
      avatar: payload.avatar !== undefined ? (payload.avatar ?? undefined) : conversation.avatar,
      coverPhoto: payload.coverPhoto !== undefined ? (payload.coverPhoto ?? undefined) : conversation.coverPhoto,
    });
  });

  // ── Resolved partner ID ──
  const resolvedPartnerId = useMemo(() => {
    if (isGroup) return null;
    if (routePartnerUserId) return routePartnerUserId;
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
    routePartnerUserId,
  ]);

  // ── Partner profile fetch ──
  const [partnerProfile, setPartnerProfile] = useState<PublicProfileUser | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    setPartnerProfile(null);
    if (!resolvedPartnerId) return () => { active = false; };
    fetchPublicProfile(resolvedPartnerId)
      .then((profile) => {
        if (active) setPartnerProfile(profile);
      })
      .catch(() => {
        // The conversation remains usable when a public profile is unavailable.
      });
    return () => {
      active = false;
    };
  }, [resolvedPartnerId]);

  // ── Partner summary + seller handle ──
  const partnerSummary = resolvedPartnerId
    ? conversation?.participantProfiles?.find(
        (participant) => participant.id === resolvedPartnerId,
      )
    : undefined;

  const sellerHandle = resolvedPartnerId
    ? (partnerProfile?.displayName ||
        partnerProfile?.username ||
        partnerSummary?.displayName ||
        partnerSummary?.username ||
        userLookup.get(resolvedPartnerId) ||
        t('chat.fallbackUserName'))
    : t('chat.fallbackUserName');

  // ── Top bar derived values ──
  const avatarUri = !isGroup
    ? conversation?.avatar ||
      (resolvedPartnerId
        ? profileMediaOverrides[resolvedPartnerId]?.avatar
        : undefined) ||
      partnerProfile?.avatar ||
      partnerSummary?.avatar ||
      null
    : conversation?.avatar ?? null;

  const topBarTitle = isGroup
    ? (conversation?.title ?? t('chat.groupChatLabel'))
    : sellerHandle;

  const topBarSubtitle = isTyping
    ? 'typing…'
    : isGroup
      ? `${conversation?.participantIds?.length ?? 0} members`
      : t('chat.marketplaceChatLabel');

  const topBarInitials = isGroup
    ? (conversation?.title
        ?.split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() ?? "G")
    : sellerHandle.slice(0, 2).toUpperCase();

  // ── Conversation-level safety warning ──
  const conversationSafetyWarning = useMemo(() => {
    if (!conversation) return null;
    return detectChatSafetyWarning(
      conversation,
      currentUser?.id,
      conversation.messages,
    );
  }, [conversation, currentUser?.id]);

  // ── Screen height (stable for session) ──
  const screenHeight = useMemo(
    () => Dimensions.get("window").height,
    [],
  );

  return {
    currentUser,
    conversation,
    isGroup,
    botLookup,
    userLookup,
    hydratedMessages,
    messagesRef,
    profileMediaOverrides,
    sellerQuickReplies,
    buyerQuickReplies,
    listings,
    show,
    haptic,
    insets,
    appendConversationMessage,
    replaceConversationMessages,
    markConversationRead,
    setConversationDraft,
    addMessageReaction,
    upsertConversation,
    formatFromFiat,
    currencyCode,
    resolvedPartnerId,
    partnerProfile,
    partnerSummary,
    sellerHandle,
    avatarUri,
    topBarTitle,
    topBarSubtitle,
    topBarInitials,
    linkedListing,
    conversationSafetyWarning,
    isTyping,
    suggestedRepliesDismissed,
    setSuggestedRepliesDismissed,
    screenHeight,
  };
}
