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
 * Comprehensive list of off-platform payment patterns.
 * These cover the most common methods scammers use to move payments
 * outside of the platform's buyer protection.
 */
const OFF_PLATFORM_PAYMENT_PATTERNS: RegExp[] = [
  // Payment apps & services
  /paypal(?:\s*(?:me|to|at|\.com|\.co\.uk))?/i,
  /venmo(?:\s*(?:me|at|\.com))?/i,
  /cashapp|cash\s*app|cash\s*tag/i,
  /zelle/i,
  /revolut/i,
  /monzo/i,
  /wise\b|transferwise/i,
  /samsung\s*pay|google\s*pay|apple\s*pay(?!\s*in\s*app)/i,
  // Bank transfers
  /bank\s*(?:transfer|details|account|sort\s*code|iban|swift)/i,
  /sort\s*code/i,
  /iban\b/i,
  /account\s*(?:number|no\.?)\s*[:\-]?\s*\d/i,
  /bacs/i,
  /chaps/i,
  // Crypto
  /bitcoin|btc\b|ethereum|eth\b|crypto(?:currency)?\s*(?:wallet|transfer|payment)/i,
  /btc\s*(?:address|wallet)/i,
  /eth\s*(?:address|wallet)/i,
  /usdt|tether/i,
  // Money transfer services
  /western\s*union/i,
  /moneygram|money\s*gram/i,
  /remittance/i,
  // Gift cards
  /gift\s*card(?:\s*(?:code|number|balance))?/i,
  /steam\s*card|itunes\s*card|amazon\s*card\s*code/i,
  /voucher\s*code/i,
  // Generic off-platform language
  /send\s*(?:money|payment|cash)\s*(?:to|via|through|on|using)\s*(?:my|our|the)?\s*(?!thryft|app|platform)/i,
  /outside\s*(?:thryft|the\s*app|platform)/i,
  /off(?:\s*|-)?platform/i,
  /direct\s*(?:transfer|payment|to\s*my)/i,
  /pay\s*(?:me|us)\s*(?:directly|outside|via|through)/i,
  /my\s*(?:email|phone|number)\s*(?:is|:)\s*[\w@]/i,
  /contact\s*me\s*(?:on|at|via)\s*(?:whatsapp|telegram|signal|text|sms|email)/i,
  /whatsapp\s*(?:me|at|on)\s*[:+]?\s*\d/i,
  /telegram\s*(?:me|at|on)\s*[@@]/i,
  /take\s*this\s*(?:off|outside)\s*(?:the\s*)?app/i,
  /let'?s\s*(?:talk|chat|continue)\s*(?:on|via|through)\s*(?!thryft)/i,
];

/**
 * Scam urgency patterns — high-pressure tactics used to rush buyers into
 * paying off-platform or skipping due diligence.
 */
const SCAM_URGENCY_PATTERNS: RegExp[] = [
  /pay\s*(?:now|today|immediately|right\s*away|asap)/i,
  /urgent\s*(?:sale|payment|transfer|dispatch)/i,
  /ship\s*(?:today|now|immediately|before\s*payment)/i,
  /send\s*(?:payment|money|deposit)\s*(?:first|before|upfront)/i,
  /only\s*(?:accept|take)\s*(?:cash|bank\s*transfer|paypal|venmo|zelle)/i,
  /must\s*(?:sell|ship|pay)\s*(?:today|now|within\s*\d+\s*hours?)/i,
  /price\s*(?:is\s*)?(?:firm|non[- ]?negotiable)\s*(?:if|when)\s*(?:paid|paid\s*via)\s*(?!thryft|app|checkout)/i,
  /won'?t\s*(?:last|be\s*here)\s*(?:long|tomorrow|another\s*day)/i,
];

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

    // Check for scam urgency patterns — high-pressure tactics
    if (messages && hasScamUrgencyPattern(messages)) {
      return {
        level: 'caution',
        message: 'This user may be using high-pressure tactics. Take your time — legitimate sellers don\'t rush you to pay.',
        dismissible: true,
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
  return messages.some((m) => {
    const text = m.text;
    if (!text) return false;
    return OFF_PLATFORM_PAYMENT_PATTERNS.some((pattern) => pattern.test(text));
  });
}

/**
 * Detect if any message text contains high-pressure scam urgency patterns.
 */
function hasScamUrgencyPattern(messages: Message[]): boolean {
  return messages.some((m) => {
    const text = m.text;
    if (!text) return false;
    return SCAM_URGENCY_PATTERNS.some((pattern) => pattern.test(text));
  });
}

/**
 * Real-time detection of off-platform payment keywords in the composer text.
 * This runs as the user types, before they send the message.
 *
 * Returns a warning object if the text contains suspicious patterns,
 * or null if the text is clean.
 *
 * This works for BOTH directions:
 * - User typing payment instructions to send off-platform
 * - User typing a response that includes payment app names
 */
export function detectComposerSafetyWarning(
  composerText: string
): ChatSafetyWarning | null {
  const trimmed = composerText.trim();
  if (!trimmed) return null;

  const matched = OFF_PLATFORM_PAYMENT_PATTERNS.some((pattern) => pattern.test(trimmed));
  if (matched) {
    return {
      level: 'danger',
      message:
        'This message may share off-platform payment details. Keep payments in Thryftverse to stay protected by Buyer Protection.',
      dismissible: true,
    };
  }

  const urgencyMatched = SCAM_URGENCY_PATTERNS.some((pattern) => pattern.test(trimmed));
  if (urgencyMatched) {
    return {
      level: 'caution',
      message:
        'This message sounds urgent. Legitimate sellers give buyers time to decide.',
      dismissible: true,
    };
  }

  return null;
}

/**
 * Check if a specific text string contains off-platform payment patterns.
 * Exposed for testing and reuse in other contexts.
 */
export function containsOffPlatformPaymentPattern(text: string): boolean {
  if (!text) return false;
  return OFF_PLATFORM_PAYMENT_PATTERNS.some((pattern) => pattern.test(text));
}
