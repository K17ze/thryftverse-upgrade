import type { Conversation, Message } from '../data/mockData';
import { classifyConversation, ConversationRole } from './conversationClassification';

export type AttentionType =
  | 'unread'
  | 'pending_offer'
  | 'pending_shipment'
  | 'failed_message'
  | 'message_request'
  | 'none';

export interface ConversationAttention {
  type: AttentionType;
  label: string;
  /** Whether the user should see a badge or indicator */
  hasIndicator: boolean;
  /** Whether the conversation should be prioritised in the inbox */
  shouldPrioritise: boolean;
}

/**
 * Resolve what action (if any) the current user needs to take on a conversation.
 *
 * Priority order (highest first):
 * 1. message_request — conversation is in message requests, awaiting accept/decline
 * 2. failed_message — last message from current user failed to send
 * 3. pending_offer — there's an offer awaiting the current user's response
 * 4. pending_shipment — seller has an order that needs shipping
 * 5. unread — there are unread messages
 * 6. none — no action needed
 */
export function resolveConversationAttention(
  conversation: Conversation,
  currentUserId?: string,
  isMessageRequest = false
): ConversationAttention {
  if (isMessageRequest) {
    return {
      type: 'message_request',
      label: 'Request',
      hasIndicator: true,
      shouldPrioritise: true,
    };
  }

  const messages = conversation.messages;
  const lastMessage = messages[messages.length - 1];
  const classification = classifyConversation(conversation, currentUserId);

  // Check for failed message from current user
  if (lastMessage?.uploadStatus === 'failed' && isFromCurrentUser(lastMessage, currentUserId)) {
    return {
      type: 'failed_message',
      label: 'Failed to send',
      hasIndicator: true,
      shouldPrioritise: true,
    };
  }

  // Check for pending offers that need the current user's response
  const pendingOffer = messages.find(
    (m) => m.type === 'offer' && m.offerStatus === 'pending'
  );
  if (pendingOffer) {
    const offerIsFromOther = !isFromCurrentUser(pendingOffer, currentUserId);
    if (offerIsFromOther) {
      return {
        type: 'pending_offer',
        label: 'Offer pending',
        hasIndicator: true,
        shouldPrioritise: true,
      };
    }
  }

  // Check for pending shipment (seller needs to ship)
  if (classification.isSelling) {
    const shipmentSystemMsg = messages.find(
      (m) => (m.isSystem || m.type === 'system') &&
      m.systemTitle?.toLowerCase().includes('ship')
    );
    if (shipmentSystemMsg && conversation.unread) {
      return {
        type: 'pending_shipment',
        label: 'Ship item',
        hasIndicator: true,
        shouldPrioritise: true,
      };
    }
  }

  // Unread messages
  if (conversation.unread) {
    return {
      type: 'unread',
      label: 'Unread',
      hasIndicator: true,
      shouldPrioritise: false,
    };
  }

  return {
    type: 'none',
    label: '',
    hasIndicator: false,
    shouldPrioritise: false,
  };
}

function isFromCurrentUser(message: Message, currentUserId?: string): boolean {
  return message.senderId === currentUserId ||
    message.senderId === 'me' ||
    message.sender === 'me';
}
