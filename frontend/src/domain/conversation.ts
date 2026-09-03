export interface MessageReaction {
  emoji: string;
  userIds: string[];
}

export interface Message {
  id: string;
  senderId: string;
  text?: string;
  offerPrice?: number;
  originalPrice?: number;
  offerStatus?: 'pending' | 'accepted' | 'declined' | 'countered' | 'expired' | 'cancelled';
  isSystem?: boolean;
  systemTitle?: string;
  timestamp: string;
  itemImage?: string;
  type?: 'text' | 'offer' | 'system' | 'commerce_state' | 'voice' | 'listing_share' | 'purchase_status';
  sender?: 'me' | 'other' | 'system';
  offer?: { originalPrice: number; offerPrice: number; status: 'pending' | 'accepted' | 'declined' | 'countered' | 'expired' | 'cancelled'; expiresAt?: string; counterRound?: number; itemId?: string; itemTitle?: string; itemImage?: string | null; itemBrand?: string | null; itemSize?: string | null; itemCondition?: string | null };
  listing?: { id: string; title: string; price: number; originalPrice?: number; image: string; brand?: string; size?: string; condition?: string; sellerUsername?: string; sellerRating?: number; isSold?: boolean };
  reactions?: MessageReaction[];
  replyToMessageId?: string;
  mediaUri?: string;
  mediaType?: 'image' | 'video' | 'document';
  uploadStatus?: 'uploading' | 'failed' | 'sent';
  // Voice messages — report 19.
  voiceUri?: string;
  voiceDurationMs?: number;
  voiceWaveform?: number[];
  voiceContainer?: 'm4a' | 'ogg' | 'webm' | 'mp4';
  voiceCodec?: 'aac' | 'opus' | 'mp3';
  voiceModerationState?: 'pending' | 'allowed' | 'limited' | 'blocked';
  /** P2-03: True when the message has been edited by its sender. */
  isEdited?: boolean;
  /** P2-03: ISO timestamp of the most recent edit (null/undefined when never edited). */
  editedAt?: string | null;
  /** P2-03: Monotonic edit revision counter (0 = never edited, 1+ = edited N times). */
  editVersion?: number;
  /** ID of the bot/agent that authored this message (agent conversations). */
  botId?: string;
  /** True when the message was generated in demo mode (clearly labelled). */
  isDemo?: boolean;
  commerceState?: {
    stateType: 'order_placed' | 'payment_confirmed' | 'order_shipped' | 'order_in_transit' | 'order_delivered' | 'order_cancelled' | 'order_refunded';
    orderId: string;
    orderShortId?: string;
    itemTitle?: string;
    itemImage?: string | null;
    trackingNumber?: string | null;
    carrier?: string | null;
  };
  /** P2-02: Pinned location shared in chat (expo-location). */
  location?: { lat: number; lng: number; label?: string };
  /** P2-02: Document attachment (expo-document-picker). */
  documentUri?: string;
  documentName?: string;
  documentMimeType?: string;
}

export type ConversationType = 'dm' | 'group';

export interface Conversation {
  id: string;
  type: ConversationType;
  title?: string;
  description?: string;
  /** Circular group avatar / profile picture (small, 1:1). */
  avatar?: string;
  /** Wide cover photo banner shown at the top of group info (WhatsApp/Telegram pattern). */
  coverPhoto?: string;
  sellerId?: string;
  itemId?: string;
  ownerId?: string;
  creatorId?: string;
  participantIds?: string[];
  participantProfiles?: Array<{
    id: string;
    username: string;
    displayName?: string | null;
    avatar?: string | null;
    emailVerified?: boolean;
    /** Identity/KYC verification — drives the verified badge, not email. */
    identityVerified?: boolean;
  }>;
  botIds?: string[];
  lastMessage: string;
  lastMessageTime: string;
  unread: boolean;
  messages: Message[];
  isPinned?: boolean;
  draftText?: string;
  /** Member roles: userId → 'owner' | 'admin' | 'member'. Populated from backend. */
  memberRoles?: Record<string, 'owner' | 'admin' | 'member'>;
  /** P0.12: Per-user conversation state — hydrated from backend, not local-only. */
  isMuted?: boolean;
  isArchived?: boolean;
  requestStatus?: 'pending' | 'accepted' | 'declined';
  markedUnread?: boolean;
}
