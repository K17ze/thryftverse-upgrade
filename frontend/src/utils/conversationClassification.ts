import type { Conversation } from '../data/mockData';

export type ConversationRole = 'buying' | 'selling' | 'group' | 'general';

export interface ConversationClassification {
  role: ConversationRole;
  isBuying: boolean;
  isSelling: boolean;
  isGroup: boolean;
  isMarketplace: boolean;
  counterpartyId: string | null;
  itemContextId: string | null;
}

/**
 * Classify a conversation into a typed role based on the current user's
 * relationship to the item being discussed.
 *
 * Rules:
 * - Group conversations are always 'group'.
 * - If the conversation has an itemId and the current user is the seller/owner,
 *   the role is 'selling'.
 * - If the conversation has an itemId and the current user is NOT the seller/owner,
 *   the role is 'buying'.
 * - If the conversation has no itemId, the role is 'general'.
 *
 * This replaces the previous heuristic of inferring buying/selling solely
 * from `counterpartyId === sellerId`, which was unreliable.
 */
export function classifyConversation(
  conversation: Conversation,
  currentUserId?: string
): ConversationClassification {
  const isGroup = conversation.type === 'group';

  const counterpartyId =
    conversation.participantIds?.find(
      (id) => id !== 'me' && id !== currentUserId
    ) ?? null;

  const itemContextId = conversation.itemId ?? null;
  const isMarketplace = !!conversation.itemId;

  if (isGroup) {
    return {
      role: 'group',
      isBuying: false,
      isSelling: false,
      isGroup: true,
      isMarketplace: false,
      counterpartyId,
      itemContextId,
    };
  }

  if (!isMarketplace) {
    return {
      role: 'general',
      isBuying: false,
      isSelling: false,
      isGroup: false,
      isMarketplace: false,
      counterpartyId,
      itemContextId,
    };
  }

  // Marketplace conversation — determine if user is buyer or seller
  const sellerId = conversation.sellerId ?? conversation.ownerId;
  const isSelling = sellerId === currentUserId || sellerId === 'me';
  const isBuying = !isSelling;

  return {
    role: isSelling ? 'selling' : 'buying',
    isBuying,
    isSelling,
    isGroup: false,
    isMarketplace: true,
    counterpartyId,
    itemContextId,
  };
}

/**
 * Get a human-readable label for a conversation role.
 */
export function getRoleLabel(role: ConversationRole): string {
  switch (role) {
    case 'buying':
      return 'Buying';
    case 'selling':
      return 'Selling';
    case 'group':
      return 'Group';
    case 'general':
      return 'Direct';
  }
}
