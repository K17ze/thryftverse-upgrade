import { describe, it, expect } from 'vitest';

interface MockConversation {
  id: string;
  unread: boolean;
}

function computeInboxBadgeCount(
  conversations: MockConversation[],
  messageRequests: string[]
): number {
  const requestIds = new Set(messageRequests);
  const unreadNonRequestCount = conversations.filter(
    (c) => c.unread && !requestIds.has(c.id)
  ).length;
  return unreadNonRequestCount + requestIds.size;
}

describe('VQ-09D: Inbox badge deduplication logic', () => {
  it('returns 0 when no unread conversations and no requests', () => {
    expect(computeInboxBadgeCount([], [])).toBe(0);
    expect(computeInboxBadgeCount(
      [{ id: 'c1', unread: false }],
      []
    )).toBe(0);
  });

  it('counts unread conversations that are not requests', () => {
    expect(computeInboxBadgeCount(
      [{ id: 'c1', unread: true }, { id: 'c2', unread: false }],
      []
    )).toBe(1);
  });

  it('counts message requests even if the conversation is read', () => {
    expect(computeInboxBadgeCount(
      [{ id: 'r1', unread: false }],
      ['r1']
    )).toBe(1);
  });

  it('counts message requests even if the conversation is unread (no double count)', () => {
    expect(computeInboxBadgeCount(
      [{ id: 'r1', unread: true }],
      ['r1']
    )).toBe(1);
  });

  it('counts both unread non-request conversations and requests', () => {
    expect(computeInboxBadgeCount(
      [
        { id: 'c1', unread: true },
        { id: 'c2', unread: true },
        { id: 'r1', unread: true },
      ],
      ['r1']
    )).toBe(3);
  });

  it('handles request absent from loaded conversations', () => {
    expect(computeInboxBadgeCount(
      [{ id: 'c1', unread: true }],
      ['r_orphaned']
    )).toBe(2);
  });

  it('handles duplicate request IDs (Set deduplication)', () => {
    expect(computeInboxBadgeCount(
      [{ id: 'r1', unread: true }],
      ['r1', 'r1', 'r1']
    )).toBe(1);
  });

  it('handles multiple requests and multiple unread conversations', () => {
    expect(computeInboxBadgeCount(
      [
        { id: 'c1', unread: true },
        { id: 'c2', unread: true },
        { id: 'c3', unread: false },
        { id: 'r1', unread: true },
        { id: 'r2', unread: false },
      ],
      ['r1', 'r2']
    )).toBe(4);
  });

  it('does not count archived/read requests as unread conversations', () => {
    expect(computeInboxBadgeCount(
      [
        { id: 'r1', unread: false },
        { id: 'c1', unread: true },
      ],
      ['r1']
    )).toBe(2);
  });

  it('handles large counts (99+ display boundary)', () => {
    const conversations = Array.from({ length: 100 }, (_, i) => ({
      id: `c${i}`,
      unread: true,
    }));
    expect(computeInboxBadgeCount(conversations, [])).toBe(100);
  });
});
