import type { Message } from '../data/mockData';

/**
 * Known system sender IDs that are authorised to display trusted system styling.
 * Only messages from these IDs may receive the verified system message appearance.
 */
const SYSTEM_SENDER_IDS = new Set([
  'system',
  'thryftverse_system',
  'thryftverse_bot',
]);

/**
 * System message categories that carry provenance metadata.
 * Each category maps to a specific kind of system event.
 */
export type SystemMessageCategory =
  | 'order'
  | 'shipping'
  | 'payment'
  | 'safety'
  | 'policy'
  | 'listing'
  | 'offer'
  | 'general';

export interface SystemMessageProvenance {
  isTrusted: boolean;
  category: SystemMessageCategory;
  /** The verified origin of the message, or null if unverified */
  origin: 'system' | 'bot' | 'unknown';
  /** Whether the message should receive trusted visual styling */
  shouldRenderTrusted: boolean;
  /** Whether the message should be protected from spoofing */
  isProtected: boolean;
}

/**
 * Resolve the provenance of a system message to determine whether it should
 * receive trusted visual styling.
 *
 * CRITICAL: Trusted styling must NOT be granted solely based on `isSystem` or
 * `type === 'system'`. The message must also have a verified sender ID that
 * matches a known system sender.
 *
 * This prevents spoofing where a regular user crafts a message with
 * `isSystem: true` to make it appear as an official system notification.
 */
export function resolveSystemMessageProvenance(
  message: Message
): SystemMessageProvenance {
  const hasSystemFlag = message.isSystem === true || message.type === 'system';
  const senderId = message.senderId ?? '';
  const isKnownSystemSender = SYSTEM_SENDER_IDS.has(senderId);

  // Determine origin
  const origin: SystemMessageProvenance['origin'] = isKnownSystemSender
    ? senderId.includes('bot')
      ? 'bot'
      : 'system'
    : 'unknown';

  // Trusted styling requires BOTH the system flag AND a verified sender
  const isTrusted = hasSystemFlag && isKnownSystemSender;

  // Protected messages cannot be edited or deleted by users
  const isProtected = isTrusted;

  // Categorise based on systemTitle or text content
  const category = categoriseSystemMessage(message);

  return {
    isTrusted,
    category,
    origin,
    shouldRenderTrusted: isTrusted,
    isProtected,
  };
}

function categoriseSystemMessage(message: Message): SystemMessageCategory {
  const text = (message.systemTitle ?? message.text ?? '').toLowerCase();

  if (text.includes('order') || text.includes('purchased') || text.includes('confirmed')) {
    return 'order';
  }
  if (text.includes('ship') || text.includes('deliver') || text.includes('tracking')) {
    return 'shipping';
  }
  if (text.includes('payment') || text.includes('payout') || text.includes('refund')) {
    return 'payment';
  }
  if (text.includes('safety') || text.includes('warning') || text.includes('scam')) {
    return 'safety';
  }
  if (text.includes('policy') || text.includes('terms') || text.includes('guideline')) {
    return 'policy';
  }
  if (text.includes('listing') || text.includes('item') || text.includes('sold')) {
    return 'listing';
  }
  if (text.includes('offer') || text.includes('price') || text.includes('accept')) {
    return 'offer';
  }
  return 'general';
}

/**
 * Check if a message is a legitimate system message that should be rendered
 * with trusted styling. This is a convenience wrapper around
 * resolveSystemMessageProvenance for use in render logic.
 */
export function isTrustedSystemMessage(message: Message): boolean {
  return resolveSystemMessageProvenance(message).shouldRenderTrusted;
}
