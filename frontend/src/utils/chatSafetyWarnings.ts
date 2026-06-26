import type { Conversation, Message } from '../data/mockData';
import { classifyConversation } from './conversationClassification';

export type SafetyWarningLevel = 'info' | 'caution' | 'danger';

export interface ChatSafetyWarning {
  level: SafetyWarningLevel;
  message: string;
  /** Whether the warning should be dismissible */
  dismissible: boolean;
}

/**
 * Detect contextual safety warnings for a chat conversation.
 *
 * Warnings are ONLY shown when contextually relevant — never permanently.
 * The following scenarios trigger warnings:
 *
 * 1. Buyer in a marketplace conversation — payment protection reminder
 * 2. Conversation with a newly joined or unverified user — caution
 * 3. Messages containing suspicious patterns (payment off-platform requests)
 *
 * No warning is shown for:
 * - Group conversations (handled separately)
 * - Seller-side conversations (no payment protection needed)
 * - Conversations without a linked listing
 */
export function detectChatSafetyWarning(
  conversation: Conversation,
  currentUserId?: string,
  messages?: Message[]
): ChatSafetyWarning | null {
  const classification = classifyConversation(conversation, currentUserId);

  // Only show payment protection warning for buyers in marketplace conversations
  if (classification.isBuying && classification.isMarketplace) {
    // Check if any message contains off-platform payment request
    if (messages && hasOffPlatformPaymentRequest(messages)) {
      return {
        level: 'danger',
        message: 'This user may be asking for payment outside Thryftverse. Never pay off-platform — you lose buyer protection.',
        dismissible: false,
      };
    }

    return {
      level: 'info',
      message: 'Never pay outside Thryftverse. Use checkout for buyer protection.',
      dismissible: true,
    };
  }

  return null;
}

/**
 * Detect if any message text contains patterns suggesting off-platform payment requests.
 */
function hasOffPlatformPaymentRequest(messages: Message[]): boolean {
  const suspiciousPatterns = [
    /bank\s*(?:transfer|details)/i,
    /paypal\s*(?:me|to|at)/i,
    /venmo\s*(?:me|at)/i,
    /cashapp|cash\s*app/i,
    /zelle/i,
    /send\s*(?:money|payment)\s*(?:to|via|through)/i,
    /outside\s*(?:thryft|app|platform)/i,
    /direct\s*(?:transfer|payment)/i,
  ];

  return messages.some((m) => {
    const text = m.text;
    if (!text) return false;
    return suspiciousPatterns.some((pattern) => pattern.test(text));
  });
}
