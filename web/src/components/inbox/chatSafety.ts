/**
 * chatSafety — in-thread scam/off-platform-payment detection, a port of
 * the mobile `utils/chatSafetyWarnings.ts`. Two surfaces share the
 * pattern lists:
 *
 *  - `detectThreadSafetyWarning` scans *incoming* history and is gated on
 *    the viewer's role in the conversation (the mobile
 *    `classifyConversation` contract): the banner only exists for the
 *    buyer side of a marketplace thread — sellers and non-marketplace DMs
 *    never see buyer-protection copy (a seller receiving "paypal me" is
 *    the potential scammer's target audience, not a protected buyer).
 *    A clean marketplace-buyer thread carries the standing info reminder
 *    mobile ships ("Never pay outside Thryftverse…").
 *  - `detectComposerSafetyWarning` scans the viewer's *own draft* as they
 *    type — the mobile useConversationSafety composer check — warning
 *    before an off-platform detail goes out. Non-blocking: send always
 *    proceeds (mobile warns, never prevents).
 *
 * Patterns are ported verbatim — they encode real scam grammar (payment
 * rail names, bank-detail requests, gift-card codes, "take this off the
 * app" phrasing) and both clients should flag the same text.
 */

import type { Message } from '@/lib/contracts/domain';

export type SafetyWarningLevel = 'info' | 'caution' | 'danger';

export interface ChatSafetyWarning {
  level: SafetyWarningLevel;
  message: string;
  /** Whether the banner can be dismissed — danger stays pinned. */
  dismissible: boolean;
}

/**
 * Off-platform payment patterns — ported verbatim from the mobile
 * OFF_PLATFORM_PAYMENT_PATTERNS list (payment apps, bank transfers,
 * crypto, gift cards, "pay me outside the app" phrasing).
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

/** High-pressure scam tactics — ported verbatim from the mobile list. */
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

const isMine = (m: Message) => m.sender === 'me' || m.senderId === 'me';
const isSystem = (m: Message) =>
  m.isSystem === true || m.type === 'system' || m.sender === 'system';

/** Incoming message bodies only — a warning fires on what the
 *  counterparty said, never on the viewer's own text or system rows,
 *  and tombstones carry no body to test. */
function incomingTexts(messages: Message[]): string[] {
  return messages
    .filter((m) => !isMine(m) && !isSystem(m) && !m.isDeleted && typeof m.text === 'string')
    .map((m) => m.text as string);
}

/**
 * The viewer's role in the thread — the web contract doesn't carry the
 * mobile Conversation.classification, so the caller assembles the two
 * signals mobile's classifier derives (context.listing/itemId →
 * marketplace; sellerId/ownerId === viewer → selling).
 */
export interface ThreadRoleContext {
  /** Marketplace thread — the conversation is linked to a listing/item. */
  isMarketplace: boolean;
  /** The viewer is the listing's seller — buyer-protection copy suppressed. */
  isSelling: boolean;
}

/**
 * Scan the thread's incoming messages for safety signals — the mobile
 * detectChatSafetyWarning port. The whole feature is role-gated: only a
 * buyer in a marketplace thread sees it. Danger (off-platform payment
 * request) wins over caution (pressure tactics); a clean marketplace-
 * buyer thread carries the standing info reminder; every other thread —
 * seller-side, group, plain DM — shows nothing.
 */
export function detectThreadSafetyWarning(
  messages: Message[],
  role: ThreadRoleContext,
): ChatSafetyWarning | null {
  if (!role.isMarketplace || role.isSelling) return null;
  const texts = incomingTexts(messages);
  if (texts.some((t) => OFF_PLATFORM_PAYMENT_PATTERNS.some((p) => p.test(t)))) {
    return {
      level: 'danger',
      message:
        'This user may be asking for payment outside ThryftVerse. Never pay off-platform — you lose buyer protection.',
      dismissible: false,
    };
  }
  if (texts.some((t) => SCAM_URGENCY_PATTERNS.some((p) => p.test(t)))) {
    return {
      level: 'caution',
      message:
        "This user may be using high-pressure tactics. Take your time — legitimate sellers don't rush you to pay.",
      dismissible: true,
    };
  }
  // Standing reminder — the mobile info row a buyer marketplace thread
  // always carries, fired once per dismissal (it never escalates itself).
  return {
    level: 'info',
    message: 'Never pay outside ThryftVerse. Use checkout for buyer protection.',
    dismissible: true,
  };
}

/**
 * Real-time detection of off-platform payment keywords in the composer
 * draft — the mobile detectComposerSafetyWarning port. Runs as the user
 * types, before the message goes out; either direction of risky content
 * is flagged (the viewer sharing their own payment details is the common
 * case). Dismissible and non-blocking — mobile warns, never prevents the
 * send.
 */
export function detectComposerSafetyWarning(
  composerText: string,
): ChatSafetyWarning | null {
  const trimmed = composerText.trim();
  if (!trimmed) return null;

  if (OFF_PLATFORM_PAYMENT_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return {
      level: 'danger',
      message:
        'This message may share off-platform payment details. Keep payments in Thryftverse to stay protected by Buyer Protection.',
      dismissible: true,
    };
  }

  if (SCAM_URGENCY_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return {
      level: 'caution',
      message:
        'This message sounds urgent. Legitimate sellers give buyers time to decide.',
      dismissible: true,
    };
  }

  return null;
}
