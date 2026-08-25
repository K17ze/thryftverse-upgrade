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
  type?: 'text' | 'offer' | 'system' | 'commerce_state';
  sender?: 'me' | 'other' | 'system';
  offer?: { originalPrice: number; offerPrice: number; status: 'pending' | 'accepted' | 'declined' | 'countered' | 'expired' | 'cancelled'; expiresAt?: string; counterRound?: number };
  reactions?: MessageReaction[];
  replyToMessageId?: string;
  mediaUri?: string;
  mediaType?: 'image' | 'video';
  uploadStatus?: 'uploading' | 'failed' | 'sent';
  commerceState?: {
    stateType: 'order_placed' | 'payment_confirmed' | 'order_shipped' | 'order_in_transit' | 'order_delivered' | 'order_cancelled' | 'order_refunded';
    orderId: string;
    orderShortId?: string;
    itemTitle?: string;
    itemImage?: string | null;
    trackingNumber?: string | null;
    carrier?: string | null;
  };
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
