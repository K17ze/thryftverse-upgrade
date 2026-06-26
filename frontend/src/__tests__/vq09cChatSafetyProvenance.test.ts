import { describe, it, expect, vi } from 'vitest';

vi.mock('expo-modules-core', () => ({
  requireNativeViewManager: () => ({}),
}));

import { detectChatSafetyWarning } from '../utils/chatSafetyWarnings';
import {
  isTrustedSystemMessage,
  resolveSystemMessageProvenance,
} from '../utils/systemMessageProvenance';
import type { Conversation, Message } from '../data/mockData';

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv_1',
    type: 'dm',
    sellerId: 'seller_1',
    itemId: 'item_1',
    ownerId: 'buyer_1',
    participantIds: ['buyer_1', 'seller_1'],
    lastMessage: 'Hello',
    lastMessageTime: new Date().toISOString(),
    unread: false,
    messages: [],
    ...overrides,
  };
}

function makeMessage(text: string, overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg_1',
    senderId: 'seller_1',
    text,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('PASS 8-12 — Chat safety, provenance, and quick replies', () => {
  describe('detectChatSafetyWarning', () => {
    it('returns info warning for buyer in marketplace conversation', () => {
      const conv = makeConversation();
      const result = detectChatSafetyWarning(conv, 'buyer_1');
      expect(result).not.toBeNull();
      expect(result?.level).toBe('info');
    });

    it('returns danger warning when off-platform payment detected', () => {
      const conv = makeConversation({
        messages: [makeMessage('Can you Venmo me for this?')],
      });
      const result = detectChatSafetyWarning(conv, 'buyer_1', conv.messages);
      expect(result).not.toBeNull();
      expect(result?.level).toBe('danger');
    });

    it('returns danger for bank transfer requests', () => {
      const conv = makeConversation({
        messages: [makeMessage('Send the money to my bank transfer details')],
      });
      const result = detectChatSafetyWarning(conv, 'buyer_1', conv.messages);
      expect(result?.level).toBe('danger');
    });

    it('returns danger for PayPal requests', () => {
      const conv = makeConversation({
        messages: [makeMessage('PayPal me at my@email.com')],
      });
      const result = detectChatSafetyWarning(conv, 'buyer_1', conv.messages);
      expect(result?.level).toBe('danger');
    });

    it('returns null for seller-side conversations', () => {
      const conv = makeConversation();
      const result = detectChatSafetyWarning(conv, 'seller_1');
      expect(result).toBeNull();
    });

    it('returns null for group conversations', () => {
      const conv = makeConversation({ type: 'group' });
      const result = detectChatSafetyWarning(conv, 'buyer_1');
      expect(result).toBeNull();
    });
  });

  describe('isTrustedSystemMessage', () => {
    it('returns true for system sender ID', () => {
      expect(
        isTrustedSystemMessage({
          id: 'msg_1',
          senderId: 'system',
          isSystem: true,
          type: 'system',
          systemTitle: 'Offer created',
          text: '',
          timestamp: new Date().toISOString(),
        } as any),
      ).toBe(true);
    });

    it('returns true for thryftverse_system sender ID', () => {
      expect(
        isTrustedSystemMessage({
          id: 'msg_2',
          senderId: 'thryftverse_system',
          isSystem: true,
          type: 'system',
          timestamp: new Date().toISOString(),
        } as any),
      ).toBe(true);
    });

    it('returns false for user sender ID', () => {
      expect(
        isTrustedSystemMessage({
          id: 'msg_3',
          senderId: 'user_123',
          isSystem: true,
          type: 'system',
          timestamp: new Date().toISOString(),
        } as any),
      ).toBe(false);
    });

    it('returns false for undefined senderId', () => {
      expect(
        isTrustedSystemMessage({
          id: 'msg_4',
          senderId: undefined,
          isSystem: true,
          type: 'system',
          timestamp: new Date().toISOString(),
        } as any),
      ).toBe(false);
    });
  });

  describe('resolveSystemMessageProvenance', () => {
    it('returns isProtected for trusted system messages', () => {
      const result = resolveSystemMessageProvenance({
        id: 'msg_1',
        senderId: 'system',
        isSystem: true,
        type: 'system',
        systemTitle: 'Offer accepted',
        text: '',
        timestamp: new Date().toISOString(),
      } as any);
      expect(result.isProtected).toBe(true);
    });

    it('returns isProtected false for untrusted messages', () => {
      const result = resolveSystemMessageProvenance({
        id: 'msg_2',
        senderId: 'user_456',
        isSystem: false,
        type: 'text',
        text: 'This is a regular message',
        timestamp: new Date().toISOString(),
      } as any);
      expect(result.isProtected).toBe(false);
    });
  });
});
