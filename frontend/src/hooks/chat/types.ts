/**
 * Shared chat controller types and helpers.
 *
 * The canonical `Message` model lives in `domain/conversation.ts` and is the
 * single source of truth for the chat message shape across the app. This
 * module re-exports it so the controller hooks (useConversationMessages,
 * useConversationComposer, etc.) can share the same Message type without
 * circular imports, and provides chat-specific helper functions.
 */

import type { Message } from '../../domain/conversation';

// Re-export the canonical Message as the chat Message type. All consumers
// that import `Message` from `hooks/chat` or `hooks/chat/types` get the
// domain model with `sender: 'me' | 'other' | 'system'` and the canonical
// `type` enum.
export type { Message };
export type { Message as ChatMessage };

/**
 * Map a legacy sender value ('me' | 'them' | 'system') to the canonical
 * sender value ('me' | 'other' | 'system'). Used by any adapter that still
 * receives 'them' from an external source.
 */
export function mapSenderToCanonical(
  sender: 'me' | 'them' | 'system',
): 'me' | 'other' | 'system' {
  return sender === 'them' ? 'other' : sender;
}

export const INITIAL_MESSAGES: Message[] = [];

// Context-aware default quick replies shown when user hasn't configured custom ones
export const DEFAULT_SELLER_QUICK_REPLIES = [
  "Thanks for your interest!",
  "Yes, it's still available.",
  "I can ship within 2 business days.",
  "Any questions about the item?",
];

export const DEFAULT_BUYER_QUICK_REPLIES = [
  "Is this still available?",
  "Can I make an offer?",
  "What's your best price?",
  "Could you share more photos?",
];

export function parseMessageDate(dateStr: string): Date | null {
  const legacyMatch = dateStr.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/,
  );
  const d = legacyMatch
    ? new Date(
        Number(legacyMatch[3]),
        Number(legacyMatch[2]) - 1,
        Number(legacyMatch[1]),
        Number(legacyMatch[4] ?? 12),
        Number(legacyMatch[5] ?? 0),
      )
    : new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateSeparator(dateStr: string): string | null {
  const d = parseMessageDate(dateStr);
  if (!d) return null;
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

export function formatMessageTime(dateStr?: string): string | undefined {
  if (!dateStr) return undefined;
  const hasExplicitTime = /T\d{2}:\d{2}|\b\d{1,2}:\d{2}\b/.test(dateStr);
  if (!hasExplicitTime) return undefined;
  const d = parseMessageDate(dateStr);
  if (!d) return undefined;
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
